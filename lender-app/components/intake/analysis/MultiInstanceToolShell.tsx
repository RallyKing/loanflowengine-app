"use client";

import { useCallback } from "react";
import type { AnalysisInstanceV1 } from "@/lib/intake/analysisInstances";
import { duplicateInstanceData } from "@/lib/intake/analysisInstances";
import { Button, Field, TextInput } from "../ui/Field";

type Props<T> = {
  singularLabel: string;
  instances: AnalysisInstanceV1<T>[];
  onInstancesChange: (next: AnalysisInstanceV1<T>[]) => void;
  createEmptyData: () => T;
  /** Tighter header when nested inside another shell (e.g. Analysis workspace). */
  embedChrome?: boolean;
  children: (
    instance: AnalysisInstanceV1<T>,
    replaceData: (data: T) => void
  ) => React.ReactNode;
};

export function MultiInstanceToolShell<T>({
  singularLabel,
  instances,
  onInstancesChange,
  createEmptyData,
  embedChrome = false,
  children,
}: Props<T>) {
  const patchAt = useCallback(
    (index: number, patch: Partial<AnalysisInstanceV1<T>>) => {
      const next = instances.map((row, i) =>
        i === index ? { ...row, ...patch } : row
      );
      onInstancesChange(next);
    },
    [instances, onInstancesChange]
  );

  const replaceDataAt = useCallback(
    (index: number, data: T) => {
      patchAt(index, { data });
    },
    [patchAt]
  );

  const add = useCallback(() => {
    const n = instances.length + 1;
    onInstancesChange([
      ...instances,
      {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `id-${Date.now()}`,
        name: `${singularLabel} ${n}`,
        data: createEmptyData(),
      },
    ]);
  }, [instances, onInstancesChange, createEmptyData, singularLabel]);

  const duplicate = useCallback(
    (index: number) => {
      const src = instances[index];
      if (!src) return;
      onInstancesChange([
        ...instances,
        {
          id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `id-${Date.now()}`,
          name: `${src.name} (copy)`,
          data: duplicateInstanceData(src.data),
        },
      ]);
    },
    [instances, onInstancesChange]
  );

  const remove = useCallback(
    (index: number) => {
      onInstancesChange(instances.filter((_, i) => i !== index));
    },
    [instances, onInstancesChange]
  );

  return (
    <div className="flex flex-col gap-6">
      <div
        className={
          embedChrome
            ? "flex justify-end border-b border-border pb-3"
            : "flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3"
        }
      >
        {!embedChrome ? (
          <p className="text-sm text-muted-foreground">
            Multiple independent {singularLabel.toLowerCase()}s on this file.
            Each keeps its own inputs and results.
          </p>
        ) : null}
        <Button type="button" variant="secondary" onClick={add}>
          + Add {singularLabel}
        </Button>
      </div>

      {instances.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          No {singularLabel.toLowerCase()}s yet. Use &quot;Add&quot; to create one.
        </div>
      ) : (
        instances.map((inst, index) => (
          <section
            key={inst.id}
            className="rounded-xl border border-border bg-background p-4 shadow-sm sm:p-5"
            aria-label={inst.name}
          >
            <div className="mb-4 flex flex-col gap-3 border-b border-border/80 pb-4 sm:flex-row sm:items-end sm:justify-between">
              <Field label="Name" className="min-w-0 flex-1 sm:max-w-md">
                <TextInput
                  value={inst.name}
                  onChange={(e) => patchAt(index, { name: e.target.value })}
                  aria-label={`${singularLabel} name`}
                />
              </Field>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="px-2.5 py-1.5 text-xs"
                  onClick={() => duplicate(index)}
                >
                  Duplicate
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="px-2.5 py-1.5 text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => remove(index)}
                >
                  Delete
                </Button>
              </div>
            </div>
            {children(inst, (data) => replaceDataAt(index, data))}
          </section>
        ))
      )}
    </div>
  );
}
