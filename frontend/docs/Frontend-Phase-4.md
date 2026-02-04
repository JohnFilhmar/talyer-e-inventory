# Frontend Phase 4: Stock & Supplier Management

**Aligned with Backend:** Phase 4 (Stock & Supplier Management)  
**Complexity:** High  
**Priority:** Critical (Inventory Operations)  
**Estimated Effort:** 5-7 days  
**Dependencies:** Phase 1 (Auth), Phase 2 (Branches), Phase 3 (Products)

---

## Overview

Phase 4 implements stock management across branches, supplier management, stock transfers between branches, and low-stock alerts. This phase enables multi-branch inventory tracking, restocking, adjustments, and supplier relationships.

**Core Features:**
- Branch-specific stock levels with reorder points
- Stock restock and adjustment operations
- Stock transfers between branches (pending → in-transit → completed)
- Low-stock alerts and dashboard
- Supplier CRUD (create, view, edit, deactivate)
- Supplier payment terms and credit limits

---

## Prerequisites

Before starting this phase:
- [x] Phases 1-3 complete (auth, branches, products working)
- [ ] Review backend Phase 4 docs and `/stock`, `/suppliers` endpoints
- [ ] Understand stock reservation vs available quantity
- [ ] Understand transfer workflow (pending/in-transit/completed/cancelled)

---

## Part A: UI/Pages Design (Build First)

### 1. Stock Overview Page (`app/(protected)/stock/page.tsx`)

**Layout:**
- Page header: "Stock Overview" title
- Branch selector dropdown (admin sees all branches, salesperson sees own)
- Quick stats cards (4-column grid):
  - Total Items
  - Total Value (cost price * quantity sum)
  - Low Stock Items (quantity <= reorderPoint)
  - Out of Stock Items (quantity = 0)
- Filter bar:
  - Search: Product name or SKU
  - Filter chips: "All", "Low Stock", "Out of Stock"
- Stock table (responsive):
  - Columns: Product Name, SKU, Branch, Quantity, Reserved, Available, Reorder Point, Selling Price, Actions
  - Actions (admin/salesperson): "Restock", "Adjust", "Transfer"
- Pagination controls

**Responsive Design:**
- Mobile: Card view instead of table, show key info only
- Desktop: Full table with all columns

**Empty State:**
- No stock: "No stock records found. Restock your first product."

**Component Structure:**
```typescript
// app/(protected)/stock/page.tsx
- StockOverviewPage
  - PageHeader
    - Title
    - BranchSelector (admin only)
  - StatsCards
    - StatCard (Total Items)
    - StatCard (Total Value)
    - StatCard (Low Stock)
    - StatCard (Out of Stock)
  - FilterBar
    - SearchBar
    - FilterChips
  - StockTable
    - StockRow[]
      - ProductInfo (name, SKU, branch)
      - QuantityInfo (quantity, reserved, available)
      - ReorderPoint
      - SellingPrice
      - ActionButtons (Restock, Adjust, Transfer)
  - Pagination
```

---

### 2. Product Stock Details Page (`app/(protected)/stock/product/[id]/page.tsx`)

**Layout:**
- Back button (top-left)
- Product header: Name, SKU, primary image (thumbnail)
- Cross-branch stock summary (table):
  - Columns: Branch, Quantity, Reserved, Available, Selling Price, Reorder Point
  - Summary row: Total Quantity, Total Available
- Recent stock movements (timeline or list):
  - Type (restock, adjustment, transfer, sale, service)
  - Date/time
  - Quantity change (+/-)
  - From/To branch (if transfer)
  - Reason (if adjustment)

**Responsive Design:**
- Mobile: Stacked cards for each branch, collapse timeline
- Desktop: Full table, expanded timeline

**Component Structure:**
```typescript
// app/(protected)/stock/product/[id]/page.tsx
- ProductStockDetailsPage
  - BackButton
  - ProductHeader (name, SKU, image)
  - CrossBranchStockTable
    - BranchStockRow[]
    - SummaryRow
  - StockMovementsTimeline
    - MovementItem[]
```

---

### 3. Restock Modal (`components/stock/RestockModal.tsx`)

