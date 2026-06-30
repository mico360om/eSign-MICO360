import { Request } from "express";
import { prisma } from "../lib/prisma";
import { badRequest, forbidden, notFound } from "../lib/http";
import { audit, docEvent } from "../lib/audit";
import { notify } from "../lib/notify";
import { hasPermission } from "../middleware/auth";
import { advanceWorkflow } from "./workflow";

/**
 * Apply an approve/reject decision to a document on behalf of the caller, who
 * must be the pending signatory OR the delegate of an out-of-office signatory.
 * Shared by the single-decision and bulk-decision routes. Returns {id, status}.
 */
export async function decide(
  req: Request,
  documentId: string,
  decision: "APPROVE" | "REJECT",
  comment?: string,
): Promise<{ id: string; status: string }> {
  if (!hasPermission(req, decision)) throw forbidden(`Requires ${decision} permission`);

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      steps: {
        orderBy: { order: "asc" },
        include: { signatory: { select: { id: true, outOfOffice: true, delegateToId: true } } },
      },
    },
  });
  if (!doc) throw notFound("Document not found");

  const me = req.user!.id;
  const step = doc.steps.find(
    (s) => s.signatoryId === me || (s.signatory.outOfOffice && s.signatory.delegateToId === me),
  );
  if (!step) throw forbidden("You are not a signatory on this document");
  if (step.status !== "PENDING") throw badRequest("You have already acted on this document");

  if (doc.approvalMode === "SEQUENTIAL") {
    const earlierPending = doc.steps.find((s) => s.order < step.order && s.status === "PENDING");
    if (earlierPending) throw badRequest("Waiting for an earlier signatory to approve first");
  }

  const asDelegate = step.signatoryId !== me;
  const note = asDelegate ? `(delegate) ${comment ?? ""}`.trim() : comment;

  await prisma.approvalStep.update({
    where: { id: step.id },
    data: { status: decision === "APPROVE" ? "APPROVED" : "REJECTED", comment: note, actedAt: new Date() },
  });

  await docEvent(doc.id, decision === "APPROVE" ? "APPROVED" : "REJECTED", me, note);
  await audit({ actorId: me, action: `${decision}_DOCUMENT`, entity: "Document", entityId: doc.id, detail: asDelegate ? "as delegate" : undefined });

  await notify({
    userId: doc.uploadedById,
    type: decision === "APPROVE" ? "DOCUMENT_APPROVED" : "DOCUMENT_REJECTED",
    title: `${decision === "APPROVE" ? "Approved" : "Rejected"}: ${doc.title}`,
    body: note || undefined,
    link: `/documents/${doc.id}`,
  });

  await advanceWorkflow(doc.id);
  const updated = await prisma.document.findUnique({ where: { id: doc.id }, select: { id: true, status: true } });
  return updated!;
}
