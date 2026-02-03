import apiClient from '@/lib/apiClient';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type {
  SalesOrder,
  SalesStats,
  CreateSalesOrderPayload,
  UpdateOrderStatusPayload,
  UpdatePaymentPayload,
  SalesOrderListParams,
} from '@/types/sales';

/**
 * Sales service
 * Handles all sales order related API calls
 */
export const salesService = {
  /**
   * Get all sales orders with optional filters
   * @param params - Filter parameters
   */
  async getAll(params: SalesOrderListParams = {}): Promise<PaginatedResponse<SalesOrder>> {
    const { data } = await apiClient.get<ApiResponse<SalesOrder[]>>('/api/sales', {
      params,
    });

    return {
      data: data.data ?? [],
      pagination: data.pagination,
    };
  },

  /**
   * Get a single sales order by ID
   * @param id - Order ID
   */
  async getById(id: string): Promise<SalesOrder> {
    const { data } = await apiClient.get<ApiResponse<SalesOrder>>(`/api/sales/${id}`);

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to fetch sales order');
    }

    return data.data;
  },

  /**
   * Get sales orders by branch
   * @param branchId - Branch ID
   * @param params - Optional filter parameters
   */
  async getByBranch(
    branchId: string,
    params: Omit<SalesOrderListParams, 'branch'> = {}
  ): Promise<PaginatedResponse<SalesOrder>> {
    const { data } = await apiClient.get<ApiResponse<SalesOrder[]>>(
      `/api/sales/branch/${branchId}`,
      { params }
    );

    return {
      data: data.data ?? [],
      pagination: data.pagination,
    };
  },

  /**
   * Get sales statistics
   * @param params - Optional params like branch filter
   */
  async getStats(params?: { branch?: string }): Promise<SalesStats> {
    const { data } = await apiClient.get<ApiResponse<SalesStats>>('/api/sales/stats', { params });

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to fetch sales stats');
    }

    return data.data;
  },

  /**
   * Create a new sales order
   * @param payload - Order data
   */
  async create(payload: CreateSalesOrderPayload): Promise<SalesOrder> {
    const { data } = await apiClient.post<ApiResponse<SalesOrder>>('/api/sales', payload);

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to create sales order');
    }

    return data.data;
  },

  /**
   * Update order status
   * @param id - Order ID
   * @param payload - Status update data
   */
  async updateStatus(id: string, payload: UpdateOrderStatusPayload): Promise<SalesOrder> {
    const { data } = await apiClient.put<ApiResponse<SalesOrder>>(
      `/api/sales/${id}/status`,
      payload
    );

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to update order status');
    }

    return data.data;
  },

  /**
   * Update payment information
   * @param id - Order ID
   * @param payload - Payment update data
   */
  async updatePayment(id: string, payload: UpdatePaymentPayload): Promise<SalesOrder> {
    const { data } = await apiClient.put<ApiResponse<SalesOrder>>(
      `/api/sales/${id}/payment`,
      payload
    );

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to update payment');
    }

    return data.data;
  },

  /**
   * Cancel a sales order
   * @param id - Order ID
   */
  async cancel(id: string): Promise<void> {
    const { data } = await apiClient.delete<ApiResponse<null>>(`/api/sales/${id}`);

    if (!data.success) {
      throw new Error(data.message ?? 'Failed to cancel order');
    }
  },

  /**
   * Get invoice data for an order
   * @param id - Order ID
   */
  async getInvoice(id: string): Promise<SalesOrder> {
    const { data } = await apiClient.get<ApiResponse<SalesOrder>>(`/api/sales/${id}/invoice`);

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to fetch invoice');
    }

    return data.data;
  },
};
