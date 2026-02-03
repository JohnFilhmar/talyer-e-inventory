import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { branchService } from '@/lib/services/branchService';
import { userService } from '@/lib/services/userService';
import type {
  Branch,
  BranchStats,
  BranchListParams,
  CreateBranchPayload,
  UpdateBranchPayload,
  ManagerListResponse,
} from '@/types/branch';
import type { PaginatedResponse } from '@/types/api';

/**
 * Query keys for branch-related queries
 */
export const branchKeys = {
  all: ['branches'] as const,
  lists: () => [...branchKeys.all, 'list'] as const,
  list: (params: BranchListParams) => [...branchKeys.lists(), params] as const,
  details: () => [...branchKeys.all, 'detail'] as const,
  detail: (id: string) => [...branchKeys.details(), id] as const,
  stats: (id: string) => [...branchKeys.all, 'stats', id] as const,
};

/**
 * Query keys for user-related queries
 */
export const userKeys = {
  all: ['users'] as const,
  managers: () => [...userKeys.all, 'managers'] as const,
};

/**
 * Hook to fetch paginated branch list with filters
 */
export function useBranches(params: BranchListParams = {}) {
  return useQuery<PaginatedResponse<Branch>, Error>({
    queryKey: branchKeys.list(params),
    queryFn: () => branchService.getAll(params),
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to fetch a single branch by ID
 */
export function useBranch(id: string | undefined) {
  return useQuery<Branch, Error>({
    queryKey: branchKeys.detail(id ?? ''),
    queryFn: () => branchService.getById(id!),
    enabled: !!id,
    staleTime: 30 * 1000,
  });
}

/**
 * Hook to fetch branch statistics
 */
export function useBranchStats(id: string | undefined, enabled = true) {
  return useQuery<BranchStats, Error>({
    queryKey: branchKeys.stats(id ?? ''),
    queryFn: () => branchService.getStats(id!),
    enabled: !!id && enabled,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook to fetch managers (admin/salesperson users) for branch form dropdown
 */
export function useManagers() {
  return useQuery<ManagerListResponse, Error>({
    queryKey: userKeys.managers(),
    queryFn: () => userService.getManagers(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to create a new branch
 */
export function useCreateBranch() {
  const queryClient = useQueryClient();

  return useMutation<Branch, Error, CreateBranchPayload>({
    mutationFn: (payload) => branchService.create(payload),
    onSuccess: () => {
      // Invalidate branch list queries to refetch
      queryClient.invalidateQueries({ queryKey: branchKeys.lists() });
    },
  });
}

/**
 * Hook to update an existing branch
 */
export function useUpdateBranch() {
  const queryClient = useQueryClient();

  return useMutation<Branch, Error, { id: string; payload: UpdateBranchPayload }>({
    mutationFn: ({ id, payload }) => branchService.update(id, payload),
    onSuccess: (data) => {
      // Invalidate and refetch the specific branch
      queryClient.invalidateQueries({ queryKey: branchKeys.detail(data._id) });
      // Invalidate branch list
      queryClient.invalidateQueries({ queryKey: branchKeys.lists() });
    },
  });
}

/**
 * Hook to deactivate a branch
 */
export function useDeactivateBranch() {
  const queryClient = useQueryClient();

  return useMutation<{ id: string; name: string; isActive: boolean }, Error, string>({
    mutationFn: (id) => branchService.deactivate(id),
    onSuccess: (data) => {
      // Invalidate and refetch the specific branch
      queryClient.invalidateQueries({ queryKey: branchKeys.detail(data.id) });
      // Invalidate branch list
      queryClient.invalidateQueries({ queryKey: branchKeys.lists() });
    },
  });
}

/**
 * Hook to activate a branch
 */
export function useActivateBranch() {
  const queryClient = useQueryClient();

  return useMutation<Branch, Error, string>({
    mutationFn: (id) => branchService.activate(id),
    onSuccess: (data) => {
      // Invalidate and refetch the specific branch
      queryClient.invalidateQueries({ queryKey: branchKeys.detail(data._id) });
      // Invalidate branch list
      queryClient.invalidateQueries({ queryKey: branchKeys.lists() });
    },
  });
}
