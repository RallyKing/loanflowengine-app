"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { toDisplayError } from "@/lib/caughtError";

type Props = {
  children: ReactNode;
  /** Shown when a child throws (e.g. Convex “function not found” during useQuery). */
  fallback: ReactNode;
  /**
   * When any entry changes (shallow compare by index), clear the captured error
   * so children remount their hooks and retry (e.g. after deploy + tab focus).
   */
  recoverOnKeys?: unknown[];
  /** If true, do not log in componentDidCatch (expected degraded paths, e.g. attachments). */
  silent?: boolean;
};

type State = { error: Error | null };

function keysChanged(a: unknown[] | undefined, b: unknown[] | undefined) {
  if (a === undefined && b === undefined) return false;
  if (a === undefined || b === undefined) return true;
  if (a.length !== b.length) return true;
  return a.some((v, i) => v !== b[i]);
}

/**
 * Catches render-time errors from Convex/React children so one failed query
 * does not take down the whole surface (e.g. task drawer body).
 */
export class ConvexQueryBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: toDisplayError(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    if (this.props.silent) return;
    const err = toDisplayError(error);
    if (process.env.NODE_ENV === "development") {
      console.warn("[ConvexQueryBoundary]", err.message, err.stack, info.componentStack);
    }
  }

  componentDidUpdate(prevProps: Props): void {
    if (!this.state.error) return;
    if (!keysChanged(this.props.recoverOnKeys, prevProps.recoverOnKeys)) return;
    this.setState({ error: null });
  }

  render(): ReactNode {
    if (this.state.error) return this.props.fallback;
    return this.props.children;
  }
}
