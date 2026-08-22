/**
 * Client portal block-assignment UX maps onto existing vault task statuses:
 * - incomplete      → draft / in progress (autosave only; form editable)
 * - pending_review  → client submitted (broker review; client may Revise until complete)
 * - complete        → broker marked complete (client locked out)
 *
 * Autosave must never promote incomplete → pending_review; only explicit Submit does.
 */

export type VaultFileTaskStatus =
  | "incomplete"
  | "pending_review"
  | "complete";

export type ClientBlockAssignmentPhase =
  | "draft"
  | "submitted"
  | "complete";

export function clientBlockAssignmentPhase(
  status: VaultFileTaskStatus,
): ClientBlockAssignmentPhase {
  if (status === "complete") return "complete";
  if (status === "pending_review") return "submitted";
  return "draft";
}

/** True when the client may still edit / revise the assigned block form. */
export function clientBlockAssignmentAllowsEdit(
  status: VaultFileTaskStatus,
): boolean {
  return status !== "complete";
}

/**
 * Whether fields should be read-only right now.
 * After submit, fields lock until the client clicks Revise (local UI).
 */
export function clientBlockFormFieldsReadOnly(args: {
  taskStatus: VaultFileTaskStatus;
  revising: boolean;
  forceDisabled?: boolean;
}): boolean {
  if (args.forceDisabled) return true;
  if (args.taskStatus === "complete") return true;
  if (args.taskStatus === "pending_review" && !args.revising) return true;
  return false;
}
