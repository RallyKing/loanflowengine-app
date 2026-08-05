"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  ChevronDown,
  Filter,
  Landmark,
  Loader2,
  Plus,
  Search,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/DropdownMenu";
import { cn } from "@/lib/cn";
import {
  REGISTRY_ROLE_CATALOG,
  registryRoleDisplayName,
  type RegistryRoleId,
} from "@/lib/registry/universalRoles";
import type { RegistryType } from "@/lib/registry/registryItem";
import type { ContactsSmartList } from "@/lib/contacts/contactsSmartLists";
import { countActiveContactsFilters } from "@/lib/contacts/contactsWorkspaceFilters";

const SEARCH_DEBOUNCE_MS = 280;

const TYPE_OPTIONS: { id: RegistryType; label: string; icon: typeof UserRound }[] =
  [
    { id: "contact", label: "Contact", icon: UserRound },
    { id: "entity", label: "Entity", icon: Building2 },
    { id: "lender", label: "Lender", icon: Landmark },
  ];

type ContactsCommandBarProps = {
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  typeFilters: RegistryType[];
  onTypeFiltersChange: (next: RegistryType[]) => void;
  roleFilters: RegistryRoleId[];
  onRoleFiltersChange: (next: RegistryRoleId[]) => void;
  onAddContact: () => void;
  onAddEntity: () => void;
  onAddLender: () => void;
  canMutate?: boolean;
  recordCount?: number;
  loading?: boolean;
  searching?: boolean;
  smartLists: ContactsSmartList[];
  activeSmartListId: string;
  onSmartListChange: (id: string) => void;
  onSaveSmartList: () => void;
  onOpenFilters: () => void;
  activeFilterCount: number;
  columnMenu: React.ReactNode;
};

function toggleArrayItem<T>(current: T[], item: T): T[] {
  return current.includes(item)
    ? current.filter((v) => v !== item)
    : [...current, item];
}

