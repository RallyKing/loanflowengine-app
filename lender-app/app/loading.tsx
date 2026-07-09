/** Route-level default while server/client segments load. */
export default function Loading() {
  return (
    <div
      className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-4"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span
        className="inline-block h-6 w-6 shrink-0 rounded-full border-2 border-muted-foreground/20 border-t-primary motion-safe:animate-spin"
        aria-hidden
      />
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  );
}
