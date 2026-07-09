"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { toDisplayError } from "@/lib/caughtError";

type Props = {
  children: ReactNode;
  /** When this value changes (e.g. route), clear the error so the page remounts cleanly. */
  recoverKey?: string;
};

type State = { error: Error | null };

/**
 * Catches render errors in page content so navigation chrome stays usable
 * and one broken view does not blank the entire shell.
 */
export class PageErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: toDisplayError(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    const err = toDisplayError(error);
    if (process.env.NODE_ENV === "development") {
      console.warn("[PageErrorBoundary]", err.message, err.stack, info.componentStack);
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
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-center"
          role="alert"
        >
          <p className="text-sm font-semibold text-destructive">
            This page hit an error
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {this.state.error.message ||
              "Something went wrong while rendering. You can retry or open another tab."}
          </p>
          {process.env.NODE_ENV === "development" &&
          this.state.error.stack &&
          this.state.error.stack.trim() ? (
            <details className="mt-4 max-h-48 w-full overflow-auto rounded-md border border-border bg-muted/40 p-3 text-left text-xs">
              <summary className="cursor-pointer font-medium text-foreground">
                Stack trace (development)
              </summary>
              <pre className="mt-2 whitespace-pre-wrap break-all font-mono text-[11px] text-muted-foreground">
                {this.state.error.stack}
              </pre>
            </details>
          ) : null}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                window.location.assign("/tasks");
              }}
            >
              Go to Tasks
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
