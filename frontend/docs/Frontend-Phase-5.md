# Frontend Phase 5: Sales Order Management (Primary Revenue)

**Aligned with Backend:** Phase 5 (Sales Order Management)  
**Complexity:** High  
**Priority:** Critical (Primary Revenue Stream)  
**Estimated Effort:** 5-7 days  
**Dependencies:** Phase 1-4 (Auth, Branches, Products, Stock)

---

## Overview

Phase 5 implements the primary revenue stream: sales order management. Features include order creation with automatic stock reservation, status transitions (pending → processing → completed), payment tracking, invoice generation, and branch-restricted access for salespersons. Completed and paid orders automatically deduct stock and create transaction records.

**Core Features:**
- Sales order creation with customer info and line items
- Automatic stock reservation on order creation
- Order status management (pending, processing, completed, cancelled)
- Payment tracking (unpaid, partial, paid, overpaid)
- Payment updates with change calculation
- Invoice view/print
- Branch-restricted access (salespersons see own branch only)
- Order search and filtering
- Order stats dashboard

---

## Prerequisites

Before starting this phase:
- [x] Phases 1-4 complete (auth, branches, products, stock working)
- [ ] Review backend Phase 5 docs and `/sales` endpoints
- [ ] Understand stock reservation vs deduction flow
- [ ] Understand status transitions and validation rules

---

## Part A: UI/Pages Design (Build First)

### 1. Sales Order List Page (`app/(protected)/sales/page.tsx`)

**Layout:**
- Page header: "Sales Orders" title, "New Sale" button (admin/salesperson, yellow bg)
- Quick stats cards (4-column grid):
  - Total Orders (all time)
  - Pending Orders (count)
  - Today's Revenue (sum of paid orders)
  - This Month's Revenue
- Filter bar:
  - Search: Order ID, customer name, phone
  - Branch dropdown (admin sees all, salesperson sees own)
  - Status chips: "All", "Pending", "Processing", "Completed", "Cancelled"
  - Payment status chips: "All", "Unpaid", "Partial", "Paid"
  - Date range picker (start/end date)
- Order table:
  - Columns: Order ID, Customer, Branch, Items Count, Total Amount, Payment Status, Order Status, Date, Actions
  - Payment status badge: Unpaid (gray), Partial (yellow), Paid (black with white text), Overpaid (yellow with warning icon)
  - Order status badge: Pending (gray), Processing (yellow), Completed (black with white text), Cancelled (red text)
  - Actions: "View Details", "View Invoice"
- Pagination controls

**Responsive Design:**
- Mobile: Card view, show key info only
- Desktop: Full table

**Empty State:**
- No orders: "No sales orders found. Create your first sale."

**Component Structure:**
```typescript
// app/(protected)/sales/page.tsx
- SalesOrdersPage
  - PageHeader
    - Title
    - NewSaleButton
  - StatsCards
    - StatCard (Total Orders)
    - StatCard (Pending)
    - StatCard (Today's Revenue)
    - StatCard (Month Revenue)
  - FilterBar
    - SearchBar
    - BranchDropdown
    - StatusChips (order status)
    - PaymentStatusChips
    - DateRangePicker
  - OrderTable
    - OrderRow[]
      - OrderInfo (ID, customer, branch)
      - ItemsCount
      - TotalAmount
      - PaymentStatusBadge
      - OrderStatusBadge
      - Date
      - ActionButtons
  - Pagination
```

---

### 2. Order Details Page (`app/(protected)/sales/[id]/page.tsx`)

**Layout:**
- Back button (top-left)
- Order header:
  - Order ID (large, bold)
  - Order status badge
  - Payment status badge
  - Created date
- Action buttons (admin/salesperson own branch):
  - "Update Status" (opens status update modal)
  - "Update Payment" (opens payment modal)
  - "View Invoice" (opens invoice in new tab or modal)
  - "Cancel Order" (admin only, confirmation required)
- Customer Information Card:
  - Name, Phone, Email (if available)
  - Address (if available)
- Order Items Table:
  - Columns: Product, SKU, Quantity, Unit Price, Discount, Subtotal
  - Summary row: Items subtotal