**Layout:**
- Modal overlay, centered card (max-w-md)
- Modal header: "Restock Product"
- Form fields:
  - **Product:** Display product name and SKU (read-only)
  - **Branch:** Dropdown (admin can select, salesperson sees own)
  - **Quantity:** Number input (required, positive integer)
  - **Cost Price:** Number input (required, positive)
  - **Selling Price:** Number input (required, >= cost price)
  - **Reorder Point:** Number input (optional, default 10)
  - **Reorder Quantity:** Number input (optional, default 20)
  - **Supplier:** Dropdown (optional, list of active suppliers)
  - **Location:** Text input (optional, warehouse location)
- Action buttons: "Cancel", "Restock" (yellow bg)

**Validation:**
- Quantity: Required, positive integer
- Cost/Selling Price: Required, positive, selling >= cost
- Reorder Point/Quantity: Optional, positive integers

**Component Structure:**
```typescript
// components/stock/RestockModal.tsx
- RestockModal
  - ModalOverlay
  - ModalCard
    - ModalHeader
    - Form
      - Display (product info)
      - Select (branch)
      - Input (quantity)
      - Input (costPrice)
      - Input (sellingPrice)
      - Input (reorderPoint)
      - Input (reorderQuantity)
      - Select (supplier)
      - Input (location)
      - FormActions
```

---

### 4. Adjust Stock Modal (`components/stock/AdjustStockModal.tsx`)

**Layout:**
- Modal overlay, centered card (max-w-md)
- Modal header: "Adjust Stock"
- Form fields:
  - **Product:** Display product name and SKU (read-only)
  - **Branch:** Display branch name (read-only)
  - **Current Quantity:** Display current quantity (read-only)
  - **Adjustment:** Number input (can be positive or negative, e.g., +10 or -5)
  - **Reason:** Dropdown (Damaged, Lost, Found, Inventory Count, Other)
  - **Notes:** Textarea (optional, additional context)
- Calculated New Quantity: Display current + adjustment
- Action buttons: "Cancel", "Adjust" (yellow bg, admin only)

**Validation:**
- Adjustment: Required, non-zero integer
- New quantity must be >= 0 (cannot adjust to negative)
- Reason: Required

**Component Structure:**
```typescript
// components/stock/AdjustStockModal.tsx
- AdjustStockModal
  - ModalOverlay
  - ModalCard
    - ModalHeader
    - Form
      - Display (product, branch, current quantity)
      - Input (adjustment, number with +/- prefix)
      - Select (reason)
      - Textarea (notes)
      - Display (calculated new quantity)
      - FormActions
```

---

### 5. Stock Transfer Page (`app/(protected)/stock/transfers/page.tsx`)

**Layout:**
- Page header: "Stock Transfers" title, "New Transfer" button (admin/branch manager, yellow bg)
- Filter bar:
  - Branch dropdown (filter by from/to branch)
  - Status chips: "All", "Pending", "In-Transit", "Completed", "Cancelled"
- Transfer table:
  - Columns: Transfer ID, Product, From Branch, To Branch, Quantity, Status, Requested Date, Actions
  - Status badge colors: Pending (gray), In-Transit (yellow), Completed (black with white text), Cancelled (red text)
  - Actions: "View Details", "Update Status" (admin/branch manager)
- Pagination controls

**Responsive Design:**
- Mobile: Card view, show key info only
- Desktop: Full table

**Component Structure:**
```typescript
// app/(protected)/stock/transfers/page.tsx
- StockTransfersPage
  - PageHeader
    - Title
    - NewTransferButton
  - FilterBar
    - BranchDropdown
    - StatusChips
  - TransferTable
    - TransferRow[]
      - TransferInfo (ID, product, branches)
      - Quantity
      - StatusBadge
      - RequestedDate
      - ActionButtons
  - Pagination
```

---

### 6. New Transfer Modal (`components/stock/NewTransferModal.tsx`)

**Layout:**
- Modal overlay, centered card (max-w-md)
- Modal header: "New Stock Transfer"
- Form fields:
  - **Product:** Dropdown (searchable, show SKU)
  - **From Branch:** Dropdown (only branches with stock for selected product)
  - **To Branch:** Dropdown (exclude from branch)
  - **Available Quantity:** Display available stock in from branch (read-only)
  - **Transfer Quantity:** Number input (required, positive, <= available)
  - **Notes:** Textarea (optional)
- Action buttons: "Cancel", "Create Transfer" (yellow bg)

**Validation:**
- Product, From Branch, To Branch: Required
- Transfer Quantity: Required, positive, <= available quantity in from branch

