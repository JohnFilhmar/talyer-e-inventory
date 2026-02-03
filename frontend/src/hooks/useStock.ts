import { useQuery, useMutation, useQueryClient, UseQueryOptions } from '@tanstack/react-query';
import { stockService } from '@/lib/services/stockService';
import type {
  Stock,
  StockTransfer,
  StockMovement,
  ProductStockSummary,
  StockListParams,
  TransferListParams,
  MovementListParams,
  RestockPayload,
  RestockByIdPayload,
  AdjustStockPayload,
  AdjustStockByIdPayload,
  CreateTransferPayload,
  UpdateTransferStatusPayload,
} from '@/types/stock';
import type { PaginatedResponse } from '@/types/api';

/**
 * Query keys for stock-related queries
 */
export const stockKeys = {
  all: ['stock'] as const,
  lists: () => [...stockKeys.all, 'list'] as const,
  list: (params: StockListParams) => [...stockKeys.lists(), params] as const,
  byBranch: (branchId: string) => [...stockKeys.all, 'branch', branchId] as const,
  byProduct: (productId: string) => [...stockKeys.all, 'product', productId] as const,
  lowStock: () => [...stockKeys.all, 'low-stock'] as const,
  transfers: () => [...stockKeys.all, 'transfers'] as const,
  transferList: (params: TransferListParams) => [...stockKeys.transfers(), 'list', params] as const,
  transfer: (id: string) => [...stockKeys.transfers(), 'detail', id] as const,
  // Movement keys
  movements: () => [...stockKeys.all, 'movements'] as const,
  movementList: (params: MovementListParams) => [...stockKeys.movements(), 'list', params] as const,
  movementsByStock: (stockId: string) => [...stockKeys.movements(), 'stock', stockId] as const,
  movementsByProduct: (productId: string) => [...stockKeys.movements(), 'product', productId] as const,
  movementsByBranch: (branchId: string) => [...stockKeys.movements(), 'branch', branchId] as const,
};

// ============ Stock Queries ============

/**
 * Hook to fetch stock list with filters
 */
export function useStock(
  params: StockListParams = {},
  options?: Partial<UseQueryOptions<PaginatedResponse<Stock>, Error>>
) {
  return useQuery<PaginatedResponse<Stock>, Error>({
    queryKey: stockKeys.list(params),
    queryFn: () => stockService.getAll(params),
    staleTime: 30 * 1000, // 30 seconds
    ...options,
  });
}

/**
 * Hook to fetch stock for a specific branch
 */
export function useStockByBranch(
  branchId: string | undefined,
  options?: Partial<UseQueryOptions<Stock[], Error>>
) {
  return useQuery<Stock[], Error>({
    queryKey: stockKeys.byBranch(branchId ?? ''),
    queryFn: () => stockService.getByBranch(branchId!),
    enabled: !!branchId,
    staleTime: 30 * 1000,
    ...options,
  });
}

/**
 * Hook to fetch stock for a product across all branches
 */
export function useStockByProduct(productId: string | undefined) {
  return useQuery<ProductStockSummary, Error>({
    queryKey: stockKeys.byProduct(productId ?? ''),
    queryFn: () => stockService.getByProduct(productId!),
    enabled: !!productId,
    staleTime: 30 * 1000,
  });
}

/**
 * Hook to fetch low stock items
 */
export function useLowStock(params: Pick<StockListParams, 'page' | 'limit'> = {}) {
  return useQuery<PaginatedResponse<Stock>, Error>({
    queryKey: [...stockKeys.lowStock(), params] as const,
    queryFn: () => stockService.getLowStock(params),
    staleTime: 60 * 1000, // 1 minute
  });
}

// ============ Stock Mutations ============

/**
 * Hook to restock a product (create or update by product+branch)
 */
export function useRestock() {
  const queryClient = useQueryClient();

  return useMutation<Stock, Error, RestockPayload>({
    mutationFn: (payload) => stockService.restock(payload),
    onSuccess: (_, variables) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: stockKeys.lists() });
      queryClient.invalidateQueries({ queryKey: stockKeys.lowStock() });
      queryClient.invalidateQueries({ queryKey: stockKeys.byBranch(variables.branch) });
      queryClient.invalidateQueries({ queryKey: stockKeys.byProduct(variables.product) });
    },
  });
}

/**
 * Hook to restock an existing stock record by ID
 */
export function useRestockById() {
  const queryClient = useQueryClient();

  return useMutation<Stock, Error, { stockId: string; data: RestockByIdPayload }>({
    mutationFn: ({ stockId, data }) => stockService.restockById(stockId, data),
    onSuccess: () => {
      // Invalidate all stock queries since we don't know branch/product from stockId
      queryClient.invalidateQueries({ queryKey: stockKeys.all });
    },
  });
}

/**
 * Hook to adjust stock quantity (by product+branch)
 */
export function useAdjustStock() {
  const queryClient = useQueryClient();

  return useMutation<Stock, Error, AdjustStockPayload>({
    mutationFn: (payload) => stockService.adjust(payload),
    onSuccess: (_, variables) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: stockKeys.lists() });
      queryClient.invalidateQueries({ queryKey: stockKeys.lowStock() });
      queryClient.invalidateQueries({ queryKey: stockKeys.byBranch(variables.branch) });
      queryClient.invalidateQueries({ queryKey: stockKeys.byProduct(variables.product) });
    },
  });
}

