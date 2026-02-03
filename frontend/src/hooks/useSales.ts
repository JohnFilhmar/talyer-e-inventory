import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { salesService } from '@/lib/services/salesService';
import type {
  SalesOrder,
  SalesStats,
  CreateSalesOrderPayload,
  UpdateOrderStatusPayload,
  UpdatePaymentPayload,
  SalesOrderListParams,
} from '@/types/sales';
import type { PaginatedResponse } from '@/types/api';

/**
 * Query keys for sales-related queries
 */
export const salesKeys = {
  all: ['sales'] as const,
  lists: () => [...salesKeys.all, 'list'] as const,
  list: (params: SalesOrderListParams) => [...salesKeys.lists(), params] as const,
  byBranch: (branchId: string, params?: Omit<SalesOrderListParams, 'branch'>) =>
    [...salesKeys.all, 'branch', branchId, params] as const,
  details: () => [...salesKeys.all, 'detail'] as const,
  detail: (id: string) => [...salesKeys.details(), id] as const,
  stats: () => [...salesKeys.all, 'stats'] as const,
  invoice: (id: string) => [...salesKeys.all, 'invoice', id] as const,
};

// ============ Sales Order Queries ============

/**
 * Hook to fetch sales orders list with filters
 */
export function useSalesOrders(params: SalesOrderListParams = {}) {
  return useQuery<PaginatedResponse<SalesOrder>, Error>({
    queryKey: salesKeys.list(params),
    queryFn: () => salesService.getAll(params),
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to fetch sales orders by branch
 */
export function useSalesOrdersByBranch(
  branchId: string | undefined,
  params: Omit<SalesOrderListParams, 'branch'> = {}
) {
  return useQuery<PaginatedResponse<SalesOrder>, Error>({
    queryKey: salesKeys.byBranch(branchId ?? '', params),
    queryFn: () => salesService.getByBranch(branchId!, params),
    enabled: !!branchId,
    staleTime: 30 * 1000,
  });
}

/**
 * Hook to fetch a single sales order by ID
 */
export function useSalesOrder(id: string | undefined) {
  return useQuery<SalesOrder, Error>({
    queryKey: salesKeys.detail(id ?? ''),
    queryFn: () => salesService.getById(id!),
    enabled: !!id,
    staleTime: 30 * 1000,
  });
}

/**
 * Hook to fetch sales statistics
 */
export function useSalesStats(params?: { branch?: string }) {
  return useQuery<SalesStats, Error>({
    queryKey: [...salesKeys.stats(), params] as const,
    queryFn: () => salesService.getStats(params),
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook to fetch invoice data
 */
export function useSalesInvoice(id: string | undefined) {
  return useQuery<SalesOrder, Error>({
    queryKey: salesKeys.invoice(id ?? ''),
    queryFn: () => salesService.getInvoice(id!),
    enabled: !!id,
    staleTime: 5 * 60 * 1000, // 5 minutes (invoices rarely change)
  });
}

// ============ Sales Order Mutations ============

/**
 * Hook to create a new sales order
 */
export function useCreateSalesOrder() {
  const queryClient = useQueryClient();

  return useMutation<SalesOrder, Error, CreateSalesOrderPayload>({
    mutationFn: (payload) => salesService.create(payload),
    onSuccess: (newOrder) => {
      // Invalidate sales lists
      queryClient.invalidateQueries({ queryKey: salesKeys.lists() });
      queryClient.invalidateQueries({ queryKey: salesKeys.stats() });
      // Invalidate branch-specific lists
      const branchId = typeof newOrder.branch === 'string' 
        ? newOrder.branch 
        : newOrder.branch._id;
      queryClient.invalidateQueries({ queryKey: salesKeys.byBranch(branchId) });
      // Invalidate stock queries (stock is reserved on order creation)
      queryClient.invalidateQueries({ queryKey: ['stock'] });
    },
  });
}

/**
 * Hook to update order status
 */
export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();

  return useMutation<SalesOrder, Error, { orderId: string; payload: UpdateOrderStatusPayload }>({
    mutationFn: ({ orderId, payload }) => salesService.updateStatus(orderId, payload),
    onSuccess: (updatedOrder) => {
      // Invalidate specific order
      queryClient.invalidateQueries({ queryKey: salesKeys.detail(updatedOrder._id) });
      // Invalidate lists and stats
      queryClient.invalidateQueries({ queryKey: salesKeys.lists() });
      queryClient.invalidateQueries({ queryKey: salesKeys.stats() });
      // Invalidate stock queries (stock is deducted on completion or released on cancel)
      queryClient.invalidateQueries({ queryKey: ['stock'] });
    },
  });
}

/**
 * Hook to update payment
 */
export function useUpdatePayment() {
  const queryClient = useQueryClient();

  return useMutation<SalesOrder, Error, { orderId: string; payload: UpdatePaymentPayload }>({
    mutationFn: ({ orderId, payload }) => salesService.updatePayment(orderId, payload),
    onSuccess: (updatedOrder) => {
      // Invalidate specific order
      queryClient.invalidateQueries({ queryKey: salesKeys.detail(updatedOrder._id) });
      // Invalidate lists and stats (payment status affects stats)
      queryClient.invalidateQueries({ queryKey: salesKeys.lists() });
      queryClient.invalidateQueries({ queryKey: salesKeys.stats() });
    },
  });
}

/**
 * Hook to cancel an order
 */
export function useCancelOrder() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (orderId) => salesService.cancel(orderId),
    onSuccess: (_, orderId) => {
      // Invalidate specific order
      queryClient.invalidateQueries({ queryKey: salesKeys.detail(orderId) });
      // Invalidate lists and stats
      queryClient.invalidateQueries({ queryKey: salesKeys.lists() });
      queryClient.invalidateQueries({ queryKey: salesKeys.stats() });
      // Invalidate stock queries (reserved stock is released)
      queryClient.invalidateQueries({ queryKey: ['stock'] });
    },
  });
}
