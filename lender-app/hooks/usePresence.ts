"use client";



import { useCallback, useEffect, useRef } from "react";

import { useMutation } from "convex/react";

import type { Id } from "@/convex/_generated/dataModel";

import { api } from "@/convex/_generated/api";

import type { WorkspaceSurface } from "@/lib/collaboration/workspaceSurface";

import {

  getConvexSubDiagnostics,

  isConvexSubDebugEnabled,

} from "@/lib/convexSubDiagnostics";
import { getConvexCostGovernance } from "@/lib/convexCostGovernance";
import { traceConvexMutation } from "@/lib/convexWriteStormGovernance";

import { useConvexSubMountTrace } from "@/lib/convexSubDiagnosticsHooks";



export type PresenceStatus =

  | "online"

  | "viewing_file"

  | "editing_file"

  | "idle"

  | "away"

  | "typing";



/** Active tab — at most one heartbeat per 60s (Convex guidance + churn budget). */

const HEARTBEAT_MS = 60_000;



type PresencePayload = {

  organizationId: Id<"organizations">;

  memberUserKey?: string;

  status: PresenceStatus;

  pipelineFileId?: Id<"pipeline">;

  collaborationThreadId?: Id<"collaborationThreads">;

  workspaceSurface?: WorkspaceSurface;

  surfaceKey?: string;

  observationOnly?: boolean;

};



function payloadKey(p: PresencePayload): string {

  return JSON.stringify({

    organizationId: p.organizationId,

    memberUserKey: p.memberUserKey ?? "",

    status: p.status,

    pipelineFileId: p.pipelineFileId ?? "",

    collaborationThreadId: p.collaborationThreadId ?? "",

    workspaceSurface: p.workspaceSurface ?? "",

    surfaceKey: p.surfaceKey ?? "",

    observationOnly: p.observationOnly === true,

  });

}



export function usePresence(args: {

  organizationId: Id<"organizations"> | null | undefined;

  memberUserKey?: string;

  status: PresenceStatus;

  pipelineFileId?: Id<"pipeline">;

  collaborationThreadId?: Id<"collaborationThreads">;

  workspaceSurface?: WorkspaceSurface;

  surfaceKey?: string;

  observationOnly?: boolean;

}) {

  useConvexSubMountTrace("usePresence");



  const heartbeat = useMutation(api.presence.heartbeat);

  const clear = useMutation(api.presence.clearForUser);

  const tabSessionId = useRef(

    typeof crypto !== "undefined" && "randomUUID" in crypto

      ? crypto.randomUUID()

      : `tab-${Math.random().toString(36).slice(2)}`,

  );



  const argsRef = useRef(args);

  argsRef.current = args;



  const lastSentKeyRef = useRef<string | null>(null);

  const visDebounceRef = useRef<number | null>(null);



  const sendHeartbeat = useCallback(

    async (force = false) => {

      const a = argsRef.current;

      const orgId = a.organizationId;

      if (!orgId) return;

      if (typeof document !== "undefined" && document.visibilityState === "hidden") {

        return;

      }



      const payload: PresencePayload = {

        organizationId: orgId,

        memberUserKey: a.memberUserKey,

        status: a.status,

        pipelineFileId: a.pipelineFileId,

        collaborationThreadId: a.collaborationThreadId,

        workspaceSurface: a.workspaceSurface,

        surfaceKey: a.surfaceKey,

        observationOnly: a.observationOnly,

      };

      const key = payloadKey(payload);

      if (!force && lastSentKeyRef.current === key) return;

      const cost = getConvexCostGovernance();
      if (!force && !cost.canSendPresenceWrite()) return;

      lastSentKeyRef.current = key;



      getConvexCostGovernance().recordPresenceWriteSent();
      traceConvexMutation("usePresence", "presence.heartbeat");

      try {

        await heartbeat({

          memberUserKey: payload.memberUserKey,

          organizationId: payload.organizationId,

          status: payload.status,

          pipelineFileId: payload.pipelineFileId,

          collaborationThreadId: payload.collaborationThreadId,

          tabSessionId: tabSessionId.current,

          workspaceSurface: payload.workspaceSurface,

          surfaceKey: payload.surfaceKey,

          observationOnly: payload.observationOnly,

        });

      } catch {

        /* non-fatal — reconnect / permission / offline */

      }

    },

    [heartbeat],

  );



  /** Interval + visibility — keyed only on org + member (not volatile surface fields). */

  useEffect(() => {

    const orgId = args.organizationId;

    if (!orgId) return;



    void sendHeartbeat(true);



    let intervalId: number | undefined;

    const armInterval = () => {

      if (typeof document !== "undefined" && document.visibilityState === "hidden") {

        return;

      }

      if (intervalId !== undefined) return;

      intervalId = window.setInterval(() => void sendHeartbeat(false), HEARTBEAT_MS);

    };

    const disarmInterval = () => {

      if (intervalId !== undefined) {

        window.clearInterval(intervalId);

        intervalId = undefined;

      }

    };

    armInterval();



    const onVis = () => {

      if (isConvexSubDebugEnabled()) {

        getConvexSubDiagnostics().recordVisibility("usePresence");

      }

      if (visDebounceRef.current !== null) {

        window.clearTimeout(visDebounceRef.current);

      }

      visDebounceRef.current = window.setTimeout(() => {

        visDebounceRef.current = null;

        if (document.visibilityState === "hidden") {

          disarmInterval();

          lastSentKeyRef.current = null;

          void clear({

            memberUserKey: argsRef.current.memberUserKey,

            organizationId: orgId,

          });
          traceConvexMutation("usePresence", "presence.clearForUser");

        } else {

          void sendHeartbeat(true);

          armInterval();

        }

      }, 80);

    };



    const onOnline = () => {

      void sendHeartbeat(true);

    };



    document.addEventListener("visibilitychange", onVis);

    window.addEventListener("online", onOnline);

    return () => {

      disarmInterval();

      if (visDebounceRef.current !== null) {

        window.clearTimeout(visDebounceRef.current);

        visDebounceRef.current = null;

      }

      document.removeEventListener("visibilitychange", onVis);

      window.removeEventListener("online", onOnline);

      lastSentKeyRef.current = null;

      void clear({

        memberUserKey: argsRef.current.memberUserKey,

        organizationId: orgId,

      });
      traceConvexMutation("usePresence", "presence.clearForUser");

    };

  }, [args.memberUserKey, args.organizationId, clear, sendHeartbeat]);



  /** Surface/status changes — heartbeat only when semantic payload changes. */

  useEffect(() => {

    void sendHeartbeat(false);

  }, [

    args.status,

    args.pipelineFileId,

    args.collaborationThreadId,

    args.workspaceSurface,

    args.surfaceKey,

    args.observationOnly,

    sendHeartbeat,

  ]);



  return { flush: () => sendHeartbeat(true), tabSessionId: tabSessionId.current };

}


