"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { toDisplayError } from "@/lib/caughtError";

type Props = {
  children: ReactNode;
  /** Log prefix when a child throws (e.g. `productKnowledge:updates-bell`). */
  feature?: string;
};

type State = { err: Error | null };

/**
 * Fails silently — returns `null` when a child throws (e.g. missing Convex function).
 * Use around optional chrome features so backend gaps do not crash AppChrome.
 */
export class SilentFeatureErrorBoundary extends Component<Props, State> {
  state: State = { err: null };

  static getDerivedStateFromError(err: unknown): State {
    return { err: toDisplayError(err) };
  }

  override componentDidCatch(err: unknown, info: ErrorInfo) {
    const e = toDisplayError(err);
    const tag = this.props.feature ? `[SilentFeatureErrorBoundary:${this.props.feature}]` : "[SilentFeatureErrorBoundary]";
    console.warn(tag, e.message, info.componentStack);
  }

  override render() {
    if (this.state.err) return null;
    return this.props.children;
  }
}
