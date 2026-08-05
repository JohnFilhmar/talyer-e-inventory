import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { salesService } from '@/lib/services/salesService';
import { withOfflinePaginatedList } from '@/lib/offline/offlineQuery';
import { isOffline } from '@/lib/offline/cache';
import { enqueueSalesOrder, listOutbox, type SaleOutboxEntry } from '@/lib/offline/outbox';
import { isNetworkError } from '@/lib/apiClient';
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
    // Queued orders are merged in on top of whatever the server (or the
    // mirror) returned. Without this an order created offline is invisible
    // here — it exists only as the create mutation's return value, so the
    // salesperson sees it once on the New Sale screen and then it vanishes,
    // which reads as "my sale was lost" even though it is safely queued.
    //
    // Newest-first, ahead of server rows, because a queued order is by
    // definition the most recent thing that happened.
    queryFn: async () => {
      const response = await withOfflinePaginatedList('salesOrders', () =>
        salesService.getAll(params)
      );
      const queued = await listOutbox();
      const optimistic = queued
        .filter((entry): entry is SaleOutboxEntry => entry.kind === 'sale')
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(buildOptimisticSalesOrder);

      if (optimistic.length === 0) return response;
      return { ...response, data: [...optimistic, ...(response.data ?? [])] };
    },
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
 * Builds a placeholder `SalesOrder` for a create that was queued to the
 * offline outbox instead of reaching the API. The real `orderNumber` and a
 * real `_id` are only assigned server-side, at insert — they do not exist
 * yet, so this must not look like a confirmed order:
 *  - `_id` is prefixed `outbox-`, which can never collide with (or be
 *    mistaken for) a real Mongo ObjectId.
 *  - `orderNumber` is the literal string `'Pending sync'` rather than a
 *    fabricated `SO-YYYY-NNNNNN`-shaped value — nobody should read a made-up
 *    order number aloud to a customer.
 *  - `status` and the payment `status` are forced to `'pending'`.
 * Line pricing (`unitPrice`, `total`, `subtotal`, tax) is left at 0 because
 * the outbox only has the branch-agnostic request payload, not the
 * branch-specific `Stock.sellingPrice` the server prices from — that price
 * is only known once the order actually reaches the server.
 */
function buildOptimisticSalesOrder(entry: SaleOutboxEntry): SalesOrder {
  const { payload } = entry;
  const createdAt = new Date(entry.createdAt).toISOString();

  return {
    _id: `outbox-${entry.id}`,
    orderNumber: 'Pending sync',
    branch: payload.branch,
    customer: payload.customer,
    items: payload.items.map((item, index) => ({
      _id: `outbox-item-${index}`,
      product: item.product,
      sku: '',
      name: '',
      quantity: item.quantity,
      unitPrice: 0,
      discount: item.discount ?? 0,
      total: 0,
    })),
    subtotal: 0,
    tax: { rate: payload.taxRate ?? 0, amount: 0 },
    discount: payload.discount ?? 0,
    total: 0,
    payment: {
      method: payload.paymentMethod,
      amountPaid: payload.amountPaid ?? 0,
      change: 0,
      status: 'pending',
    },
    status: 'pending',
    processedBy: 'offline',
    notes: payload.notes,
    createdAt,
    updatedAt: createdAt,
  };
}

/**
 * Hook to create a new sales order
 *
 * Offline-aware: when the device has no connection, the create is queued to
 * the outbox (outbox.ts) and this resolves with a local placeholder instead
 * of calling the API — see `buildOptimisticSalesOrder`. A request that dies
 * mid-flight (the network drops between the preflight `isOffline()` check
 * and the request settling) gets the same treatment via the `catch`: only
 * `isNetworkError` failures are queued, so a real rejection (insufficient
 * stock, validation, a genuine 5xx) still reaches the caller as a rejected
 * mutation rather than being silently swallowed into the outbox.
 */
export function useCreateSalesOrder() {
  const queryClient = useQueryClient();

  return useMutation<SalesOrder, Error, CreateSalesOrderPayload>({
    mutationFn: async (payload) => {
      if (isOffline()) {
        const entry = await enqueueSalesOrder(payload);
        return buildOptimisticSalesOrder(entry);
      }

      try {
        return await salesService.create(payload);
      } catch (error) {
        if (isNetworkError(error)) {
          const entry = await enqueueSalesOrder(payload);
          return buildOptimisticSalesOrder(entry);
        }
        throw error;
      }
    },
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
