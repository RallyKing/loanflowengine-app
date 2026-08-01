"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { RegistryExplorerShell } from "@/components/registry/RegistryExplorerShell";
import {
  RegistryCommandBar,
  useRegistrySearchDebounce,
} from "@/components/registry/RegistryCommandBar";
import {
  RegistryDataTable,
  type RegistryRowAction,
} from "@/components/registry/RegistryDataTable";
import { RegistryEditModal } from "@/components/registry/RegistryEditModal";
import { RegistryCreateLenderModal } from "@/components/registry/RegistryCreateLenderModal";
import { UniversalContactModal } from "@/components/contacts/UniversalContactModal";
import type { UniversalContactKind } from "@/components/contacts/UniversalContactModal";
import { ConvertToEntityModal } from "@/components/contacts/ConvertToEntityModal";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import { simpleDeleteConfirm } from "@/lib/ui/confirmDestructive";
import { useUserPreferences } from "@/lib/userPreferencesContext";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import type { RegistryItem, RegistryType } from "@/lib/registry/registryItem";
import { registryCommandCenterHref } from "@/lib/registry/registryRoutes";
import type { RegistryRoleId } from "@/lib/registry/universalRoles";

const DELETE_TYPE_LABEL: Record<RegistryType, string> = {
  contact: "contact",
  entity: "entity",
  lender: "lender",
};

export function RegistryWorkspaceClient() {
  const router = useRouter();
  const { confirm } = useOperationalConfirm();
  const { accountId } = useUserPreferences();
  const { activeOrganizationId, can } = useOrgPermissions();
  const memberKey = accountId.trim();

  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useRegistrySearchDebounce(searchInput);
  const [typeFilters, setTypeFilters] = useState<RegistryType[]>([]);
  const [roleFilters, setRoleFilters] = useState<RegistryRoleId[]>([]);

  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactModalKind, setContactModalKind] =
    useState<UniversalContactKind>("individual");
  const [lenderModalOpen, setLenderModalOpen] = useState(false);

  const [editModalItem, setEditModalItem] = useState<RegistryItem | null>(null);

  const [convertContactId, setConvertContactId] =
    useState<Id<"contacts"> | null>(null);
  const [convertContactLabel, setConvertContactLabel] = useState<string>("");

  const removeContact = useMutation(api.contacts.remove);
  const deleteClient = useMutation(api.hierarchyCrudMutations.deleteClient);
  const removeLender = useMutation(api.lenders.remove);

  const canView = can("contacts.view");
  const canMutate = can("contacts.manage");

  const listArgs = useMemo(() => {
    if (!activeOrganizationId || !memberKey || !canView) return "skip" as const;
    return {
      organizationId: activeOrganizationId,
      memberUserKey: memberKey,
      ...(debouncedSearch.trim()
        ? { searchQuery: debouncedSearch.trim() }
        : {}),
      ...(typeFilters.length > 0 ? { typeFilter: typeFilters } : {}),
      ...(roleFilters.length > 0 ? { roleFilter: roleFilters } : {}),
      sortBy: "updatedAt" as const,
    };
  }, [
    activeOrganizationId,
    memberKey,
    canView,
    debouncedSearch,
    typeFilters,
    roleFilters,
  ]);

  const items = useQuery(api.registry.list, listArgs);

  const openAddModal = useCallback((kind: UniversalContactKind) => {
    setContactModalKind(kind);
    setContactModalOpen(true);
  }, []);

  const handleDelete = useCallback(
    async (item: RegistryItem) => {
      if (!activeOrganizationId || !memberKey) return;
      const typeLabel = DELETE_TYPE_LABEL[item.registryType];
      const ok = await confirm(
        simpleDeleteConfirm(item.displayName, {
          title: `Delete ${typeLabel}`,
          impact:
            item.registryType === "entity"
              ? "This removes the entity and may require cascade confirmation if linked projects or files exist."
              : "This action cannot be undone.",
        }),
      );
      if (!ok) return;

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
          if (!cascadeOk) return;
          await deleteClient({
            organizationId: activeOrganizationId,
            memberUserKey: memberKey,
            clientId: item._id as Id<"clients">,
            forceCascade: true,
          });
        } else {
          throw err;
        }
      }
    },
    [
      activeOrganizationId,
      confirm,
      deleteClient,
      memberKey,
      removeContact,
      removeLender,
    ],
  );

  const handleRowAction = useCallback(
    (item: RegistryItem, action: RegistryRowAction) => {
      switch (action) {
        case "edit":
          setEditModalItem(item);
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

  if (!activeOrganizationId || !memberKey) {
    return (
      <RegistryExplorerShell
        commandBar={
          <RegistryCommandBar
            searchInput={searchInput}
            onSearchInputChange={setSearchInput}
            typeFilters={typeFilters}
            onTypeFiltersChange={setTypeFilters}
            roleFilters={roleFilters}
            onRoleFiltersChange={setRoleFilters}
            onAddContact={() => openAddModal("individual")}
            onAddEntity={() => openAddModal("entity")}
            onAddLender={() => setLenderModalOpen(true)}
            canMutate={false}
          />
        }
      >
        <p className="text-sm text-muted-foreground">
          Select an organization to browse the global registry.
        </p>
      </RegistryExplorerShell>
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
          onCreated={() => {
            setContactModalOpen(false);
          }}
        />
      ) : null}

      {lenderModalOpen ? (
        <RegistryCreateLenderModal
          open={lenderModalOpen}
          onClose={() => setLenderModalOpen(false)}
        />
      ) : null}

      {editModalItem ? (
        <RegistryEditModal
          open
          item={editModalItem}
          organizationId={activeOrganizationId}
          memberUserKey={memberKey}
          onClose={() => setEditModalItem(null)}
          onSaved={() => setEditModalItem(null)}
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

      <RegistryExplorerShell
        commandBar={
          <RegistryCommandBar
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
            recordCount={items?.length}
            loading={items === undefined}
          />
        }
      >
        <RegistryDataTable
          items={items}
          onRowAction={handleRowAction}
          canMutate={canMutate}
        />
      </RegistryExplorerShell>
    </>
  );
}