/**
 * Hook to adjust an existing stock record by ID
 */
export function useAdjustStockById() {
  const queryClient = useQueryClient();

  return useMutation<Stock, Error, { stockId: string; data: AdjustStockByIdPayload }>({
    mutationFn: ({ stockId, data }) => stockService.adjustById(stockId, data),
    onSuccess: () => {
      // Invalidate all stock queries since we don't know branch/product from stockId
      queryClient.invalidateQueries({ queryKey: stockKeys.all });
    },
  });
}

// ============ Transfer Queries ============

/**
 * Hook to fetch transfer list with filters
 */
export function useTransfers(params: TransferListParams = {}) {
  return useQuery<PaginatedResponse<StockTransfer>, Error>({
    queryKey: stockKeys.transferList(params),
    queryFn: () => stockService.getTransfers(params),
    staleTime: 30 * 1000,
  });
}

/**
 * Hook to fetch a single transfer by ID
 */
export function useTransfer(transferId: string | undefined) {
  return useQuery<StockTransfer, Error>({
    queryKey: stockKeys.transfer(transferId ?? ''),
    queryFn: () => stockService.getTransferById(transferId!),
    enabled: !!transferId,
    staleTime: 30 * 1000,
  });
}

// ============ Transfer Mutations ============

/**
 * Hook to create a new transfer
 */
export function useCreateTransfer() {
  const queryClient = useQueryClient();

  return useMutation<StockTransfer, Error, CreateTransferPayload>({
    mutationFn: (payload) => stockService.createTransfer(payload),
    onSuccess: (_, variables) => {
      // Invalidate transfer lists and stock queries
      queryClient.invalidateQueries({ queryKey: stockKeys.transfers() });
      queryClient.invalidateQueries({ queryKey: stockKeys.byBranch(variables.fromBranch) });
      queryClient.invalidateQueries({ queryKey: stockKeys.byProduct(variables.product) });
      queryClient.invalidateQueries({ queryKey: stockKeys.lists() });
    },
  });
}

/**
 * Hook to update transfer status
 */
export function useUpdateTransferStatus() {
  const queryClient = useQueryClient();

  return useMutation<
    StockTransfer,
    Error,
    { transferId: string; payload: UpdateTransferStatusPayload }
  >({
    mutationFn: ({ transferId, payload }) =>
      stockService.updateTransferStatus(transferId, payload),
    onSuccess: (updatedTransfer) => {
      // Invalidate transfer queries
      queryClient.invalidateQueries({ queryKey: stockKeys.transfers() });
      queryClient.invalidateQueries({ queryKey: stockKeys.transfer(updatedTransfer._id) });
      // Invalidate stock queries (status change affects stock)
      queryClient.invalidateQueries({ queryKey: stockKeys.lists() });
      queryClient.invalidateQueries({ queryKey: stockKeys.lowStock() });
      // Invalidate movement queries (transfers create movements)
      queryClient.invalidateQueries({ queryKey: stockKeys.movements() });
    },
  });
}

// ============ Stock Movement Queries ============

/**
 * Hook to fetch all stock movements with filters
 */
export function useStockMovements(
  params: MovementListParams = {},
  options?: Partial<UseQueryOptions<PaginatedResponse<StockMovement>, Error>>
) {
  return useQuery<PaginatedResponse<StockMovement>, Error>({
    queryKey: stockKeys.movementList(params),
    queryFn: () => stockService.getMovements(params),
    staleTime: 30 * 1000, // 30 seconds
    ...options,
  });
}

/**
 * Hook to fetch movements for a specific stock record
 */
export function useStockMovementsByStock(
  stockId: string | undefined,
  params: Pick<MovementListParams, 'page' | 'limit'> = {},
  options?: Partial<UseQueryOptions<PaginatedResponse<StockMovement>, Error>>
) {
  return useQuery<PaginatedResponse<StockMovement>, Error>({
    queryKey: [...stockKeys.movementsByStock(stockId ?? ''), params] as const,
    queryFn: () => stockService.getMovementsByStock(stockId!, params),
    enabled: !!stockId,
    staleTime: 30 * 1000,
    ...options,
  });
}

/**
 * Hook to fetch movements for a specific product
 */
export function useStockMovementsByProduct(
  productId: string | undefined,
  params: Pick<MovementListParams, 'branch' | 'page' | 'limit'> = {},
  options?: Partial<UseQueryOptions<PaginatedResponse<StockMovement>, Error>>
) {
  return useQuery<PaginatedResponse<StockMovement>, Error>({
    queryKey: [...stockKeys.movementsByProduct(productId ?? ''), params] as const,
    queryFn: () => stockService.getMovementsByProduct(productId!, params),
    enabled: !!productId,
    staleTime: 30 * 1000,
    ...options,
  });
}

/**
 * Hook to fetch movements for a specific branch
 */
export function useStockMovementsByBranch(
  branchId: string | undefined,
  params: Pick<MovementListParams, 'type' | 'startDate' | 'endDate' | 'page' | 'limit'> = {},
  options?: Partial<UseQueryOptions<PaginatedResponse<StockMovement>, Error>>
) {
  return useQuery<PaginatedResponse<StockMovement>, Error>({
    queryKey: [...stockKeys.movementsByBranch(branchId ?? ''), params] as const,
    queryFn: () => stockService.getMovementsByBranch(branchId!, params),
    enabled: !!branchId,
    staleTime: 30 * 1000,
    ...options,
  });
}
