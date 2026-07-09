import { Badge, type BadgeVariant } from "@/components/ui/Badge";

function statusToBadgeVariant(status: string | undefined): BadgeVariant {
  const s = (status ?? "").trim().toLowerCase();
  if (!s) return "neutral";
  if (
    s.includes("fund") ||
    s.includes("closed") ||
    s.includes("won") ||
    s.includes("complete")
  ) {
    return "approved";
  }
  if (
    s.includes("declin") ||
    s.includes("lost") ||
    s.includes("dead") ||
    s.includes("cancel")
  ) {
    return "declined";
  }
  if (s.includes("active") || s.includes("progress") || s.includes("open")) {
    return "active";
  }
  if (s.includes("pending") || s.includes("review") || s.includes("wait")) {
    return "pending";
  }
  return "info";
}

export function DealStatusBadge({ status }: { status?: string }) {
  const label = status?.trim() || "Unknown";
  return <Badge variant={statusToBadgeVariant(status)}>{label}</Badge>;
}

export function ContactRoleBadge({ label }: { label: string }) {
  return <Badge variant="info">{label}</Badge>;
}
