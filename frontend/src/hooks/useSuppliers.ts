import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supplierService } from '@/lib/services/supplierService';
import type {
  Supplier,
  CreateSupplierPayload,
  UpdateSupplierPayload,
  SupplierListParams,
} from '@/types/supplier';
import type { PaginatedResponse } from '@/types/api';

/**
 * Query keys for supplier-related queries
 */
export const supplierKeys = {
  all: ['suppliers'] as const,
  lists: () => [...supplierKeys.all, 'list'] as const,
  list: (params: SupplierListParams) => [...supplierKeys.lists(), params] as const,
  active: () => [...supplierKeys.all, 'active'] as const,
  details: () => [...supplierKeys.all, 'detail'] as const,
  detail: (id: string) => [...supplierKeys.details(), id] as const,
};

// ============ Supplier Queries ============

/**
 * Hook to fetch supplier list with filters
 */
export function useSuppliers(params: SupplierListParams = {}) {
  return useQuery<PaginatedResponse<Supplier>, Error>({
    queryKey: supplierKeys.list(params),
    queryFn: () => supplierService.getAll(params),
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook to fetch active suppliers (for dropdowns)
 */
export function useActiveSuppliers() {
  return useQuery<Supplier[], Error>({
    queryKey: supplierKeys.active(),
    queryFn: () => supplierService.getActive(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch a single supplier by ID
 */
export function useSupplier(id: string | undefined) {
  return useQuery<Supplier, Error>({
    queryKey: supplierKeys.detail(id ?? ''),
    queryFn: () => supplierService.getById(id!),
    enabled: !!id,
    staleTime: 60 * 1000,
  });
}

// ============ Supplier Mutations ============

/**
 * Hook to create a new supplier
 */
export function useCreateSupplier() {
  const queryClient = useQueryClient();

  return useMutation<Supplier, Error, CreateSupplierPayload>({
    mutationFn: (payload) => supplierService.create(payload),
    onSuccess: () => {
      // Invalidate supplier lists
      queryClient.invalidateQueries({ queryKey: supplierKeys.lists() });
      queryClient.invalidateQueries({ queryKey: supplierKeys.active() });
    },
  });
}

/**
 * Hook to update a supplier
 */
export function useUpdateSupplier() {
  const queryClient = useQueryClient();

  return useMutation<Supplier, Error, { id: string; payload: UpdateSupplierPayload }>({
    mutationFn: ({ id, payload }) => supplierService.update(id, payload),
    onSuccess: (updatedSupplier) => {
      // Invalidate specific supplier and lists
      queryClient.invalidateQueries({ queryKey: supplierKeys.detail(updatedSupplier._id) });
      queryClient.invalidateQueries({ queryKey: supplierKeys.lists() });
      queryClient.invalidateQueries({ queryKey: supplierKeys.active() });
    },
  });
}

/**
 * Hook to deactivate a supplier
 */
export function useDeactivateSupplier() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => supplierService.deactivate(id),
    onSuccess: (_, id) => {
      // Invalidate specific supplier and lists
      queryClient.invalidateQueries({ queryKey: supplierKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: supplierKeys.lists() });
      queryClient.invalidateQueries({ queryKey: supplierKeys.active() });
    },
  });
}
