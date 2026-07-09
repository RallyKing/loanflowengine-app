"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { NewFileDrawerTemplateBlocksEditor } from "@/components/NewFileDrawerTemplateBlocksEditor";
import {
  ALL_PIPELINE_BLOCK_IDS,
  getMandatoryPipelineBlockIds,
  PIPELINE_BLOCKS,
  type PipelineBlockId,
} from "@/lib/pipelineBlockRegistry";
import { getEffectiveMandatoryPipelineBlockIds } from "@/lib/pipelineGlobalBlockPolicy";
import { mergeBlockSettingsWithSchemaDefaults } from "@/lib/pipelineBlockSettingsSchema";
import { DEFAULT_PIPELINE_DRAWER_ORDER } from "@/lib/pipelineDrawerLayoutStorage";
import {
  buildInitialIncludedOrderForEditor,
  cloneBlockSettings,
} from "@/lib/newFileDrawerTemplateEditorState";
import { coerceUserDrawerPreferenceLists } from "@/lib/userPreferencesNewFileDrawer";
import type { UserPreferencesV1 } from "@/lib/userPreferencesModel";
import type { UserPreferencesContextValue } from "@/lib/userPreferencesContext";

function layoutsEqual(a: PipelineBlockId[], b: readonly PipelineBlockId[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function sanitizePersistedSettings(
  draft: UserPreferencesV1["newFileDrawerSettings"],
  included: PipelineBlockId[],
): UserPreferencesV1["newFileDrawerSettings"] {
  const allow = new Set(included);
  const out: UserPreferencesV1["newFileDrawerSettings"] = {};
  for (const [k, v] of Object.entries(draft)) {
    if (!allow.has(k as PipelineBlockId)) continue;
    if (!v || typeof v !== "object" || Array.isArray(v)) continue;
    const block = PIPELINE_BLOCKS.find((b) => b.blockId === k);
    const merged = mergeBlockSettingsWithSchemaDefaults(
      block?.settingsSchema ?? null,
      v,
    );
    if (Object.keys(merged).length > 0) {
      out[k as PipelineBlockId] = merged;
    }
  }
  return out;
}

function hasPersonalNewFileTemplate(prefs: UserPreferencesV1): boolean {
  return (
    prefs.defaultBlocks.length > 0 ||
    prefs.blockOrder.length > 0 ||
    Object.keys(prefs.newFileDrawerSettings).length > 0
  );
}

type Props = {
  preferences: UserPreferencesV1;
  ready: boolean;
  canSync: boolean;
  updatePreferences: UserPreferencesContextValue["updatePreferences"];
};

export function PersonalNewFileTemplateSection({
  preferences,
  ready,
  canSync,
  updatePreferences,
}: Props) {
  const resolved = useQuery(api.pipelineGlobalBlockConfig.getResolved, {});
  const nonHideable = useMemo(() => {
    if (resolved === undefined) {
      return new Set(getEffectiveMandatoryPipelineBlockIds(undefined));
    }
    return new Set(
      getEffectiveMandatoryPipelineBlockIds(resolved.adminRequiredBlockIds),
    );
  }, [resolved]);
  const registryMandatory = useMemo(
    () => new Set(getMandatoryPipelineBlockIds()),
    [],
  );

  const [includedOrder, setIncludedOrder] = useState<PipelineBlockId[]>(() =>
    buildInitialIncludedOrderForEditor(
      preferences,
      new Set(getEffectiveMandatoryPipelineBlockIds(undefined)),
    ),
  );
  const [blockSettings, setBlockSettings] = useState<
    UserPreferencesV1["newFileDrawerSettings"]
  >(() => cloneBlockSettings(preferences.newFileDrawerSettings));

  const prefsSnap = useMemo(
    () =>
      JSON.stringify({
        b: preferences.defaultBlocks,
        o: preferences.blockOrder,
        s: preferences.newFileDrawerSettings,
      }),
    [preferences],
  );

  useEffect(() => {
    if (!ready || !canSync) return;
    setIncludedOrder(buildInitialIncludedOrderForEditor(preferences, nonHideable));
    setBlockSettings(cloneBlockSettings(preferences.newFileDrawerSettings));
  }, [ready, canSync, prefsSnap, preferences, nonHideable]);

  const save = useCallback(async () => {
    if (!canSync || !ready) return;
    const fullSet = new Set(DEFAULT_PIPELINE_DRAWER_ORDER);
    const includedSet = new Set(includedOrder);
    const sameMemberSet =
      includedSet.size === fullSet.size &&
      DEFAULT_PIPELINE_DRAWER_ORDER.every((id) => includedSet.has(id));

    const settingsOut = sanitizePersistedSettings(blockSettings, includedOrder);
    const effectiveMandatory = [...nonHideable];

    if (sameMemberSet) {
      const orderChanged = !layoutsEqual(
        includedOrder,
        DEFAULT_PIPELINE_DRAWER_ORDER,
      );
      const lists = coerceUserDrawerPreferenceLists(effectiveMandatory, {
        defaultBlocks: [],
        blockOrder: orderChanged ? [...includedOrder] : [],
      });
      await updatePreferences({
        defaultBlocks: lists.defaultBlocks,
        blockOrder: lists.blockOrder,
        newFileDrawerSettings: settingsOut,
      });
    } else {
      const lists = coerceUserDrawerPreferenceLists(effectiveMandatory, {
        defaultBlocks: [...includedOrder],
        blockOrder: [...includedOrder],
      });
      await updatePreferences({
        defaultBlocks: lists.defaultBlocks,
        blockOrder: lists.blockOrder,
        newFileDrawerSettings: settingsOut,
      });
    }
  }, [
    blockSettings,
    canSync,
    includedOrder,
    nonHideable,
    ready,
    updatePreferences,
  ]);

  const clearTemplate = useCallback(async () => {
    if (!canSync || !ready) return;
    await updatePreferences({
      defaultBlocks: [],
      blockOrder: [],
      newFileDrawerSettings: {},
    });
  }, [canSync, ready, updatePreferences]);

  const configured = hasPersonalNewFileTemplate(preferences);

  return (
    <div className="max-w-xl space-y-3 border-t border-border/60 pt-4">
      <p className="text-sm font-medium text-foreground">
        Personal default — new pipeline files
      </p>
      <p className="text-xs text-muted-foreground">
        Choose which drawer blocks appear, their order, and defaults for
        configurable blocks. Blocks marked required (product or workspace policy)
        always stay included and cannot be removed. Your choices apply on top of
        the workspace new-file baseline, only for{" "}
        <span className="font-medium text-foreground">new files you create</span>{" "}
        on this account.
      </p>

      {!canSync || !ready ? (
        <p className="text-xs text-muted-foreground" role="status">
          {!canSync
            ? "Account id unavailable — preferences are not synced."
            : "Waiting for account preferences…"}
        </p>
      ) : (
        <>
          <NewFileDrawerTemplateBlocksEditor
            includedOrder={includedOrder}
            setIncludedOrder={setIncludedOrder}
            blockSettings={blockSettings}
            setBlockSettings={setBlockSettings}
            nonHideable={nonHideable}
            registryMandatory={registryMandatory}
          />

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void save()}>
              Save personal default template
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!configured}
              onClick={() => void clearTemplate()}
            >
              Clear personal template
            </Button>
          </div>
          <p className="text-xs text-muted-foreground" role="status">
            {configured
              ? "A personal template is saved for this account."
              : "No personal template — new files follow your workspace baseline only."}
          </p>
        </>
      )}
    </div>
  );
}
