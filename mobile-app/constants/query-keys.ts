/**
 * Hierarchical query-key factory — the single place keys are minted, so a
 * mutation can invalidate through the same object instead of an inline array.
 *
 * Shape to follow as domains land (user-scoped queries embed the userId):
 *
 *   export const queryKeys = {
 *     auth:     { all: ["auth"] as const, user: () => ["auth", "user"] as const },
 *     products: {
 *       all:    ["products"] as const,
 *       list:   (f?: object) => ["products", "list", f] as const,
 *       detail: (id: string) => ["products", "detail", id] as const,
 *     },
 *   } as const;
 */
export const queryKeys = {} as const;
