"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueries, useQuery, type RequestForQueries } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { SearchField } from "@/components/ui/SearchField";
import { ConvexQueryBoundary } from "@/components/ConvexQueryBoundary";
import { cn } from "@/lib/cn";
import { OperationalSkeletonList } from "@/components/ui/OperationalSkeleton";
import { useUserPreferences } from "@/lib/userPreferencesContext";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import {
  contactRoleDisplayNames,
  effectiveContactRoleIdsFromDoc,
  normalizeContactRoles,
  type ContactRole,
} from "@/lib/contact/contactRoles";
import { Building2, Plus, UserCircle2 } from "lucide-react";
import { appendPriorityDebugClientLog } from "@/lib/debugClientLog";
import { OP_WORKSPACE_ISLAND } from "@/lib/ui/operationalInputs";
import { UniversalContactModal } from "@/components/contacts/UniversalContactModal";
import type { ContactHubRecord } from "@/lib/contacts/contactWithPrimaryEntity";
import {
  COMMON_ENTITY_POSITIONS,
  ENTITY_CONTACT_RELATIONSHIP_ROLES,
  type EntityContactRelationshipRoleId,
} from "@/lib/contacts/entityContactRoles";
import {
  contactMatchesAllRoleFilters,
  contactMatchesEntityJunctionFilters,
  contactMatchesSearchTokens,
  entityMatchesSearchTokens,
  individualListSublabel,
  type ContactRecordType,
} from "@/lib/contacts/contactsIndexFilters";

const SEARCH_DEBOUNCE_MS = 280;

type ClientHubListRow = {
  _id: Id<"clients">;
  displayName: string;
  companyName?: string;
  primaryContactName?: string;
  primaryContactEmail?: string;
  ein?: string;
  entityType?: string;
};

type HubListItem =
  | {
      kind: "individual";
      id: Id<"contacts">;
      label: string;
      sublabel?: string;
      contact: ContactHubRecord;
    }
  | {
      kind: "entity";
      id: Id<"clients">;
      label: string;
      sublabel?: string;
      entity: ClientHubListRow;
    };

function ContactsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accountId } = useUserPreferences();
  const { activeOrganizationId } = useOrgPermissions();
  const memberKey = accountId.trim();

  const [roleFilters, setRoleFilters] = useState<string[]>([]);
  const [typeFilters, setTypeFilters] = useState<ContactRecordType[]>([]);
  const [entityRelRoleFilters, setEntityRelRoleFilters] = useState<
    EntityContactRelationshipRoleId[]
  >([]);
  const [entityPositionFilters, setEntityPositionFilters] = useState<string[]>(
    [],
  );
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [universalModalOpen, setUniversalModalOpen] = useState(false);

  const orgContactRoles = useQuery(
    api.organizationSettings.getContactRoles,
    activeOrganizationId && memberKey
      ? {
          organizationId: activeOrganizationId,
          memberUserKey: memberKey,
        }
      : "skip",
  ) as ContactRole[] | undefined;

  const listArgs = useMemo(() => {
    if (!activeOrganizationId || !memberKey) return "skip" as const;
    return {
      organizationId: activeOrganizationId,
      memberUserKey: memberKey,
    };
  }, [activeOrganizationId, memberKey]);

  const showIndividuals =
    typeFilters.length === 0 || typeFilters.includes("individual");
  const showEntities =
    typeFilters.length === 0 || typeFilters.includes("entity");

  const contactQueries = useMemo((): RequestForQueries => {
    const q: RequestForQueries = {};
    if (listArgs !== "skip" && showIndividuals) {
      q.contactList = { query: api.contacts.list, args: listArgs };
    }
    if (
      debouncedSearch.trim().length > 0 &&
      activeOrganizationId &&
      memberKey &&
      showIndividuals
    ) {
      q.linkSearch = {
        query: api.contactFileLinks.linkSearchTextByContact,
        args: {
          organizationId: activeOrganizationId,
          memberUserKey: memberKey,
        },
      };
    }
    return q;
  }, [
    activeOrganizationId,
    memberKey,
    listArgs,
    debouncedSearch,
    showIndividuals,
  ]);

  const contactQueryResults = useQueries(contactQueries);
  const listRaw = contactQueryResults.contactList;
  const linkSearchRaw = contactQueryResults.linkSearch;

  const entityLinkIndex = useQuery(
    api.entityContactLinks.listOrgLinkIndex,
    activeOrganizationId && memberKey
      ? {
          organizationId: activeOrganizationId,
          memberUserKey: memberKey,
        }
      : "skip",
  );

  const contactRoles = useMemo(
    () => normalizeContactRoles(orgContactRoles ?? []),
    [orgContactRoles],
  );

  const listError = listRaw instanceof Error ? listRaw : null;
  const list =
    listRaw instanceof Error
      ? null
      : listRaw === undefined
        ? undefined
        : listRaw;
  const loading = showIndividuals && listArgs !== "skip" && list === undefined;

  const linkSearchError =
    linkSearchRaw instanceof Error ? linkSearchRaw : null;
  const linkSearchRows = useMemo(() => {
    if (linkSearchRaw instanceof Error) return [];
    if (linkSearchRaw === undefined) return undefined;
    return linkSearchRaw;
  }, [linkSearchRaw]);

  useEffect(() => {
    if (!listError) return;
    appendPriorityDebugClientLog({
      sessionId: "f25461",
      runId: "contacts-list",
      hypothesisId: "H_contacts_list_useQuery_throw",
      location: "contacts/page.tsx:contactList",
      message: listError.message,
      data: {
        name: listError.name,
        stack: listError.stack?.slice(0, 500) ?? null,
      },
      timestamp: Date.now(),
    });
  }, [listError]);

  const clientListArgs = useMemo(() => {
    if (!activeOrganizationId || !memberKey) return "skip" as const;
    return {
      organizationId: activeOrganizationId,
      memberUserKey: memberKey,
    };
  }, [activeOrganizationId, memberKey]);

  const clientList = useQuery(
    api.pipelineHierarchyQueries.listClients,
    clientListArgs === "skip" || !showEntities ? "skip" : clientListArgs,
  );

  const entityListLoading =
    showEntities && clientListArgs !== "skip" && clientList === undefined;
  const hubListLoading = loading || entityListLoading;

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const c = searchParams.get("contact")?.trim();
    const e = searchParams.get("entity")?.trim();
    if (c) {
      router.replace(`/contacts/${c}`);
    } else if (e) {
      router.replace(`/contacts/entity/${e}`);
    }
  }, [searchParams, router]);

  const entityRows = useMemo((): ClientHubListRow[] => {
    return Array.isArray(clientList) ? clientList : [];
  }, [clientList]);

  const rows = useMemo((): ContactHubRecord[] => {
    return Array.isArray(list) ? (list as ContactHubRecord[]) : [];
  }, [list]);

  const fileHaystackByContactId = useMemo(() => {
    const m = new Map<Id<"contacts">, string>();
    for (const row of linkSearchRows ?? []) {
      m.set(row.contactId, row.text);
    }
    return m;
  }, [linkSearchRows]);

  const hasEntityJunctionFilters =
    entityRelRoleFilters.length > 0 || entityPositionFilters.length > 0;

  const filteredIndividuals = useMemo(() => {
    if (!showIndividuals) return [];
    const q = debouncedSearch;
    let result = rows;
    if (roleFilters.length > 0) {
      result = result.filter((c) =>
        contactMatchesAllRoleFilters(c, roleFilters),
      );
    }
    if (q.trim()) {
      const linkHaystackLoading =
        linkSearchRows === undefined && debouncedSearch.trim().length > 0;
      result = result.filter((c) =>
        contactMatchesSearchTokens(
          c,
          q,
          linkHaystackLoading ? "" : fileHaystackByContactId.get(c._id) ?? "",
        ),
      );
    }
    if (hasEntityJunctionFilters) {
      result = result.filter((c) =>
        contactMatchesEntityJunctionFilters(
          c._id,
          entityLinkIndex,
          entityRelRoleFilters,
          entityPositionFilters,
        ),
      );
    }
    return result;
  }, [
    rows,
    debouncedSearch,
    fileHaystackByContactId,
    linkSearchRows,
    roleFilters,
    entityLinkIndex,
    entityRelRoleFilters,
    entityPositionFilters,
    hasEntityJunctionFilters,
    showIndividuals,
  ]);

  const filteredEntityRows = useMemo(() => {
    if (!showEntities) return [];
    const q = debouncedSearch;
    if (!q.trim()) return entityRows;
    return entityRows.filter((e) => entityMatchesSearchTokens(e, q));
  }, [entityRows, debouncedSearch, showEntities]);

  const hubListItems = useMemo((): HubListItem[] => {
    const individuals: HubListItem[] = filteredIndividuals.map((c) => ({
      kind: "individual",
      id: c._id,
      label: c.name,
      sublabel: individualListSublabel(c),
      contact: c,
    }));
    const entities: HubListItem[] = filteredEntityRows.map((e) => ({
      kind: "entity",
      id: e._id,
      label:
        e.displayName.trim() || e.companyName?.trim() || "Business entity",
      sublabel:
        e.primaryContactName?.trim() ||
        e.companyName?.trim() ||
        e.ein?.trim() ||
        undefined,
      entity: e,
    }));
    return [...individuals, ...entities].sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
    );
  }, [filteredIndividuals, filteredEntityRows]);

  const hasActiveSearch =
    searchInput.trim() !== "" || debouncedSearch.trim() !== "";
  const isSearchDebouncing =
    searchInput.trim() !== debouncedSearch.trim();

  const onSearchInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setSearchInput(e.currentTarget.value);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchInput("");
    setDebouncedSearch("");
  }, []);

  const toggleRoleFilter = useCallback((roleId: string) => {
    setRoleFilters((current) =>
      current.includes(roleId)
        ? current.filter((id) => id !== roleId)
        : [...current, roleId],
    );
  }, []);

  const toggleTypeFilter = useCallback((type: ContactRecordType) => {
    setTypeFilters((current) => {
      const showingAll = current.length === 0;
      const includes = current.includes(type);
      if (showingAll) return [type];
      if (includes) {
        if (current.length === 1) return [];
        return current.filter((t) => t !== type);
      }
      const next = [...current, type];
      if (next.length === 2) return [];
      return next;
    });
  }, []);

  const typeFilterIncludes = useCallback(
    (type: ContactRecordType) =>
      typeFilters.length === 0 || typeFilters.includes(type),
    [typeFilters],
  );

  const toggleEntityRelRoleFilter = useCallback(
    (roleId: EntityContactRelationshipRoleId) => {
      setEntityRelRoleFilters((current) =>
        current.includes(roleId)
          ? current.filter((id) => id !== roleId)
          : [...current, roleId],
      );
    },
    [],
  );

  const toggleEntityPositionFilter = useCallback((position: string) => {
    setEntityPositionFilters((current) =>
      current.includes(position)
        ? current.filter((p) => p !== position)
        : [...current, position],
    );
  }, []);

  const clearEntityJunctionFilters = useCallback(() => {
    setEntityRelRoleFilters([]);
    setEntityPositionFilters([]);
  }, []);

  const clearAllFilters = useCallback(() => {
    clearSearch();
    setRoleFilters([]);
    setTypeFilters([]);
    clearEntityJunctionFilters();
  }, [clearSearch, clearEntityJunctionFilters]);

  const navigateToItem = useCallback(
    (item: HubListItem) => {
      if (item.kind === "individual") {
        router.push(`/contacts/${item.id}`);
      } else {
        router.push(`/contacts/entity/${item.id}`);
      }
    },
    [router],
  );

  const hasActiveFilters =
    roleFilters.length > 0 ||
    typeFilters.length > 0 ||
    hasEntityJunctionFilters;

  const totalRecordCount = useMemo(() => {
    let count = 0;
    if (showIndividuals) count += rows.length;
    if (showEntities) count += entityRows.length;
    return count;
  }, [showIndividuals, showEntities, rows.length, entityRows.length]);

  const filteredRecordCount = hubListItems.length;

  return (
    <>
      {activeOrganizationId && memberKey ? (
        <UniversalContactModal
          open={universalModalOpen}
          onClose={() => setUniversalModalOpen(false)}
          organizationId={activeOrganizationId}
          memberUserKey={memberKey}
          onSelectIndividual={(contactId) => {
            setUniversalModalOpen(false);
            router.push(`/contacts/${contactId}`);
          }}
          onCreated={(result) => {
            setUniversalModalOpen(false);
            if (result.kind === "individual") {
              router.push(`/contacts/${result.contactId}`);
            } else {
              router.push(`/contacts/entity/${result.entityId}`);
            }
          }}
        />
      ) : null}

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 md:p-8">
        <header className="flex shrink-0 flex-col gap-4 border-b border-border pb-6">
          {listError ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              <p className="font-medium">Could not load contacts</p>
              <p className="mt-1 text-xs opacity-90">
                {listError.message}. Check your connection or try again.
              </p>
            </div>
          ) : null}
          {linkSearchError && !listError ? (
            <div
              role="status"
              className="rounded-md border border-amber-300/80 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/35 dark:text-amber-50"
            >
              File-linked search is unavailable ({linkSearchError.message}).
              Name and email search still work.
            </div>
          ) : null}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Master index — select a record to open its command center.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              className="shrink-0"
              data-testid="contacts-add-new"
              onClick={() => setUniversalModalOpen(true)}
            >
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              New
            </Button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label htmlFor="contacts-search" className="sr-only">
              Search contacts by name, email, role, or linked files
            </label>
            <SearchField
              id="contacts-search"
              containerClassName="min-w-0 flex-1"
              value={searchInput}
              onChange={onSearchInputChange}
              placeholder="Search people, entities, EIN, files…"
              autoComplete="off"
              spellCheck={false}
              aria-busy={isSearchDebouncing}
            />
            {hasActiveSearch ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={clearSearch}
              >
                Clear search
              </Button>
            ) : null}
          </div>

          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground">
              Record type
            </p>
            <div
              className="flex flex-wrap gap-1.5"
              role="group"
              aria-label="Filter by record type"
              data-testid="contacts-type-filters"
            >
              {(
                [
                  ["individual", "Individuals", UserCircle2],
                  ["entity", "Business entities", Building2],
                ] as const
              ).map(([type, label, Icon]) => {
                const active = typeFilterIncludes(type);
                return (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={active}
                    className={cn(
                      "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-dlc-short ease-dlc-standard sm:text-sm",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/80 text-muted-foreground hover:bg-muted",
                    )}
                    onClick={() => toggleTypeFilter(type)}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    {label}
                  </button>
                );
              })}
            </div>

            <p className="text-xs font-medium text-muted-foreground">
              CRM roles (match all selected)
            </p>
            <div
              className="flex flex-wrap gap-1.5"
              role="group"
              aria-label="Filter by CRM role"
            >
              {contactRoles.map((role) => {
                const active = roleFilters.includes(role.id);
                return (
                  <button
                    key={role.id}
                    type="button"
                    aria-pressed={active}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors duration-dlc-short ease-dlc-standard sm:text-sm",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/80 text-muted-foreground hover:bg-muted",
                    )}
                    onClick={() => toggleRoleFilter(role.id)}
                  >
                    {role.displayName}
                  </button>
                );
              })}
            </div>
            {roleFilters.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setRoleFilters([])}
              >
                Clear role filters
              </Button>
            ) : null}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Entity relationship roles
            </p>
            <div className="flex flex-wrap gap-1.5">
              {ENTITY_CONTACT_RELATIONSHIP_ROLES.map((role) => {
                const active = entityRelRoleFilters.includes(role.id);
                return (
                  <button
                    key={role.id}
                    type="button"
                    aria-pressed={active}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors duration-dlc-short ease-dlc-standard",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/80 text-muted-foreground hover:bg-muted",
                    )}
                    onClick={() => toggleEntityRelRoleFilter(role.id)}
                  >
                    {role.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs font-medium text-muted-foreground">
              Position at entity
            </p>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_ENTITY_POSITIONS.map((position) => {
                const active = entityPositionFilters.includes(position);
                return (
                  <button
                    key={position}
                    type="button"
                    aria-pressed={active}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors duration-dlc-short ease-dlc-standard",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/80 text-muted-foreground hover:bg-muted",
                    )}
                    onClick={() => toggleEntityPositionFilter(position)}
                  >
                    {position}
                  </button>
                );
              })}
            </div>
            {hasEntityJunctionFilters ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={clearEntityJunctionFilters}
              >
                Clear entity filters
              </Button>
            ) : null}
            {hasEntityJunctionFilters && entityLinkIndex === undefined ? (
              <p className="text-xs text-muted-foreground">
                Loading entity link filters…
              </p>
            ) : null}
          </div>

          {linkSearchRows === undefined &&
          debouncedSearch.trim().length > 0 &&
          !linkSearchError &&
          rows.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Loading file associations for search…
            </p>
          ) : null}
        </header>

        <p
          className="text-sm font-medium text-slate-500"
          data-testid="contacts-record-counter"
          aria-live="polite"
          aria-atomic="true"
        >
          {hubListLoading ? (
            "Loading records…"
          ) : (
            <>
              Displaying {filteredRecordCount.toLocaleString()} of{" "}
              {totalRecordCount.toLocaleString()} records
            </>
          )}
        </p>

        <div className={cn("min-w-0", OP_WORKSPACE_ISLAND, "overflow-hidden p-0")}>
          {hubListLoading ? (
            <div className="p-4">
              <OperationalSkeletonList rows={8} />
            </div>
          ) : hubListItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
              <p className="text-sm font-medium text-foreground">
                {rows.length === 0 && entityRows.length === 0
                  ? "No CRM records yet"
                  : "No results found"}
              </p>
              <p className="max-w-sm text-xs text-muted-foreground">
                {rows.length === 0 && entityRows.length === 0
                  ? "Use New to add an individual or business entity."
                  : "No records match your search or filters. Try different keywords or clear filters."}
              </p>
              {hasActiveSearch || hasActiveFilters ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-1"
                  onClick={clearAllFilters}
                >
                  Clear filters
                </Button>
              ) : null}
            </div>
          ) : (
            <ul className="divide-y divide-border" role="list">
              {hubListItems.map((item) => {
                const Icon =
                  item.kind === "entity" ? Building2 : UserCircle2;
                return (
                  <li key={`${item.kind}-${item.id}`}>
                    <button
                      type="button"
                      onClick={() => navigateToItem(item)}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/80 sm:px-6 sm:py-4"
                    >
                      <Icon
                        className={cn(
                          "mt-0.5 h-5 w-5 shrink-0",
                          item.kind === "entity"
                            ? "text-primary"
                            : "text-muted-foreground",
                        )}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-medium">
                          {item.label}
                        </span>
                        {item.sublabel ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {item.sublabel}
                          </span>
                        ) : null}
                        {item.kind === "entity" ? (
                          <span className="mt-1.5 inline-block rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                            Business entity
                          </span>
                        ) : null}
                        {item.kind === "individual" &&
                        contactRoleDisplayNames(
                          contactRoles,
                          effectiveContactRoleIdsFromDoc(item.contact),
                        ).length > 0 ? (
                          <span className="mt-1.5 flex flex-wrap gap-1">
                            {contactRoleDisplayNames(
                              contactRoles,
                              effectiveContactRoleIdsFromDoc(item.contact),
                            ).map((label) => (
                              <span
                                key={label}
                                className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary"
                              >
                                {label}
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

export default function ContactsPage() {
  const [queryRecover, setQueryRecover] = useState(0);
  return (
    <ConvexQueryBoundary
      recoverOnKeys={[queryRecover]}
      fallback={
        <div className="space-y-4 p-4 md:p-6">
          <h1 className="text-2xl font-semibold">Contacts</h1>
          <div
            className="rounded-lg border border-destructive/40 bg-destructive/5 p-6"
            role="alert"
          >
            <p className="font-medium text-destructive">
              Could not load contacts
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              The contacts query failed. Other areas of the app may still work.
            </p>
            <Button
              type="button"
              className="mt-4"
              variant="outline"
              onClick={() => setQueryRecover((n) => n + 1)}
            >
              Retry
            </Button>
          </div>
        </div>
      }
    >
      <ContactsPageInner />
    </ConvexQueryBoundary>
  );
}
