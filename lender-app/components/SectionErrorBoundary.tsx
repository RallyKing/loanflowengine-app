"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { toDisplayError } from "@/lib/caughtError";

type State = { err: Error | null };

/**
 * Catches render/query errors in a section so a failing child (e.g. a Convex
 * `useQuery`) does not prevent sibling UI (e.g. the main lender table) from mounting.
 */
export class SectionErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  State
> {
  state: State = { err: null };

  static getDerivedStateFromError(err: unknown): State {
    return { err: toDisplayError(err) };
  }

  override componentDidCatch(err: unknown, info: ErrorInfo) {
    const e = toDisplayError(err);
    console.error("[SectionErrorBoundary]", e.message, e.stack, info.componentStack);
  }

  override render() {
    if (this.state.err) return <>{this.props.fallback}</>;
    return this.props.children;
  }
}
