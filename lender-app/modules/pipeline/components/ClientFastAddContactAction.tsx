"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery } from "convex/react";
import { UserPlus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { layerZIndexStyle } from "@/lib/ui/layering";
import { touchTargetIconClass } from "@/lib/ui/touchTarget";
import { DEFAULT_CONTACT_ROLE_IDS } from "@/lib/contact/contactRoles";

export type ClientFastAddContactActionProps = {
  clientId: Id<"clients">;
  organizationId: Id<"organizations">;
  memberUserKey: string;
  primaryContactId?: Id<"contacts">;
  linkedAdditionalContactIds: Id<"contacts">[];
  disabled?: boolean;
};

const PANEL_WIDTH_PX = 288;

export function ClientFastAddContactAction({
  clientId,
  organizationId,
  memberUserKey,
  primaryContactId,
  linkedAdditionalContactIds,
  disabled = false,
}: ClientFastAddContactActionProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const orgContacts = useQuery(api.contacts.list, {
    organizationId,
    memberUserKey,
  });
  const contactRoles = useQuery(api.organizationSettings.getContactRoles, {
    organizationId,
    memberUserKey,
  });
  const addClientContact = useMutation(
    api.pipelineClientWorkspaceMutations.addClientContact,
  );
  const createClientContactAndLink = useMutation(
    api.pipelineClientWorkspaceMutations.createClientContactAndLink,
  );

  const defaultRoleId =
    contactRoles?.[0]?.id ?? DEFAULT_CONTACT_ROLE_IDS.client;

  const excludedIds = useMemo(() => {
    const ids = new Set(linkedAdditionalContactIds.map(String));
    if (primaryContactId) ids.add(String(primaryContactId));
    return ids;
  }, [linkedAdditionalContactIds, primaryContactId]);

  const trimmedQuery = query.trim();
  const normalizedQuery = trimmedQuery.toLowerCase();

  const availableContacts = useMemo(() => {
    const pool = (orgContacts ?? []).filter(
      (contact) => !excludedIds.has(String(contact._id)),
    );
    if (!normalizedQuery) return pool.slice(0, 8);
    return pool
      .filter((contact) =>
        contact.name.toLowerCase().includes(normalizedQuery),
      )
      .slice(0, 8);
  }, [orgContacts, excludedIds, normalizedQuery]);

  const exactMatch = useMemo(
    () =>
      (orgContacts ?? []).some(
        (contact) =>
          contact.name.trim().toLowerCase() === normalizedQuery &&
          !excludedIds.has(String(contact._id)),
      ),
    [orgContacts, excludedIds, normalizedQuery],
  );

  const updatePanelPos = useCallback(() => {
    const anchor = rootRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const left = Math.min(
      Math.max(8, rect.right - PANEL_WIDTH_PX),
      window.innerWidth - PANEL_WIDTH_PX - 8,
    );
    setPanelPos({
      top: rect.bottom + 6,
      left,
    });
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setError(null);
  }, []);

  const linkContact = useCallback(
    async (contactId: Id<"contacts">) => {
      setBusy(true);
      setError(null);
      try {
        await addClientContact({
          organizationId,
          clientId,
          memberUserKey,
          contactId,
          contactRoleId: defaultRoleId,
        });
        close();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [
      addClientContact,
      clientId,
      close,
      defaultRoleId,
      memberUserKey,
      organizationId,
    ],
  );

  const createAndLink = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setBusy(true);
      setError(null);
      try {
        await createClientContactAndLink({
          organizationId,
          clientId,
          memberUserKey,
          name: trimmed,
          contactRoleId: defaultRoleId,
        });
        close();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [
      clientId,
      close,
      createClientContactAndLink,
      defaultRoleId,
      memberUserKey,
      organizationId,
    ],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePanelPos();
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    const onScrollOrResize = () => updatePanelPos();
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open, updatePanelPos]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (
        (event.target as HTMLElement | null)?.closest?.(
          "[data-client-fast-add-contact-panel]",
        )
      ) {
        return;
      }
      close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const panel =
    open && mounted ? (
      <div
        data-client-fast-add-contact-panel
        role="dialog"
        aria-label="Add contact to client group"
        className="fixed rounded-dlc-md border border-border/80 bg-background p-2 shadow-dlc-3"
        style={{
          ...layerZIndexStyle("POPOVER"),
          top: panelPos.top,
          left: panelPos.left,
          width: PANEL_WIDTH_PX,
        }}
        data-testid="pipeline-client-fast-add-contact-panel"
      >
        <Input
          ref={inputRef}
          value={query}
          disabled={busy}
          placeholder="Search or type a name…"
          className="h-9 text-sm"
          aria-label="Search CRM contacts"
          data-testid="pipeline-client-fast-add-contact-search"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || busy) return;
            e.preventDefault();
            if (availableContacts.length === 1) {
              void linkContact(availableContacts[0]!._id);
              return;
            }
            if (trimmedQuery && !exactMatch) {
              void createAndLink(trimmedQuery);
            }
          }}
        />

        <ul
          className="mt-2 max-h-48 space-y-0.5 overflow-y-auto"
          data-testid="pipeline-client-fast-add-contact-results"
        >
          {orgContacts === undefined ? (
            <li className="px-2 py-2 text-xs text-muted-foreground">
              Loading contacts…
            </li>
          ) : availableContacts.length === 0 && !trimmedQuery ? (
            <li className="px-2 py-2 text-xs text-muted-foreground">
              No contacts available to link.
            </li>
          ) : (
            availableContacts.map((contact) => (
              <li key={String(contact._id)}>
                <button
                  type="button"
                  className="flex w-full rounded-dlc-sm px-2 py-2 text-left text-sm hover:bg-muted/60 disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void linkContact(contact._id)}
                >
                  {contact.name}
                </button>
              </li>
            ))
          )}
        </ul>

        {trimmedQuery && !exactMatch ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 h-9 w-full justify-start text-sm"
            disabled={busy}
            data-testid="pipeline-client-fast-add-contact-create"
            onClick={() => void createAndLink(trimmedQuery)}
          >
            Create &amp; link “{trimmedQuery}”
          </Button>
        ) : null}

        {error ? (
          <p className="mt-2 text-xs text-destructive">{error}</p>
        ) : null}
      </div>
    ) : null;

  return (
    <div ref={rootRef} className="inline-flex shrink-0">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn("h-8 w-8 shrink-0 p-0", touchTargetIconClass)}
        disabled={disabled || busy}
        title="Add contact"
        aria-label="Add contact"
        aria-expanded={open}
        data-testid="pipeline-client-fast-add-contact"
        onClick={() => setOpen((prev) => !prev)}
      >
        <UserPlus className="h-4 w-4 shrink-0" aria-hidden />
      </Button>
      {mounted && panel ? createPortal(panel, document.body) : null}
    </div>
  );
}
