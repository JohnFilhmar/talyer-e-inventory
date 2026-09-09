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
 * The server caps a page at PAGINATION.MAX_LIMIT, which is 100.
 *
 * Two callers need every row rather than a page: the New Sale product picker,
 * which filters by motorcycle fitment client-side because no endpoint can, and
 * the transfer modal, which lists the products stocked anywhere. Both used to
 * take whatever a single unparameterised request returned, 50 rows and 20 rows
 * respectively, and silently show nothing else.
 */
const MAX_PAGE_SIZE = 100;

/** Refuses to loop forever if the API keeps reporting more pages. */
const MAX_PAGES = 50;

/**
 * Read every page of a paginated stock endpoint.
 *
 * The alternative, raising the server's own cap, is explicitly ruled out by
 * GAP-043: it moves the truncation rather than removing it, and it makes one
 * request unboundedly large.
 */
async function readAllPages(
  fetchPage: (page: number, limit: number) => Promise<PaginatedResponse<Stock>>
): Promise<Stock[]> {
  const rows: Stock[] = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const response = await fetchPage(page, MAX_PAGE_SIZE);
    rows.push(...response.data);

    const pages = response.pagination?.pages;
    // No pagination envelope means the endpoint answered with a plain list, so
    // there is nothing more to ask for.
    if (pages === undefined || page >= pages) break;
  }

  return rows;
}

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
    const { data } = await apiClient.get<ApiResponse<Stock[]>>('/stock', {
      params,
    });

    return {
      data: data.data ?? [],
      pagination: data.pagination,
    };
  },

  /**
   * Get every stock row for a branch, across all pages.
   *
   * This backs the New Sale and New Service product pickers and the offline
   * mirror behind them. It used to send no pagination at all and take the
   * endpoint's 50-row default, so a branch stocking more than 50 products could
   * not sell the rest through the picker and nothing in the interface said so.
   *
   * @param branchId - Branch ID
   */
  async getByBranch(branchId: string): Promise<Stock[]> {
    return readAllPages(async (page, limit) => {
      const { data } = await apiClient.get<ApiResponse<Stock[]>>(
        `/stock/branch/${branchId}`,
        { params: { page, limit } }
      );

      if (!data.success) {
        throw new Error(data.message ?? 'Failed to fetch branch stock');
      }

      return { data: data.data ?? [], pagination: data.pagination };
    });
  },

  /**
   * Get every stock row matching the filters, across all pages.
   *
   * Only for callers that genuinely need the whole set, such as the transfer
   * modal's product list. A screen showing rows to a person should paginate
   * with `getAll` instead.
   */
  async getAllPages(params: StockListParams = {}): Promise<Stock[]> {
    return readAllPages(async (page, limit) => {
      const { data } = await apiClient.get<ApiResponse<Stock[]>>('/stock', {
        params: { ...params, page, limit },
      });

      return { data: data.data ?? [], pagination: data.pagination };
    });
  },

  /**
   * Get stock for a product across all branches
   * @param productId - Product ID
   */
  async getByProduct(productId: string): Promise<ProductStockSummary> {
    const { data } = await apiClient.get<ApiResponse<ProductStockSummary>>(
      `/stock/product/${productId}`
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
    const { data } = await apiClient.get<ApiResponse<Stock[]>>('/stock/low-stock', {
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
      '/stock/restock',
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
      `/stock/${stockId}/restock`,
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
      '/stock/adjust',
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
      `/stock/${stockId}/adjust`,
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
      '/stock/transfers',
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
      `/stock/transfers/${transferId}`
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
      '/stock/transfers',
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
      `/stock/transfers/${transferId}`,
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
      '/stock/movements',
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
      `/stock/movements/stock/${stockId}`,
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
      `/stock/movements/product/${productId}`,
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
      `/stock/movements/branch/${branchId}`,
      { params }
    );

    return {
      data: data.data ?? [],
      pagination: data.pagination,
    };
  },
};
