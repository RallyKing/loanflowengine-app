"use client";

import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useTriageClockTime } from "@/components/providers/TriageClockProvider";
import {
  EMPTY_HUB_TRIAGE_HIGHLIGHT_MAP,
  hubTriageMapFromQuery,
  normalizeHubTriageHighlightMap,
  type HubTriageHighlightMapView,
} from "@/lib/pipeline/hubTriageHighlight";
import { projectHubTriageHighlightMap } from "@/lib/pipeline/projectHubTriageHighlightMap";
import { resolveTriageEvaluationTime } from "@/lib/triageClock";

function triageHighlightContextKey(
  organizationId: Id<"organizations"> | null | undefined,
  memberUserKey: string | undefined,
): string | null {
  const key = memberUserKey?.trim();
  if (!organizationId || !key) return null;
  return `${organizationId}:${key}`;
}

/**
 * Reactive triage bubbles for hub / board / file workspace (Phase 24.2A).
 *
 * Query args are stable (no minute `nowBucket`) so Convex does not force a full
 * uncached re-read every 60s. Time-sensitive schedule / snooze / overdue gates
 * are projected locally from `fileCandidates` using TriageClockProvider.
 */
export function useHubTriageHighlightMap(
  organizationId: Id<"organizations"> | null | undefined,
  memberUserKey: string | undefined,
): HubTriageHighlightMapView {
  const contextKey = triageHighlightContextKey(organizationId, memberUserKey);
  const nowBucket = useTriageClockTime();

  const queryArgs = useMemo(() => {
    if (!contextKey) return "skip" as const;
    const key = memberUserKey!.trim();
    return {
      organizationId: organizationId!,
      memberUserKey: key,
    };
  }, [contextKey, organizationId, memberUserKey]);

  const raw = useQuery(api.taskHighlights.getHubTriageHighlightMap, queryArgs);

  const lastKnownMapRef = useRef<HubTriageHighlightMapView>(
    EMPTY_HUB_TRIAGE_HIGHLIGHT_MAP,
  );
  const loadedContextKeyRef = useRef<string | null>(null);

  const normalized = useMemo(() => {
    if (raw === undefined) return undefined;
    const candidates = raw.fileCandidates;
    if (Array.isArray(candidates)) {
      const now = resolveTriageEvaluationTime(nowBucket);
      return hubTriageMapFromQuery(
        projectHubTriageHighlightMap(candidates, now),
      );
    }
    return normalizeHubTriageHighlightMap(raw);
  }, [raw, nowBucket]);

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
