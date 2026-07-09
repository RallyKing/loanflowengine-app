import { cn } from "@/lib/cn";
import { premiumFieldLabelClass } from "@/lib/pipeline/premiumWorkspaceUi";

/** Shared label style for compact pipeline / file forms. */
export function FieldLabel({
  children,
  premium = false,
}: {
  children: React.ReactNode;
  premium?: boolean;
}) {
  return (
    <div
      className={cn(
        premium
          ? premiumFieldLabelClass
          : "text-xs font-medium text-[color:var(--ui-label)]",
      )}
    >
      {children}
    </div>
  );
}