**Component Structure:**
```typescript
// components/stock/NewTransferModal.tsx
- NewTransferModal
  - ModalOverlay
  - ModalCard
    - ModalHeader
    - Form
      - Select (product, searchable)
      - Select (fromBranch)
      - Select (toBranch)
      - Display (available quantity)
      - Input (quantity)
      - Textarea (notes)
      - FormActions
```

---

### 7. Transfer Details Modal (`components/stock/TransferDetailsModal.tsx`)

**Layout:**
- Modal overlay, centered card (max-w-lg)
- Modal header: "Transfer Details"
- Transfer information (read-only):
  - Transfer ID
  - Product (name, SKU)
  - From Branch, To Branch
  - Quantity
  - Status (badge)
  - Requested Date
  - Updated Date
  - Notes (if any)
- Status update section (admin/branch manager only):
  - Current status display
  - Status dropdown: Next valid status only (e.g., pending → in-transit, in-transit → completed)
  - "Update Status" button (yellow bg)
- Close button

**Status Transitions (backend enforces):**
- Pending → In-Transit
- In-Transit → Completed
- Pending/In-Transit → Cancelled

**Component Structure:**
```typescript
// components/stock/TransferDetailsModal.tsx
- TransferDetailsModal
  - ModalOverlay
  - ModalCard
    - ModalHeader
    - TransferInfo (read-only fields)
    - StatusUpdateSection (admin/manager only)
      - CurrentStatusDisplay
      - StatusSelect (next valid status)
      - UpdateButton
    - CloseButton
```

---

### 8. Low Stock Alert Page (`app/(protected)/stock/low-stock/page.tsx`)

**Layout:**
- Page header: "Low Stock Alerts" title
- Alert message: "These products are at or below their reorder point."
- Low stock table:
  - Columns: Product, Branch, Current Quantity, Reorder Point, Reorder Quantity (suggestion), Action
  - Action: "Restock" button (opens restock modal with pre-filled reorder quantity)
- Pagination controls

**Responsive Design:**
- Mobile: Card view with prominent "Restock" button
- Desktop: Full table

**Component Structure:**
```typescript
// app/(protected)/stock/low-stock/page.tsx
- LowStockAlertsPage
  - PageHeader
    - Title
    - AlertMessage
  - LowStockTable
    - LowStockRow[]
      - ProductInfo
      - BranchInfo
      - QuantityInfo (current, reorder point, reorder qty)
      - RestockButton
  - Pagination
```

---

### 9. Supplier List Page (`app/(protected)/suppliers/page.tsx`)

**Layout:**
- Page header: "Suppliers" title, "Add Supplier" button (admin only, yellow bg)
- Search bar: Text input for searching by name or code
- Filter chips: "All", "Active", "Inactive"
- Supplier cards grid (3 columns on desktop, 2 on tablet, 1 on mobile):
  - Supplier name (bold)
  - Supplier code (gray text)
  - Contact phone and email
  - Payment terms (e.g., "Net 30")
  - Credit limit (if set)
  - Active status badge
  - Admin actions: "View Details", "Edit", "Deactivate"
- Pagination controls

**Responsive Design:**
- Mobile: Stacked cards
- Desktop: 3-column grid

**Empty State:**
- No suppliers: "No suppliers found. Add your first supplier."

**Component Structure:**
```typescript
// app/(protected)/suppliers/page.tsx
- SuppliersPage
  - PageHeader
    - Title
    - AddSupplierButton (admin only)
  - SearchBar
  - FilterChips
  - SupplierGrid
    - SupplierCard[]
      - SupplierInfo (name, code)
      - ContactInfo
      - PaymentTerms
      - CreditLimit
      - StatusBadge
      - ActionButtons
  - Pagination
```

---

### 10. Supplier Details Page (`app/(protected)/suppliers/[id]/page.tsx`)

**Layout:**
- Back button (top-left)
- Supplier header: Name, code, status badge
- Action buttons (admin only): "Edit Supplier", "Deactivate/Activate"
- Information card:
  - Contact Information: Phone, email
  - Address: Full address (if available)
  - Payment Terms: Terms description
  - Credit Limit: Amount
  - Notes: Additional notes
- Recent orders/restocks (list):
  - Product name
  - Quantity restocked
  - Date
  - Branch

**Responsive Design:**
- Mobile: Stacked sections
- Desktop: 2-column layout (info left, recent orders right)

