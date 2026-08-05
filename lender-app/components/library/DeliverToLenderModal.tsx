"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Copy, Loader2, Mail, Plus, Shield, UserPlus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { cn } from "@/lib/cn";
import { buildClientPortalUrl } from "@/lib/clientPortalUrl";
import { showOperationalToast } from "@/lib/ui/operationalToast";

export type DeliverToLenderModalProps = {
  open: boolean;
  onClose: () => void;
  pipelineFileId: Id<"pipeline">;
  organizationId: Id<"organizations">;
  memberUserKey?: string;
  fileTasks: Doc<"documentVaultFileTasks">[];
  folders: Doc<"documentFolders">[];
  documents: {
    _id: Id<"libraryDocuments">;
    title: string;
    fileTaskId?: Id<"documentVaultFileTasks">;
    folderId?: Id<"documentFolders">;
  }[];
  onError: (message: string) => void;
};

type ExpiryPreset = "24h" | "3d" | "7d";
type AddMode = "directory" | "oneTime" | null;

const BROWSE_LIMIT = 200;
const SEARCH_LIMIT = 500;

function lenderLabel(l: {
  company?: string;
  contactName?: string;
  email?: string;
}): string {
  const company = l.company?.trim() || "Lender";
  const contact = l.contactName?.trim();
  const email = l.email?.trim();
  const bits = [company];
  if (contact) bits.push(contact);
  if (email) bits.push(email);
  return bits.join(" · ");
}

