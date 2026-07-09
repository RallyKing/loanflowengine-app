"use client";

import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { HubDataTable } from "@/components/contacts/hub/HubDataTable";
import { hubDetailStyles } from "@/components/contacts/hub/hubDetailStyles";
import { maskSsn, formatSsnDisplay } from "@/lib/contacts/maskPii";
import { contactPiiMutationArgs } from "@/lib/contacts/contactHubDraft";
import { cn } from "@/lib/cn";

export type ContactFinancialsTabProps = {
  contactId: Id<"contacts">;
  memberUserKey: string;
  contact: Doc<"contacts">;
};

function formatCurrency(value: string | undefined): string {
  const n = Number.parseFloat((value ?? "").replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(n)) return value?.trim() || "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function ContactFinancialsTab({
  contactId,
  memberUserKey,
  contact,
}: ContactFinancialsTabProps) {
  const [fico, setFico] = useState("");
  const [ssn, setSsn] = useState("");
  const [dob, setDob] = useState("");
  const [ssnRevealed, setSsnRevealed] = useState(false);
  const [piiSaving, setPiiSaving] = useState(false);
  const [piiError, setPiiError] = useState<string | null>(null);
  const [piiSaved, setPiiSaved] = useState(false);

  const [newReoAddress, setNewReoAddress] = useState("");
  const [newReoValue, setNewReoValue] = useState("");
  const [reoSaving, setReoSaving] = useState(false);

  const [newDebtEntityId, setNewDebtEntityId] =
    useState<Id<"contactBusinessEntities"> | "">("");
  const [newDebtCreditor, setNewDebtCreditor] = useState("");
  const [newDebtBalance, setNewDebtBalance] = useState("");
  const [debtSaving, setDebtSaving] = useState(false);

  useEffect(() => {
    setFico(contact.fico != null ? String(contact.fico) : "");
    setSsn(contact.ssn?.trim() ?? "");
    setDob(contact.dob?.trim() ?? "");
  }, [contact.fico, contact.ssn, contact.dob]);

  const reoRows = useQuery(api.contactDataBridge.getContactReo, {
    contactId,
    memberUserKey,
  });
  const debtRows = useQuery(api.contactDataBridge.listBusinessDebtByContact, {
    contactId,
    memberUserKey,
  });
  const businessEntities = useQuery(api.contactDataBridge.getContactBusinessEntities, {
    contactId,
    memberUserKey,
  });

  const updateContact = useMutation(api.contacts.update);
  const saveReo = useMutation(api.contactDataBridge.saveContactReo);
  const archiveReo = useMutation(api.contactDataBridge.archiveContactReo);
  const saveDebt = useMutation(api.contactDataBridge.saveContactBusinessDebt);

  const onSavePii = useCallback(async () => {
    setPiiSaving(true);
    setPiiError(null);
    setPiiSaved(false);
    try {
      await updateContact({
        id: contactId,
        memberUserKey,
        ...contactPiiMutationArgs({ fico, ssn, dob, name: contact.name, emails: [], phones: [], notes: "", contactRoleIds: [] }),
      });
      setPiiSaved(true);
    } catch (err) {
      setPiiError(err instanceof Error ? err.message : String(err));
    } finally {
      setPiiSaving(false);
    }
  }, [contactId, contact.name, dob, fico, memberUserKey, ssn, updateContact]);

  const onAddReo = useCallback(async () => {
    if (!newReoAddress.trim()) return;
    setReoSaving(true);
    try {
      await saveReo({
        contactId,
        memberUserKey,
        patch: {
          propertyAddress: newReoAddress.trim(),
          ...(newReoValue.trim() ? { marketValue: newReoValue.trim() } : {}),
        },
      });
      setNewReoAddress("");
      setNewReoValue("");
    } finally {
      setReoSaving(false);
    }
  }, [contactId, memberUserKey, newReoAddress, newReoValue, saveReo]);

  const onAddDebt = useCallback(async () => {
    if (!newDebtEntityId || !newDebtCreditor.trim()) return;
    setDebtSaving(true);
    try {
      await saveDebt({
        contactId,
        memberUserKey,
        businessEntityId: newDebtEntityId,
        patch: {
          creditor: newDebtCreditor.trim(),
          ...(newDebtBalance.trim() ? { balance: newDebtBalance.trim() } : {}),
        },
      });
      setNewDebtCreditor("");
      setNewDebtBalance("");
    } finally {
      setDebtSaving(false);
    }
  }, [
    contactId,
    memberUserKey,
    newDebtBalance,
    newDebtCreditor,
    newDebtEntityId,
    saveDebt,
  ]);

  const entityOptions =
    businessEntities?.filter((row) => row.entity != null) ?? [];

  return (
    <div className="space-y-10">
      <section className={hubDetailStyles.identityCard}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className={hubDetailStyles.sectionTitle}>Identity & credit</h3>
            <p className="mt-1 text-dlc-body-sm text-muted-foreground">
              PII stored on the master CRM record — synced with pipeline deals.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => void onSavePii()}
            disabled={piiSaving}
          >
            {piiSaving ? "Saving…" : "Save PII"}
          </Button>
        </div>
        {piiError ? (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {piiError}
          </p>
        ) : null}
        {piiSaved ? (
          <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400" role="status">
            Credit profile saved to CRM.
          </p>
        ) : null}
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Label htmlFor="financials-fico">
            FICO
            <Input
              id="financials-fico"
              className="mt-1.5"
              inputMode="numeric"
              value={fico}
              onChange={(e) => setFico(e.currentTarget.value)}
              placeholder="e.g. 720"
            />
          </Label>
          <Label htmlFor="financials-dob">
            Date of birth
            <Input
              id="financials-dob"
              className="mt-1.5"
              type="date"
              value={dob}
              onChange={(e) => setDob(e.currentTarget.value)}
            />
          </Label>
          <div>
            <Label htmlFor="financials-ssn" className="flex items-center gap-2">
              SSN
              <button
                type="button"
                className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-dlc-sm text-muted-foreground hover:bg-muted/60"
                aria-label={ssnRevealed ? "Hide SSN" : "Reveal SSN"}
                aria-pressed={ssnRevealed}
                onClick={() => setSsnRevealed((v) => !v)}
              >
                {ssnRevealed ? (
                  <EyeOff className="h-4 w-4" aria-hidden />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden />
                )}
              </button>
            </Label>
            <Input
              id="financials-ssn"
              className="mt-1.5 font-mono tracking-wider"
              type={ssnRevealed ? "text" : "password"}
              autoComplete="off"
              readOnly={!ssnRevealed}
              value={ssnRevealed ? formatSsnDisplay(ssn) : maskSsn(ssn)}
              onChange={(e) =>
                setSsn(e.currentTarget.value.replace(/\D/g, "").slice(0, 9))
              }
              onFocus={() => setSsnRevealed(true)}
              placeholder="•••-••-••••"
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h3 className={hubDetailStyles.sectionTitle}>Schedule of real estate</h3>
          <p className="mt-1 text-dlc-body-sm text-muted-foreground">
            Properties owned — synced to deal REO schedules on push/pull.
          </p>
        </div>
        <HubDataTable
          caption="Contact REO schedule"
          loading={reoRows === undefined}
          rows={reoRows ?? []}
          rowKey={(row) => String(row._id)}
          emptyMessage="No properties on file yet."
          columns={[
            {
              id: "address",
              header: "Property",
              render: (row) => (
                <span className="font-medium text-foreground">
                  {row.propertyAddress?.trim() || "—"}
                </span>
              ),
            },
            {
              id: "type",
              header: "Type",
              render: (row) => (
                <span className="text-muted-foreground">
                  {row.propertyType?.trim() || row.usage?.trim() || "—"}
                </span>
              ),
            },
            {
              id: "value",
              header: "Market value",
              render: (row) => (
                <span className="tabular-nums">{formatCurrency(row.marketValue)}</span>
              ),
            },
            {
              id: "mortgage",
              header: "Mortgage bal.",
              render: (row) => (
                <span className="tabular-nums">
                  {formatCurrency(row.mortgageBalance)}
                </span>
              ),
            },
            {
              id: "payment",
              header: "Monthly pmt",
              render: (row) => (
                <span className="tabular-nums">
                  {formatCurrency(row.monthlyPayment)}
                </span>
              ),
            },
            {
              id: "actions",
              header: "",
              cellClassName: "text-right",
              render: (row) => (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() =>
                    void archiveReo({
                      contactId,
                      memberUserKey,
                      reoId: row._id,
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              ),
            },
          ]}
        />
        <div className={cn(hubDetailStyles.opsCard, "grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end")}>
          <Label htmlFor="new-reo-address">
            Add property
            <Input
              id="new-reo-address"
              className="mt-1.5"
              value={newReoAddress}
              onChange={(e) => setNewReoAddress(e.currentTarget.value)}
              placeholder="Street address"
            />
          </Label>
          <Label htmlFor="new-reo-value">
            Market value
            <Input
              id="new-reo-value"
              className="mt-1.5"
              value={newReoValue}
              onChange={(e) => setNewReoValue(e.currentTarget.value)}
              placeholder="$"
            />
          </Label>
          <Button
            type="button"
            className="min-h-10"
            disabled={reoSaving || !newReoAddress.trim()}
            onClick={() => void onAddReo()}
          >
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            Add REO
          </Button>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h3 className={hubDetailStyles.sectionTitle}>Schedule of business debt</h3>
          <p className="mt-1 text-dlc-body-sm text-muted-foreground">
            Debt by business entity — maps to deal weighted-interest schedules.
          </p>
        </div>
        <HubDataTable
          caption="Contact business debt"
          loading={debtRows === undefined}
          rows={debtRows ?? []}
          rowKey={({ debt }) => String(debt._id)}
          emptyMessage={
            entityOptions.length === 0
              ? "Link a business entity in Relationships to track debt."
              : "No business debt rows yet."
          }
          columns={[
            {
              id: "entity",
              header: "Entity",
              render: ({ entity }) => (
                <span className="font-medium text-foreground">
                  {entity?.entityName?.trim() || "—"}
                </span>
              ),
            },
            {
              id: "creditor",
              header: "Creditor",
              render: ({ debt }) => (
                <span>{debt.creditor?.trim() || "—"}</span>
              ),
            },
            {
              id: "balance",
              header: "Balance",
              render: ({ debt }) => (
                <span className="tabular-nums">{formatCurrency(debt.balance)}</span>
              ),
            },
            {
              id: "payment",
              header: "Monthly pmt",
              render: ({ debt }) => (
                <span className="tabular-nums">
                  {formatCurrency(debt.monthlyPayment)}
                </span>
              ),
            },
          ]}
        />
        {entityOptions.length > 0 ? (
          <div className={cn(hubDetailStyles.opsCard, "grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end")}>
            <Label htmlFor="new-debt-entity">
              Entity
              <select
                id="new-debt-entity"
                className="mt-1.5 flex h-10 w-full rounded-dlc-md border border-input bg-background px-3 text-sm"
                value={newDebtEntityId}
                onChange={(e) =>
                  setNewDebtEntityId(
                    e.currentTarget.value as Id<"contactBusinessEntities"> | "",
                  )
                }
              >
                <option value="">Select entity…</option>
                {entityOptions.map(({ entity }) =>
                  entity ? (
                    <option key={entity._id} value={entity._id}>
                      {entity.entityName}
                    </option>
                  ) : null,
                )}
              </select>
            </Label>
            <Label htmlFor="new-debt-creditor">
              Creditor
              <Input
                id="new-debt-creditor"
                className="mt-1.5"
                value={newDebtCreditor}
                onChange={(e) => setNewDebtCreditor(e.currentTarget.value)}
              />
            </Label>
            <Label htmlFor="new-debt-balance">
              Balance
              <Input
                id="new-debt-balance"
                className="mt-1.5"
                value={newDebtBalance}
                onChange={(e) => setNewDebtBalance(e.currentTarget.value)}
              />
            </Label>
            <Button
              type="button"
              className="min-h-10"
              disabled={debtSaving || !newDebtEntityId || !newDebtCreditor.trim()}
              onClick={() => void onAddDebt()}
            >
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              Add debt
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
