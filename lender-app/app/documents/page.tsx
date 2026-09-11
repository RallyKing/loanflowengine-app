"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useUserPreferences } from "@/lib/userPreferencesContext";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { Button } from "@/components/ui/Button";
import { ChevronRight, FolderOpen, Sparkles } from "lucide-react";
import { pipelineDealEditorHref } from "@/lib/pipeline/routes";
import { DueDiligenceWorkspaceSheet } from "@/components/library/DueDiligenceWorkspaceSheet";
import { showOperationalToast } from "@/lib/ui/operationalToast";

export default function DocumentsHubPage() {
  const { accountId } = useUserPreferences();
  const { activeOrganizationId } = useOrgPermissions();
  const memberKey = accountId.trim() || undefined;

  const hubArgs = useMemo(() => {
    if (activeOrganizationId && memberKey) {
      return {
        organizationId: activeOrganizationId,
        memberUserKey: memberKey,
        limit: 80 as const,
      };
    }
    return "skip" as const;
  }, [activeOrganizationId, memberKey]);

  const rows = useQuery(api.libraryDocuments.listHub, hubArgs);
  const [openId, setOpenId] = useState<Id<"libraryDocuments"> | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [dueDiligenceOpen, setDueDiligenceOpen] = useState(false);

  const links = useQuery(
    api.libraryDocuments.listLinksForDocument,
    openId && memberKey
      ? { documentId: openId, memberUserKey: memberKey }
      : "skip",
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <FolderOpen className="h-7 w-7 text-muted-foreground" aria-hidden />
          Documents
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Versioned files linked to pipeline deals, contacts, and tasks. Open a
          record to upload or manage versions.
        </p>
        {activeOrganizationId && !memberKey ? (
          <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">
            Sign in to list organization documents.
          </p>
        ) : null}
      </div>

      {rows && rows.length > 0 && activeOrganizationId && memberKey ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {selectedIds.size} selected
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 text-xs"
            disabled={selectedIds.size === 0}
            onClick={() => {
              if (selectedIds.size === 0) {
                showOperationalToast({
                  title: "Select files first",
                  description: "Choose at least one document for Due Diligence.",
                });
                return;
              }
              setDueDiligenceOpen(true);
            }}
            data-testid="documents-hub-due-diligence"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Due Diligence
          </Button>
        </div>
      ) : null}

      {rows === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No documents yet. Create one from a deal drawer, contact, or task.
        </p>
      ) : (
        <ul className="space-y-2" role="list">
          {rows.map((r: NonNullable<typeof rows>[number]) => (
            <li
              key={r._id}
              className="rounded-lg border border-border bg-card/60 px-3 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={selectedIds.has(String(r._id))}
                    onChange={() => {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        const id = String(r._id);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return next;
                      });
                    }}
                    aria-label={`Select ${r.title}`}
                  />
                  <div>
                  <div className="font-medium">{r.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {r.latestVersionNumber > 0
                      ? `v${r.latestVersionNumber}${
                          r.latestFileName ? ` · ${r.latestFileName}` : ""
                        }`
                      : "Empty (no versions)"}
                    {r.latestUploadedAt
                      ? ` · ${new Date(r.latestUploadedAt).toLocaleString()}`
                      : ""}
                  </div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 text-xs"
                  onClick={() =>
                    setOpenId((x) => (x === r._id ? null : r._id))
                  }
                >
                  {openId === r._id ? "Hide links" : "Where linked"}
                  <ChevronRight
                    className={`h-3.5 w-3.5 transition-transform ${
                      openId === r._id ? "rotate-90" : ""
                    }`}
                    aria-hidden
                  />
                </Button>
              </div>
              {openId === r._id && links !== undefined ? (
                <ul className="mt-3 space-y-1 border-t border-border/60 pt-2 text-sm">
                  {links.length === 0 ? (
                    <li className="text-muted-foreground">No links (orphan).</li>
                  ) : (
                    links.map((l) => (
                      <li key={l._id}>
                        {l.pipelineFileId ? (
                          <Link
                            className="text-primary hover:underline"
                            href={pipelineDealEditorHref(l.pipelineFileId)}
                          >
                            Pipeline file
                          </Link>
                        ) : null}
                        {l.contactId ? (
                          <Link
                            className="text-primary hover:underline"
                            href="/contacts"
                          >
                            Contact
                          </Link>
                        ) : null}
                        {l.taskId ? (
                          <span className="text-muted-foreground">
                            Task (open from Tasks)
                          </span>
                        ) : null}
                      </li>
                    ))
                  )}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {activeOrganizationId && memberKey ? (
        <DueDiligenceWorkspaceSheet
          open={dueDiligenceOpen}
          onClose={() => setDueDiligenceOpen(false)}
          organizationId={activeOrganizationId}
          memberUserKey={memberKey}
          selectedDocuments={(rows ?? [])
            .filter((r) => selectedIds.has(String(r._id)))
            .map((r) => ({
              _id: r._id,
              title: r.title,
              latestVersionId: r.latestVersionId,
              latestFileName: r.latestFileName,
              latestContentType: undefined,
            }))}
        />
      ) : null}
    </div>
  );
}
