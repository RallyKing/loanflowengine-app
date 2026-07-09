import type { Doc } from "@/convex/_generated/dataModel";

function trimStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v !== "string") return String(v).trim();
  return v.trim();
}

function joinPropertyAddress(
  p?: {
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
  } | null,
): string {
  if (!p) return "";
  const line1 = trimStr(p.address);
  const cityState = [trimStr(p.city), trimStr(p.state)].filter(Boolean).join(", ");
  const tail = [cityState, trimStr(p.zip)].filter(Boolean).join(" ");
  return [line1, tail].filter(Boolean).join(", ");
}

function coverSubjectOneLine(intake: Doc<"intakeSheets"> | null): string {
  if (!intake?.cover) return "";
  const raw = (intake.cover as { subjectProperty?: unknown }).subjectProperty;
  return trimStr(raw);
}

/**
 * Subject address line — same precedence as `convex/pipeline` table preview
 * and `commitPipelineSubjectAddress` (structured property → coversheet line →
 * primary → legacy pipeline → scenario).
 */
export function buildSubjectAddressDisplay(
  intake: Doc<"intakeSheets"> | null,
  p: { propertyAddress?: string | null },
): string {
  const intakeSubject = joinPropertyAddress(intake?.subjectProperty ?? null);
  const coverLine = intake ? coverSubjectOneLine(intake) : "";
  const intakePrimary = joinPropertyAddress(intake?.primaryProperty ?? null);
  return (
    intakeSubject ||
    coverLine ||
    intakePrimary ||
    trimStr(p.propertyAddress) ||
    trimStr(intake?.scenario?.propertyAddress) ||
    ""
  );
}
