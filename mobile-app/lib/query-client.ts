import { QueryClient } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PersistQueryClientProviderProps } from "@tanstack/react-query-persist-client";

/** One central client for the whole app. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5m
      gcTime: 30 * 60 * 1000, // 30m
      retry: 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    // Side effects must never auto-replay.
    mutations: { retry: 0 },
  },
});

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "talyer-e-query-cache",
});

export const persistOptions: PersistQueryClientProviderProps["persistOptions"] = {
  persister,
  maxAge: Infinity,
  // Bump when the persisted shape breaks — old blobs are then dropped, not merged.
  buster: "v1",
  dehydrateOptions: {
    // Whitelist: nothing persists until a query family opts in here.
    shouldDehydrateQuery: () => false,
  },
};

/**
 * Run on every auth boundary (login and logout). Clears in-memory queries and
 * purges the on-disk cache so a restored session never belongs to the previous
 * account. Tear down sockets / bump a session epoch here as those land.
 */
export async function resetSessionCaches(): Promise<void> {
  queryClient.clear();
  await persister.removeClient();
}