- Order Summary Card:
  - Items Subtotal
  - Tax (if applicable)
  - Discount (if applicable)
  - **Total Amount** (bold, large)
  - Amount Paid
  - **Balance Due** (or "Change" if overpaid)
  - Payment Method
- Order Timeline (optional for MVP, placeholder):
  - Status changes with timestamps
  - Payment updates with timestamps

**Responsive Design:**
- Mobile: Stacked cards
- Desktop: 2-column layout (info left, summary right)

**Component Structure:**
```typescript
// app/(protected)/sales/[id]/page.tsx
- OrderDetailPage
  - BackButton
  - OrderHeader
    - OrderID, StatusBadges, Date
    - ActionButtons
  - CustomerInfoCard
  - OrderItemsTable
    - ItemRow[]
    - SummaryRow
  - OrderSummaryCard
    - Subtotal, Tax, Discount, Total
    - AmountPaid, BalanceDue
    - PaymentMethod
  - OrderTimeline (optional)
```

---

### 3. New Sale Form Page (`app/(protected)/sales/new/page.tsx`)

**Layout:**
- Page header: "New Sale"
- Form (multi-section, full-width):
  - **Branch Selection:** Dropdown (admin selects, salesperson sees own, read-only)
  - **Customer Information:**
    - Name (required)
    - Phone (required)
    - Email (optional)
    - Address (optional)
  - **Order Items:**
    - Product search/select (autocomplete dropdown with SKU/name)
    - Quantity input (positive integer, <= available stock)
    - Unit Price (pre-filled from stock.sellingPrice, editable)
    - Discount input (optional, percentage or amount)
    - Subtotal (calculated, display-only)
    - "Add Item" button to add more rows
    - "Remove" icon per row
  - **Order Summary Section (sticky on desktop):**
    - Items Subtotal (calculated)
    - Tax Rate input (optional, percentage, default 0)
    - Discount input (optional, amount)
    - **Total Amount** (calculated, bold, large)
    - **Payment Method:** Dropdown (Cash, Card, Bank Transfer, Other)
    - **Amount Paid:** Number input (required, positive)
    - **Change Due:** Calculated (if amount paid > total)
    - Notes textarea (optional)
- Action buttons (bottom-right):
  - "Cancel" (black bg, white text)
  - "Create Sale" (yellow bg, black text, disabled until valid)

**Validation:**
- Branch: Required
- Customer name/phone: Required
- At least one order item
- Quantity: Positive integer, <= available stock
- Amount paid: Required, positive (can be 0 for unpaid orders)

**Real-time Calculations:**
- Unit price × quantity - discount = item subtotal
- Sum of item subtotals = items subtotal
- Items subtotal + tax - discount = total amount
- Amount paid - total amount = change (if positive) or balance due (if negative)

**Responsive Design:**
- Mobile: Stacked sections, summary at bottom
- Desktop: 2-column (items left, summary right sticky)

**Component Structure:**
```typescript
// app/(protected)/sales/new/page.tsx
- NewSalePage
  - PageHeader
  - Form
    - BranchSelect
    - CustomerInfoSection
      - Input (name)
      - Input (phone)
      - Input (email)
      - Textarea (address)
    - OrderItemsSection
      - ItemRow[]
        - ProductSelect (searchable)
        - Input (quantity)
        - Input (unitPrice)
        - Input (discount)
        - Display (subtotal)
        - RemoveButton
      - AddItemButton
    - OrderSummarySection (sticky)
      - Display (items subtotal)
      - Input (taxRate)
      - Input (discount)
      - Display (total amount, bold)
      - Select (paymentMethod)
      - Input (amountPaid)
      - Display (change/balance)
      - Textarea (notes)
    - FormActions
      - CancelButton
      - CreateSaleButton
```

---

### 4. Update Order Status Modal (`components/sales/UpdateStatusModal.tsx`)

**Layout:**
- Modal overlay, centered card (max-w-md)
- Modal header: "Update Order Status"
- Current status display (read-only)
- New status dropdown (only valid transitions):
  - Pending → Processing
  - Pending → Cancelled
  - Processing → Completed
  - Processing → Cancelled
- Confirmation message: "Change status from [current] to [new]?"
- Action buttons: "Cancel", "Update Status" (yellow bg)

**Validation:**
- New status must be a valid transition (backend enforces)
- Cannot change status of cancelled orders

