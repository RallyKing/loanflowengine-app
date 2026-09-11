"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ConvexQueryBoundary } from "@/components/ConvexQueryBoundary";
import { Button } from "@/components/ui/Button";
import { OperationalSkeletonList } from "@/components/ui/OperationalSkeleton";
import { OperationalEmptyState } from "@/components/ui/OperationalEmptyState";
import { IndividualHubDetailPanel } from "@/components/contacts/IndividualHubDetailPanel";
import { EntityProfileModal } from "@/components/contacts/EntityProfileModal";
import { useUserPreferences } from "@/lib/userPreferencesContext";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { useLiveConnection } from "@/lib/useLiveConnection";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import { simpleDeleteConfirm, unlinkConfirm } from "@/lib/ui/confirmDestructive";
import {
  contactRoleIdsMutationPayload,
  normalizeContactRoles,
} from "@/lib/contact/contactRoles";
import {
  contactHubDraftFromDoc,
  contactMethodsMutationArgs,
  contactPiiMutationArgs,
  normalizeContactHubDraft,
} from "@/lib/contacts/contactHubDraft";
import type { ContactHubRecord } from "@/lib/contacts/contactWithPrimaryEntity";
import type { IndividualHubDraft } from "@/components/contacts/IndividualHubDetailPanel";

type ContactHubPageProps = {
  contactId: Id<"contacts">;
};

