/**
 * Namespaced client logging. Prefer this over raw `console.*` so production
 * can stay quieter and messages stay grep-friendly (`[dlc]`).
 *
 * - `error` / `warn` always emit (errors are actionable).
 * - `debug` / `info` only in development builds.
 */
const PREFIX = "[dlc]";

const isDev =
  typeof process !== "undefined" && process.env.NODE_ENV === "development";

export const log = {
  debug(...args: unknown[]) {
    if (isDev) console.debug(PREFIX, ...args);
  },

  info(...args: unknown[]) {
    if (isDev) console.info(PREFIX, ...args);
  },

  warn(...args: unknown[]) {
    console.warn(PREFIX, ...args);
  },

  /**
   * Log a failure. Pass the caught value as `err` so `Error` instances
   * keep stack traces in the console.
   */
  error(message: string, err?: unknown) {
    if (err !== undefined) console.error(PREFIX, message, err);
    else console.error(PREFIX, message);
  },
};