**Component Structure:**
```typescript
// components/sales/UpdateStatusModal.tsx
- UpdateStatusModal
  - ModalOverlay
  - ModalCard
    - ModalHeader
    - CurrentStatusDisplay
    - NewStatusSelect (filtered for valid transitions)
    - ConfirmationMessage
    - FormActions
```

---

### 5. Update Payment Modal (`components/sales/UpdatePaymentModal.tsx`)

**Layout:**
- Modal overlay, centered card (max-w-md)
- Modal header: "Update Payment"
- Current payment info (read-only):
  - Total Amount
  - Amount Paid
  - Balance Due (or "Change" if overpaid)
- New payment fields:
  - Additional Amount Paid (number input, positive)
  - Payment Method (dropdown: Cash, Card, etc.)
- Calculated New Total Paid: Current + Additional
- Calculated New Balance/Change
- Action buttons: "Cancel", "Update Payment" (yellow bg)

**Validation:**
- Additional amount: Required, positive

**Component Structure:**
```typescript
// components/sales/UpdatePaymentModal.tsx
- UpdatePaymentModal
  - ModalOverlay
  - ModalCard
    - ModalHeader
    - CurrentPaymentInfo (read-only)
    - NewPaymentFields
      - Input (additionalAmount)
      - Select (paymentMethod)
    - CalculatedInfo (new total, new balance)
    - FormActions
```

---

### 6. Invoice View/Print (`app/(protected)/sales/[id]/invoice/page.tsx`)

**Layout:**
- Printable invoice format (white background, black text, no navigation)
- Invoice header:
  - Company logo/name (top-left)
  - "INVOICE" title (large, top-right)
  - Invoice number (Order ID)
  - Invoice date
- Branch Information:
  - Branch name, address, phone
- Customer Information:
  - Bill To: Customer name, phone, address
- Order Items Table:
  - Columns: Item Description, Quantity, Unit Price, Discount, Total
  - Items subtotal row
- Summary Section:
  - Subtotal
  - Tax
  - Discount
  - **Total Amount** (bold)
  - Amount Paid
  - Balance Due
- Payment Method
- Notes (if any)
- Footer: "Thank you for your business!"
- Print button (visible, hides on print)

**Responsive Design:**
- Optimized for print (A4 or Letter size)
- Responsive for screen view

**Component Structure:**
```typescript
// app/(protected)/sales/[id]/invoice/page.tsx
- InvoicePage (print-friendly)
  - InvoiceHeader
    - CompanyInfo
    - InvoiceTitle
    - InvoiceNumber, Date
  - BranchInfo
  - CustomerInfo
  - ItemsTable
    - ItemRow[]
    - SummaryRow
  - SummarySection
  - PaymentInfo
  - Notes
  - Footer
  - PrintButton (hides on print)
```

---

## Part B: Feature Implementation (Build After UI)

### 1. Sales Order Types (`features/sales/types.ts`)

**Implementation:**
```typescript
export interface SalesOrder {
  _id: string;
  orderNumber: string;
  branch: string | Branch;
  customer: {
    name: string;
    phone: string;
    email?: string;
    address?: string;
  };
  items: OrderItem[];
  summary: {
    subtotal: number;
    taxRate: number;
    taxAmount: number;
    discount: number;
    totalAmount: number;
  };
  payment: {
    method: 'cash' | 'card' | 'bank_transfer' | 'other';
    amountPaid: number;
    balanceDue: number;
    status: 'unpaid' | 'partial' | 'paid' | 'overpaid';
    paidAt?: string;
  };
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  notes?: string;
  createdBy: string | User;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  _id: string;
  product: string | Product;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  subtotal: number;
}

export interface CreateSalesOrderRequest {
  branch: string;
  customer: {
    name: string;
    phone: string;
    email?: string;
    address?: string;
  };
  items: Array<{
    product: string;
    quantity: number;
    discount?: number;
  }>;
  taxRate?: number;
  discount?: number;
  paymentMethod: 'cash' | 'card' | 'bank_transfer' | 'other';
  amountPaid?: number;
  notes?: string;
}

export interface UpdatePaymentRequest {
  amountPaid?: number;
  paymentMethod?: string;
}

export interface SalesOrderQuery {
  branch?: string;
  status?: string;
  paymentStatus?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}
```

