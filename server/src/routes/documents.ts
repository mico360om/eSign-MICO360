import { Router } from "express";
import fs from "fs";
import { z } from "zod";
import { APPROVAL_MODES, ApprovalMode, DocumentStatus, StepStatus } from "../constants";
import { prisma } from "../lib/prisma";
import { asyncHandler, badRequest, forbidden, notFound, ok } from "../lib/http";
import { audit, docEvent } from "../lib/audit";
import { notify, notifyMany, notifyWithDelegate } from "../lib/notify";
import { decide } from "../services/decision";
import { authenticate, hasPermission, requirePermission } from "../middleware/auth";
import { documentUpload, signatureUpload } from "../lib/upload";
import { abs, rel } from "../lib/storage";
import { convertToPdf, pdfPageCount, aspectNormHeight } from "../lib/pdf";
import { sha256File } from "../lib/integrity";
import { pdfHasSignature } from "../lib/digitalsign";
import { userProfileIds, shareProfile } from "../services/access";
import { advanceWorkflow } from "../services/workflow";

const router = Router();
router.use(authenticate);

const docInclude = {
  profile: { select: { id: true, name: true } },
  uploadedBy: { select: { id: true, fullName: true, email: true } },
  signatureGroup: { select: { id: true, name: true } },
  steps: {
    orderBy: { order: "asc" as const },
    include: {
      signatory: { select: { id: true, fullName: true, email: true } },
      approvalType: { select: { id: true, name: true } },
    },
  },
  tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
} as const;

/** Documents visible to the caller: within their profiles, OR uploaded by them, OR awaiting their approval. */
async function visibleWhere(userId: string) {
  const profileIds = await userProfileIds(userId);
  return {
    OR: [
      { profileId: { in: profileIds } },
      { uploadedById: userId },
      { steps: { some: { signatoryId: userId } } },
    ],
  };
}

/** Fetch a document the caller is allowed to see; throw 404 if absent or not visible. */
async function fetchVisible(userId: string, docId: string, isAdmin = false) {
  if (isAdmin) {
    const doc = await prisma.document.findUnique({ where: { id: docId } });
    if (!doc) throw notFound("Document not found");
    return doc;
  }
  const visibility = await visibleWhere(userId);
  const doc = await prisma.document.findFirst({ where: { AND: [{ id: docId }, visibility] } });
  if (!doc) throw notFound("Document not found");
  return doc;
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const isAdmin = hasPermission(req, "MANAGE_PROFILES");
    const visible = isAdmin ? {} : await visibleWhere(req.user!.id);
    const status = req.query.status as DocumentStatus | undefined;
    const priority = req.query.priority as string | undefined;
    const q = (req.query.q as string)?.trim();
    const profileId = (req.query.profileId as string)?.trim();
    const uploadedById = (req.query.uploadedById as string)?.trim();
    const signatoryId = (req.query.signatoryId as string)?.trim();
    const tagId = (req.query.tagId as string)?.trim();
    const dateFrom = (req.query.dateFrom as string)?.trim();
    const dateTo = (req.query.dateTo as string)?.trim();

    const filters: any[] = [visible];
    if (status) filters.push({ status });
    if (priority) filters.push({ priority });
    if (profileId) filters.push({ profileId });
    if (uploadedById) filters.push({ uploadedById });
    if (signatoryId) filters.push({ steps: { some: { signatoryId } } });
    if (tagId) filters.push({ tags: { some: { tagId } } });
    if (dateFrom) filters.push({ createdAt: { gte: new Date(dateFrom) } });
    if (dateTo) filters.push({ createdAt: { lte: new Date(dateTo + "T23:59:59Z") } });
    if (q) filters.push({ OR: [{ title: { contains: q } }, { description: { contains: q } }] });

    const where = filters.filter((f) => Object.keys(f).length > 0);
    const docs = await prisma.document.findMany({
      where: where.length > 1 ? { AND: where } : where[0] ?? {},
      orderBy: { updatedAt: "desc" },
      include: docInclude,
    });
    ok(res, docs);
  }),
);

