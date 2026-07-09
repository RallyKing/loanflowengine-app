/**

 * Phase 18.8F — destructive confirmation layout tokens.

 */



import { cn } from "@/lib/cn";



export type OperationalConfirmVariant =

  | "delete"

  | "archive"

  | "revoke"

  | "unlink"

  | "remove_collaborator"

  | "transfer";



export type OperationalConfirmPreviewRow = {

  label: string;

  value: string;

};



export type OperationalConfirmRelationshipCount = {

  label: string;

  count: number;

};



export type OperationalConfirmCascadeItem = {

  text: string;

  tone?: "neutral" | "attention";

};



export type OperationalConfirmPreview = {

  hierarchy?: string;

  ownership?: string;

  rows?: OperationalConfirmPreviewRow[];

  relationshipCounts?: OperationalConfirmRelationshipCount[];

};



export const OP_CONFIRM_PANEL = cn("flex h-full min-h-0 w-full flex-col");



export const OP_CONFIRM_HEADER = cn(

  "shrink-0 space-y-2 px-6 pb-1 pt-6",

  "max-md:px-5 max-md:pt-5",

);



export const OP_CONFIRM_TITLE =

  "text-dlc-title-md font-semibold leading-tight tracking-dlc-title-md text-foreground";



export const OP_CONFIRM_ENTITY =

  "break-words text-dlc-body-lg font-medium leading-snug text-foreground/95";



export const OP_CONFIRM_IMPACT =

  "text-dlc-body-md leading-relaxed text-muted-foreground";



export const OP_CONFIRM_PREVIEW_SURFACE = cn(

  "rounded-dlc-md border border-border/50 bg-muted/25 px-4 py-3.5",

  "space-y-3",

);



export const OP_CONFIRM_PREVIEW_LABEL =

  "text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70";



export const OP_CONFIRM_PREVIEW_VALUE =

  "break-words text-sm font-medium leading-snug text-foreground";



export const OP_CONFIRM_CASCADE_SURFACE = cn(

  "rounded-dlc-md border border-amber-500/15 bg-amber-500/[0.04] px-4 py-3.5",

);



export const OP_CONFIRM_TERTIARY =

  "text-[11px] leading-relaxed text-muted-foreground/55 font-mono";



export const OP_CONFIRM_BODY = cn(

  "min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-6 py-5",

  "max-md:space-y-4 max-md:px-5 max-md:py-4",

);



export const OP_CONFIRM_FOOTER = cn(

  "shrink-0 w-full border-t border-border/40 bg-background/98 px-6 py-5",

  "max-md:px-5 max-md:py-4",

  "min-h-[5.25rem] pb-[max(1.25rem,env(safe-area-inset-bottom))]",

);



/** Centered action cluster — no justify-between (avoids right-weighted footer). */

export const OP_CONFIRM_ACTIONS = cn(

  "flex w-full flex-col gap-3",

  "md:flex-row md:flex-wrap md:items-center md:justify-center md:gap-4",

);



export const OP_CONFIRM_CANCEL_ZONE = "flex shrink-0 flex-col justify-center";



export const OP_CONFIRM_DANGER_ZONE = cn(

  "flex w-full shrink-0 flex-col gap-2.5 rounded-dlc-md border border-destructive/15 bg-destructive/[0.04] p-3.5",

  "md:w-auto md:max-w-full md:flex-row md:flex-nowrap md:items-center md:justify-center md:gap-3",

);



export const OP_CONFIRM_TYPED_INPUT = cn("mt-2 w-full min-w-[12rem] font-mono text-sm");



export const OP_CONFIRM_ERROR_SLOT = "min-h-[3.25rem] shrink-0";



export const OP_CONFIRM_ERROR = cn(

  "rounded-dlc-md border border-destructive/25 bg-destructive/5 px-3.5 py-2.5 text-sm leading-snug text-destructive",

);



export function operationalConfirmTitleForVariant(

  variant: OperationalConfirmVariant,

  entityLabel?: string,

): string {

  switch (variant) {

    case "archive":

      return entityLabel ? `Archive ${entityLabel}?` : "Archive item?";

    case "revoke":

      return "Revoke access?";

    case "unlink":

      return "Remove link?";

    case "remove_collaborator":

      return "Remove collaborator?";

    case "transfer":

      return "Confirm transfer";

    case "delete":

    default:

      return entityLabel ? `Delete ${entityLabel}?` : "Delete item?";

  }

}



export function operationalConfirmLabelForVariant(

  variant: OperationalConfirmVariant,

): string {

  switch (variant) {

    case "archive":

      return "Archive";

    case "revoke":

      return "Revoke access";

    case "unlink":

      return "Remove link";

    case "remove_collaborator":

      return "Remove collaborator";

    case "transfer":

      return "Confirm transfer";

    case "delete":

    default:

      return "Delete permanently";

  }

}