**Checklist:**
- [ ] Create `types.ts` for sales orders
- [ ] Match backend SalesOrder model exactly

---

### 2. Sales Service (`features/sales/services/salesService.ts`)

**Implementation:**
```typescript
import apiClient from '@/lib/apiClient';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type { SalesOrder, CreateSalesOrderRequest, UpdatePaymentRequest, SalesOrderQuery } from '../types';

export const salesService = {
  async getAll(query: SalesOrderQuery = {}): Promise<PaginatedResponse<SalesOrder>> {
    const { data } = await apiClient.get<ApiResponse<SalesOrder[]>>('/sales', { params: query });
    return { data: data.data || [], pagination: data.pagination };
  },

  async getById(id: string): Promise<SalesOrder> {
    const { data } = await apiClient.get<ApiResponse<SalesOrder>>(`/sales/${id}`);
    if (!data.success || !data.data) throw new Error(data.message || 'Failed to fetch order');
    return data.data;
  },

  async create(orderData: CreateSalesOrderRequest): Promise<SalesOrder> {
    const { data } = await apiClient.post<ApiResponse<SalesOrder>>('/sales', orderData);
    if (!data.success || !data.data) throw new Error(data.message || 'Failed to create order');
    return data.data;
  },

  async updateStatus(id: string, status: string): Promise<SalesOrder> {
    const { data } = await apiClient.put<ApiResponse<SalesOrder>>(`/sales/${id}/status`, { status });
    if (!data.success || !data.data) throw new Error(data.message || 'Failed to update status');
    return data.data;
  },

  async updatePayment(id: string, paymentData: UpdatePaymentRequest): Promise<SalesOrder> {
    const { data } = await apiClient.put<ApiResponse<SalesOrder>>(`/sales/${id}/payment`, paymentData);
    if (!data.success || !data.data) throw new Error(data.message || 'Failed to update payment');
    return data.data;
  },

  async cancel(id: string): Promise<void> {
    const { data } = await apiClient.delete(`/sales/${id}`);
    if (!data.success) throw new Error(data.message || 'Failed to cancel order');
  },

  async getInvoice(id: string): Promise<any> {
    const { data } = await apiClient.get<ApiResponse<any>>(`/sales/${id}/invoice`);
    return data.data;
  },

  async getStats(): Promise<any> {
    const { data } = await apiClient.get<ApiResponse<any>>('/sales/stats');
    return data.data;
  },
};
```

**Checklist:**
- [ ] Create `salesService.ts` with all methods
- [ ] Handle errors consistently

---

### 3. Sales Hooks (`features/sales/hooks/useSales.ts`)

**Implementation:**
```typescript
import useSWR from 'swr';
import { salesService } from '../services/salesService';
import type { SalesOrderQuery } from '../types';

export const useSalesOrders = (query: SalesOrderQuery = {}) => {
  const { data, error, mutate } = useSWR(['/sales', query], () => salesService.getAll(query));
  return {
    orders: data?.data || [],
    pagination: data?.pagination,
    isLoading: !data && !error,
    error,
    refresh: mutate,
  };
};

export const useSalesOrder = (id: string) => {
  const { data, error, mutate } = useSWR(id ? `/sales/${id}` : null, () => salesService.getById(id));
  return {
    order: data,
    isLoading: !data && !error,
    error,
    refresh: mutate,
  };
};

export const useSalesStats = () => {
  const { data, error, mutate } = useSWR('/sales/stats', () => salesService.getStats());
  return {
    stats: data,
    isLoading: !data && !error,
    error,
    refresh: mutate,
  };
};
```

**Checklist:**
- [ ] Create hooks for sales orders with SWR

---

### 4. Connect UI to Services

