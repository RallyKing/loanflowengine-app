/**
 * Phase 18.8D — structured delete lifecycle logging (forensics).
 * Enabled in development or when NEXT_PUBLIC_DLC_DELETE_TRACE=1.
 */

export type DeleteTracePhase =
  | "modal_open"
  | "delete_start"
  | "delete_confirm_accepted"
  | "cancel_pressed"
  | "mutation_dispatched"
  | "mutation_start"
  | "mutation_resolved"
  | "mutation_rejected"
  | "mutation_success"
  | "mutation_failure"
  | "timeout_triggered"
  | "overlay_close"
  | "overlay_dismissed"
  | "redirect_start"
  | "redirect_completed";

export type DeleteTraceScope =
  | "operational_confirm_provider"
  | "operational_confirm_dialog"
  | "hub_client_delete"
  | "hub_project_delete"
  | "hub_loan_delete"
  | "pipeline_file_delete";

function traceEnabled(): boolean {
  if (typeof window === "undefined") {
    return process.env.NODE_ENV !== "production";
  }
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_DLC_DELETE_TRACE === "1"
  );
}

export function traceDeleteExecution(
  scope: DeleteTraceScope,
  phase: DeleteTracePhase,
  detail?: Record<string, unknown>,
): void {
  if (!traceEnabled()) return;
  const payload = detail ? { ...detail, scope, phase } : { scope, phase };
  console.info("[dlc-delete]", payload);
}
