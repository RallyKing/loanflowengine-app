import {
  normalizePipelineDrawerLayout,
  type PipelineDrawerLayoutV1,
} from "@/lib/pipelineDrawerLayoutStorage";

/** Stable key for fields that must not trigger Convex writes on expand/collapse alone. */
export function drawerLayoutConvexPersistKey(
  layout: PipelineDrawerLayoutV1 | unknown,
): string {
  const n = normalizePipelineDrawerLayout(layout);
  return JSON.stringify({
    order: n.order,
    hidden: n.hidden,
    settings: n.settings ?? {},
  });
}

export function drawerLayoutConvexPersistEquals(
  a: PipelineDrawerLayoutV1 | unknown,
  b: PipelineDrawerLayoutV1 | unknown,
): boolean {
  return drawerLayoutConvexPersistKey(a) === drawerLayoutConvexPersistKey(b);
}