// Documents currently awaiting the caller's approval (used by desktop & mobile).
router.get(
  "/pending",
  asyncHandler(async (req, res) => {
    const docs = await prisma.document.findMany({
      where: {
        status: { in: [DocumentStatus.PENDING_APPROVAL, DocumentStatus.PARTIALLY_APPROVED] },
        steps: { some: { signatoryId: req.user!.id, status: StepStatus.PENDING } },
      },
      orderBy: { updatedAt: "desc" },
      include: docInclude,
    });
    ok(res, docs);
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const isAdmin = hasPermission(req, "MANAGE_PROFILES");
    await fetchVisible(req.user!.id, req.params.id, isAdmin);
    const doc = await prisma.document.findUnique({
      where: { id: req.params.id },
      include: { ...docInclude, placements: true, events: { orderBy: { createdAt: "asc" } } },
    });
    if (!doc) throw notFound("Document not found");

    // Enrich each history event with the actor's name (DocumentEvent stores only
    // actorId; there is no Prisma relation, so resolve names in one extra query).
    const actorIds = [...new Set(doc.events.map((e) => e.actorId).filter(Boolean) as string[])];
    const actors = actorIds.length
      ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, fullName: true } })
      : [];
    const nameById = new Map(actors.map((a) => [a.id, a.fullName]));
    const events = doc.events.map((e) => ({ ...e, actorName: e.actorId ? nameById.get(e.actorId) ?? null : null }));

    ok(res, { ...doc, events });
  }),
);

router.get(
  "/:id/history",
  asyncHandler(async (req, res) => {
    await fetchVisible(req.user!.id, req.params.id, hasPermission(req, "MANAGE_PROFILES"));
    const events = await prisma.documentEvent.findMany({
      where: { documentId: req.params.id },
      orderBy: { createdAt: "asc" },
    });
    ok(res, events);
  }),
);

// ── Comments / notes thread ────────────────────────────────────────────────
// A discussion on the document, separate from approval-decision remarks
// (ApprovalStep.comment) and the system history (DocumentEvent).

const commentInclude = { author: { select: { id: true, fullName: true } } } as const;

router.get(
  "/:id/comments",
  asyncHandler(async (req, res) => {
    await fetchVisible(req.user!.id, req.params.id, hasPermission(req, "MANAGE_PROFILES"));
    const comments = await prisma.documentComment.findMany({
      where: { documentId: req.params.id },
      orderBy: { createdAt: "asc" },
      include: commentInclude,
    });
    ok(res, comments);
  }),
);

const commentSchema = z.object({ body: z.string().trim().min(1, "Comment cannot be empty").max(2000) });

router.post(
  "/:id/comments",
  asyncHandler(async (req, res) => {
    const doc = await fetchVisible(req.user!.id, req.params.id, hasPermission(req, "MANAGE_PROFILES"));
    const { body } = commentSchema.parse(req.body);

    const comment = await prisma.documentComment.create({
      data: { documentId: doc.id, authorId: req.user!.id, body },
      include: commentInclude,
    });

    await docEvent(doc.id, "COMMENT", req.user!.id, body.length > 200 ? `${body.slice(0, 200)}…` : body);
    await audit({ actorId: req.user!.id, action: "DOCUMENT_COMMENT", entity: "Document", entityId: doc.id });

    // Notify everyone involved (uploader + all workflow signatories) except the author.
    const steps = await prisma.approvalStep.findMany({ where: { documentId: doc.id }, select: { signatoryId: true } });
    const participants = [doc.uploadedById, ...steps.map((s) => s.signatoryId)].filter((u) => u !== req.user!.id);
    if (participants.length) {
      await notifyMany(participants, {
        type: "COMMENT_ADDED",
        title: `New comment on "${doc.title}"`,
        body: `${comment.author.fullName}: ${body.length > 140 ? `${body.slice(0, 140)}…` : body}`,
        link: `/documents/${doc.id}`,
      });
    }
    ok(res, comment);
  }),
);

