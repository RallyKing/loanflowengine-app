"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { SortingState, VisibilityState } from "@tanstack/react-table";
import { Columns3, ChevronDown } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ContactsExplorerShell } from "@/modules/contacts/workspace/ContactsExplorerShell";
import { ContactsCommandBar } from "@/modules/contacts/workspace/ContactsCommandBar";
import {
  ContactsDataTable,
  DEFAULT_CONTACTS_COLUMN_VISIBILITY,
  CONTACTS_TABLE_COLUMN_IDS,
  type ContactsRowAction,
} from "@/modules/contacts/workspace/ContactsDataTable";
import {
  ContactsFilterDrawer,
  contactsAdvancedFiltersToMs,
  type ContactsAdvancedFilters,
} from "@/modules/contacts/workspace/ContactsFilterDrawer";
import { ContactInspectorSidePanel } from "@/modules/contacts/workspace/ContactInspectorSidePanel";
import { RegistryCreateLenderModal } from "@/components/registry/RegistryCreateLenderModal";
import { UniversalContactModal } from "@/components/contacts/UniversalContactModal";
import type { UniversalContactKind } from "@/components/contacts/UniversalContactModal";
import { ConvertToEntityModal } from "@/components/contacts/ConvertToEntityModal";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import { simpleDeleteConfirm } from "@/lib/ui/confirmDestructive";
import { useUserPreferences } from "@/lib/userPreferencesContext";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { useConvexOrgQueryReady } from "@/lib/useConvexOrgQueryReady";
import { useActorUserKey } from "@/lib/useActorUserKey";
import type { RegistryItem, RegistryType } from "@/lib/registry/registryItem";
import {
  registryItemMatchesSearchQuery,
  sortRegistryItems,
} from "@/lib/registry/registryItem";
import { registryCommandCenterHref } from "@/lib/registry/registryRoutes";
import type { RegistryRoleId } from "@/lib/registry/universalRoles";
import {
  countActiveContactsFilters,
  DEFAULT_CONTACTS_WORKSPACE_FILTERS,
  type ContactsWorkspaceFilters,
} from "@/lib/contacts/contactsWorkspaceFilters";
import {
  createSmartListFromFilters,
  loadContactsSmartLists,
  saveContactsSmartLists,
  type ContactsSmartList,
} from "@/lib/contacts/contactsSmartLists";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuItem,
} from "@/components/ui/DropdownMenu";

const DELETE_TYPE_LABEL: Record<RegistryType, string> = {
  contact: "contact",
  entity: "entity",
  lender: "lender",
};

const COLUMN_VISIBILITY_KEY = "dlc-contacts-column-visibility-v1";

function rowKey(item: RegistryItem): string {
  return `${item.registryType}-${item._id}`;
}

function sortWithDirection(
  items: RegistryItem[],
  sortId: string,
  desc: boolean,
): RegistryItem[] {
  const sortBy: "updatedAt" | "displayName" | "lastActivityAt" | "lastInteractionAt" =
    sortId === "displayName" ||
    sortId === "lastActivityAt" ||
    sortId === "lastInteractionAt"
      ? sortId
      : "updatedAt";
  const sorted = sortRegistryItems(items, sortBy);
  if (sortBy === "displayName") {
    return desc ? [...sorted].reverse() : sorted;
  }
  return desc ? sorted : [...sorted].reverse();
}

function loadColumnVisibility(orgId: string): VisibilityState {
  if (typeof window === "undefined") return DEFAULT_CONTACTS_COLUMN_VISIBILITY;
  try {
    const raw = window.localStorage.getItem(`${COLUMN_VISIBILITY_KEY}-${orgId}`);
    if (!raw) return DEFAULT_CONTACTS_COLUMN_VISIBILITY;
    return { ...DEFAULT_CONTACTS_COLUMN_VISIBILITY, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONTACTS_COLUMN_VISIBILITY;
  }
}

function saveColumnVisibility(orgId: string, state: VisibilityState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `${COLUMN_VISIBILITY_KEY}-${orgId}`,
      JSON.stringify(state),
    );
  } catch {
    /* private mode */
  }
}

