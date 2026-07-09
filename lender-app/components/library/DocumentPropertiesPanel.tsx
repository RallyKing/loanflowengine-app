"use client";

import { useCallback, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { LibraryDocumentsProof } from "@/components/LibraryDocumentsPanel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";

function formatBytes(size: number | undefined) {
  if (size == null || size <= 0) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatWhen(ts: number | undefined) {
  if (ts == null) return "—";
  return new Date(ts).toLocaleString();
}

export type DocumentPropertiesPanelProps = {
  documentId: Id<"libraryDocuments">;
  proof: LibraryDocumentsProof;
  memberUserKey?: string;
  canMutate: boolean;
  onClose: () => void;
  onError: (message: string) => void;
  className?: string;
};

export function DocumentPropertiesPanel({
  documentId,
  proof,
  memberUserKey,
  canMutate,
  onClose,
  onError,
  className,
}: DocumentPropertiesPanelProps) {
  const props = useQuery(
    api.libraryDocuments.getDocumentProperties,
    memberUserKey
      ? { documentId, proof, memberUserKey }
      : { documentId, proof },
  );

  const patchLinkMetadata = useMutation(
    api.libraryDocuments.patchDocumentLinkMetadata,
  );

  const [tagInput, setTagInput] = useState("");
  const [busy, setBusy] = useState(false);

  const saveTags = useCallback(
    async (tags: string[]) => {
      if (!memberUserKey) return;
      setBusy(true);
      try {
        await patchLinkMetadata({
          documentId,
          proof,
          customTags: tags.length ? tags : "__unset__",
          memberUserKey,
        });
      } catch (e) {
        onError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [documentId, memberUserKey, onError, patchLinkMetadata, proof],
  );

  const addTag = () => {
    const next = tagInput.trim();
    if (!next || !props) return;
    const merged = [...new Set([...(props.customTags ?? []), next])];
    setTagInput("");
    void saveTags(merged);
  };

  const removeTag = (tag: string) => {
    if (!props) return;
    void saveTags((props.customTags ?? []).filter((t) => t !== tag));
  };

  return (
    <aside
      className={cn(
        "flex min-h-0 w-full min-w-0 flex-col rounded-dlc-md border border-border/70 bg-dlc-surface-high shadow-dlc-2 lg:w-80 lg:shrink-0",
        className,
      )}
      data-testid="document-properties-panel"
      aria-label="Document properties"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3 py-2.5">
        <h3 className="text-sm font-semibold text-foreground">Properties</h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={onClose}
          aria-label="Close properties"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 text-sm">
        {props === undefined ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : props === null ? (
          <p className="text-muted-foreground">Document not found.</p>
        ) : (
          <div className="space-y-4">
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                File info
              </h4>
              <dl className="mt-2 space-y-1.5 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Title</dt>
                  <dd className="max-w-[60%] truncate text-right font-medium">
                    {props.title}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Type</dt>
                  <dd>{props.latestContentType ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Size</dt>
                  <dd>{formatBytes(props.latestSize)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Versions</dt>
                  <dd>{props.latestVersionNumber}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Created</dt>
                  <dd>{formatWhen(props.createdAt)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Updated</dt>
                  <dd>{formatWhen(props.updatedAt)}</dd>
                </div>
              </dl>
            </section>

            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Custom tags
              </h4>
              <ul className="mt-2 flex flex-wrap gap-1">
                {(props.customTags ?? []).length === 0 ? (
                  <li className="text-xs text-muted-foreground">No tags</li>
                ) : (
                  props.customTags.map((tag) => (
                    <li key={tag}>
                      <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px]">
                        {tag}
                        {canMutate ? (
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground"
                            aria-label={`Remove tag ${tag}`}
                            onClick={() => removeTag(tag)}
                          >
                            ×
                          </button>
                        ) : null}
                      </span>
                    </li>
                  ))
                )}
              </ul>
              {canMutate ? (
                <div className="mt-2 flex gap-1">
                  <Input
                    className="h-8 text-xs"
                    placeholder="Add tag…"
                    value={tagInput}
                    disabled={busy}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 shrink-0 px-2 text-xs"
                    disabled={busy || !tagInput.trim()}
                    onClick={addTag}
                  >
                    Add
                  </Button>
                </div>
              ) : null}
            </section>

            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Access log
              </h4>
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-[11px]">
                {props.accessLog.length === 0 ? (
                  <li className="text-muted-foreground">No activity yet</li>
                ) : (
                  props.accessLog.map((entry, i) => (
                    <li
                      key={`${entry.at}-${entry.userKey}-${i}`}
                      className="rounded-dlc-sm border border-border/40 px-2 py-1"
                    >
                      <span className="font-medium capitalize">
                        {entry.action}
                      </span>
                      {" · "}
                      <span className="text-muted-foreground">
                        {entry.userKey}
                      </span>
                      <div className="text-muted-foreground">
                        {formatWhen(entry.at)}
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </section>
          </div>
        )}
      </div>
    </aside>
  );
}
