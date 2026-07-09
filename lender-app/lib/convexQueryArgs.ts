/**
 * Stable object identities for Convex `useQuery` / `useMutation` with no
 * (or fixed) server args, so the React client does not treat args as
 * new every render.
 */
export const emptyQueryArgs: Record<string, never> = {};

export const discoveryRecentRunsArgs = { limit: 8 } as const;
