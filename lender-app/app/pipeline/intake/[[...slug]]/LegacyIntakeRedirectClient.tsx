"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { dealLibraryHref } from "@/lib/intake/routes";
import { pipelineDealEditorHref, pipelineDealPrintHref } from "@/lib/pipeline/routes";
import { useUserPreferences } from "@/lib/userPreferencesContext";

/**
 * Old URLs under `/pipeline/intake/...` redirect into the Files workspace.
 */
export function LegacyIntakeRedirectClient({ slug }: { slug: string[] }) {
  const router = useRouter();
  const { accountId: preferencesAccountId } = useUserPreferences();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);
  const createFile = useMutation(api.pipeline.createFileFromIntakeSheet);

  useEffect(() => {
    if (slug.length === 0) {
      router.replace(dealLibraryHref());
      return;
    }
    if (slug[0] === "tools") {
      router.replace(
        slug[1] === "state-licenses"
          ? "/pipeline/licenses"
          : dealLibraryHref()
      );
    }
  }, [slug, router]);

  const isTools = slug[0] === "tools";
  const intakeId =
    !isTools && slug[0] ? (slug[0] as Id<"intakeSheets">) : undefined;
  const isPrint = slug[1] === "print";

  const linkedFileId = useQuery(
    api.pipeline.getIdForIntakeSheet,
    intakeId ? { intakeSheetId: intakeId } : "skip"
  );

  useEffect(() => {
    if (slug.length === 0 || isTools) return;
    if (!intakeId) {
      router.replace(dealLibraryHref());
      return;
    }
    if (ran.current) return;
    if (linkedFileId === undefined) return;

    const go = async () => {
      ran.current = true;
      try {
        let fileId = linkedFileId;
        if (fileId == null) {
          const { id } = await createFile({
            intakeSheetId: intakeId,
            preferencesAccountId: preferencesAccountId || undefined,
            allowLegacyHierarchyBypass: true,
          });
          fileId = id;
        }
        if (isPrint) {
          router.replace(pipelineDealPrintHref(fileId));
        } else {
          router.replace(pipelineDealEditorHref(fileId));
        }
      } catch (e) {
        ran.current = false;
        setError(e instanceof Error ? e.message : "Redirect failed.");
      }
    };

    void go();
  }, [
    slug.length,
    isTools,
    intakeId,
    isPrint,
    linkedFileId,
    createFile,
    router,
    preferencesAccountId,
  ]);

  if (slug.length === 0 || isTools) {
    return (
      <div className="flex min-h-[30dvh] items-center justify-center text-sm text-muted-foreground">
        Redirecting…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-6 py-12 text-sm text-destructive">
        {error}{" "}
        <button
          type="button"
          className="mt-2 block font-medium text-primary underline"
          onClick={() => router.replace(dealLibraryHref())}
        >
          Open pipeline
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[40dvh] flex-col items-center justify-center gap-3 px-6 py-12">
      <span
        className="inline-block h-7 w-7 shrink-0 rounded-full border-2 border-muted-foreground/20 border-t-primary motion-safe:animate-spin"
        aria-hidden
      />
      <p className="text-sm text-muted-foreground" role="status">
        Moving this deal into the file workspace…
      </p>
    </div>
  );
}
