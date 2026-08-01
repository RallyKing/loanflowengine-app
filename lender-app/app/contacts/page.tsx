"use client";

import { useState } from "react";
import { ConvexQueryBoundary } from "@/components/ConvexQueryBoundary";
import { Button } from "@/components/ui/Button";
import { ContactsWorkspaceClient } from "@/modules/contacts/workspace/ContactsWorkspaceClient";

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
              The contacts query failed. Check your connection or try again.
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
      <div className="flex min-h-0 w-full flex-1 flex-col">
        <ContactsWorkspaceClient />
      </div>
    </ConvexQueryBoundary>
  );
}