// Authors can delete their own comment; profile admins can moderate any.
router.delete(
  "/:id/comments/:commentId",
  asyncHandler(async (req, res) => {
    await fetchVisible(req.user!.id, req.params.id, hasPermission(req, "MANAGE_PROFILES"));
    const comment = await prisma.documentComment.findFirst({
      where: { id: req.params.commentId, documentId: req.params.id },
    });
    if (!comment) throw notFound("Comment not found");
    if (comment.authorId !== req.user!.id && !hasPermission(req, "MANAGE_PROFILES"))
      throw forbidden("You can only delete your own comments");

    await prisma.documentComment.delete({ where: { id: comment.id } });
    await audit({ actorId: req.user!.id, action: "DOCUMENT_COMMENT_DELETED", entity: "Document", entityId: req.params.id });
    ok(res, { deleted: true });
  }),
);

// ── Tags on a document (folders/labels) ────────────────────────────────────
router.post(
  "/:id/tags",
  asyncHandler(async (req, res) => {
    const doc = await fetchVisible(req.user!.id, req.params.id, hasPermission(req, "MANAGE_PROFILES"));
    const { tagId } = z.object({ tagId: z.string().min(1) }).parse(req.body);
    const tag = await prisma.tag.findUnique({ where: { id: tagId } });
    if (!tag) throw notFound("Tag not found");
    await prisma.documentTag.upsert({
      where: { documentId_tagId: { documentId: doc.id, tagId } },
      update: {},
      create: { documentId: doc.id, tagId },
    });
    await audit({ actorId: req.user!.id, action: "DOCUMENT_TAGGED", entity: "Document", entityId: doc.id, detail: tag.name });
    const tags = await prisma.documentTag.findMany({ where: { documentId: doc.id }, include: { tag: true } });
    ok(res, tags.map((dt) => dt.tag));
  }),
);

router.delete(
  "/:id/tags/:tagId",
  asyncHandler(async (req, res) => {
    const doc = await fetchVisible(req.user!.id, req.params.id, hasPermission(req, "MANAGE_PROFILES"));
    await prisma.documentTag.deleteMany({ where: { documentId: doc.id, tagId: req.params.tagId } });
    ok(res, { removed: true });
  }),
);

// Integrity verification: recompute SHA-256 of the stored files and compare to
// the hashes captured at upload/finalize, and report digital-signature status.
router.get(
  "/:id/verify",
  asyncHandler(async (req, res) => {
    const doc = await fetchVisible(req.user!.id, req.params.id, hasPermission(req, "MANAGE_PROFILES"));

    const result: any = { signatureMethod: doc.signatureMethod };
    if (doc.originalPath) {
      const current = sha256File(abs(doc.originalPath));
      result.original = { stored: doc.originalHash, current, intact: !!doc.originalHash && current === doc.originalHash };
    }
    if (doc.finalPdfPath) {
      const current = sha256File(abs(doc.finalPdfPath));
      result.final = {
        stored: doc.finalHash,
        current,
        intact: !!doc.finalHash && current === doc.finalHash,
        digitallySigned: doc.digitallySigned,
        hasEmbeddedSignature: pdfHasSignature(abs(doc.finalPdfPath)),
      };
    }
    ok(res, result);
  }),
);

// Revise: upload a new file as the next version of an existing document.
router.post(
  "/:id/revise",
  requirePermission("UPLOAD"),
  documentUpload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("A revised document file is required");
    const parent = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!parent) throw notFound("Document not found");
    if (parent.uploadedById !== req.user!.id) throw forbidden("Only the requester can revise this document");

    const originalAbs = req.file.path;
    const convertedAbs = await convertToPdf(originalAbs, req.file.originalname);
    const originalHash = sha256File(originalAbs);

    const newDoc = await prisma.document.create({
      data: {
        title: parent.title,
        description: parent.description,
        status: DocumentStatus.PDF_CONVERTED,
        originalPath: rel(originalAbs),
        originalName: req.file.originalname,
        originalHash,
        convertedPdfPath: rel(convertedAbs),
        profileId: parent.profileId,
        uploadedById: req.user!.id,
        parentId: parent.id,
        version: parent.version + 1,
        signatureMethod: parent.signatureMethod,
      },
      include: docInclude,
    });
    await docEvent(newDoc.id, "UPLOADED", req.user!.id, `Revision v${newDoc.version} of "${parent.title}"`);
    await docEvent(newDoc.id, "CONVERTED", req.user!.id, "Generated PDF copy");
    await audit({ actorId: req.user!.id, action: "REVISE_DOCUMENT", entity: "Document", entityId: newDoc.id, detail: `v${newDoc.version} from ${parent.id}` });
    ok(res, newDoc);
  }),
);