function ContactHubPageInner({ contactId }: ContactHubPageProps) {
  const router = useRouter();
  const { confirm } = useOperationalConfirm();
  const { accountId } = useUserPreferences();
  const { activeOrganizationId } = useOrgPermissions();
  const { canUseHub } = useLiveConnection();
  const memberKey = accountId.trim();

  const orgContactRoles = useQuery(
    api.organizationSettings.getContactRoles,
    activeOrganizationId && memberKey
      ? { organizationId: activeOrganizationId, memberUserKey: memberKey }
      : "skip",
  );

  const selectedDoc = useQuery(
    api.contacts.get,
    memberKey ? { id: contactId, memberUserKey: memberKey } : "skip",
  ) as ContactHubRecord | null | undefined;

  const contactRoles = useMemo(
    () => normalizeContactRoles(orgContactRoles ?? []),
    [orgContactRoles],
  );

  const [draft, setDraft] = useState<IndividualHubDraft>(() =>
    normalizeContactHubDraft(),
  );
  const [draftContactId, setDraftContactId] = useState<Id<"contacts"> | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [entityProfileModalId, setEntityProfileModalId] =
    useState<Id<"clients"> | null>(null);

  // Hydrate draft when the contact document first loads or the route id changes.
  // Do not clobber in-progress edits on every reactive selectedDoc reference.
  useEffect(() => {
    if (!selectedDoc) return;
    if (draftContactId === contactId) return;
    setDraft(contactHubDraftFromDoc(selectedDoc));
    setDraftContactId(contactId);
  }, [selectedDoc, contactId, draftContactId]);

  const update = useMutation(api.contacts.update);
  const remove = useMutation(api.contacts.remove);
  const removeLenderLink = useMutation(
    api.contactLenderLinks.removeByContactAndLender,
  );

  const patchDraft = useCallback((patch: Partial<IndividualHubDraft>) => {
    setDraft((current) => normalizeContactHubDraft({ ...current, ...patch }));
  }, []);

  const patchEmails = useCallback(
    (
      next:
        | IndividualHubDraft["emails"]
        | ((prev: IndividualHubDraft["emails"]) => IndividualHubDraft["emails"]),
    ) => {
      setDraft((current) =>
        normalizeContactHubDraft({
          ...current,
          emails: typeof next === "function" ? next(current.emails) : next,
        }),
      );
    },
    [],
  );

  const patchPhones = useCallback(
    (
      next:
        | IndividualHubDraft["phones"]
        | ((prev: IndividualHubDraft["phones"]) => IndividualHubDraft["phones"]),
    ) => {
      setDraft((current) =>
        normalizeContactHubDraft({
          ...current,
          phones: typeof next === "function" ? next(current.phones) : next,
        }),
      );
    },
    [],
  );

  const onSave = useCallback(async () => {
    const safe = normalizeContactHubDraft(draft);
    const name = safe.name.trim();
    if (!name || !memberKey) return;
    setSaving(true);
    setSaveError(null);
    try {
      const rolePayload = contactRoleIdsMutationPayload(safe.contactRoleIds);
      await update({
        id: contactId,
        name,
        ...contactMethodsMutationArgs(safe),
        notes: safe.notes,
        ...rolePayload,
        ...contactPiiMutationArgs(safe),
        memberUserKey: memberKey,
      });
      // Re-baseline from the just-saved draft (server will converge via query).
      setDraft(safe);
      setDraftContactId(contactId);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [contactId, draft, memberKey, update]);

  const onDelete = useCallback(async () => {
    const entityName = draft.name.trim() || "this contact";
    const ok = await confirm(
      simpleDeleteConfirm(entityName, {
        title: "Delete contact",
        impact: "This cannot be undone.",
      }),
    );
    if (!ok) return;
    setDeleting(true);
    try {
      await remove({ id: contactId, memberUserKey: memberKey });
      router.push("/contacts");
    } finally {
      setDeleting(false);
    }
  }, [confirm, contactId, draft.name, memberKey, remove, router]);

  const onRemoveLenderLink = useCallback(
    async (lenderId: Id<"lenders">) => {
      const ok = await confirm(
        unlinkConfirm(
          "this lender association",
          "The contact will no longer be linked to this lender. The lender record is not deleted.",
        ),
      );
      if (!ok) return;
      await removeLenderLink({
        contactId,
        lenderId,
        memberUserKey: memberKey,
      });
    },
    [confirm, contactId, memberKey, removeLenderLink],
  );

  const openEntityInHub = useCallback(
    (entityId: Id<"clients">) => {
      router.push(`/contacts/entity/${entityId}`);
    },
    [router],
  );

  if (!activeOrganizationId || !memberKey) {
    return (
      <OperationalEmptyState
        className="m-8"
        title="Organization required"
        description="Select an organization to view this contact."
      />
    );
  }

  if (selectedDoc === undefined) {
    return (
      <div className="p-8">
        <OperationalSkeletonList rows={6} />
      </div>
    );
  }

  if (selectedDoc === null) {
    return (
      <OperationalEmptyState
        className="m-8"
        title="Contact not found"
        description="This contact may have been removed or you may not have access."
      />
    );
  }

  return (
    <>
      <EntityProfileModal
        open={entityProfileModalId !== null}
        entityId={entityProfileModalId}
        organizationId={activeOrganizationId}
        memberUserKey={memberKey}
        onClose={() => setEntityProfileModalId(null)}
      />
      <div className="flex min-w-0 flex-col overflow-visible">
        <IndividualHubDetailPanel
        selectedId={contactId}
        selectedDoc={selectedDoc}
        organizationId={activeOrganizationId}
        memberUserKey={memberKey}
        contactRoles={contactRoles}
        editorDraft={draft}
        onPatchDraft={patchDraft}
        onPatchEmails={patchEmails}
        onPatchPhones={patchPhones}
        onOpenEntityProfile={setEntityProfileModalId}
        onOpenEntityInHub={openEntityInHub}
        saveError={saveError}
        saving={saving}
        deleting={deleting}
        onSave={onSave}
        onDelete={onDelete}
        onRemoveLenderLink={onRemoveLenderLink}
        canUseHub={canUseHub}
        layoutMode="commandCenter"
      />
      </div>
    </>
  );
}

export default function ContactHubPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [contactId, setContactId] = useState<Id<"contacts"> | null>(null);
  const [queryRecover, setQueryRecover] = useState(0);

  useEffect(() => {
    void params.then((p) => {
      setContactId(p.id as Id<"contacts">);
    });
  }, [params]);

  if (!contactId) {
    return (
      <div className="p-8">
        <OperationalSkeletonList rows={4} />
      </div>
    );
  }

  return (
    <ConvexQueryBoundary
      recoverOnKeys={[queryRecover, contactId]}
      fallback={
        <div className="space-y-4 p-8">
          <p className="font-medium text-destructive">Could not load contact hub</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => setQueryRecover((n) => n + 1)}
          >
            Retry
          </Button>
        </div>
      }
    >
      <ContactHubPageInner contactId={contactId} />
    </ConvexQueryBoundary>
  );
}
