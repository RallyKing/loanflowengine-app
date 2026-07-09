"use client";

import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useTriageClockTime } from "@/components/providers/TriageClockProvider";
import {
  EMPTY_HUB_TRIAGE_HIGHLIGHT_MAP,
  normalizeHubTriageHighlightMap,
  type HubTriageHighlightMapView,
} from "@/lib/pipeline/hubTriageHighlight";

function triageHighlightContextKey(
  organizationId: Id<"organizations"> | null | undefined,
  memberUserKey: string | undefined,
): string | null {
  const key = memberUserKey?.trim();
  if (!organizationId || !key) return null;
  return `${organizationId}:${key}`;
}

/** Reactive triage bubbles for hub / board / file workspace (Phase 24.2A). */
export function useHubTriageHighlightMap(
  organizationId: Id<"organizations"> | null | undefined,
  memberUserKey: string | undefined,
): HubTriageHighlightMapView {
  const nowBucket = useTriageClockTime();
  const contextKey = triageHighlightContextKey(organizationId, memberUserKey);

  const queryArgs = useMemo(() => {
    if (!contextKey) return "skip" as const;
    const key = memberUserKey!.trim();
    return {
      organizationId: organizationId!,
      memberUserKey: key,
      nowBucket,
    };
  }, [contextKey, organizationId, memberUserKey, nowBucket]);

  const raw = useQuery(api.taskHighlights.getHubTriageHighlightMap, queryArgs);

  const lastKnownMapRef = useRef<HubTriageHighlightMapView>(
    EMPTY_HUB_TRIAGE_HIGHLIGHT_MAP,
  );
  const loadedContextKeyRef = useRef<string | null>(null);

  const normalized = useMemo(() => {
    if (raw === undefined) return undefined;
    return normalizeHubTriageHighlightMap(raw);
  }, [raw]);

  useEffect(() => {
    if (!contextKey) {
      lastKnownMapRef.current = EMPTY_HUB_TRIAGE_HIGHLIGHT_MAP;
      loadedContextKeyRef.current = null;
      return;
    }
    if (
      loadedContextKeyRef.current !== null &&
      loadedContextKeyRef.current !== contextKey
    ) {
      lastKnownMapRef.current = EMPTY_HUB_TRIAGE_HIGHLIGHT_MAP;
      loadedContextKeyRef.current = null;
    }
  }, [contextKey]);

  useEffect(() => {
    if (normalized === undefined || !contextKey) return;
    lastKnownMapRef.current = normalized;
    loadedContextKeyRef.current = contextKey;
  }, [normalized, contextKey]);

  return useMemo(() => {
    if (queryArgs === "skip") {
      return EMPTY_HUB_TRIAGE_HIGHLIGHT_MAP;
    }
    if (normalized !== undefined) {
      return normalized;
    }
    if (loadedContextKeyRef.current === contextKey) {
      return lastKnownMapRef.current;
    }
    return EMPTY_HUB_TRIAGE_HIGHLIGHT_MAP;
  }, [queryArgs, normalized, contextKey]);
}

export { EMPTY_HUB_TRIAGE_HIGHLIGHT_MAP };