// List the full version chain for a document (root → latest).
router.get(
  "/:id/versions",
  asyncHandler(async (req, res) => {
    const start = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!start) throw notFound("Document not found");
    let root: any = start;
    while (root.parentId) {
      const p: any = await prisma.document.findUnique({ where: { id: root.parentId } });
      if (!p) break;
      root = p;
    }
    const chain: any[] = [];
    let node: any = root;
    while (node) {
      chain.push({ id: node.id, version: node.version, status: node.status, title: node.title, createdAt: node.createdAt });
      const kids = await prisma.document.findMany({ where: { parentId: node.id }, orderBy: { version: "asc" } });
      node = kids[0];
    }
    ok(res, chain);
  }),
);

// Upload an original document and immediately generate the PDF copy.
router.post(
  "/upload",
  requirePermission("UPLOAD"),
  documentUpload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("A document file is required");
    const body = z
      .object({
        title: z.string().min(1),
        description: z.string().optional(),
        profileId: z.string(),
        priority: z.enum(["NORMAL", "URGENT", "CRITICAL"]).optional(),
        dueDate: z.string().optional(),
        notes: z.string().optional(),
        confidential: z.string().optional(),
      })
      .parse(req.body);

    // Profile access rule: user must belong to the target profile (admins bypass).
    if (!hasPermission(req, "MANAGE_PROFILES")) {
      const profileIds = await userProfileIds(req.user!.id);
      if (!profileIds.includes(body.profileId)) throw forbidden("You are not assigned to this company");
    }

    const originalAbs = req.file.path;
    const convertedAbs = await convertToPdf(originalAbs, req.file.originalname);
    const originalHash = sha256File(originalAbs);

    const doc = await prisma.document.create({
      data: {
        title: body.title,
        description: body.description,
        status: DocumentStatus.PDF_CONVERTED,
        originalPath: rel(originalAbs),
        originalName: req.file.originalname,
        originalHash,
        convertedPdfPath: rel(convertedAbs),
        profileId: body.profileId,
        uploadedById: req.user!.id,
        priority: body.priority ?? "NORMAL",
        dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
        notes: body.notes,
        confidential: body.confidential === "true",
      },
      include: docInclude,
    });

    await docEvent(doc.id, "UPLOADED", req.user!.id, `Original: ${req.file.originalname} (sha256 ${originalHash.slice(0, 12)}…)`);
    await docEvent(doc.id, "CONVERTED", req.user!.id, "Generated PDF copy");
    await audit({ actorId: req.user!.id, action: "UPLOAD_DOCUMENT", entity: "Document", entityId: doc.id });
    ok(res, doc);
  }),
);

// Edit document details BEFORE it is submitted for approval. Once a document is
// in an approval workflow (or completed/cancelled/rejected) its details lock.
const editSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  profileId: z.string().optional(),
  priority: z.enum(["NORMAL", "URGENT", "CRITICAL"]).optional(),
  dueDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  confidential: z.boolean().optional(),
});

router.patch(
  "/:id",
  requirePermission("UPLOAD"),
  asyncHandler(async (req, res) => {
    const body = editSchema.parse(req.body);
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!doc) throw notFound("Document not found");
    const isAdmin = hasPermission(req, "MANAGE_PROFILES");
    if (doc.uploadedById !== req.user!.id && !isAdmin) throw forbidden("Only the requester can edit this document");

    const editable: string[] = [DocumentStatus.DRAFT, DocumentStatus.UPLOADED, DocumentStatus.PDF_CONVERTED];
    if (!editable.includes(doc.status)) throw badRequest("This document has been submitted for approval and can no longer be edited");

    // If moving to a different company/profile, enforce membership (admins bypass).
    if (body.profileId && body.profileId !== doc.profileId && !isAdmin) {
      const profileIds = await userProfileIds(req.user!.id);
      if (!profileIds.includes(body.profileId)) throw forbidden("You are not assigned to this company");
    }

    const updated = await prisma.document.update({
      where: { id: doc.id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.profileId !== undefined ? { profileId: body.profileId } : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
        ...(body.dueDate !== undefined ? { dueDate: body.dueDate ? new Date(body.dueDate) : null } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.confidential !== undefined ? { confidential: body.confidential } : {}),
      },
      include: docInclude,
    });
    await docEvent(doc.id, "UPDATED", req.user!.id, "Edited document details before submission");
    await audit({ actorId: req.user!.id, action: "UPDATE_DOCUMENT", entity: "Document", entityId: doc.id });
    ok(res, updated);
  }),
);

