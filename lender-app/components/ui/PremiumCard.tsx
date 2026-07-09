import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import {
  premiumCardBodyPaddingClass,
  premiumCardClassName,
} from "@/lib/pipeline/premiumWorkspaceUi";

export type PremiumCardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  /** When true (default), applies standard inner padding. */
  padded?: boolean;
};

/** Floating card shell for premium workspace sections (Phase 38). */
export function PremiumCard({
  children,
  className,
  padded = true,
  ...props
}: PremiumCardProps) {
  return (
    <div
      className={cn(
        premiumCardClassName,
        padded && premiumCardBodyPaddingClass,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