**Component Structure:**
```typescript
// app/(protected)/suppliers/[id]/page.tsx
- SupplierDetailPage
  - BackButton
  - SupplierHeader
    - Name, Code, StatusBadge
    - ActionButtons (Edit, Deactivate — admin)
  - InfoCard
    - ContactSection
    - AddressSection
    - PaymentTermsSection
    - CreditLimitSection
    - NotesSection
  - RecentOrdersList
    - OrderItem[]
```

---

### 11. Add/Edit Supplier Form Modal (`components/suppliers/SupplierFormModal.tsx`)

**Layout:**
- Modal overlay, centered card (max-w-2xl)
- Modal header: "Add Supplier" or "Edit Supplier"
- Form fields (2-column on desktop):
  - **Name:** Text input (required)
  - **Code:** Text input (optional, auto-generated or manual)
  - **Phone:** Text input (required)
  - **Email:** Text input (optional)
  - **Address:** Textarea (optional)
  - **Payment Terms:** Text input (e.g., "Net 30", "COD", optional)
  - **Credit Limit:** Number input (optional, positive)
  - **Notes:** Textarea (optional)
  - **Status:** Toggle switch (Active/Inactive, default Active)
- Action buttons: "Cancel", "Save Supplier" (yellow bg)

**Validation:**
- Name: Required, 2-100 characters
- Phone: Required, valid phone format
- Email: Optional, valid email format
- Credit Limit: Optional, positive number

**Component Structure:**
```typescript
// components/suppliers/SupplierFormModal.tsx
- SupplierFormModal
  - ModalOverlay
  - ModalCard
    - ModalHeader
    - Form
      - Input (name)
      - Input (code)
      - Input (phone)
      - Input (email)
      - Textarea (address)
      - Input (paymentTerms)
      - Input (creditLimit)
      - Textarea (notes)
      - Toggle (status)
      - FormActions
```

---

## Part B: Feature Implementation (Build After UI)

### 1. Stock & Supplier Types

**Stock Types (`features/stock/types.ts`):**
```typescript
export interface Stock {
  _id: string;
  product: string | Product;
  branch: string | Branch;
  quantity: number;
  reserved: number;
  available: number; // quantity - reserved
  costPrice: number;
  sellingPrice: number;
  reorderPoint: number;
  reorderQuantity: number;
  supplier?: string | Supplier;
  location?: string;
  lastRestocked?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StockTransfer {
  _id: string;
  product: string | Product;
  fromBranch: string | Branch;
  toBranch: string | Branch;
  quantity: number;
  status: 'pending' | 'in-transit' | 'completed' | 'cancelled';
  requestedBy: string | User;
  requestedAt: string;
  completedAt?: string;
  notes?: string;
}

export interface RestockRequest {
  product: string;
  branch: string;
  quantity: number;
  costPrice: number;
  sellingPrice: number;
  reorderPoint?: number;
  reorderQuantity?: number;
  supplier?: string;
  location?: string;
}

export interface AdjustStockRequest {
  product: string;
  branch: string;
  adjustment: number; // Can be positive or negative
  reason: string;
  notes?: string;
}

export interface CreateTransferRequest {
  product: string;
  fromBranch: string;
  toBranch: string;
  quantity: number;
  notes?: string;
}
```

**Supplier Types (`features/suppliers/types.ts`):**
```typescript
export interface Supplier {
  _id: string;
  name: string;
  code?: string;
  contact: {
    phone: string;
    email?: string;
    address?: string;
  };
  paymentTerms?: string;
  creditLimit?: number;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSupplierRequest {
  name: string;
  code?: string;
  contact: {
    phone: string;
    email?: string;
    address?: string;
  };
  paymentTerms?: string;
  creditLimit?: number;
  notes?: string;
}
```

**Checklist:**
- [ ] Create types for Stock, StockTransfer, Supplier
- [ ] Define request types for restock, adjust, transfer

---

### 2. Stock Service (`features/stock/services/stockService.ts`)