export function ContactsCommandBar({
  searchInput,
  onSearchInputChange,
  typeFilters,
  onTypeFiltersChange,
  roleFilters,
  onRoleFiltersChange,
  onAddContact,
  onAddEntity,
  onAddLender,
  canMutate = true,
  recordCount,
  loading = false,
  searching = false,
  smartLists,
  activeSmartListId,
  onSmartListChange,
  onSaveSmartList,
  onOpenFilters,
  activeFilterCount,
  columnMenu,
}: ContactsCommandBarProps) {
  const typeSummary =
    typeFilters.length === 0
      ? "All types"
      : typeFilters.length === 1
        ? TYPE_OPTIONS.find((t) => t.id === typeFilters[0])?.label ?? "Type"
        : `${typeFilters.length} types`;

  const roleSummary =
    roleFilters.length === 0
      ? "All roles"
      : roleFilters.length === 1
        ? registryRoleDisplayName(roleFilters[0])
        : `${roleFilters.length} roles`;

  const toggleRole = useCallback(
    (roleId: RegistryRoleId) => {
      onRoleFiltersChange(toggleArrayItem(roleFilters, roleId));
    },
    [roleFilters, onRoleFiltersChange],
  );

  return (
    <div
      className={cn(
        // Sticky above table rows only — must stay below overlay menus (CHROME_MENU / DROPDOWN).
        "sticky top-0 z-[calc(var(--dlc-z-header,20)+1)] shrink-0 border-b border-slate-200/90 bg-white/95 backdrop-blur-sm",
        "dark:border-slate-700/80 dark:bg-dlc-surface-high/95",
      )}
      data-testid="contacts-command-bar"
    >
      <div className="mx-auto flex w-full max-w-[100rem] flex-col gap-0">
        <div
          className="flex gap-0 overflow-x-auto border-b border-slate-200/70 px-4 dark:border-slate-700/60"
          role="tablist"
          aria-label="Smart lists"
          data-testid="contacts-smart-lists"
        >
          {smartLists.map((list) => {
            const active = list.id === activeSmartListId;
            return (
              <button
                key={list.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={cn(
                  "relative shrink-0 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors duration-dlc-short ease-dlc-standard sm:px-4 sm:text-sm",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
                onClick={() => onSmartListChange(list.id)}
              >
                {list.label}
              </button>
            );
          })}
          <button
            type="button"
            className="shrink-0 px-3 py-2.5 text-xs font-medium text-primary hover:underline sm:text-sm"
            onClick={onSaveSmartList}
          >
            + Save list
          </button>
        </div>

        <div className="flex flex-col gap-3 px-4 py-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="flex min-w-0 shrink-0 items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
                Contacts
              </h1>
              {typeof recordCount === "number" ? (
                <span
                  className="rounded-full bg-muted/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                  aria-live="polite"
                >
                  {loading ? "…" : recordCount.toLocaleString()}
                </span>
              ) : null}
            </div>

            {canMutate ? (
              <DropdownMenu
                align="start"
                aria-label="Add new contact"
                trigger={
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    className="h-9 shrink-0 gap-1.5 text-xs"
                    data-testid="contacts-add-new"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    Add New
                    <ChevronDown className="h-3.5 w-3.5 opacity-80" aria-hidden />
                  </Button>
                }
              >
                <DropdownMenuItem onClick={onAddContact}>
                  <UserRound className="h-4 w-4 shrink-0" aria-hidden />
                  Add Contact
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onAddEntity}>
                  <Building2 className="h-4 w-4 shrink-0" aria-hidden />
                  Add Entity
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onAddLender}>
                  <Landmark className="h-4 w-4 shrink-0" aria-hidden />
                  Add Lender
                </DropdownMenuItem>
              </DropdownMenu>
            ) : null}

            <div className="ml-auto flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:flex-nowrap">
              <div className="relative min-w-[10rem] flex-1 sm:max-w-[18rem]">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                {searching ? (
                  <Loader2
                    className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-primary"
                    aria-hidden
                  />
                ) : null}
                <Input
                  type="search"
                  value={searchInput}
                  onChange={(e) => onSearchInputChange(e.target.value)}
                  placeholder="Search contacts…"
                  className={cn("h-9 pl-8 text-sm", searching && "pr-8")}
                  data-testid="contacts-search"
                  aria-label="Search contacts by name, email, or phone"
                  aria-busy={searching}
                />
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 shrink-0 gap-1.5 text-xs"
                data-testid="contacts-filter-drawer"
                onClick={onOpenFilters}
              >
                <Filter className="h-3.5 w-3.5" aria-hidden />
                Filters
                {activeFilterCount > 0 ? (
                  <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                    {activeFilterCount}
                  </span>
                ) : null}
              </Button>

              {columnMenu}

              <FilterDropdown
                label="Record type"
                summary={typeSummary}
                testId="contacts-type-filter"
              >
                {TYPE_OPTIONS.map(({ id, label, icon: Icon }) => {
                  const activeOnly =
                    typeFilters.length > 0 && typeFilters.includes(id);
                  return (
                    <FilterToggleRow
                      key={id}
                      label={label}
                      icon={<Icon className="h-4 w-4 shrink-0" aria-hidden />}
                      pressed={activeOnly}
                      onToggle={() => {
                        if (typeFilters.length === 0) {
                          onTypeFiltersChange([id]);
                          return;
                        }
                        onTypeFiltersChange(toggleArrayItem(typeFilters, id));
                      }}
                    />
                  );
                })}
                {typeFilters.length > 0 ? (
                  <button
                    type="button"
                    className="mx-2 mb-1 mt-0.5 w-[calc(100%-1rem)] rounded-dlc-sm px-2 py-1.5 text-left text-xs text-primary hover:bg-muted/50"
                    onClick={() => onTypeFiltersChange([])}
                  >
                    Clear type filters
                  </button>
                ) : null}
              </FilterDropdown>

              <FilterDropdown
                label="Role"
                summary={roleSummary}
                testId="contacts-role-filter"
              >
                {REGISTRY_ROLE_CATALOG.map((role) => (
                  <FilterToggleRow
                    key={role.id}
                    label={role.displayName}
                    pressed={roleFilters.includes(role.id)}
                    onToggle={() => toggleRole(role.id)}
                  />
                ))}
                {roleFilters.length > 0 ? (
                  <button
                    type="button"
                    className="mx-2 mb-1 mt-0.5 w-[calc(100%-1rem)] rounded-dlc-sm px-2 py-1.5 text-left text-xs text-primary hover:bg-muted/50"
                    onClick={() => onRoleFiltersChange([])}
                  >
                    Clear role filters
                  </button>
                ) : null}
              </FilterDropdown>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterDropdown({
  label,
  summary,
  children,
  testId,
}: {
  label: string;
  summary: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <DropdownMenu
      align="end"
      aria-label={label}
      trigger={
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 shrink-0 gap-1 text-xs"
          data-testid={testId}
        >
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          <span className="max-w-[8rem] truncate sm:max-w-[10rem]">{summary}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
        </Button>
      }
    >
      <div className="px-3 py-2 text-dlc-label-md font-semibold text-muted-foreground">
        {label}
      </div>
      {children}
    </DropdownMenu>
  );
}

function FilterToggleRow({
  label,
  icon,
  pressed,
  onToggle,
}: {
  label: string;
  icon?: React.ReactNode;
  pressed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={pressed}
      className={cn(
        "flex w-full min-h-10 items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-dlc-short ease-dlc-standard",
        "hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
        pressed && "bg-primary/8 font-medium",
      )}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px]",
          pressed
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-background",
        )}
        aria-hidden
      >
        {pressed ? "✓" : ""}
      </span>
      {icon}
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}

export function useContactsSearchDebounce(
  searchInput: string,
  delayMs = SEARCH_DEBOUNCE_MS,
): string {
  const [debounced, setDebounced] = useState(searchInput);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(searchInput), delayMs);
    return () => window.clearTimeout(t);
  }, [searchInput, delayMs]);

  return debounced;
}
