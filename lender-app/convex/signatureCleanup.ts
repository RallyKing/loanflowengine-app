import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

/**
 * Remove all signature rows for a library document (before document purge).
 */
export async function deleteSignatureEnvelopesForDocument(
  ctx: MutationCtx,
  libraryDocumentId: Id<"libraryDocuments">,
): Promise<void> {
  const envelopes = await ctx.db
    .query("signatureEnvelopes")
    .withIndex("by_document_updatedAt", (q) =>
      q.eq("libraryDocumentId", libraryDocumentId),
    )
    .collect();
  for (const e of envelopes) {
    const signers = await ctx.db
      .query("signatureSigners")
      .withIndex("by_envelope_order", (q) => q.eq("envelopeId", e._id))
      .collect();
    for (const s of signers) {
      await ctx.db.delete(s._id);
    }
    const audits = await ctx.db
      .query("signatureAuditEvents")
      .withIndex("by_envelope_at", (q) => q.eq("envelopeId", e._id))
      .collect();
    for (const a of audits) {
      await ctx.db.delete(a._id);
    }
    await ctx.db.delete(e._id);
  }
}
