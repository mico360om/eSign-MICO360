import { ApprovalMode, DocumentStatus, StepStatus } from "../constants";
import { prisma } from "../lib/prisma";
import { docEvent } from "../lib/audit";
import { notify, notifyWithDelegate } from "../lib/notify";
import { applyPlacements, PlacementInput } from "../lib/pdf";
import { digitallySignPdf } from "../lib/digitalsign";
import { sha256File } from "../lib/integrity";
import { abs, rel } from "../lib/storage";

/**
 * Recompute a document's status from its approval steps and, when fully
 * approved, generate the final signed PDF from the placements.
 *
 * Rules:
 *  - any REJECTED step  → REJECTED
 *  - all APPROVED       → APPROVED → render final PDF → COMPLETED
 *  - some APPROVED      → PARTIALLY_APPROVED
 *  - none acted yet     → PENDING_APPROVAL
 * In SEQUENTIAL mode only the lowest-order PENDING step is "active"; we notify
 * that signatory when the previous one approves.
 */
export async function advanceWorkflow(documentId: string) {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { steps: { orderBy: { order: "asc" } }, placements: true },
  });
  if (!doc) return;

  const steps = doc.steps;
  const anyRejected = steps.some((s) => s.status === StepStatus.REJECTED);
  const approved = steps.filter((s) => s.status === StepStatus.APPROVED);
  const allApproved = steps.length > 0 && approved.length === steps.length;

  let status: DocumentStatus;
  if (anyRejected) status = DocumentStatus.REJECTED;
  else if (allApproved) status = DocumentStatus.APPROVED;
  else if (approved.length > 0) status = DocumentStatus.PARTIALLY_APPROVED;
  else status = DocumentStatus.PENDING_APPROVAL;

  await prisma.document.update({ where: { id: documentId }, data: { status } });

  // Sequential: notify the next pending signatory.
  if (doc.approvalMode === ApprovalMode.SEQUENTIAL && !anyRejected && !allApproved) {
    const next = steps.find((s) => s.status === StepStatus.PENDING);
    if (next) {
      await notifyWithDelegate(next.signatoryId, {
        type: "APPROVAL_REQUIRED",
        title: `Approval required: ${doc.title}`,
        body: "A document is awaiting your approval.",
        link: `/documents/${doc.id}`,
      });
    }
  }

  if (allApproved && !anyRejected) {
    await finalizeDocument(documentId);
  }
}

/** Render the final signed PDF and mark the document COMPLETED. */
export async function finalizeDocument(documentId: string) {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { placements: true },
  });
  if (!doc?.convertedPdfPath) return;

  const placements: PlacementInput[] = doc.placements.map((p) => ({
    kind: p.kind as "SIGNATURE" | "STAMP",
    page: p.page,
    x: p.x,
    y: p.y,
    width: p.width,
    height: p.height,
    imageAbsPath: abs(p.imagePath),
  }));

  const finalAbs = await applyPlacements(abs(doc.convertedPdfPath), placements);

  // Apply a cryptographic signature if the requester chose the DIGITAL method.
  let digitallySigned = false;
  if (doc.signatureMethod === "DIGITAL") {
    try {
      await digitallySignPdf(finalAbs, { reason: `Approved: ${doc.title}` });
      digitallySigned = true;
      await docEvent(documentId, "DIGITALLY_SIGNED", null, "PKCS#7 signature embedded");
    } catch (e) {
      await docEvent(documentId, "DIGITAL_SIGN_FAILED", null, String((e as Error)?.message || e));
    }
  }

  const finalHash = sha256File(finalAbs);

  await prisma.document.update({
    where: { id: documentId },
    data: {
      finalPdfPath: rel(finalAbs),
      finalHash,
      digitallySigned,
      status: DocumentStatus.COMPLETED,
      completedAt: new Date(),
    },
  });

  await docEvent(documentId, "COMPLETED", null, `Final ${digitallySigned ? "digitally-signed " : ""}PDF generated`);

  await notify({
    userId: doc.uploadedById,
    type: "DOCUMENT_COMPLETED",
    title: `Completed: ${doc.title}`,
    body: "Your document has been fully approved and signed.",
    link: `/documents/${doc.id}`,
  });
}
