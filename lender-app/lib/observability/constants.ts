/** Echoed on responses and propagated on the internal Next request (middleware). */
export const HEADER_REQUEST_ID = "x-request-id";
/** Optional upstream / client root span id (defaults to request id when absent). */
export const HEADER_CORRELATION_ID = "x-correlation-id";
/** Browser-issued span id for correlating Convex logs with a tab session (not secret). */
export const HEADER_CLIENT_TRACE_ID = "x-dlc-client-trace-id";
/** Production-safe debug elevated responses (must pair with authenticated routes). */
export const HEADER_DEBUG_SECRET = "x-dlc-debug-secret";

export const LOG_PREFIX = "DLC_OBS";
