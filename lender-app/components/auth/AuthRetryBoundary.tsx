"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { toDisplayError } from "@/lib/caughtError";
import type { AuthMachineState } from "@/lib/auth/authTypes";

type Props = {
  children: ReactNode;
  recoverKey?: string;
  /** When auth connectivity changes, reset error UI. */
  authRecoverKey?: string;
  fallbackTitle?: string;
};

type S = { error: Error | null };

/**
 * Catches render errors under auth-heavy subtrees; resets when route or auth phase changes.
 */
export class AuthRetryBoundary extends Component<Props, S> {
  state: S = { error: null };

  static getDerivedStateFromError(error: unknown): S {
    return { error: toDisplayError(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    const err = toDisplayError(error);
    if (process.env.NODE_ENV === "development") {
      console.warn("[AuthRetryBoundary]", err.message, info.componentStack);
    }
  }

  componentDidUpdate(prev: Props): void {
    if (!this.state.error) return;
    if (prev.recoverKey !== this.props.recoverKey) {
      this.setState({ error: null });
      return;
    }
    if (prev.authRecoverKey !== this.props.authRecoverKey) {
      this.setState({ error: null });
    }
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          className="rounded-lg border border-destructive/35 bg-destructive/5 p-5"
          role="alert"
        >
          <p className="text-sm font-semibold text-destructive">
            {this.props.fallbackTitle ?? "Something went wrong"}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {this.state.error.message || "Retry loading this section."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
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

export function authRecoverKeyFromState(state: AuthMachineState): string {
  return state;
}