export function ContactsWorkspaceClient() {
  const router = useRouter();
  const { confirm } = useOperationalConfirm();
  const { accountId } = useUserPreferences();
  const { activeOrganizationId, can } = useOrgPermissions();
  const orgQueryReady = useConvexOrgQueryReady();
  const memberKey = useActorUserKey().trim() || accountId.trim();

  const [searchInput, setSearchInput] = useState("");
  const [typeFilters, setTypeFilters] = useState<RegistryType[]>([]);
  const [roleFilters, setRoleFilters] = useState<RegistryRoleId[]>([]);
  const [advancedFilters, setAdvancedFilters] = useState<ContactsAdvancedFilters>({
    linkStatusFilters: [],
    tagInput: "",
    tagFilters: [],
    activityFromDate: "",
    activityToDate: "",
  });
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

  const [smartLists, setSmartLists] = useState<ContactsSmartList[]>([]);
  const [activeSmartListId, setActiveSmartListId] = useState("all");

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    DEFAULT_CONTACTS_COLUMN_VISIBILITY,
  );
  const [sorting, setSorting] = useState<SortingState>([
    { id: "updatedAt", desc: true },
  ]);

  const [selectedItem, setSelectedItem] = useState<RegistryItem | null>(null);
  const [rowPatches, setRowPatches] = useState<Record<string, Partial<RegistryItem>>>(
    {},
  );
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactModalKind, setContactModalKind] =
    useState<UniversalContactKind>("individual");
  const [lenderModalOpen, setLenderModalOpen] = useState(false);
  const [convertContactId, setConvertContactId] =
    useState<Id<"contacts"> | null>(null);
  const [convertContactLabel, setConvertContactLabel] = useState("");

  const removeContact = useMutation(api.contacts.remove);
  const updateContact = useMutation(api.contacts.update);
  const deleteClient = useMutation(api.hierarchyCrudMutations.deleteClient);
  const removeLender = useMutation(api.lenders.remove);

  const canMutate = can("contacts.manage");

  useEffect(() => {
    if (!activeOrganizationId) return;
    const { lists, activeListId } = loadContactsSmartLists(activeOrganizationId);
    setSmartLists(lists);
    setActiveSmartListId(activeListId);
    setColumnVisibility(loadColumnVisibility(activeOrganizationId));
  }, [activeOrganizationId]);

  const applyWorkspaceFilters = useCallback((filters: ContactsWorkspaceFilters) => {
    setSearchInput(filters.search);
    setTypeFilters(filters.typeFilters as RegistryType[]);
    setRoleFilters(filters.roleFilters as RegistryRoleId[]);
    setAdvancedFilters({
      linkStatusFilters: filters.linkStatusFilters,
      tagInput: "",
      tagFilters: filters.tagFilters,
      activityFromDate: filters.activityFrom
        ? new Date(filters.activityFrom).toISOString().slice(0, 10)
        : "",
      activityToDate: filters.activityTo
        ? new Date(filters.activityTo).toISOString().slice(0, 10)
        : "",
    });
  }, []);

  const { activityFrom, activityTo } = useMemo(
    () => contactsAdvancedFiltersToMs(advancedFilters),
    [advancedFilters],
  );

  const currentWorkspaceFilters = useMemo((): ContactsWorkspaceFilters => {
    return {
      search: searchInput,
      typeFilters,
      roleFilters,
      linkStatusFilters: advancedFilters.linkStatusFilters,
      tagFilters: advancedFilters.tagFilters,
      activityFrom,
      activityTo,
    };
  }, [
    searchInput,
    typeFilters,
    roleFilters,
    advancedFilters.linkStatusFilters,
    advancedFilters.tagFilters,
    activityFrom,
    activityTo,
  ]);

  const activeFilterCount = countActiveContactsFilters(currentWorkspaceFilters);

  const listArgs = useMemo(() => {
    if (!orgQueryReady || !activeOrganizationId || !memberKey) return "skip" as const;
    return {
      organizationId: activeOrganizationId,
      memberUserKey: memberKey,
      ...(typeFilters.length > 0 ? { typeFilter: typeFilters } : {}),
      ...(roleFilters.length > 0 ? { roleFilter: roleFilters } : {}),
      ...(advancedFilters.linkStatusFilters.length > 0
        ? { linkStatusFilter: advancedFilters.linkStatusFilters }
        : {}),
      ...(advancedFilters.tagFilters.length > 0
        ? { tagFilter: advancedFilters.tagFilters }
        : {}),
      ...(activityFrom != null ? { activityFrom } : {}),
      ...(activityTo != null ? { activityTo } : {}),
    };
  }, [
    orgQueryReady,
    activeOrganizationId,
    memberKey,
    typeFilters,
    roleFilters,
    advancedFilters.linkStatusFilters,
    advancedFilters.tagFilters,
    activityFrom,
    activityTo,
  ]);

  const allResults = useQuery(api.registry.listAll, listArgs);

  const applyRowPatches = useCallback(
    (rows: RegistryItem[]): RegistryItem[] => {
      if (Object.keys(rowPatches).length === 0) return rows;
      return rows.map((row) => {
        const patch = rowPatches[rowKey(row)];
        return patch ? { ...row, ...patch } : row;
      });
    },
    [rowPatches],
  );

  const tableData = useMemo(() => {
    let rows = applyRowPatches(allResults ?? []);

    const term = searchInput.trim();
    if (term) {
      rows = rows.filter((item) => registryItemMatchesSearchQuery(item, term));
    }

    const sortCol = sorting[0]?.id ?? "updatedAt";
    const sortDesc = sorting[0]?.desc ?? true;
    rows = sortWithDirection(rows, sortCol, sortDesc);

    return rows;
  }, [allResults, applyRowPatches, searchInput, sorting]);

  const loading = allResults === undefined;

  useEffect(() => {
    setSelectedRowKeys(new Set());
  }, [searchInput, typeFilters, roleFilters, advancedFilters, activityFrom, activityTo]);

  const handleItemPatched = useCallback(
    (patch: Partial<RegistryItem>) => {
      if (!selectedItem) return;
      const key = rowKey(selectedItem);
      setRowPatches((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
      setSelectedItem((prev) => (prev ? { ...prev, ...patch } : prev));
    },
    [selectedItem],
  );

  const handleSmartListChange = useCallback(
    (id: string) => {
      setActiveSmartListId(id);
      const list = smartLists.find((l) => l.id === id);
      if (list) applyWorkspaceFilters(list.filters);
      if (activeOrganizationId) {
        saveContactsSmartLists(activeOrganizationId, smartLists, id);
      }
    },
    [smartLists, applyWorkspaceFilters, activeOrganizationId],
  );

  const handleSaveSmartList = useCallback(() => {
    const label = window.prompt("Name this smart list:");
    if (!label?.trim() || !activeOrganizationId) return;
    const list = createSmartListFromFilters(label, currentWorkspaceFilters);
    const next = [...smartLists, list];
    setSmartLists(next);
    setActiveSmartListId(list.id);
    saveContactsSmartLists(activeOrganizationId, next, list.id);
  }, [activeOrganizationId, currentWorkspaceFilters, smartLists]);

  const handleColumnVisibilityToggle = useCallback(
    (columnId: string) => {
      if (!activeOrganizationId) return;
      setColumnVisibility((prev) => {
        const next = { ...prev, [columnId]: !prev[columnId] };
        saveColumnVisibility(activeOrganizationId, next);
        return next;
      });
    },
    [activeOrganizationId],
  );

  const openAddModal = useCallback((kind: UniversalContactKind) => {
    setContactModalKind(kind);
    setContactModalOpen(true);
  }, []);

  const deleteItem = useCallback(
    async (item: RegistryItem, opts?: { skipConfirm?: boolean }) => {
      if (!activeOrganizationId || !memberKey) return false;
      const typeLabel = DELETE_TYPE_LABEL[item.registryType];

      if (!opts?.skipConfirm) {
        const ok = await confirm(
          simpleDeleteConfirm(item.displayName, {
            title: `Delete ${typeLabel}`,
            impact:
              item.registryType === "entity"
                ? "This removes the entity and may require cascade confirmation if linked projects or files exist."
                : "This action cannot be undone.",
          }),
        );
        if (!ok) return false;
      }

      try {
        if (item.registryType === "contact") {
          await removeContact({
            id: item._id as Id<"contacts">,
            memberUserKey: memberKey,
          });
        } else if (item.registryType === "entity") {
          await deleteClient({
            organizationId: activeOrganizationId,
            memberUserKey: memberKey,
            clientId: item._id as Id<"clients">,
          });
        } else {
          await removeLender({
            id: item._id as Id<"lenders">,
            organizationId: activeOrganizationId,
            memberUserKey: memberKey,
          });
        }
        if (selectedItem && rowKey(selectedItem) === rowKey(item)) {
          setSelectedItem(null);
        }
        setRowPatches((prev) => {
          const next = { ...prev };
          delete next[rowKey(item)];
          return next;
        });
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (
          item.registryType === "entity" &&
          message.includes("forceCascade")
        ) {
          const cascadeOk = await confirm(
            simpleDeleteConfirm(item.displayName, {
              title: "Cascade delete entity",
              impact:
                "This entity has nested projects or loan files. All nested records will be deleted.",
              confirmLabel: "Delete all",
              variant: "delete",
            }),
          );
          if (!cascadeOk) return false;
          await deleteClient({
            organizationId: activeOrganizationId,
            memberUserKey: memberKey,
            clientId: item._id as Id<"clients">,
            forceCascade: true,
          });
          if (selectedItem && rowKey(selectedItem) === rowKey(item)) {
            setSelectedItem(null);
          }
          setRowPatches((prev) => {
            const next = { ...prev };
            delete next[rowKey(item)];
            return next;
          });
          return true;
        }
        throw err;
      }
    },
    [
      activeOrganizationId,
      confirm,
      deleteClient,
      memberKey,
      removeContact,
      removeLender,
      selectedItem,
    ],
  );

  const handleDelete = useCallback(
    async (item: RegistryItem) => {
      await deleteItem(item);
    },
    [deleteItem],
  );

  const selectedItems = useMemo(() => {
    return tableData.filter((item) => selectedRowKeys.has(rowKey(item)));
  }, [tableData, selectedRowKeys]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedItems.length === 0 || !canMutate) return;
    const ok = await confirm(
      simpleDeleteConfirm(`${selectedItems.length} records`, {
        title: "Delete selected",
        impact: "This permanently removes all selected contacts, entities, and lenders.",
        confirmLabel: "Delete all",
        variant: "delete",
      }),
    );
    if (!ok) return;

    setBulkBusy(true);
    try {
      for (const item of selectedItems) {
        await deleteItem(item, { skipConfirm: true });
      }
      setSelectedRowKeys(new Set());
    } finally {
      setBulkBusy(false);
    }
  }, [selectedItems, canMutate, confirm, deleteItem]);

  const handleBulkAssignTag = useCallback(async () => {
    if (!canMutate || !memberKey) return;
    const contactItems = selectedItems.filter((i) => i.registryType === "contact");
    if (contactItems.length === 0) {
      window.alert("Select at least one contact to assign a tag.");
      return;
    }

    const tag = window.prompt("Tag to assign (comma-separated for multiple):");
    if (!tag?.trim()) return;

    const newTags = tag
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (newTags.length === 0) return;

    setBulkBusy(true);
    try {
      for (const item of contactItems) {
        const existing = Array.isArray(item.crmTags) ? item.crmTags : [];
        const merged = [...new Set([...existing, ...newTags])];
        await updateContact({
          id: item._id as Id<"contacts">,
          memberUserKey: memberKey,
          crmTags: merged,
        });
        const key = rowKey(item);
        setRowPatches((prev) => ({
          ...prev,
          [key]: { ...prev[key], crmTags: merged },
        }));
      }
      setSelectedRowKeys(new Set());
    } finally {
      setBulkBusy(false);
    }
  }, [canMutate, memberKey, selectedItems, updateContact]);

  const handleRowAction = useCallback(
    (item: RegistryItem, action: ContactsRowAction) => {
      switch (action) {
        case "edit":
          setSelectedItem(item);
          break;
        case "view-vault":
          router.push(registryCommandCenterHref(item));
          break;
        case "promote-to-entity":
          setConvertContactId(item._id as Id<"contacts">);
          setConvertContactLabel(item.displayName);
          break;
        case "delete":
          void handleDelete(item);
          break;
      }
    },
    [handleDelete, router],
  );

  const handleRowSelect = useCallback((item: RegistryItem) => {
    setSelectedItem(item);
  }, []);

  const columnMenu = useMemo(
    () => (
      <DropdownMenu
        align="end"
        aria-label="Toggle columns"
        trigger={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0 gap-1 text-xs"
            data-testid="contacts-columns-menu"
          >
            <Columns3 className="h-3.5 w-3.5" aria-hidden />
            Columns
            <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
          </Button>
        }
      >
        {CONTACTS_TABLE_COLUMN_IDS.filter(
          (id) => id !== "actions" && id !== "select",
        ).map((columnId) => (
          <DropdownMenuItem
            key={columnId}
            onClick={() => handleColumnVisibilityToggle(columnId)}
          >
            <span className="mr-2 w-4 text-center">
              {columnVisibility[columnId] !== false ? "✓" : ""}
            </span>
            {columnId}
          </DropdownMenuItem>
        ))}
      </DropdownMenu>
    ),
    [columnVisibility, handleColumnVisibilityToggle],
  );

  const commandBar = (
    <ContactsCommandBar
      searchInput={searchInput}
      onSearchInputChange={setSearchInput}
      typeFilters={typeFilters}
      onTypeFiltersChange={setTypeFilters}
      roleFilters={roleFilters}
      onRoleFiltersChange={setRoleFilters}
      onAddContact={() => openAddModal("individual")}
      onAddEntity={() => openAddModal("entity")}
      onAddLender={() => setLenderModalOpen(true)}
      canMutate={canMutate}
      recordCount={loading ? undefined : tableData.length}
      loading={loading}
      searching={false}
      smartLists={smartLists}
      activeSmartListId={activeSmartListId}
      onSmartListChange={handleSmartListChange}
      onSaveSmartList={handleSaveSmartList}
      onOpenFilters={() => setFilterDrawerOpen(true)}
      activeFilterCount={activeFilterCount}
      columnMenu={columnMenu}
    />
  );

  if (!activeOrganizationId || !memberKey) {
    return (
      <ContactsExplorerShell commandBar={commandBar}>
        <p className="text-sm text-muted-foreground">
          Select an organization to browse contacts.
        </p>
      </ContactsExplorerShell>
    );
  }

  return (
    <>
      {contactModalOpen ? (
        <UniversalContactModal
          open={contactModalOpen}
          onClose={() => setContactModalOpen(false)}
          organizationId={activeOrganizationId}
          memberUserKey={memberKey}
          defaultKind={contactModalKind}
          onCreated={(result) => {
            setContactModalOpen(false);
            setSearchInput("");
            if (result.kind === "individual") {
              setSelectedItem({
                _id: String(result.contactId),
                registryType: "contact",
                displayName: "New contact",
                primaryEmail: "",
                primaryPhone: "",
                roles: [],
                updatedAt: Date.now(),
              });
            }
          }}
        />
      ) : null}

      {lenderModalOpen ? (
        <RegistryCreateLenderModal
          open={lenderModalOpen}
          onClose={() => setLenderModalOpen(false)}
        />
      ) : null}

      {convertContactId ? (
        <ConvertToEntityModal
          open
          onClose={() => {
            setConvertContactId(null);
            setConvertContactLabel("");
          }}
          organizationId={activeOrganizationId}
          memberUserKey={memberKey}
          contactId={convertContactId}
          contactLabel={convertContactLabel}
          navigateOnSuccess={false}
          onConverted={() => {
            setConvertContactId(null);
            setConvertContactLabel("");
          }}
        />
      ) : null}

      <ContactsExplorerShell
        commandBar={commandBar}
        sidePanel={
          selectedItem ? (
            <ContactInspectorSidePanel
              item={selectedItem}
              organizationId={activeOrganizationId}
              memberUserKey={memberKey}
              canMutate={canMutate}
              onClose={() => setSelectedItem(null)}
              onItemPatched={handleItemPatched}
              onDelete={() => void handleDelete(selectedItem)}
            />
          ) : null
        }
      >
        <ContactsFilterDrawer
          open={filterDrawerOpen}
          onClose={() => setFilterDrawerOpen(false)}
          filters={advancedFilters}
          onChange={setAdvancedFilters}
          onApply={() => setFilterDrawerOpen(false)}
          onClear={() => {
            setAdvancedFilters({
              linkStatusFilters: [],
              tagInput: "",
              tagFilters: [],
              activityFromDate: "",
              activityToDate: "",
            });
            applyWorkspaceFilters(DEFAULT_CONTACTS_WORKSPACE_FILTERS);
          }}
        />
        <ContactsDataTable
          items={tableData}
          loading={loading}
          searchQuery={searchInput}
          onClearSearch={() => setSearchInput("")}
          selectedId={selectedItem ? rowKey(selectedItem) : null}
          onRowSelect={handleRowSelect}
          onRowAction={handleRowAction}
          canMutate={canMutate}
          columnVisibility={columnVisibility}
          sorting={sorting}
          onSortingChange={setSorting}
          selectedRowKeys={selectedRowKeys}
          onSelectedRowKeysChange={setSelectedRowKeys}
          bulkBusy={bulkBusy}
          onBulkDelete={() => void handleBulkDelete()}
          onBulkAssignTag={() => void handleBulkAssignTag()}
        />
      </ContactsExplorerShell>
    </>
  );
}