**Sales Order List:**
```typescript
'use client';

import { useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useSalesOrders } from '@/features/sales/hooks/useSales';
import { useRouter } from 'next/navigation';
import OrderCard from '@/components/sales/OrderCard';

export default function SalesOrdersPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [filters, setFilters] = useState({
    branch: user?.role === 'salesperson' ? user.branch : undefined,
    status: undefined,
    paymentStatus: undefined,
  });

  const { orders, isLoading, error } = useSalesOrders(filters);

  const handleNewSale = () => {
    router.push('/sales/new');
  };

  return (
    <div>
      <div className="flex justify-between mb-6">
        <h1 className="text-2xl font-bold">Sales Orders</h1>
        {(user?.role === 'admin' || user?.role === 'salesperson') && (
          <button onClick={handleNewSale} className="px-4 py-2 bg-yellow-400 text-black rounded">
            New Sale
          </button>
        )}
      </div>

      {/* Filters and orders list */}
      {isLoading && <div>Loading orders...</div>}
      <div className="grid gap-4">
        {orders.map((order) => (
          <OrderCard key={order._id} order={order} />
        ))}
      </div>
    </div>
  );
}
```

**New Sale Form:**
- Implement form with react-hook-form and Zod validation
- Real-time calculations for subtotals, tax, total, change
- Product search with autocomplete
- Stock availability check on quantity input
- On submit: call `salesService.create()`, redirect to order details on success

**Checklist:**
- [ ] Connect sales list page to hooks
- [ ] Implement new sale form with calculations
- [ ] Connect order details page to hooks
- [ ] Implement status update modal
- [ ] Implement payment update modal
- [ ] Implement invoice view

---

## Part C: Validation & Security

### Zod Schemas

**Create Order Schema:**
```typescript
export const createOrderSchema = z.object({
  branch: z.string().min(1, 'Branch required'),
  customer: z.object({
    name: z.string().min(2, 'Customer name required'),
    phone: z.string().regex(/^\d{10}$/, 'Valid phone required'),
    email: z.string().email().optional().or(z.literal('')),
    address: z.string().optional(),
  }),
  items: z.array(z.object({
    product: z.string().min(1),
    quantity: z.number().int().positive(),
    discount: z.number().nonnegative().optional(),
  })).min(1, 'At least one item required'),
  taxRate: z.number().nonnegative().optional(),
  discount: z.number().nonnegative().optional(),
  paymentMethod: z.enum(['cash', 'card', 'bank_transfer', 'other']),
  amountPaid: z.number().nonnegative(),
  notes: z.string().optional(),
});
```

**Security Checklist:**
- [ ] Admin/salesperson only for create/update operations
- [ ] Salesperson restricted to own branch
- [ ] Validate quantity <= available stock (backend enforces)
- [ ] Validate status transitions (backend enforces)
- [ ] Sanitize customer input

---

## Part D: Testing & Validation

### Manual Testing Checklist

**Order Creation:**
- [ ] Create order with valid data: Success, order created, stock reserved
- [ ] Create order with quantity > available stock: Error message
- [ ] Create order with missing required fields: Validation errors
- [ ] Create order with payment: Payment status calculated correctly
- [ ] Create order without payment: Status "unpaid"

**Order Management:**
- [ ] View order details
- [ ] Update order status (pending → processing → completed)
- [ ] Cannot update completed order status
- [ ] Update payment (add payment, recalculate balance)
- [ ] Cancel order: Stock reservation released
- [ ] View invoice (print-friendly)

**Filtering:**
- [ ] Filter by branch (salesperson sees own only)
- [ ] Filter by status, payment status
- [ ] Filter by date range
- [ ] Search by order ID, customer name/phone

**Calculations:**
- [ ] Item subtotal = unit price × quantity - discount
- [ ] Total amount = items subtotal + tax - discount
- [ ] Balance due = total - amount paid
- [ ] Change = amount paid - total (if positive)

**Responsive Design:**
- [ ] Order list responsive
- [ ] New sale form responsive
- [ ] Invoice print-friendly

---

## Part E: Success Criteria

Phase 5 is complete when:
- [ ] Sales order list displays with filters
- [ ] New sale form works with calculations
- [ ] Order creation reserves stock
- [ ] Order status updates work (with transitions)
- [ ] Payment updates work
- [ ] Completed+paid orders deduct stock and create transaction
- [ ] Invoice view/print works
- [ ] Salespersons restricted to own branch
- [ ] All validation and authorization work
- [ ] All manual tests pass
- [ ] Responsive design works

---

## Part F: Next Steps

After completing Phase 5:
1. **Proceed to Phase 6:** Service Order Management

---

**End of Phase 5**
