"use client";

import { useOrgConvexQueryArgs } from "@/lib/useOrgConvexQueryArgs";
import { TaskTemplateManager } from "@/components/library/TaskTemplateManager";
import { useState } from "react";

/** Settings workspace embed — reuses the same manager shell inline. */
export function TaskTemplateManagerPage() {
  const orgScope = useOrgConvexQueryArgs();
  const [err, setErr] = useState<string | null>(null);

  if (!orgScope) {
    return (
      <p className="text-sm text-muted-foreground">
        Sign in and select an organization to manage templates.
      </p>
    );
  }

  return (
    <div>
      {err ? (
        <p className="mb-3 text-sm text-destructive" role="alert">
          {err}
        </p>
      ) : null}
      <TaskTemplateManager
        open
        embedded
        onClose={() => {}}
        organizationId={orgScope.organizationId}
        memberUserKey={orgScope.memberUserKey}
        onError={setErr}
      />
    </div>
  );
}