// Create the signature request: choose signatories or a signature group, then submit.
const submitSchema = z.object({
  signatoryIds: z.array(z.string()).optional(),
  signatureGroupId: z.string().optional(),
  approvalMode: z.enum(APPROVAL_MODES).optional(),
  signatureMethod: z.enum(["IMAGE", "DIGITAL"]).optional(),
  templateId: z.string().optional(),
  // Per-signatory requested approval type: { [userId]: approvalTypeId }
  signatoryTypes: z.record(z.string(), z.string()).optional(),
  comment: z.string().optional(),
});

router.post(
  "/:id/submit",
  requirePermission("UPLOAD"),
  asyncHandler(async (req, res) => {
    const parsed = submitSchema.parse(req.body);
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!doc) throw notFound("Document not found");
    if (doc.uploadedById !== req.user!.id) throw forbidden("Only the requester can submit this document");
    const submittable: string[] = [DocumentStatus.DRAFT, DocumentStatus.UPLOADED, DocumentStatus.PDF_CONVERTED];
    if (!submittable.includes(doc.status)) {
      throw badRequest("Document has already been submitted");
    }

    // A template can pre-fill signatories / group / mode / method; explicit
    // values in the request still win.
    const body = { ...parsed };
    if (parsed.templateId) {
      const t = await prisma.template.findUnique({ where: { id: parsed.templateId } });
      if (!t) throw notFound("Template not found");
      if (t.profileId !== doc.profileId) throw forbidden("Template is for a different company");
      body.signatoryIds = parsed.signatoryIds ?? (JSON.parse(t.signatoryIds || "[]") as string[]);
      body.signatureGroupId = parsed.signatureGroupId ?? (t.signatureGroupId || undefined);
      body.approvalMode = parsed.approvalMode ?? (t.approvalMode as any);
      body.signatureMethod = parsed.signatureMethod ?? (t.signatureMethod as any);
    }

    // Resolve signatories from a group or an explicit list.
    let signatories: { userId: string; order: number }[] = [];
    let approvalMode: ApprovalMode = body.approvalMode ?? ApprovalMode.SEQUENTIAL;
    let groupId: string | undefined = body.signatureGroupId;

    if (body.signatureGroupId) {
      const group = await prisma.signatureGroup.findUnique({
        where: { id: body.signatureGroupId },
        include: { members: { orderBy: { order: "asc" } } },
      });
      if (!group) throw notFound("Signature group not found");
      // Signature group rule: group must belong to the document's profile.
      if (group.profileId !== doc.profileId) throw forbidden("Signature group is not linked to this company");
      approvalMode = group.approvalMode as ApprovalMode;
      signatories = group.members.map((m) => ({ userId: m.userId, order: m.order }));
    } else if (body.signatoryIds?.length) {
      // Signatory selection rule: requester & signatory must share a profile.
      for (const sid of body.signatoryIds) {
        if (!(await shareProfile(req.user!.id, sid))) {
          throw forbidden("A selected signatory is not in your company");
        }
      }
      signatories = body.signatoryIds.map((userId, i) => ({ userId, order: i + 1 }));
    } else {
      throw badRequest("Select at least one signatory or a signature group");
    }

    await prisma.$transaction([
      prisma.approvalStep.deleteMany({ where: { documentId: doc.id } }),
      prisma.approvalStep.createMany({
        data: signatories.map((s) => ({
          documentId: doc.id,
          signatoryId: s.userId,
          order: s.order,
          approvalTypeId: body.signatoryTypes?.[s.userId] ?? null,
        })),
      }),
      prisma.document.update({
        where: { id: doc.id },
        data: {
          status: DocumentStatus.PENDING_APPROVAL,
          approvalMode,
          signatureGroupId: groupId,
          ...(body.signatureMethod ? { signatureMethod: body.signatureMethod } : {}),
        },
      }),
    ]);

    await docEvent(doc.id, "SUBMITTED", req.user!.id, body.comment ?? `${signatories.length} signatory(ies)`);
    await audit({ actorId: req.user!.id, action: "SUBMIT_DOCUMENT", entity: "Document", entityId: doc.id });

    // Notify signatories (sequential → only the first; parallel → all),
    // routing to delegates for anyone out-of-office.
    const toNotify = approvalMode === ApprovalMode.SEQUENTIAL ? [signatories[0].userId] : signatories.map((s) => s.userId);
    for (const uid of [...new Set(toNotify)]) {
      await notifyWithDelegate(uid, {
        type: "SIGNATURE_REQUEST",
        title: `Approval requested: ${doc.title}`,
        body: "You have a new document to review and approve.",
        link: `/documents/${doc.id}`,
      });
    }

    const updated = await prisma.document.findUnique({ where: { id: doc.id }, include: docInclude });
    ok(res, updated);
  }),
);

