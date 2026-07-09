/**
 * Phase 18.8A — operational async safety wrappers (UI only).
 */

export type OperationalTimeoutResult<T> =
  | { ok: true; value: T }
  | { ok: false; timedOut: true; message: string };

export async function withOperationalTimeout<T>(
  work: Promise<T>,
  options: { timeoutMs: number; message: string },
): Promise<OperationalTimeoutResult<T>> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    const timed = new Promise<OperationalTimeoutResult<T>>((resolve) => {
      timeout = setTimeout(() => {
        resolve({ ok: false, timedOut: true, message: options.message });
      }, options.timeoutMs);
    });
    const done = work.then((value) => ({ ok: true as const, value }));
    return (await Promise.race([done, timed])) as OperationalTimeoutResult<T>;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

