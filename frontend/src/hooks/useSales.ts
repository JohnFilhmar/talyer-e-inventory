import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { salesService } from '@/lib/services/salesService';
import { withOfflinePaginatedList } from '@/lib/offline/offlineQuery';
import { isOffline, readCachedById, readCachedList } from '@/lib/offline/cache';
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
import type { Stock } from '@/types/stock';
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
      const optimistic = await Promise.all(
        queued
          .filter((entry): entry is SaleOutboxEntry => entry.kind === 'sale')
          .sort((a, b) => b.createdAt - a.createdAt)
          .map(buildOptimisticSalesOrder)
      );

      if (optimistic.length === 0) return response;

      // The pagination block has to grow with the rows, or the footer reads
      // "Showing 5 of 4 orders" — the server's total does not know about
      // anything still sitting in the outbox.
      const serverRows = response.data ?? [];
      const pagination = response.pagination
        ? {
            ...response.pagination,
            total: response.pagination.total + optimistic.length,
          }
        : undefined;

      return { ...response, data: [...optimistic, ...serverRows], pagination };
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
    queryFn: async () => {
      // An `outbox-` id belongs to an order that has never reached the server,
      // so there is nothing to fetch — rebuild it from the queued entry.
      if (id!.startsWith('outbox-')) {
        const entryId = id!.slice('outbox-'.length);
        const entry = (await listOutbox()).find(
          (candidate): candidate is SaleOutboxEntry =>
            candidate.kind === 'sale' && candidate.id === entryId
        );
        if (!entry) throw new Error('This queued order is no longer in the sync queue.');
        return buildOptimisticSalesOrder(entry);
      }

      try {
        return await salesService.getById(id!);
      } catch (error) {
        // Opening an order offline should work for anything the list already
        // mirrored. Only a network failure falls back — a real 404 or 403
        // must still surface.
        if (isNetworkError(error)) {
          const cached = await readCachedById<SalesOrder>('salesOrders', id!);
          if (cached) return cached;
        }
        throw error;
      }
    },
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
 * Line pricing is resolved from the offline stock mirror rather than left at
 * zero. The outbox only stores the request payload, but the mirror already
 * holds the branch's `Stock.sellingPrice` and the product's name and SKU —
 * the same figures the server prices from. Showing ₱0.00 and a blank product
 * for a real sale reads as corruption, and a salesperson cannot sanity-check
 * an order they cannot see the value of.
 *
 * These remain provisional: the server reprices at insert, so a price change
 * between queueing and replay is reconciled then. Anything the mirror cannot
 * resolve falls back to zero rather than guessing.
 */
async function buildOptimisticSalesOrder(entry: SaleOutboxEntry): Promise<SalesOrder> {
  const { payload } = entry;
  const createdAt = new Date(entry.createdAt).toISOString();

  const branchId =
    typeof payload.branch === 'string'
      ? payload.branch
      : (payload.branch as { _id?: string } | null)?._id;

  const cachedStock = await readCachedList<Stock>('stock');
  const stockFor = (productId: string) =>
    cachedStock.find((row) => {
      const rowProduct = row.product as unknown;
      const rowProductId =
        typeof rowProduct === 'string' ? rowProduct : (rowProduct as { _id?: string })?._id;
      if (rowProductId !== productId) return false;

      const rowBranch = row.branch as unknown;
      const rowBranchId =
        typeof rowBranch === 'string' ? rowBranch : (rowBranch as { _id?: string })?._id;
      return rowBranchId === branchId;
    });

  const items = payload.items.map((item, index) => {
    const stock = stockFor(item.product);
    const product = stock?.product as { sku?: string; name?: string } | undefined;
    const unitPrice = stock?.sellingPrice ?? 0;
    const discount = item.discount ?? 0;

    return {
      _id: `outbox-item-${index}`,
      product: item.product,
      sku: product?.sku ?? '',
      name: product?.name ?? '',
      quantity: item.quantity,
      unitPrice,
      discount,
      total: Math.max(unitPrice * item.quantity - discount, 0),
    };
  });

  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const orderDiscount = payload.discount ?? 0;
  const taxRate = payload.taxRate ?? 0;
  const taxAmount = ((subtotal - orderDiscount) * taxRate) / 100;
  const total = Math.max(subtotal - orderDiscount + taxAmount, 0);

  return {
    _id: `outbox-${entry.id}`,
    orderNumber: 'Pending sync',
    branch: payload.branch,
    customer: payload.customer,
    items,
    subtotal,
    tax: { rate: taxRate, amount: taxAmount },
    discount: orderDiscount,
    total,
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
