"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { Landmark, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { blankLender } from "@/lib/schema";
import { classifyEntity } from "@/lib/classify";
import { useOrgConvexQueryArgs } from "@/lib/useOrgConvexQueryArgs";

export type RegistryCreateLenderModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated?: (lenderId: string) => void;
};

export function RegistryCreateLenderModal({
  open,
  onClose,
  onCreated,
}: RegistryCreateLenderModalProps) {
  const upsert = useMutation(api.lenders.upsert);
  const orgScope = useOrgConvexQueryArgs();

  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCompany("");
    setEmail("");
    setPhone("");
    setError(null);
    setSubmitting(false);
  }, [open]);

  async function handleCreate() {
    const name = company.trim();
    if (!name) {
      setError("Company name is required.");
      return;
    }
    if (!orgScope) {
      setError("Sign in and select a workspace.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const draft = blankLender();
      const entityType = classifyEntity(name, draft.primaryNiche, draft.notes);
      const result = await upsert({
        ...draft,
        ...orgScope,
        company: name,
        email: email.trim(),
        phone: phone.trim(),
        entityType,
      });
      onCreated?.(String(result.id));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create lender.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <OverlayShell
      open
      onClose={onClose}
      layer="MODAL"
      align="bottom-sheet"
      wrapPanel={false}
      data-testid="registry-create-lender-modal"
    >
      <div className="relative w-full max-w-lg rounded-xl border border-border bg-dlc-surface-high p-5 shadow-dlc-3">
        <div className="mb-4 flex items-start justify-between gap-2">
          <div className="flex items-start gap-3">
            <Landmark className="mt-0.5 h-6 w-6 shrink-0 text-primary" aria-hidden />
            <div>
              <h2 className="text-lg font-semibold">Add Lender</h2>
              <p className="mt-1 text-dlc-body-sm text-muted-foreground">
                Create a lender record in the global registry.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close dialog">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="registry-lender-company">Company</Label>
            <Input
              id="registry-lender-company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Lender / firm name"
              disabled={submitting}
            />
          </div>
          <div>
            <Label htmlFor="registry-lender-email">Email</Label>
            <Input
              id="registry-lender-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div>
            <Label htmlFor="registry-lender-phone">Phone</Label>
            <Input
              id="registry-lender-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={submitting}
            />
          </div>
        </div>

        {error ? (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={submitting || !company.trim()}
            onClick={() => void handleCreate()}
            data-testid="registry-create-lender-submit"
          >
            {submitting ? "Creating…" : "Create lender"}
          </Button>
        </div>
      </div>
    </OverlayShell>
  );
}