**Implementation:**
```typescript
import apiClient from '@/lib/apiClient';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type { Stock, StockTransfer, RestockRequest, AdjustStockRequest, CreateTransferRequest } from '../types';

export const stockService = {
  async getAll(query: any = {}): Promise<PaginatedResponse<Stock>> {
    const { data } = await apiClient.get<ApiResponse<Stock[]>>('/stock', { params: query });
    return { data: data.data || [], pagination: data.pagination };
  },

  async getByBranch(branchId: string): Promise<Stock[]> {
    const { data } = await apiClient.get<ApiResponse<Stock[]>>(`/stock/branch/${branchId}`);
    return data.data || [];
  },

  async getByProduct(productId: string): Promise<any> {
    const { data } = await apiClient.get<ApiResponse<any>>(`/stock/product/${productId}`);
    return data.data;
  },

  async getLowStock(): Promise<Stock[]> {
    const { data } = await apiClient.get<ApiResponse<Stock[]>>('/stock/low-stock');
    return data.data || [];
  },

  async restock(restockData: RestockRequest): Promise<Stock> {
    const { data } = await apiClient.post<ApiResponse<Stock>>('/stock/restock', restockData);
    if (!data.success || !data.data) throw new Error(data.message || 'Failed to restock');
    return data.data;
  },

  async adjust(adjustData: AdjustStockRequest): Promise<Stock> {
    const { data } = await apiClient.post<ApiResponse<Stock>>('/stock/adjust', adjustData);
    if (!data.success || !data.data) throw new Error(data.message || 'Failed to adjust stock');
    return data.data;
  },

  async createTransfer(transferData: CreateTransferRequest): Promise<StockTransfer> {
    const { data } = await apiClient.post<ApiResponse<StockTransfer>>('/stock/transfers', transferData);
    if (!data.success || !data.data) throw new Error(data.message || 'Failed to create transfer');
    return data.data;
  },

  async updateTransferStatus(transferId: string, status: string): Promise<StockTransfer> {
    const { data } = await apiClient.put<ApiResponse<StockTransfer>>(`/stock/transfers/${transferId}`, { status });
    if (!data.success || !data.data) throw new Error(data.message || 'Failed to update transfer');
    return data.data;
  },

  async getTransfers(query: any = {}): Promise<PaginatedResponse<StockTransfer>> {
    const { data } = await apiClient.get<ApiResponse<StockTransfer[]>>('/stock/transfers', { params: query });
    return { data: data.data || [], pagination: data.pagination };
  },

  async getTransferById(transferId: string): Promise<StockTransfer> {
    const { data } = await apiClient.get<ApiResponse<StockTransfer>>(`/stock/transfers/${transferId}`);
    if (!data.success || !data.data) throw new Error(data.message || 'Failed to fetch transfer');
    return data.data;
  },
};
```

**Checklist:**
- [ ] Create `stockService.ts` with all methods
- [ ] Handle errors consistently

---

### 3. Supplier Service (`features/suppliers/services/supplierService.ts`)

**Implementation:**
```typescript
import apiClient from '@/lib/apiClient';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type { Supplier, CreateSupplierRequest } from '../types';

export const supplierService = {
  async getAll(query: any = {}): Promise<PaginatedResponse<Supplier>> {
    const { data } = await apiClient.get<ApiResponse<Supplier[]>>('/suppliers', { params: query });
    return { data: data.data || [], pagination: data.pagination };
  },

  async getById(id: string): Promise<Supplier> {
    const { data } = await apiClient.get<ApiResponse<Supplier>>(`/suppliers/${id}`);
    if (!data.success || !data.data) throw new Error(data.message || 'Failed to fetch supplier');
    return data.data;
  },

  async create(supplierData: CreateSupplierRequest): Promise<Supplier> {
    const { data } = await apiClient.post<ApiResponse<Supplier>>('/suppliers', supplierData);
    if (!data.success || !data.data) throw new Error(data.message || 'Failed to create supplier');
    return data.data;
  },

  async update(id: string, supplierData: Partial<CreateSupplierRequest>): Promise<Supplier> {
    const { data } = await apiClient.put<ApiResponse<Supplier>>(`/suppliers/${id}`, supplierData);
    if (!data.success || !data.data) throw new Error(data.message || 'Failed to update supplier');
    return data.data;
  },

  async deactivate(id: string): Promise<void> {
    const { data } = await apiClient.delete(`/suppliers/${id}`);
    if (!data.success) throw new Error(data.message || 'Failed to deactivate supplier');
  },
};
```

**Checklist:**
- [ ] Create `supplierService.ts` with CRUD operations

---

### 4. Hooks

**Stock Hooks (`features/stock/hooks/useStock.ts`):**
```typescript
import useSWR from 'swr';
import { stockService } from '../services/stockService';

export const useStock = (query: any = {}) => {
  const { data, error, mutate } = useSWR(['/stock', query], () => stockService.getAll(query));
  return { stock: data?.data || [], pagination: data?.pagination, isLoading: !data && !error, error, refresh: mutate };
};

export const useLowStock = () => {
  const { data, error, mutate } = useSWR('/stock/low-stock', () => stockService.getLowStock());
  return { lowStock: data || [], isLoading: !data && !error, error, refresh: mutate };
};

export const useStockTransfers = (query: any = {}) => {
  const { data, error, mutate } = useSWR(['/stock/transfers', query], () => stockService.getTransfers(query));
  return { transfers: data?.data || [], pagination: data?.pagination, isLoading: !data && !error, error, refresh: mutate };
};
```

