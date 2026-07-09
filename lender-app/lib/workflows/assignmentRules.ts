/**
 * Pure assignment workflow rules (no I/O). Used by Convex `assignments` and routers.
 */
export type EntityKind =
  | "pipeline_file"
  | "task"
  | "lender"
  | "library_document";

export const ASSIGNMENT_ROLES = [
  "owner",
  "assignee",
  "watcher",
  "follower",
  "reviewer",
  "approver",
] as const;

export type AssignmentRole = (typeof ASSIGNMENT_ROLES)[number];

const ROLE_RANK: Record<AssignmentRole, number> = {
  owner: 60,
  approver: 50,
  assignee: 40,
  reviewer: 35,
  watcher: 20,
  follower: 10,
};

/** Higher rank for first argument wins when result is positive. */
export function compareAssignmentRoles(a: AssignmentRole, b: AssignmentRole): number {
  return ROLE_RANK[a] - ROLE_RANK[b];
}

export function isPrivilegedAssignmentRole(role: AssignmentRole): boolean {
  return role === "owner" || role === "approver";
}

/**
 * One active owner per org + entity (enforced in mutations).
 */
export function allowsMultipleActive(role: AssignmentRole): boolean {
  return role !== "owner";
}
