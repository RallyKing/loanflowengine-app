export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { obsLog } = await import("./lib/observability/logger");
  obsLog("info", "instrumentation.register", {
    node: process.version,
    nodeEnv: process.env.NODE_ENV ?? "unknown",
  });
}
