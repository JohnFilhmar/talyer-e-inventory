import apiClient from '@/lib/apiClient';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type { User } from '@/types/auth';
import type {
  ServiceOrder,
  CreateServiceOrderPayload,
  AssignMechanicPayload,
  UpdateServiceStatusPayload,
  UpdatePartsPayload,
  UpdateServicePaymentPayload,
  UpdateChargesPayload,
  ServiceOrderListParams,
  MyJobsParams,
} from '@/types/service';

/**
 * Service invoice response type
 */
export interface ServiceInvoice {
  jobNumber: string;
  date: string;
  completedDate?: string;
  branch: {
    _id: string;
    name: string;
    code: string;
    address?: string;
    phone?: string;
    email?: string;
  };
  customer: {
    name: string;
    phone: string;
    email?: string;
    address?: string;
  };
  vehicle: {
    make?: string;
    model?: string;
    year?: number;
    plateNumber?: string;
    vin?: string;
    mileage?: number;
  };
  assignedMechanic?: {
    _id: string;
    name: string;
  };
  description: string;
  diagnosis?: string;
  partsUsed: Array<{
    product: { _id: string; sku: string; name: string; brand?: string } | string;
    sku: string;
    name: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  totalParts: number;
  laborCost: number;
  otherCharges: number;
  totalAmount: number;
  payment: {
    method?: string;
    amountPaid: number;
    status: string;
    paidAt?: string;
  };
  notes?: string;
  status: string;
}

/**
 * Status update response type
 */
interface StatusUpdateResponse {
  order: ServiceOrder;
  statusChanged: {
    from: string;
    to: string;
  };
}

/**
 * Cancel response type
 */
interface CancelResponse {
  id: string;
  jobNumber: string;
  status: string;
}

/**
 * Service order service
 * Handles all service order related API calls
 */
export const serviceService = {
  /**
   * Get all service orders with optional filters
   * @param params - Filter parameters
   */
  async getAll(params: ServiceOrderListParams = {}): Promise<PaginatedResponse<ServiceOrder>> {
    const { data } = await apiClient.get<ApiResponse<ServiceOrder[]>>('/api/services', {
      params,
    });

    return {
      data: data.data ?? [],
      pagination: data.pagination,
    };
  },

  /**
   * Get mechanic's assigned jobs
   * @param params - Filter parameters
   */
  async getMyJobs(params: MyJobsParams = {}): Promise<PaginatedResponse<ServiceOrder>> {
    const { data } = await apiClient.get<ApiResponse<ServiceOrder[]>>('/api/services/my-jobs', {
      params,
    });

    return {
      data: data.data ?? [],
      pagination: data.pagination,
    };
  },

  /**
   * Get a single service order by ID
   * @param id - Service order ID
   */
  async getById(id: string): Promise<ServiceOrder> {
    const { data } = await apiClient.get<ApiResponse<ServiceOrder>>(`/api/services/${id}`);

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to fetch service order');
    }

    return data.data;
  },

  /**
   * Create a new service order
   * @param payload - Service order data
   */
  async create(payload: CreateServiceOrderPayload): Promise<ServiceOrder> {
    const { data } = await apiClient.post<ApiResponse<ServiceOrder>>('/api/services', payload);

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to create service order');
    }

    return data.data;
  },

  /**
   * Assign/reassign mechanic to service order
   * @param id - Service order ID
   * @param payload - Mechanic assignment data
   */
  async assignMechanic(id: string, payload: AssignMechanicPayload): Promise<ServiceOrder> {
    const { data } = await apiClient.put<ApiResponse<ServiceOrder>>(
      `/api/services/${id}/assign`,
      payload
    );

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to assign mechanic');
    }

    return data.data;
  },

  /**
   * Update service order status
   * @param id - Service order ID
   * @param payload - Status update data
   */
  async updateStatus(id: string, payload: UpdateServiceStatusPayload): Promise<ServiceOrder> {
    const { data } = await apiClient.put<ApiResponse<StatusUpdateResponse>>(
      `/api/services/${id}/status`,
      payload
    );

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to update status');
    }

    return data.data.order;
  },

  /**
   * Update parts used in service order
   * @param id - Service order ID
   * @param payload - Parts update data
   */
  async updateParts(id: string, payload: UpdatePartsPayload): Promise<ServiceOrder> {
    const { data } = await apiClient.put<ApiResponse<ServiceOrder>>(
      `/api/services/${id}/parts`,
      payload
    );

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to update parts');
    }

    return data.data;
  },

  /**
   * Update payment information
   * @param id - Service order ID
   * @param payload - Payment update data
   */
  async updatePayment(id: string, payload: UpdateServicePaymentPayload): Promise<ServiceOrder> {
    const { data } = await apiClient.put<ApiResponse<ServiceOrder>>(
      `/api/services/${id}/payment`,
      payload
    );

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to update payment');
    }

    return data.data;
  },

  /**
   * Update labor cost and other charges
   * @param id - Service order ID
   * @param payload - Charges update data
   */
  async updateCharges(id: string, payload: UpdateChargesPayload): Promise<ServiceOrder> {
    // This uses the same payment endpoint for charges
    const { data } = await apiClient.put<ApiResponse<ServiceOrder>>(
      `/api/services/${id}/payment`,
      payload
    );

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to update charges');
    }

    return data.data;
  },

  /**
   * Cancel a service order
   * @param id - Service order ID
   */
  async cancel(id: string): Promise<CancelResponse> {
    const { data } = await apiClient.delete<ApiResponse<CancelResponse>>(`/api/services/${id}`);

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to cancel service order');
    }

    return data.data;
  },

  /**
   * Get invoice data for a service order
   * @param id - Service order ID
   */
  async getInvoice(id: string): Promise<ServiceInvoice> {
    const { data } = await apiClient.get<ApiResponse<ServiceInvoice>>(
      `/api/services/${id}/invoice`
    );

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to fetch invoice');
    }

    return data.data;
  },

  /**
   * Get all mechanics (users with role 'mechanic')
   * Fetched globally and filtered client-side
   */
  async getMechanics(): Promise<User[]> {
    const { data } = await apiClient.get<ApiResponse<User[]>>('/api/users');

    if (!data.success) {
      throw new Error(data.message ?? 'Failed to fetch users');
    }

    // Filter to only mechanics who are active
    return (data.data ?? []).filter(
      (user) => user.role === 'mechanic' && user.isActive
    );
  },
};

export default serviceService;
