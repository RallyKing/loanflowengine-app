import { headers } from "next/headers";
import {
  HEADER_CLIENT_TRACE_ID,
  HEADER_CORRELATION_ID,
  HEADER_REQUEST_ID,
} from "./constants";

export type RequestObservabilityContext = {
  requestId: string;
  correlationId: string;
  clientTraceId: string | null;
};

export async function getRequestObservabilityContext(): Promise<RequestObservabilityContext> {
  const h = await headers();
  const requestId =
    h.get(HEADER_REQUEST_ID) ??
    h.get(HEADER_REQUEST_ID.toUpperCase()) ??
    "unknown";
  const correlationId =
    h.get(HEADER_CORRELATION_ID) ??
    h.get(HEADER_CORRELATION_ID.toUpperCase()) ??
    requestId;
  const clientTraceId =
    h.get(HEADER_CLIENT_TRACE_ID) ??
    h.get(HEADER_CLIENT_TRACE_ID.toUpperCase());
  return {
    requestId,
    correlationId,
    clientTraceId: clientTraceId?.trim() || null,
  };
}

/** Sync helper when `headers()` is already available as a plain object / Headers. */
export function readObservabilityFromHeaders(
  h: Headers,
): RequestObservabilityContext {
  const requestId = h.get(HEADER_REQUEST_ID) ?? "unknown";
  const correlationId = h.get(HEADER_CORRELATION_ID) ?? requestId;
  const clientTraceId = h.get(HEADER_CLIENT_TRACE_ID);
  return {
    requestId,
    correlationId,
    clientTraceId: clientTraceId?.trim() || null,
  };
}
