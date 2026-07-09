"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  DEBUG_CLIENT_LOG_KEY,
  DEBUG_CLIENT_PRIORITY_KEY,
  flushPriorityBufferToWorkspaceViaApi,
} from "@/lib/debugClientLog";

/**
 * Shows mirrored NDJSON from `appendDebugClientLog` when `/api/debug-agent-log` cannot reach disk.
 * Signed-in users only (middleware); open after a repro to copy stacks for debugging.
 */
export default function AgentDebugLogPage() {
  const [priorityText, setPriorityText] = useState<string>("");
  const [generalText, setGeneralText] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [flushBusy, setFlushBusy] = useState(false);

  const refresh = useCallback(() => {
    try {
      setPriorityText(localStorage.getItem(DEBUG_CLIENT_PRIORITY_KEY) ?? "");
      setGeneralText(localStorage.getItem(DEBUG_CLIENT_LOG_KEY) ?? "");
      setStatus("Loaded from localStorage.");
    } catch {
      setStatus("Could not read localStorage.");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const combined = [
    priorityText.trim()
      ? `--- priority (${DEBUG_CLIENT_PRIORITY_KEY}) ---\n${priorityText}`
      : "",
    generalText.trim()
      ? `--- general (${DEBUG_CLIENT_LOG_KEY}) ---\n${generalText}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(combined);
      setStatus("Copied to clipboard.");
    } catch {
      setStatus("Clipboard failed — select and copy manually.");
    }
  };

  const download = () => {
    const blob = new Blob([combined || ""], { type: "application/x-ndjson" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "debug-f25461-client.ndjson";
    a.click();
    URL.revokeObjectURL(url);
    setStatus("Download started.");
  };

  const flushToWorkspace = useCallback(async () => {
    setFlushBusy(true);
    try {
      const { posted, skipped, failed } =
        await flushPriorityBufferToWorkspaceViaApi();
      setStatus(
        `Flush: ${posted} line(s) written to server log file, ${skipped} skipped (oversize), ${failed} failed. Requires local \`npm run dev\` and writable path (see DEBUG_AGENT_LOG_PATH).`,
      );
    } finally {
      setFlushBusy(false);
    }
  }, []);

  const clear = () => {
    try {
      localStorage.removeItem(DEBUG_CLIENT_PRIORITY_KEY);
      localStorage.removeItem(DEBUG_CLIENT_LOG_KEY);
      setPriorityText("");
      setGeneralText("");
      setStatus("Cleared buffers.");
    } catch {
      setStatus("Could not clear localStorage.");
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold">Agent debug log (client buffer)</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          <strong className="font-medium text-foreground">Priority</strong> (
          <code className="text-xs">{DEBUG_CLIENT_PRIORITY_KEY}</code>):{" "}
          <code className="text-xs">H185_early</code> /{" "}
          <code className="text-xs">H185_boundary</code> only — not evicted by
          high-frequency telemetry. <strong className="font-medium text-foreground">General</strong>{" "}
          ring: <code className="text-xs">{DEBUG_CLIENT_LOG_KEY}</code>.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={refresh}>
          Refresh
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={copy}>
          Copy
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={download}>
          Download
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={flushBusy}
          onClick={() => void flushToWorkspace()}
        >
          Flush priority to workspace
        </Button>
        <Button type="button" size="sm" variant="danger" onClick={clear}>
          Clear buffers
        </Button>
      </div>
      {status ? (
        <p className="text-sm text-muted-foreground" role="status">
          {status}
        </p>
      ) : null}
      <div className="space-y-3">
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Priority
          </p>
          <pre className="max-h-[min(38vh,360px)] overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/20 p-3 text-[11px] leading-relaxed text-foreground">
            {priorityText.trim() ||
              "(empty — H185 lines appear here after repro)"}
          </pre>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            General
          </p>
          <pre className="max-h-[min(38vh,360px)] overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/20 p-3 text-[11px] leading-relaxed text-foreground">
            {generalText.trim() ||
              "(empty — optional ring buffer; errors use priority above)"}
          </pre>
        </div>
      </div>
    </div>
  );
}
