import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { categoryService } from '@/lib/services/categoryService';
import type {
  Category,
  CategoryListParams,
  CreateCategoryPayload,
  UpdateCategoryPayload,
} from '@/types/category';

/**
 * Query keys for category-related queries
 */
export const categoryKeys = {
  all: ['categories'] as const,
  lists: () => [...categoryKeys.all, 'list'] as const,
  list: (params: CategoryListParams) => [...categoryKeys.lists(), params] as const,
  roots: () => [...categoryKeys.all, 'roots'] as const,
  active: () => [...categoryKeys.all, 'active'] as const,
  details: () => [...categoryKeys.all, 'detail'] as const,
  detail: (id: string) => [...categoryKeys.details(), id] as const,
  children: (id: string) => [...categoryKeys.all, 'children', id] as const,
};

/**
 * Hook to fetch categories with optional filters
 */
export function useCategories(params: CategoryListParams = {}) {
  return useQuery<Category[], Error>({
    queryKey: categoryKeys.list(params),
    queryFn: () => categoryService.getAll(params),
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook to fetch root categories (for tree view)
 */
export function useRootCategories() {
  return useQuery<Category[], Error>({
    queryKey: categoryKeys.roots(),
    queryFn: () => categoryService.getRootCategories(),
    staleTime: 60 * 1000,
  });
}

/**
 * Hook to fetch all active categories (for dropdowns/selectors)
 */
export function useActiveCategories() {
  return useQuery<Category[], Error>({
    queryKey: categoryKeys.active(),
    queryFn: () => categoryService.getActiveCategories(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch a single category by ID
 */
export function useCategory(id: string | undefined) {
  return useQuery<Category, Error>({
    queryKey: categoryKeys.detail(id ?? ''),
    queryFn: () => categoryService.getById(id!),
    enabled: !!id,
    staleTime: 60 * 1000,
  });
}

/**
 * Hook to fetch children of a category
 */
export function useCategoryChildren(id: string | undefined) {
  return useQuery<Category[], Error>({
    queryKey: categoryKeys.children(id ?? ''),
    queryFn: () => categoryService.getChildren(id!),
    enabled: !!id,
    staleTime: 60 * 1000,
  });
}

/**
 * Hook to create a new category
 */
export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation<Category, Error, CreateCategoryPayload>({
    mutationFn: (payload) => categoryService.create(payload),
    onSuccess: (newCategory) => {
      // Invalidate all category lists
      queryClient.invalidateQueries({ queryKey: categoryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: categoryKeys.roots() });
      queryClient.invalidateQueries({ queryKey: categoryKeys.active() });

      // If this category has a parent, invalidate its children list
      if (newCategory.parent) {
        const parentId = typeof newCategory.parent === 'string' 
          ? newCategory.parent 
          : newCategory.parent._id;
        queryClient.invalidateQueries({ queryKey: categoryKeys.children(parentId) });
        queryClient.invalidateQueries({ queryKey: categoryKeys.detail(parentId) });
      }
    },
  });
}

/**
 * Hook to update an existing category
 */
export function useUpdateCategory() {
  const queryClient = useQueryClient();

  return useMutation<Category, Error, { id: string; payload: UpdateCategoryPayload }>({
    mutationFn: ({ id, payload }) => categoryService.update(id, payload),
    onSuccess: (updatedCategory) => {
      // Invalidate the specific category
      queryClient.invalidateQueries({ queryKey: categoryKeys.detail(updatedCategory._id) });
      // Invalidate all lists
      queryClient.invalidateQueries({ queryKey: categoryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: categoryKeys.roots() });
      queryClient.invalidateQueries({ queryKey: categoryKeys.active() });

      // If parent changed, invalidate related children
      if (updatedCategory.parent) {
        const parentId = typeof updatedCategory.parent === 'string' 
          ? updatedCategory.parent 
          : updatedCategory.parent._id;
        queryClient.invalidateQueries({ queryKey: categoryKeys.children(parentId) });
      }
    },
  });
}

/**
 * Hook to delete a category
 */
export function useDeleteCategory() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id: string; parentId?: string }>({
    mutationFn: ({ id }) => categoryService.delete(id),
    onSuccess: (_, { id, parentId }) => {
      // Invalidate the deleted category
      queryClient.invalidateQueries({ queryKey: categoryKeys.detail(id) });
      // Invalidate all lists
      queryClient.invalidateQueries({ queryKey: categoryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: categoryKeys.roots() });
      queryClient.invalidateQueries({ queryKey: categoryKeys.active() });

      // If this category had a parent, invalidate its children list
      if (parentId) {
        queryClient.invalidateQueries({ queryKey: categoryKeys.children(parentId) });
      }
    },
  });
}

/**
 * Hook to get flattened category tree (for select dropdowns with indentation)
 */
export function useFlattenedCategories() {
  const { data: categories, ...rest } = useRootCategories();

  const flattenedData = categories 
    ? categoryService.flattenTree(categories) 
    : [];

  return {
    data: flattenedData,
    ...rest,
  };
}