**Supplier Hooks (`features/suppliers/hooks/useSuppliers.ts`):**
```typescript
import useSWR from 'swr';
import { supplierService } from '../services/supplierService';

export const useSuppliers = (query: any = {}) => {
  const { data, error, mutate } = useSWR(['/suppliers', query], () => supplierService.getAll(query));
  return { suppliers: data?.data || [], pagination: data?.pagination, isLoading: !data && !error, error, refresh: mutate };
};

export const useSupplier = (id: string) => {
  const { data, error, mutate } = useSWR(id ? `/suppliers/${id}` : null, () => supplierService.getById(id));
  return { supplier: data, isLoading: !data && !error, error, refresh: mutate };
};
```

**Checklist:**
- [ ] Create hooks for stock and suppliers with SWR

---

### 5. Connect UI to Services

**Checklist:**
- [ ] Connect stock overview page to `useStock` hook
- [ ] Implement restock modal with `stockService.restock()`
- [ ] Implement adjust modal with `stockService.adjust()`
- [ ] Connect transfer page to `useStockTransfers` hook
- [ ] Implement new transfer modal with `stockService.createTransfer()`
- [ ] Implement transfer status update with `stockService.updateTransferStatus()`
- [ ] Connect supplier pages to hooks
- [ ] Implement supplier form modal

---

## Part C: Validation & Security

### Zod Schemas

**Restock Schema:**
```typescript
export const restockSchema = z.object({
  quantity: z.number().int().positive(),
  costPrice: z.number().positive(),
  sellingPrice: z.number().positive(),
  reorderPoint: z.number().int().nonnegative().optional(),
  reorderQuantity: z.number().int().positive().optional(),
}).refine(data => data.sellingPrice >= data.costPrice, {
  message: 'Selling price must be >= cost price',
  path: ['sellingPrice'],
});
```

**Adjust Schema:**
```typescript
export const adjustSchema = z.object({
  adjustment: z.number().int().refine(val => val !== 0, 'Adjustment cannot be zero'),
  reason: z.string().min(1, 'Reason required'),
  notes: z.string().optional(),
});
```

**Transfer Schema:**
```typescript
export const transferSchema = z.object({
  product: z.string().min(1),
  fromBranch: z.string().min(1),
  toBranch: z.string().min(1),
  quantity: z.number().int().positive(),
  notes: z.string().optional(),
}).refine(data => data.fromBranch !== data.toBranch, {
  message: 'From and To branches must be different',
  path: ['toBranch'],
});
```

**Security Checklist:**
- [ ] Admin/salesperson only for restock/adjust/transfer
- [ ] Salesperson restricted to own branch
- [ ] Validate adjustment does not result in negative stock
- [ ] Validate transfer quantity <= available quantity

---

## Part D: Testing & Validation

### Manual Testing Checklist

**Stock Management:**
- [ ] View stock overview with branch filter
- [ ] View low-stock alerts
- [ ] Restock product (creates or updates stock record)
- [ ] Adjust stock (positive and negative adjustments)
- [ ] View product stock details (cross-branch)
- [ ] Transfer stock between branches
- [ ] Update transfer status (pending → in-transit → completed)
- [ ] Cancel transfer

**Supplier Management:**
- [ ] View supplier list with search/filter
- [ ] View supplier details
- [ ] Create supplier
- [ ] Edit supplier
- [ ] Deactivate supplier

**Responsive Design:**
- [ ] Stock table responsive on mobile
- [ ] Forms work on mobile

---

## Part E: Success Criteria

Phase 4 is complete when:
- [ ] Stock overview displays with branch filter
- [ ] Low-stock alerts work
- [ ] Restock, adjust, transfer operations work
- [ ] Transfer workflow (pending/in-transit/completed) works
- [ ] Supplier CRUD works
- [ ] All validation and authorization work
- [ ] All manual tests pass
- [ ] Responsive design works

---

## Part F: Next Steps

After completing Phase 4:
1. **Proceed to Phase 5:** Sales Order Management

---

**End of Phase 4**
