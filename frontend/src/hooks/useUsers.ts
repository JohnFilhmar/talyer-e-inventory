import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userService } from '@/lib/services/userService';
import type {
  User,
  UserListParams,
  UserListResponse,
  CreateUserPayload,
  UpdateUserPayload,
  ChangePasswordPayload,
} from '@/types/user';

/**
 * Query keys for user-related queries
 */
export const userKeys = {
  all: ['users'] as const,
  lists: () => [...userKeys.all, 'list'] as const,
  list: (params: UserListParams) => [...userKeys.lists(), params] as const,
  details: () => [...userKeys.all, 'detail'] as const,
  detail: (id: string) => [...userKeys.details(), id] as const,
  managers: () => [...userKeys.all, 'managers'] as const,
};

/**
 * Hook to fetch paginated user list with filters
 */
export function useUsers(params: UserListParams = {}) {
  return useQuery<UserListResponse, Error>({
    queryKey: userKeys.list(params),
    queryFn: () => userService.getUsers(params),
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to fetch a single user by ID
 */
export function useUser(id: string | undefined) {
  return useQuery<User, Error>({
    queryKey: userKeys.detail(id ?? ''),
    queryFn: () => userService.getById(id!),
    enabled: !!id,
    staleTime: 30 * 1000,
  });
}

/**
 * Hook to create a new user
 */
export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation<User, Error, CreateUserPayload>({
    mutationFn: (payload) => userService.create(payload),
    onSuccess: () => {
      // Invalidate user list queries to refetch
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      // Also invalidate managers list in case new user can be a manager
      queryClient.invalidateQueries({ queryKey: userKeys.managers() });
    },
  });
}

/**
 * Hook to update an existing user
 */
export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation<User, Error, { id: string; payload: UpdateUserPayload }>({
    mutationFn: ({ id, payload }) => userService.update(id, payload),
    onSuccess: (data) => {
      // Invalidate and refetch the specific user
      queryClient.invalidateQueries({ queryKey: userKeys.detail(data._id) });
      // Invalidate user list
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      // Invalidate managers list in case role changed
      queryClient.invalidateQueries({ queryKey: userKeys.managers() });
    },
  });
}

/**
 * Hook to deactivate a user
 */
export function useDeactivateUser() {
  const queryClient = useQueryClient();

  return useMutation<User, Error, string>({
    mutationFn: (id) => userService.deactivate(id),
    onSuccess: (data) => {
      // Invalidate and refetch the specific user
      queryClient.invalidateQueries({ queryKey: userKeys.detail(data._id) });
      // Invalidate user list
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      // Invalidate managers since deactivated users shouldn't be managers
      queryClient.invalidateQueries({ queryKey: userKeys.managers() });
    },
  });
}

/**
 * Hook to activate a user
 */
export function useActivateUser() {
  const queryClient = useQueryClient();

  return useMutation<User, Error, string>({
    mutationFn: (id) => userService.activate(id),
    onSuccess: (data) => {
      // Invalidate and refetch the specific user
      queryClient.invalidateQueries({ queryKey: userKeys.detail(data._id) });
      // Invalidate user list
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      // Invalidate managers since activated users might be managers
      queryClient.invalidateQueries({ queryKey: userKeys.managers() });
    },
  });
}

/**
 * Hook to change a user's password
 */
export function useChangeUserPassword() {
  return useMutation<{ message: string }, Error, { id: string; payload: ChangePasswordPayload }>({
    mutationFn: ({ id, payload }) => userService.changePassword(id, payload),
    // No cache invalidation needed for password change
  });
}