// Approve or reject (signatory action, or delegate of an out-of-office signatory).
const decisionSchema = z.object({ decision: z.enum(["APPROVE", "REJECT"]), comment: z.string().optional() });

router.post(
  "/:id/decision",
  asyncHandler(async (req, res) => {
    const { decision, comment } = decisionSchema.parse(req.body);
    await decide(req, req.params.id, decision, comment);
    const updated = await prisma.document.findUnique({ where: { id: req.params.id }, include: docInclude });
    ok(res, updated);
  }),
);

// Bulk approve/reject multiple documents in one call.
const bulkSchema = z.object({
  ids: z.array(z.string()).min(1),
  decision: z.enum(["APPROVE", "REJECT"]),
  comment: z.string().optional(),
});

router.post(
  "/bulk-decision",
  asyncHandler(async (req, res) => {
    const { ids, decision, comment } = bulkSchema.parse(req.body);
    const results = [];
    for (const id of ids) {
      try {
        const r = await decide(req, id, decision, comment);
        results.push({ id, ok: true, status: r.status });
      } catch (e: any) {
        results.push({ id, ok: false, error: e?.message || "failed" });
      }
    }
    ok(res, { results, succeeded: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length });
  }),
);

// Reopen the caller's own approved step so they can edit (re-place signature/
// stamp) and re-approve. If the document had completed, its final signed PDF is
// cleared and regenerated on the next full approval.
router.post(
  "/:id/reopen",
  asyncHandler(async (req, res) => {
    const doc = await prisma.document.findUnique({
      where: { id: req.params.id },
      include: { steps: { include: { signatory: { select: { id: true, outOfOffice: true, delegateToId: true } } } } },
    });
    if (!doc) throw notFound("Document not found");
    const noEdit: string[] = [DocumentStatus.CANCELLED, DocumentStatus.REJECTED, DocumentStatus.DRAFT];
    if (noEdit.includes(doc.status)) {
      throw badRequest(`Cannot edit a ${doc.status.toLowerCase().replace(/_/g, " ")} document`);
    }
    const me = req.user!.id;
    const step = doc.steps.find((s) => s.signatoryId === me || (s.signatory.outOfOffice && s.signatory.delegateToId === me));
    if (!step) throw forbidden("You are not a signatory on this document");
    if (step.status !== StepStatus.APPROVED) throw badRequest("You can only edit a document you have approved");

    await prisma.approvalStep.update({ where: { id: step.id }, data: { status: StepStatus.PENDING, actedAt: null } });
    if (doc.status === DocumentStatus.COMPLETED) {
      await prisma.document.update({
        where: { id: doc.id },
        data: { finalPdfPath: null, finalHash: null, digitallySigned: false, completedAt: null },
      });
    }
    await docEvent(doc.id, "REOPENED", me, "Reopened for edit & re-approval");
    await audit({ actorId: me, action: "REOPEN_DOCUMENT", entity: "Document", entityId: doc.id });
    await advanceWorkflow(doc.id); // recompute status from the steps

    const updated = await prisma.document.findUnique({ where: { id: doc.id }, include: docInclude });
    ok(res, updated);
  }),
);