export function DeliverToLenderModal({
  open,
  onClose,
  pipelineFileId,
  organizationId,
  memberUserKey,
  fileTasks,
  folders,
  documents,
  onError,
}: DeliverToLenderModalProps) {
  const [search, setSearch] = useState("");
  const [lenderId, setLenderId] = useState<Id<"lenders"> | "">("");
  const [expiry, setExpiry] = useState<ExpiryPreset>("3d");
  const [permission, setPermission] = useState<"view_only" | "downloadable">(
    "view_only",
  );
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [deliveryUrl, setDeliveryUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [creating, setCreating] = useState(false);
  const [newCompany, setNewCompany] = useState("");
  const [newContact, setNewContact] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newTitle, setNewTitle] = useState("");

  const trimmedSearch = search.trim();
  const listArgs =
    open && memberUserKey
      ? {
          organizationId,
          memberUserKey,
          search: trimmedSearch || undefined,
          limit: trimmedSearch ? SEARCH_LIMIT : BROWSE_LIMIT,
        }
      : "skip";

  const lenders = useQuery(api.lenders.list, listArgs);
  const selectedLenderRow = useQuery(
    api.lenders.get,
    open && memberUserKey && lenderId
      ? { id: lenderId, organizationId, memberUserKey }
      : "skip",
  );

  const issueDelivery = useMutation(api.lenderDeliveryPortal.issueDeliveryToken);
  const sendDelivery = useMutation(api.lenderDeliveryPortal.sendDeliveryToLender);
  const upsertRecipient = useMutation(api.lenders.upsertDeliveryRecipient);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setLenderId("");
      setDeliveryUrl("");
      setAddMode(null);
      setNewCompany("");
      setNewContact("");
      setNewEmail("");
      setNewPhone("");
      setNewTitle("");
      setSelectedDocs(new Set());
      setSelectedFolders(new Set());
      setSelectedTasks(new Set());
    }
  }, [open]);

  const lenderOptions = useMemo(() => {
    const rows = lenders ?? [];
    if (
      selectedLenderRow &&
      !rows.some((r) => String(r._id) === String(selectedLenderRow._id))
    ) {
      return [selectedLenderRow, ...rows];
    }
    return rows;
  }, [lenders, selectedLenderRow]);

  const selectedLender = useMemo(
    () =>
      lenderOptions.find((l) => String(l._id) === String(lenderId)) ??
      selectedLenderRow ??
      null,
    [lenderOptions, lenderId, selectedLenderRow],
  );

  const activeTasks = fileTasks.filter((t) => !t.isArchived);
  const activeFolders = folders.filter(
    (f) =>
      !f.fileTaskId ||
      activeTasks.some((t) => String(t._id) === String(f.fileTaskId)),
  );

  const toggle = (
    set: React.Dispatch<React.SetStateAction<Set<string>>>,
    id: string,
  ) => {
    set((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hasSelection =
    selectedDocs.size > 0 ||
    selectedFolders.size > 0 ||
    selectedTasks.size > 0;

  const canCreateLink =
    Boolean(memberUserKey && lenderId && hasSelection && !busy);

  const handleCreateRecipient = async () => {
    if (!memberUserKey || creating) return;
    if (!newCompany.trim()) {
      onError("Company (or firm name) is required.");
      return;
    }
    if (addMode === "oneTime" && !newEmail.trim().includes("@")) {
      onError("One-time recipients need a valid email for the delivery link.");
      return;
    }
    setCreating(true);
    try {
      const result = await upsertRecipient({
        organizationId,
        memberUserKey,
        company: newCompany.trim(),
        contactName: newContact.trim() || undefined,
        email: newEmail.trim() || undefined,
        phone: newPhone.trim() || undefined,
        titleRole: newTitle.trim() || undefined,
        oneTimeRecipient: addMode === "oneTime",
      });
      setLenderId(result.id);
      setAddMode(null);
      setSearch("");
      setNewCompany("");
      setNewContact("");
      setNewEmail("");
      setNewPhone("");
      setNewTitle("");
      showOperationalToast({
        title:
          addMode === "oneTime"
            ? "One-time recipient ready"
            : result.action === "inserted"
              ? "Lender added"
              : "Lender selected",
        description: "Selected for this delivery.",
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not save recipient.");
    } finally {
      setCreating(false);
    }
  };

  const handleDeliver = async () => {
    if (!memberUserKey || !lenderId || busy) return;
    if (!hasSelection) {
      onError(
        "Please select at least one document, folder, or file task to deliver.",
      );
      showOperationalToast({
        title: "Nothing selected",
        description: "Please select at least one document or task to deliver.",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      const result = await issueDelivery({
        pipelineFileId,
        lenderId,
        expiryPreset: expiry,
        permission,
        includedDocumentIds: [...selectedDocs].map(
          (id) => id as Id<"libraryDocuments">,
        ),
        includedFolderIds: [...selectedFolders].map(
          (id) => id as Id<"documentFolders">,
        ),
        includedFileTaskIds: [...selectedTasks].map(
          (id) => id as Id<"documentVaultFileTasks">,
        ),
        memberUserKey,
      });
      const url = buildClientPortalUrl(
        result.companySlug ?? "portal",
        result.token,
      );
      setDeliveryUrl(url);
      showOperationalToast({
        title: "Lender delivery link created",
        description: `${result.documentCount} document(s) packaged.`,
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : "Delivery failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleSend = async () => {
    if (!memberUserKey || !lenderId || !deliveryUrl || sending) return;
    if (!selectedLender?.email?.trim()) {
      onError(
        "This lender has no email on file. Add an email before sending, or copy the link.",
      );
      return;
    }
    setSending(true);
    try {
      const result = await sendDelivery({
        pipelineFileId,
        lenderId,
        deliveryUrl,
        expiryPreset: expiry,
        permission,
        memberUserKey,
      });
      showOperationalToast({
        title: "Email sent",
        description: `Delivery link sent to ${result.sentTo}.`,
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not send email.");
    } finally {
      setSending(false);
    }
  };

  const handleCopy = async () => {
    if (!deliveryUrl) return;
    try {
      await navigator.clipboard.writeText(deliveryUrl);
      showOperationalToast({ title: "Link copied" });
    } catch {
      onError("Could not copy link.");
    }
  };

  const lendersLoading = open && Boolean(memberUserKey) && lenders === undefined;
  const showBrowseCapHint =
    !trimmedSearch && (lenders?.length ?? 0) >= BROWSE_LIMIT;

  return (
    <OverlayShell
      open={open}
      onClose={onClose}
      aria-label="Deliver to lender"
      panelClassName="flex w-full max-w-xl max-h-[min(90dvh,720px)] flex-col overflow-hidden p-0"
      align="bottom-sheet"
    >
      <div className="shrink-0 border-b border-border/60 px-5 py-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Shield className="h-4 w-4" aria-hidden />
          Deliver to Lender
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Package selected vault assets with time-limited secure access.
        </p>
      </div>

      <div className="min-h-0 flex-1 touch-scroll-y space-y-3 overflow-y-auto overscroll-contain px-5 py-4">
        <div>
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-medium text-muted-foreground">
              Lender
            </label>
            <div className="flex flex-wrap gap-1">
              <Button
                type="button"
                size="sm"
                variant={addMode === "directory" ? "primary" : "ghost"}
                className="h-8 px-2 text-xs"
                onClick={() =>
                  setAddMode((m) => (m === "directory" ? null : "directory"))
                }
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add lender
              </Button>
              <Button
                type="button"
                size="sm"
                variant={addMode === "oneTime" ? "primary" : "ghost"}
                className="h-8 px-2 text-xs"
                onClick={() =>
                  setAddMode((m) => (m === "oneTime" ? null : "oneTime"))
                }
              >
                <UserPlus className="h-3.5 w-3.5" aria-hidden />
                One-time recipient
              </Button>
            </div>
          </div>

          {addMode ? (
            <div className="mt-2 space-y-2 rounded-dlc-md border border-border/70 bg-muted/20 p-3">
              <p className="text-[11px] text-muted-foreground">
                {addMode === "oneTime"
                  ? "Custom firm / lender rep for this delivery only (saved under your organization, not the shared catalog)."
                  : "Create or update a lender in your directory, then select them for this package."}
              </p>
              <Input
                placeholder="Company / firm *"
                value={newCompany}
                onChange={(e) => setNewCompany(e.target.value)}
                aria-label="Company"
              />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Input
                  placeholder="Contact / rep name"
                  value={newContact}
                  onChange={(e) => setNewContact(e.target.value)}
                  aria-label="Contact name"
                />
                <Input
                  placeholder="Title / role"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  aria-label="Title"
                />
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Input
                  type="email"
                  placeholder={
                    addMode === "oneTime" ? "Email *" : "Email (for send)"
                  }
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  aria-label="Email"
                />
                <Input
                  placeholder="Phone"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  aria-label="Phone"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setAddMode(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  disabled={creating || !newCompany.trim()}
                  onClick={() => void handleCreateRecipient()}
                >
                  {creating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : addMode === "oneTime" ? (
                    "Use recipient"
                  ) : (
                    "Save & select"
                  )}
                </Button>
              </div>
            </div>
          ) : null}

          <Input
            className="mt-2"
            placeholder="Search all lenders by company, contact, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search lenders"
            data-testid="deliver-lender-search"
          />
          {showBrowseCapHint ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Showing the {BROWSE_LIMIT} most recent lenders. Type to search the
              full directory.
            </p>
          ) : null}

          <div
            className="mt-1 max-h-40 touch-scroll-y space-y-0.5 overflow-y-auto overscroll-contain rounded-dlc-md border border-border bg-background"
            role="listbox"
            aria-label="Lender results"
            data-testid="deliver-lender-list"
          >
            {!memberUserKey ? (
              <p className="px-3 py-3 text-xs text-muted-foreground">
                Sign in required to load lenders.
              </p>
            ) : lendersLoading ? (
              <p className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Loading lenders…
              </p>
            ) : lenderOptions.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted-foreground">
                {trimmedSearch
                  ? "No lenders match that search. Add a lender or one-time recipient above."
                  : "No lenders found for this workspace. Add a lender or one-time recipient above."}
              </p>
            ) : (
              lenderOptions.map((l) => {
                const selected = String(l._id) === String(lenderId);
                return (
                  <button
                    key={l._id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={cn(
                      "flex w-full min-h-10 items-start px-3 py-2 text-left text-sm transition-colors duration-dlc-short ease-dlc-standard",
                      selected
                        ? "bg-primary/10 font-medium text-foreground"
                        : "hover:bg-muted/50",
                    )}
                    onClick={() => setLenderId(l._id)}
                  >
                    <span className="min-w-0 break-words">
                      {lenderLabel(l)}
                      {l.source === "One-time delivery recipient" ? (
                        <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                          (one-time)
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          {selectedLender ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Selected: {lenderLabel(selectedLender)}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Expiration
            </label>
            <select
              className="mt-1 h-10 w-full rounded-dlc-md border border-border bg-background px-2 text-sm"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value as ExpiryPreset)}
            >
              <option value="24h">24 Hours</option>
              <option value="3d">3 Days</option>
              <option value="7d">7 Days</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Access Level
            </label>
            <div className="mt-1 flex gap-2">
              {(["view_only", "downloadable"] as const).map((p) => (
                <label
                  key={p}
                  className={cn(
                    "flex min-h-10 flex-1 cursor-pointer items-center justify-center rounded-dlc-md border px-2 py-2 text-xs",
                    permission === p
                      ? "border-primary bg-primary/5 font-medium"
                      : "border-border",
                  )}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    checked={permission === p}
                    onChange={() => setPermission(p)}
                  />
                  {p === "view_only" ? "View Only" : "Allow Download"}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="max-h-48 space-y-2 overflow-y-auto overscroll-contain rounded-dlc-md border border-border/60 p-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            File Tasks
          </p>
          {activeTasks.length === 0 ? (
            <p className="text-xs text-muted-foreground">No file tasks.</p>
          ) : (
            activeTasks.map((t) => (
              <label key={t._id} className="flex min-h-9 items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={selectedTasks.has(String(t._id))}
                  onChange={() => toggle(setSelectedTasks, String(t._id))}
                />
                {t.title}
              </label>
            ))
          )}
          <p className="pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Folders
          </p>
          {activeFolders.length === 0 ? (
            <p className="text-xs text-muted-foreground">No folders.</p>
          ) : (
            activeFolders.map((f) => (
              <label key={f._id} className="flex min-h-9 items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={selectedFolders.has(String(f._id))}
                  onChange={() => toggle(setSelectedFolders, String(f._id))}
                />
                {f.name}
              </label>
            ))
          )}
          <p className="pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Documents
          </p>
          {documents.length === 0 ? (
            <p className="text-xs text-muted-foreground">No documents.</p>
          ) : (
            documents.map((d) => (
              <label key={d._id} className="flex min-h-9 items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={selectedDocs.has(String(d._id))}
                  onChange={() => toggle(setSelectedDocs, String(d._id))}
                />
                {d.title}
              </label>
            ))
          )}
        </div>
        {!hasSelection ? (
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            Select at least one file task, folder, or document to create a link.
          </p>
        ) : null}

        {deliveryUrl ? (
          <div className="space-y-2">
            <Input value={deliveryUrl} readOnly className="text-xs" />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void handleCopy()}
              >
                <Copy className="h-3.5 w-3.5" aria-hidden />
                Copy link
              </Button>
              <Button
                type="button"
                size="sm"
                variant="primary"
                disabled={sending || !selectedLender?.email?.trim()}
                onClick={() => void handleSend()}
              >
                {sending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>
                    <Mail className="h-3.5 w-3.5" aria-hidden />
                    Send to Lender
                  </>
                )}
              </Button>
            </div>
            {!selectedLender?.email?.trim() ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                No email on this lender — copy the link, or add an email via Add
                lender / One-time recipient.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="shrink-0 flex justify-end gap-2 border-t border-border/60 px-5 py-3">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={!canCreateLink}
          title={
            !lenderId
              ? "Select a lender first"
              : !hasSelection
                ? "Select vault assets to package"
                : undefined
          }
          onClick={() => void handleDeliver()}
          data-testid="deliver-create-link"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            "Create Link"
          )}
        </Button>
      </div>
    </OverlayShell>
  );
}
