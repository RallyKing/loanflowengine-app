"use client";

import { BookOpen, CircleHelp, Keyboard } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useHelpSupport, getSupportMailtoHref } from "@/lib/helpSupportContext";

export function HelpSupportSettingsPanel() {
  const { openHelp } = useHelpSupport();
  const mail = getSupportMailtoHref();

  return (
    <div className="max-w-xl space-y-4">
      <p className="text-sm text-muted-foreground">
        Search bundled how-tos, browse by topic, or email support. Access stays
        lightweight: use the Help button in the header or press{" "}
        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px]">
          ?
        </kbd>{" "}
        when you are not typing in a field.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="gap-2"
          onClick={() => openHelp({})}
        >
          <BookOpen className="h-4 w-4" aria-hidden />
          Open help center
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => openHelp({ query: "search" })}
        >
          <CircleHelp className="h-4 w-4" aria-hidden />
          Browse articles
        </Button>
      </div>
      <div className="rounded-md border border-border/80 bg-muted/25 px-3 py-3">
        <div className="flex items-center gap-2 text-xs font-medium text-foreground">
          <Keyboard className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          Shortcuts
        </div>
        <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
          <li>
            <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono text-[10px]">
              ⌘K
            </kbd>{" "}
            /{" "}
            <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono text-[10px]">
              Ctrl+K
            </kbd>{" "}
            — global search
          </li>
          <li>
            <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono text-[10px]">
              ?
            </kbd>{" "}
            — help &amp; support (when not in a text field)
          </li>
        </ul>
      </div>
      {mail ? (
        <p className="text-xs text-muted-foreground">
          <a
            href={mail}
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            Contact support by email
          </a>{" "}
          with details and screenshots if something looks wrong.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Your deployment can expose{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
            NEXT_PUBLIC_SUPPORT_EMAIL
          </code>{" "}
          so the help panel can open a prefilled message.
        </p>
      )}
    </div>
  );
}
