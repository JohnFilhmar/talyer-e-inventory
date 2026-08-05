import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { serviceService, ServiceInvoice } from '@/lib/services/serviceService';
import { withOfflinePaginatedList } from '@/lib/offline/offlineQuery';
import { isOffline, readCachedById, readCachedList } from '@/lib/offline/cache';
import { enqueueServiceOrder, listOutbox, type ServiceOutboxEntry } from '@/lib/offline/outbox';
import { isNetworkError } from '@/lib/apiClient';
import type {
  ServiceOrder,
  CreateServiceOrderPayload,
  AssignMechanicPayload,
  UpdateServiceStatusPayload,
  UpdatePartsPayload,
  UpdateServicePaymentPayload,
  ServiceOrderListParams,
  MyJobsParams,
  ServiceBranch,
} from '@/types/service';
import type { User } from '@/types/auth';
import type { PaginatedResponse } from '@/types/api';

/**
 * Query keys for service-related queries
 */
export const serviceKeys = {
  all: ['services'] as const,
  lists: () => [...serviceKeys.all, 'list'] as const,
  list: (params: ServiceOrderListParams) => [...serviceKeys.lists(), params] as const,
  myJobs: () => [...serviceKeys.all, 'my-jobs'] as const,
  myJobsList: (params: MyJobsParams) => [...serviceKeys.myJobs(), params] as const,
  details: () => [...serviceKeys.all, 'detail'] as const,
  detail: (id: string) => [...serviceKeys.details(), id] as const,
  invoice: (id: string) => [...serviceKeys.all, 'invoice', id] as const,
  mechanics: () => [...serviceKeys.all, 'mechanics'] as const,
};

// ============ Service Order Queries ============

/**
 * Hook to fetch service orders list with filters
 */