// Place a signature or stamp on the converted PDF (stored; applied on finalization).
const placementSchema = z.object({
  kind: z.enum(["SIGNATURE", "STAMP"]),
  page: z.number().int().min(1),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
  stampId: z.string().optional(), // for STAMP
  savedMarkId: z.string().optional(), // for SIGNATURE — a preconfigured saved mark
});

router.post(
  "/:id/placements",
  asyncHandler(async (req, res) => {
    const body = placementSchema.parse(req.body);
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!doc) throw notFound("Document not found");

    let imagePath: string;
    if (body.kind === "SIGNATURE") {
      if (!hasPermission(req, "SIGN")) throw forbidden("Requires SIGN permission");
      if (body.savedMarkId) {
        // Use a preconfigured saved mark (own library).
        const mark = await prisma.savedMark.findFirst({ where: { id: body.savedMarkId, userId: req.user!.id } });
        if (!mark) throw notFound("Saved mark not found");
        imagePath = mark.imagePath;
      } else {
        const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
        if (!user?.signatureImg) throw badRequest("Add a signature first (draw/upload or save a mark)");
        imagePath = user.signatureImg;
      }
    } else {
      if (!hasPermission(req, "USE_STAMP")) throw forbidden("Requires USE_STAMP permission (stamp usage rule)");
      if (!body.stampId) throw badRequest("stampId is required for a stamp placement");
      const stamp = await prisma.stamp.findUnique({ where: { id: body.stampId } });
      if (!stamp || !stamp.isActive) throw notFound("Stamp not found");
      // Rule: at most ONE company stamp PER PAGE. The company stamp is applied to
      // every page of the document (all pages are one document), so each page
      // carries exactly one stamp; signatures are unlimited.
      const existingStamp = await prisma.placement.findFirst({
        where: { documentId: doc.id, page: body.page, kind: "STAMP" },
      });
      if (existingStamp) throw badRequest(`Page ${body.page} already has a company stamp.`);
      imagePath = stamp.imagePath;
      await prisma.stampUsage.create({ data: { stampId: stamp.id, userId: req.user!.id, documentId: doc.id } });
    }

    // Preserve the image's aspect ratio: derive the stored height from the image
    // and the target page so the preview matches the (aspect-correct) final PDF.
    let placeHeight = body.height;
    if (doc.convertedPdfPath) {
      const fit = await aspectNormHeight(abs(imagePath), abs(doc.convertedPdfPath), body.page, body.width);
      if (fit && fit > 0) placeHeight = fit;
    }

    const placement = await prisma.placement.create({
      data: {
        documentId: doc.id,
        kind: body.kind,
        page: body.page,
        x: body.x,
        y: body.y,
        width: body.width,
        height: placeHeight,
        imagePath,
        placedById: req.user!.id,
      },
    });
    await docEvent(doc.id, body.kind === "SIGNATURE" ? "SIGNED" : "STAMPED", req.user!.id, `page ${body.page}`);
    ok(res, placement);
  }),
);

router.delete(
  "/:id/placements/:placementId",
  asyncHandler(async (req, res) => {
    const pl = await prisma.placement.findFirst({ where: { id: req.params.placementId, documentId: req.params.id } });
    if (!pl) throw notFound("Placement not found");
    if (pl.placedById !== req.user!.id) throw forbidden("You can only remove your own placements");
    await prisma.placement.delete({ where: { id: pl.id } });
    ok(res, { success: true });
  }),
);

// Stream a placement's image (signature/stamp) so the PDF preview can overlay it.
router.get(
  "/:id/placements/:placementId/image",
  asyncHandler(async (req, res) => {
    const pl = await prisma.placement.findFirst({ where: { id: req.params.placementId, documentId: req.params.id } });
    if (!pl) throw notFound("Placement not found");
    const absPath = abs(pl.imagePath);
    if (!fs.existsSync(absPath)) throw notFound("Image missing on disk");
    res.sendFile(absPath);
  }),
);

