import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motorcycleModelService } from '@/lib/services/motorcycleModelService';
import { withOfflineList } from '@/lib/offline/offlineQuery';
import { productKeys } from '@/hooks/useProducts';
import type {
  MotorcycleModel,
  MotorcycleModelListParams,
  CreateMotorcycleModelPayload,
  UpdateMotorcycleModelPayload,
} from '@/types/motorcycleModel';

/**
 * Query keys for motorcycle-model-related queries
 */
export const motorcycleModelKeys = {
  all: ['motorcycleModels'] as const,
  lists: () => [...motorcycleModelKeys.all, 'list'] as const,
  list: (params: MotorcycleModelListParams) =>
    [...motorcycleModelKeys.lists(), params] as const,
  active: () => [...motorcycleModelKeys.all, 'active'] as const,
  makes: (activeOnly: boolean) =>
    [...motorcycleModelKeys.all, 'makes', activeOnly] as const,
  details: () => [...motorcycleModelKeys.all, 'detail'] as const,
  detail: (id: string) => [...motorcycleModelKeys.details(), id] as const,
};

/**
 * Every mutation invalidates the product keys too: a product read embeds its
 * populated motorcycle models, so a renamed or deactivated model leaves the
 * cached product lists rendering a stale fitment chip.
 */
function invalidateAll(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: motorcycleModelKeys.all });
  queryClient.invalidateQueries({ queryKey: productKeys.all });
}

/**
 * Hook to fetch motorcycle models with optional filters
 */
export function useMotorcycleModels(params: MotorcycleModelListParams = {}) {
  return useQuery<MotorcycleModel[], Error>({
    queryKey: motorcycleModelKeys.list(params),
    queryFn: () =>
      withOfflineList('motorcycleModels', () => motorcycleModelService.getAll(params)),
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook to fetch all active motorcycle models (for pickers and filters)
 */
export function useActiveMotorcycleModels() {
  return useQuery<MotorcycleModel[], Error>({
    queryKey: motorcycleModelKeys.active(),
    queryFn: () =>
      withOfflineList('motorcycleModels', () => motorcycleModelService.getActive()),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch the distinct list of makes
 */
export function useMotorcycleMakes(activeOnly = false) {
  return useQuery<string[], Error>({
    queryKey: motorcycleModelKeys.makes(activeOnly),
    queryFn: () => motorcycleModelService.getMakes(activeOnly),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch a single motorcycle model by ID
 */
export function useMotorcycleModel(id: string | undefined) {
  return useQuery<MotorcycleModel, Error>({
    queryKey: motorcycleModelKeys.detail(id ?? ''),
    queryFn: () => motorcycleModelService.getById(id!),
    enabled: !!id,
    staleTime: 60 * 1000,
  });
}

/**
 * Hook to create a new motorcycle model
 */
export function useCreateMotorcycleModel() {
  const queryClient = useQueryClient();

  return useMutation<MotorcycleModel, Error, CreateMotorcycleModelPayload>({
    mutationFn: (payload) => motorcycleModelService.create(payload),
    onSuccess: () => invalidateAll(queryClient),
  });
}

/**
 * Hook to update an existing motorcycle model
 */
export function useUpdateMotorcycleModel() {
  const queryClient = useQueryClient();

  return useMutation<
    MotorcycleModel,
    Error,
    { id: string; payload: UpdateMotorcycleModelPayload }
  >({
    mutationFn: ({ id, payload }) => motorcycleModelService.update(id, payload),
    onSuccess: () => invalidateAll(queryClient),
  });
}

/**
 * Hook to deactivate a motorcycle model
 */
export function useDeleteMotorcycleModel() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => motorcycleModelService.delete(id),
    onSuccess: () => invalidateAll(queryClient),
  });
}

/**
 * Hook to restore an archived motorcycle model
 */
export function useRestoreMotorcycleModel() {
  const queryClient = useQueryClient();

  return useMutation<MotorcycleModel, Error, string>({
    mutationFn: (id) => motorcycleModelService.restore(id),
    // Products embed populated fitment, so a restored model changes what a
    // product read renders — invalidateAll covers both domains.
    onSuccess: () => invalidateAll(queryClient),
  });
}

/**
 * Motorcycle models grouped by make, each group's models sorted for display.
 *
 * Both the picker and the filter render an `<optgroup>` per make — a shop with
 * 200 fitments is unusable as one flat list — so the grouping is derived once
 * here rather than in each component.
 */
export function groupByMake<T extends { make: string }>(
  motorcycleModels: T[]
): Array<{ make: string; models: T[] }> {
  const groups = new Map<string, T[]>();

  for (const motorcycleModel of motorcycleModels) {
    const existing = groups.get(motorcycleModel.make);
    if (existing) {
      existing.push(motorcycleModel);
    } else {
      groups.set(motorcycleModel.make, [motorcycleModel]);
    }
  }

  return [...groups.entries()]
    .map(([make, models]) => ({ make, models }))
    .sort((a, b) => a.make.localeCompare(b.make));
}
