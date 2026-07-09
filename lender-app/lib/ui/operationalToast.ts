"use client";

export type OperationalToastVariant = "default" | "success" | "destructive";

export type OperationalToastItem = {
  id: string;
  title: string;
  description?: string;
  variant?: OperationalToastVariant;
  durationMs?: number;
};

type Listener = (items: OperationalToastItem[]) => void;

let items: OperationalToastItem[] = [];
const listeners = new Set<Listener>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function emit() {
  listeners.forEach((l) => l([...items]));
}

export function subscribeOperationalToasts(listener: Listener): () => void {
  listeners.add(listener);
  listener([...items]);
  return () => listeners.delete(listener);
}

export function dismissOperationalToast(id: string) {
  const t = timers.get(id);
  if (t) clearTimeout(t);
  timers.delete(id);
  items = items.filter((i) => i.id !== id);
  emit();
}

export function showOperationalToast(
  payload: Omit<OperationalToastItem, "id">,
): string {
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const item: OperationalToastItem = { ...payload, id };
  items = [...items, item].slice(-4);
  emit();
  const duration = payload.durationMs ?? 3800;
  const t = setTimeout(() => dismissOperationalToast(id), duration);
  timers.set(id, t);
  return id;
}

/** Convenience for destructive confirmations feedback. */
export function showOperationalToastRemoved(entityLabel: string, name?: string) {
  showOperationalToast({
    title: `${entityLabel} removed`,
    description: name?.trim() || undefined,
    variant: "destructive",
  });
}