export function useServiceOrders(params: ServiceOrderListParams = {}) {
  return useQuery<PaginatedResponse<ServiceOrder>, Error>({
    queryKey: serviceKeys.list(params),
    // Queued jobs are merged in on top of the server (or mirrored) rows. See
    // the matching comment in useSales.ts: without this, a job created offline
    // is visible once on the New Service screen and then disappears from the
    // list, which reads as data loss even though it is safely queued.
    queryFn: async () => {
      const response = await withOfflinePaginatedList('serviceOrders', () =>
        serviceService.getAll(params)
      );
      const queued = await listOutbox();
      const optimistic = await Promise.all(
        queued
          .filter((entry): entry is ServiceOutboxEntry => entry.kind === 'service')
          .sort((a, b) => b.createdAt - a.createdAt)
          .map(buildOptimisticServiceOrder)
      );

      if (optimistic.length === 0) return response;

      // Keep the pagination total in step with the merged rows, or the footer
      // reports fewer records than it is showing.
      const pagination = response.pagination
        ? {
            ...response.pagination,
            total: response.pagination.total + optimistic.length,
          }
        : undefined;

      return { ...response, data: [...optimistic, ...(response.data ?? [])], pagination };
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to fetch mechanic's assigned jobs
 */
export function useMyJobs(params: MyJobsParams = {}) {
  return useQuery<PaginatedResponse<ServiceOrder>, Error>({
    queryKey: serviceKeys.myJobsList(params),
    queryFn: () => serviceService.getMyJobs(params),
    staleTime: 30 * 1000,
  });
}

/**
 * Hook to fetch a single service order by ID
 */
export function useServiceOrder(id: string | undefined) {
  return useQuery<ServiceOrder, Error>({
    queryKey: serviceKeys.detail(id ?? ''),
    queryFn: async () => {
      // An `outbox-` id belongs to a job that has never reached the server.
      if (id!.startsWith('outbox-')) {
        const entryId = id!.slice('outbox-'.length);
        const entry = (await listOutbox()).find(
          (candidate): candidate is ServiceOutboxEntry =>
            candidate.kind === 'service' && candidate.id === entryId
        );
        if (!entry) throw new Error('This queued job is no longer in the sync queue.');
        return buildOptimisticServiceOrder(entry);
      }

      try {
        return await serviceService.getById(id!);
      } catch (error) {
        // Only a network failure falls back to the mirror; a real 404 or 403
        // must still surface.
        if (isNetworkError(error)) {
          const cached = await readCachedById<ServiceOrder>('serviceOrders', id!);
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
 * Hook to fetch invoice data for a service order
 */
export function useServiceInvoice(id: string | undefined) {
  return useQuery<ServiceInvoice, Error>({
    queryKey: serviceKeys.invoice(id ?? ''),
    queryFn: () => serviceService.getInvoice(id!),
    enabled: !!id,
    staleTime: 5 * 60 * 1000, // 5 minutes (invoices rarely change)
  });
}

/**
 * Hook to fetch all mechanics (globally, filtered client-side)
 */
export function useMechanics() {
  return useQuery<User[], Error>({
    queryKey: serviceKeys.mechanics(),
    queryFn: () => serviceService.getMechanics(),
    staleTime: 5 * 60 * 1000, // 5 minutes (mechanics list rarely changes)
  });
}

// ============ Service Order Mutations ============

/**
 * Builds a placeholder `ServiceOrder` for a create that was queued to the
 * offline outbox instead of reaching the API. Mirrors
 * `buildOptimisticSalesOrder` in useSales.ts: the real `jobNumber` and a
 * real `_id` are only assigned server-side, at insert, so this must not
 * look like a confirmed job. `_id` is prefixed `outbox-` (can never collide
 * with a real Mongo ObjectId), `jobNumber` is the literal `'Pending sync'`
 * rather than a fabricated `JOB-YYYY-NNNNNN`-shaped value, and `status` /
 * the payment `status` are forced to `'pending'`.
 */
async function buildOptimisticServiceOrder(entry: ServiceOutboxEntry): Promise<ServiceOrder> {
  const { payload } = entry;
  const createdAt = new Date(entry.createdAt).toISOString();

  // Resolve the branch into the populated shape the UI expects. The payload
  // carries only an id, but the tables render via
  // `isPopulatedServiceBranch(...) ? branch.name : '-'`, so a raw id shows as
  // a dash — indistinguishable from missing data. The branches mirror has it.
  const branchId =
    typeof payload.branch === 'string'
      ? payload.branch
      : (payload.branch as { _id?: string } | null)?._id;
  const cachedBranches = await readCachedList<ServiceBranch>('branches');
  const branch: ServiceBranch | string =
    cachedBranches.find((candidate) => candidate._id === branchId) ?? payload.branch;

  return {
    _id: `outbox-${entry.id}`,
    jobNumber: 'Pending sync',
    branch,
    customer: payload.customer,
    vehicle: payload.vehicle,
    assignedTo: payload.assignedTo,
    description: payload.description,
    diagnosis: payload.diagnosis,
    partsUsed: [],
    laborCost: payload.laborCost ?? 0,
    otherCharges: payload.otherCharges ?? 0,
    totalParts: 0,
    totalAmount: 0,
    priority: payload.priority ?? 'normal',
    status: 'pending',
    payment: {
      amountPaid: 0,
      status: 'pending',
    },
    scheduledAt: payload.scheduledAt,
    createdBy: 'offline',
    notes: payload.notes,
    createdAt,
    updatedAt: createdAt,
  };
}

/**
 * Hook to create a new service order
 *
 * Offline-aware in the same way as `useCreateSalesOrder`: a preemptive
 * `isOffline()` check queues the create to the outbox and resolves with a
 * local placeholder, and a request that dies mid-flight gets the same
 * treatment via `isNetworkError` in the `catch` — any other failure still
 * reaches the caller as a rejected mutation.
 */
export function useCreateServiceOrder() {
  const queryClient = useQueryClient();

  return useMutation<ServiceOrder, Error, CreateServiceOrderPayload>({
    mutationFn: async (payload) => {
      if (isOffline()) {
        const entry = await enqueueServiceOrder(payload);
        return buildOptimisticServiceOrder(entry);
      }

      try {
        return await serviceService.create(payload);
      } catch (error) {
        if (isNetworkError(error)) {
          const entry = await enqueueServiceOrder(payload);
          return buildOptimisticServiceOrder(entry);
        }
        throw error;
      }
    },
    onSuccess: () => {
      // Invalidate service lists
      queryClient.invalidateQueries({ queryKey: serviceKeys.lists() });
      queryClient.invalidateQueries({ queryKey: serviceKeys.myJobs() });
    },
  });
}

/**
 * Hook to assign/reassign mechanic
 */
export function useAssignMechanic() {
  const queryClient = useQueryClient();

  return useMutation<ServiceOrder, Error, { orderId: string; payload: AssignMechanicPayload }>({
    mutationFn: ({ orderId, payload }) => serviceService.assignMechanic(orderId, payload),
    onSuccess: (updatedOrder) => {
      // Invalidate specific order
      queryClient.invalidateQueries({ queryKey: serviceKeys.detail(updatedOrder._id) });
      // Invalidate lists (assignment might change which lists show this order)
      queryClient.invalidateQueries({ queryKey: serviceKeys.lists() });
      queryClient.invalidateQueries({ queryKey: serviceKeys.myJobs() });
    },
  });
}

/**
 * Hook to update service order status
 */
export function useUpdateServiceStatus() {
  const queryClient = useQueryClient();

  return useMutation<ServiceOrder, Error, { orderId: string; payload: UpdateServiceStatusPayload }>({
    mutationFn: ({ orderId, payload }) => serviceService.updateStatus(orderId, payload),
    onSuccess: (updatedOrder) => {
      // Invalidate specific order
      queryClient.invalidateQueries({ queryKey: serviceKeys.detail(updatedOrder._id) });
      // Invalidate lists
      queryClient.invalidateQueries({ queryKey: serviceKeys.lists() });
      queryClient.invalidateQueries({ queryKey: serviceKeys.myJobs() });
      // If completed, parts are deducted from stock
      if (updatedOrder.status === 'completed') {
        queryClient.invalidateQueries({ queryKey: ['stock'] });
      }
    },
  });
}

/**
 * Hook to update parts used
 */
export function useUpdateParts() {
  const queryClient = useQueryClient();

  return useMutation<ServiceOrder, Error, { orderId: string; payload: UpdatePartsPayload }>({
    mutationFn: ({ orderId, payload }) => serviceService.updateParts(orderId, payload),
    onSuccess: (updatedOrder) => {
      // Invalidate specific order
      queryClient.invalidateQueries({ queryKey: serviceKeys.detail(updatedOrder._id) });
      // Invalidate lists (totals might change)
      queryClient.invalidateQueries({ queryKey: serviceKeys.lists() });
      queryClient.invalidateQueries({ queryKey: serviceKeys.myJobs() });
    },
  });
}

/**
 * Hook to update payment
 */
export function useUpdateServicePayment() {
  const queryClient = useQueryClient();

  return useMutation<ServiceOrder, Error, { orderId: string; payload: UpdateServicePaymentPayload }>({
    mutationFn: ({ orderId, payload }) => serviceService.updatePayment(orderId, payload),
    onSuccess: (updatedOrder) => {
      // Invalidate specific order
      queryClient.invalidateQueries({ queryKey: serviceKeys.detail(updatedOrder._id) });
      // Invalidate lists (payment status changes)
      queryClient.invalidateQueries({ queryKey: serviceKeys.lists() });
      queryClient.invalidateQueries({ queryKey: serviceKeys.myJobs() });
    },
  });
}

/**
 * Hook to cancel a service order
 */
export function useCancelServiceOrder() {
  const queryClient = useQueryClient();

  return useMutation<{ id: string; jobNumber: string; status: string }, Error, string>({
    mutationFn: (orderId) => serviceService.cancel(orderId),
    onSuccess: (result) => {
      // Invalidate specific order
      queryClient.invalidateQueries({ queryKey: serviceKeys.detail(result.id) });
      // Invalidate lists
      queryClient.invalidateQueries({ queryKey: serviceKeys.lists() });
      queryClient.invalidateQueries({ queryKey: serviceKeys.myJobs() });
    },
  });
}
