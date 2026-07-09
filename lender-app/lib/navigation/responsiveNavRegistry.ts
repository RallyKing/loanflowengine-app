import type { NavCatalogEntry } from "./navigationCatalog";
import type {
  NavQuickAction,
  OrgNavPolicy,
  ResolvedNavigationConfig,
} from "./navigationResolve";
import {
  resolveQuickActions,
  resolveVisibleNavItems,
} from "./navigationResolve";

export type ResponsiveNavRegistryInput = {
  config: ResolvedNavigationConfig;
  grantedPermissions: readonly string[] | null | undefined;
  orgPolicy: OrgNavPolicy | null;
  recency: ReadonlyMap<string, number> | null;
  /** Reserved for org plan / feature gating — same shape as future filters. */
  disabledCatalogIds?: ReadonlySet<string>;
};

/**
 * Single merge point: permissions, org policy, recency, responsive prefs.
 * Shells should consume `primaryNav` + `quickActions` from here or via
 * NavigationConfigProvider (which mirrors this logic).
 */
export function buildResponsiveNavRegistry(input: ResponsiveNavRegistryInput): {
  primaryNav: NavCatalogEntry[];
  quickActions: NavQuickAction[];
} {
  const extraHidden = input.disabledCatalogIds ?? new Set();
  const basePolicy = input.orgPolicy ?? {
    enforcedVisibleIds: new Set<string>(),
    enforcedHiddenIds: new Set<string>(),
  };
  const orgPolicy: OrgNavPolicy = {
    enforcedVisibleIds: basePolicy.enforcedVisibleIds,
    enforcedHiddenIds: new Set([
      ...basePolicy.enforcedHiddenIds,
      ...extraHidden,
    ]),
  };

  const opt = {
    grantedPermissions: input.grantedPermissions,
    orgPolicy,
    recency: input.recency,
  };
  return {
    primaryNav: resolveVisibleNavItems(input.config, opt),
    quickActions: resolveQuickActions(input.config, opt),
  };
}
