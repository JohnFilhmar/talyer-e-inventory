import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { serviceService, ServiceInvoice } from '@/lib/services/serviceService';
import type {
  ServiceOrder,
  CreateServiceOrderPayload,
  AssignMechanicPayload,
  UpdateServiceStatusPayload,
  UpdatePartsPayload,
  UpdateServicePaymentPayload,
  ServiceOrderListParams,
  MyJobsParams,
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
    queryFn: () => serviceService.getAll(params),
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
    queryFn: () => serviceService.getById(id!),
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
 * Hook to create a new service order
 */
export function useCreateServiceOrder() {
  const queryClient = useQueryClient();

  return useMutation<ServiceOrder, Error, CreateServiceOrderPayload>({
    mutationFn: (payload) => serviceService.create(payload),
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