// Copy a document as a fresh submission (new doc, same file/profile, no steps).
router.post(
  "/:id/copy",
  requirePermission("UPLOAD"),
  asyncHandler(async (req, res) => {
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!doc) throw notFound("Document not found");
    const profileIds = await userProfileIds(req.user!.id);
    if (!profileIds.includes(doc.profileId)) throw forbidden("You are not assigned to this company");
    const newDoc = await prisma.document.create({
      data: {
        title: `${doc.title} (copy)`,
        description: doc.description,
        status: DocumentStatus.PDF_CONVERTED,
        originalPath: doc.originalPath,
        originalName: doc.originalName,
        originalHash: doc.originalHash,
        convertedPdfPath: doc.convertedPdfPath,
        profileId: doc.profileId,
        uploadedById: req.user!.id,
        signatureMethod: doc.signatureMethod,
      },
      include: docInclude,
    });
    await docEvent(newDoc.id, "UPLOADED", req.user!.id, `Copied from "${doc.title}" (${doc.id})`);
    await audit({ actorId: req.user!.id, action: "UPLOAD_DOCUMENT", entity: "Document", entityId: newDoc.id, detail: `copy of ${doc.id}` });
    ok(res, newDoc);
  }),
);

router.post(
  "/:id/cancel",
  asyncHandler(async (req, res) => {
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!doc) throw notFound("Document not found");
    if (doc.uploadedById !== req.user!.id) throw forbidden("Only the requester can cancel");
    const uncancellable = ["COMPLETED", "CANCELLED", "REJECTED"];
    if (uncancellable.includes(doc.status)) throw badRequest(`Cannot cancel a ${doc.status.toLowerCase().replace(/_/g, " ")} document`);
    await prisma.document.update({ where: { id: doc.id }, data: { status: DocumentStatus.CANCELLED } });
    await docEvent(doc.id, "CANCELLED", req.user!.id);
    ok(res, { success: true });
  }),
);

// Save the caller's signature image (used when placing signatures).
router.post(
  "/me/signature",
  signatureUpload.single("image"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("A signature image (png/jpg) is required");
    await prisma.user.update({ where: { id: req.user!.id }, data: { signatureImg: rel(req.file.path) } });
    ok(res, { success: true });
  }),
);

// Downloads: original | converted | final. Requires DOWNLOAD permission.
router.get(
  "/:id/download/:kind",
  requirePermission("DOWNLOAD"),
  asyncHandler(async (req, res) => {
    const kind = req.params.kind;
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!doc) throw notFound("Document not found");

    const map: Record<string, string | null> = {
      original: doc.originalPath,
      converted: doc.convertedPdfPath,
      final: doc.finalPdfPath,
    };
    const stored = map[kind];
    if (!stored) throw notFound(`No ${kind} file available`);
    const absPath = abs(stored);
    if (!fs.existsSync(absPath)) throw notFound("File missing on disk");

    const filename =
      kind === "original" && doc.originalName ? doc.originalName : `${doc.title}-${kind}.pdf`;
    await audit({ actorId: req.user!.id, action: "DOWNLOAD_DOCUMENT", entity: "Document", entityId: doc.id, detail: kind });
    res.download(absPath, filename);
  }),
);

// Inline PDF stream for the in-app viewer (converted or final).
router.get(
  "/:id/view/:kind",
  asyncHandler(async (req, res) => {
    const doc = await fetchVisible(req.user!.id, req.params.id, hasPermission(req, "MANAGE_PROFILES"));
    const stored = req.params.kind === "final" ? doc.finalPdfPath : doc.convertedPdfPath;
    if (!stored) throw notFound("PDF not available");
    const absPath = abs(stored);
    if (!fs.existsSync(absPath)) throw notFound("File missing on disk");
    const pages = await pdfPageCount(absPath);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("X-Page-Count", String(pages));
    fs.createReadStream(absPath).pipe(res);
  }),
);

export default router;
