/**
 * JSON Schema–shaped **descriptor** for a block’s persisted `settings` bag.
 * Only a small subset is interpreted today (`type`, `properties.*.default`);
 * extras are ignored until validation/UI land.
 */
export type PipelineBlockSettingsSchema = Readonly<Record<string, unknown>>;

/**
 * Merges `stored` with `default` values declared under `properties.*.default`
 * for `type: "object"` schemas. Unknown keys in `stored` are preserved unless
 * `additionalProperties` is explicitly `false` (then unknown keys are dropped).
 */
export function mergeBlockSettingsWithSchemaDefaults(
  schema: PipelineBlockSettingsSchema | null,
  stored: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  if (!schema || schema.type !== "object") {
    return { ...stored };
  }
  const props = schema.properties;
  if (!props || typeof props !== "object" || Array.isArray(props)) {
    return { ...stored };
  }
  const propRec = props as Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  const out: Record<string, unknown> = { ...stored };
  for (const [key, def] of Object.entries(propRec)) {
    if (out[key] !== undefined) continue;
    if (def && typeof def === "object" && "default" in def) {
      out[key] = def.default;
    }
  }
  if (schema.additionalProperties === false) {
    const allowed = new Set(Object.keys(propRec));
    for (const k of Object.keys(out)) {
      if (!allowed.has(k)) delete out[k];
    }
  }
  return out;
}
