"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import {
  appendPriorityDebugClientLog,
  isDebugAgentRemoteEnabled,
  postDebugAgentRemote,
} from "@/lib/debugClientLog";

type Props = {
  children: ReactNode;
  /** Clears captured render errors when workspace identity changes. */
  recoverKey: string;
};

type S = { error: Error | null };

/**
 * Captures subtree render errors (e.g. React max update depth), POSTs
 * `componentStack` to `/api/debug-agent-log` for local NDJSON capture.
 */
export class OrgSubtreeDebugBoundary extends Component<Props, S> {
  state: S = { error: null };

  static getDerivedStateFromError(error: unknown): S {
    return {
      error:
        error instanceof Error ? error : new Error(String(error ?? "unknown")),
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    const err =
      error instanceof Error ? error : new Error(String(error ?? "unknown"));
    const payload = {
      sessionId: "f25461",
      runId: "boundary-catch",
      hypothesisId: "H185_boundary",
      location: "OrgSubtreeDebugBoundary.componentDidCatch",
      message: err.message,
      data: {
        name: err.name,
        stack: err.stack ?? "",
        componentStack: info.componentStack ?? "",
      },
      timestamp: Date.now(),
    };
    appendPriorityDebugClientLog(payload);
    // #region agent log
    postDebugAgentRemote(payload);
    // #endregion
    if (isDebugAgentRemoteEnabled()) {
      console.warn("[OrgSubtreeDebugBoundary]", err.message, info.componentStack);
    }
  }

  componentDidUpdate(prevProps: Props): void {
    if (!this.state.error) return;
    if (prevProps.recoverKey !== this.props.recoverKey) {
      this.setState({ error: null });
    }
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="m-4 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm"
        >
          <p className="font-semibold text-destructive">Workspace UI error</p>
          <p className="mt-2 text-muted-foreground">
            {this.state.error.message}
          </p>
          {process.env.NODE_ENV === "development" &&
          this.state.error.stack?.trim() ? (
            <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-border bg-muted/30 p-2 text-[11px] text-muted-foreground">
              {this.state.error.stack}
            </pre>
          ) : null}
          <div className="mt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
