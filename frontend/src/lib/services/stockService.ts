import apiClient from '@/lib/apiClient';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type {
  Stock,
  StockTransfer,
  StockMovement,
  ProductStockSummary,
  RestockPayload,
  RestockByIdPayload,
  AdjustStockPayload,
  AdjustStockByIdPayload,
  CreateTransferPayload,
  UpdateTransferStatusPayload,
  StockListParams,
  TransferListParams,
  MovementListParams,
} from '@/types/stock';

/**
 * Stock service
 * Handles all stock-related API calls
 */
export const stockService = {
  /**
   * Get all stock with optional filters
   * @param params - Filter parameters (branch, product, lowStock, outOfStock)
   */
  async getAll(params: StockListParams = {}): Promise<PaginatedResponse<Stock>> {
    const { data } = await apiClient.get<ApiResponse<Stock[]>>('/api/stock', {
      params,
    });

    return {
      data: data.data ?? [],
      pagination: data.pagination,
    };
  },

  /**
   * Get stock for a specific branch
   * @param branchId - Branch ID
   */
  async getByBranch(branchId: string): Promise<Stock[]> {
    const { data } = await apiClient.get<ApiResponse<Stock[]>>(
      `/api/stock/branch/${branchId}`
    );

    if (!data.success) {
      throw new Error(data.message ?? 'Failed to fetch branch stock');
    }

    return data.data ?? [];
  },

  /**
   * Get stock for a product across all branches
   * @param productId - Product ID
   */
  async getByProduct(productId: string): Promise<ProductStockSummary> {
    const { data } = await apiClient.get<ApiResponse<ProductStockSummary>>(
      `/api/stock/product/${productId}`
    );

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to fetch product stock');
    }

    return data.data;
  },

  /**
   * Get low stock items
   * @param params - Optional pagination
   */
  async getLowStock(params: Pick<StockListParams, 'page' | 'limit'> = {}): Promise<PaginatedResponse<Stock>> {
    const { data } = await apiClient.get<ApiResponse<Stock[]>>('/api/stock/low-stock', {
      params,
    });

    return {
      data: data.data ?? [],
      pagination: data.pagination,
    };
  },

  /**
   * Restock a product (add or update stock)
   * @param payload - Restock data
   */
  async restock(payload: RestockPayload): Promise<Stock> {
    const { data } = await apiClient.post<ApiResponse<Stock>>(
      '/api/stock/restock',
      payload
    );

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to restock');
    }

    return data.data;
  },

  /**
   * Restock an existing stock record by ID
   * @param stockId - Stock record ID
   * @param payload - Restock data
   */
  async restockById(stockId: string, payload: RestockByIdPayload): Promise<Stock> {
    const { data } = await apiClient.put<ApiResponse<Stock>>(
      `/api/stock/${stockId}/restock`,
      payload
    );

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to restock');
    }

    return data.data;
  },

  /**
   * Adjust stock quantity (admin only)
   * @param payload - Adjustment data
   */
  async adjust(payload: AdjustStockPayload): Promise<Stock> {
    const { data } = await apiClient.post<ApiResponse<Stock>>(
      '/api/stock/adjust',
      payload
    );

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to adjust stock');
    }

    return data.data;
  },

  /**
   * Adjust an existing stock record by ID
   * @param stockId - Stock record ID
   * @param payload - Adjustment data
   */
  async adjustById(stockId: string, payload: AdjustStockByIdPayload): Promise<Stock> {
    const { data } = await apiClient.put<ApiResponse<Stock>>(
      `/api/stock/${stockId}/adjust`,
      payload
    );

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to adjust stock');
    }

    return data.data;
  },

  // ============ Transfer Operations ============

  /**
   * Get all transfers with optional filters
   * @param params - Filter parameters (branch, status)
   */
  async getTransfers(params: TransferListParams = {}): Promise<PaginatedResponse<StockTransfer>> {
    const { data } = await apiClient.get<ApiResponse<StockTransfer[]>>(
      '/api/stock/transfers',
      { params }
    );

    return {
      data: data.data ?? [],
      pagination: data.pagination,
    };
  },

  /**
   * Get a single transfer by ID
   * @param transferId - Transfer ID
   */
  async getTransferById(transferId: string): Promise<StockTransfer> {
    const { data } = await apiClient.get<ApiResponse<StockTransfer>>(
      `/api/stock/transfers/${transferId}`
    );

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to fetch transfer');
    }

    return data.data;
  },

  /**
   * Create a new stock transfer
   * @param payload - Transfer data
   */
  async createTransfer(payload: CreateTransferPayload): Promise<StockTransfer> {
    const { data } = await apiClient.post<ApiResponse<StockTransfer>>(
      '/api/stock/transfers',
      payload
    );

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to create transfer');
    }

    return data.data;
  },

  /**
   * Update transfer status
   * @param transferId - Transfer ID
   * @param payload - New status
   */
  async updateTransferStatus(
    transferId: string,
    payload: UpdateTransferStatusPayload
  ): Promise<StockTransfer> {
    const { data } = await apiClient.put<ApiResponse<StockTransfer>>(
      `/api/stock/transfers/${transferId}`,
      payload
    );

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to update transfer status');
    }

    return data.data;
  },

  // ============ Stock Movement Methods ============

  /**
   * Get all stock movements with filters
   * @param params - Filter parameters
   */
  async getMovements(params: MovementListParams = {}): Promise<PaginatedResponse<StockMovement>> {
    const { data } = await apiClient.get<ApiResponse<StockMovement[]>>(
      '/api/stock/movements',
      { params }
    );

    return {
      data: data.data ?? [],
      pagination: data.pagination,
    };
  },

  /**
   * Get movements for a specific stock record
   * @param stockId - Stock record ID
   * @param params - Optional pagination
   */
  async getMovementsByStock(
    stockId: string,
    params: Pick<MovementListParams, 'page' | 'limit'> = {}
  ): Promise<PaginatedResponse<StockMovement>> {
    const { data } = await apiClient.get<ApiResponse<StockMovement[]>>(
      `/api/stock/movements/stock/${stockId}`,
      { params }
    );

    return {
      data: data.data ?? [],
      pagination: data.pagination,
    };
  },

  /**
   * Get movements for a specific product
   * @param productId - Product ID
   * @param params - Optional filters
   */
  async getMovementsByProduct(
    productId: string,
    params: Pick<MovementListParams, 'branch' | 'page' | 'limit'> = {}
  ): Promise<PaginatedResponse<StockMovement>> {
    const { data } = await apiClient.get<ApiResponse<StockMovement[]>>(
      `/api/stock/movements/product/${productId}`,
      { params }
    );

    return {
      data: data.data ?? [],
      pagination: data.pagination,
    };
  },

  /**
   * Get movements for a specific branch
   * @param branchId - Branch ID
   * @param params - Optional filters
   */
  async getMovementsByBranch(
    branchId: string,
    params: Pick<MovementListParams, 'type' | 'startDate' | 'endDate' | 'page' | 'limit'> = {}
  ): Promise<PaginatedResponse<StockMovement>> {
    const { data } = await apiClient.get<ApiResponse<StockMovement[]>>(
      `/api/stock/movements/branch/${branchId}`,
      { params }
    );

    return {
      data: data.data ?? [],
      pagination: data.pagination,
    };
  },
};
