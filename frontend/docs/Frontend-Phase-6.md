# Frontend Phase 6: Service Order Management (Secondary Revenue)

**Aligned with Backend:** Phase 6 (Service Order Management)  
**Complexity:** High  
**Priority:** High (Secondary Revenue Stream)  
**Estimated Effort:** 5-7 days  
**Dependencies:** Phase 1-5 (Auth, Branches, Products, Stock, Sales)

---

## Overview

Phase 6 implements the secondary revenue stream: service order management for vehicle repairs and maintenance. Features include job creation, mechanic assignment, parts tracking with stock deduction, status transitions, payment tracking, invoice generation, and mechanic-specific access to assigned jobs only.

**Core Features:**
- Service order creation with vehicle and customer info
- Mechanic assignment (auto-status to "scheduled" if assigned)
- Job status management (scheduled, in-progress, waiting-parts, completed, cancelled)
- Parts used tracking with automatic stock deduction on completion
- Labor cost and other charges
- Payment tracking (unpaid, partial, paid, overpaid)
- Invoice view/print
- Mechanics see only assigned jobs ("My Jobs" view)
- Priority levels (low, medium, high, urgent)

---

## Prerequisites

Before starting this phase:
- [x] Phases 1-5 complete (auth, branches, products, stock, sales working)
- [ ] Review backend Phase 6 docs and `/api/services` endpoints
- [ ] Understand service status transitions and mechanic access rules
- [ ] Understand parts deduction on completion

---

## Part A: UI/Pages Design (Build First)

### 1. Service Order List Page (`app/(protected)/services/page.tsx`)

**Layout:**
- Page header: "Service Orders" title, "New Service" button (admin/salesperson, yellow bg)
- Quick stats cards (4-column grid):
  - Total Jobs (all time)
  - In-Progress Jobs (count)
  - Scheduled Jobs (count)
  - Today's Revenue (sum of paid jobs)
- Filter bar:
  - Search: Job number, customer name/phone, plate number
  - Branch dropdown (admin sees all, salesperson sees own, mechanic sees assigned to own)
  - Status chips: "All", "Scheduled", "In-Progress", "Waiting Parts", "Completed", "Cancelled"
  - Priority chips: "All", "Low", "Medium", "High", "Urgent"
  - Assigned mechanic dropdown (admin/salesperson view)
  - Date range picker (scheduled or completed date)
- Order table:
  - Columns: Job Number, Customer, Vehicle (plate number), Assigned To, Priority, Status, Total Amount, Payment Status, Scheduled Date, Actions
  - Priority badge: Low (gray), Medium (yellow text), High (black bg, white text), Urgent (red text)
  - Status badge: Scheduled (gray), In-Progress (yellow), Waiting Parts (yellow with icon), Completed (black bg, white text), Cancelled (red text)
  - Payment status badge: Same as sales orders
  - Actions: "View Details", "View Invoice"
- Pagination controls

**Responsive Design:**
- Mobile: Card view, show key info only
- Desktop: Full table

**Empty State:**
- No jobs: "No service orders found. Create your first service job."

**Component Structure:**
```typescript
// app/(protected)/services/page.tsx
- ServiceOrdersPage
  - PageHeader
    - Title
    - NewServiceButton
  - StatsCards
    - StatCard (Total Jobs)
    - StatCard (In-Progress)
    - StatCard (Scheduled)
    - StatCard (Today's Revenue)
  - FilterBar
    - SearchBar
    - BranchDropdown
    - StatusChips
    - PriorityChips
    - MechanicDropdown
    - DateRangePicker
  - OrderTable
    - OrderRow[]
      - JobInfo (number, customer, vehicle)
      - AssignedMechanic
      - PriorityBadge
      - StatusBadge
      - TotalAmount
      - PaymentStatusBadge
      - ScheduledDate
      - ActionButtons
  - Pagination
```

---

### 2. My Jobs Page (`app/(protected)/services/my-jobs/page.tsx`) — Mechanic Only

**Layout:**
- Page header: "My Jobs"
- Quick stats cards (3-column):
  - Assigned to Me (total count)
  - In-Progress (count)
  - Completed This Week (count)
- Filter bar:
  - Status chips: "All", "Scheduled", "In-Progress", "Waiting Parts", "Completed"
  - Priority chips: "All", "Low", "Medium", "High", "Urgent"
- Job cards grid (similar to service list but card-based):
  - Job number, customer, vehicle
  - Priority badge
  - Status badge
  - Scheduled date
  - "View Details" button (yellow bg)

**Responsive Design:**
- Mobile: Stacked cards
- Desktop: 3-column grid

**Component Structure:**
```typescript
// app/(protected)/services/my-jobs/page.tsx
- MyJobsPage (mechanic only)
  - PageHeader
    - Title
  - StatsCards
  - FilterBar
    - StatusChips
    - PriorityChips
  - JobCardsGrid
    - JobCard[]
```

---

### 3. Service Order Details Page (`app/(protected)/services/[id]/page.tsx`)

**Layout:**
- Back button (top-left)
- Job header:
  - Job Number (large, bold)
  - Priority badge
  - Status badge
  - Payment status badge
  - Scheduled date
- Action buttons (conditional on role and status):
  - **Admin/Manager:** "Assign Mechanic", "Update Status", "Update Parts", "Update Payment", "Cancel Job"
  - **Mechanic (if assigned):** "Update Status", "Update Parts"
  - **All:** "View Invoice"
- Customer Information Card:
  - Name, Phone, Email (if available)
  - Address (if available)
- Vehicle Information Card:
  - Plate Number
  - Make/Model (if available from vehicle object)
  - Description (issues/symptoms from order)
- Assigned Mechanic Card:
  - Mechanic name (if assigned)
  - "Assign Mechanic" button (admin/manager)
- Parts Used Table (if any):
  - Columns: Part Name, SKU, Quantity, Unit Price, Subtotal
  - "Add Parts" button (admin/mechanic assigned)
  - Total Parts Cost (calculated)
- Service Charges Card:
  - Labor Cost (editable for admin/assigned mechanic)
  - Other Charges (editable, itemized or single amount)
  - Total Parts Cost (from parts table)
  - **Total Amount** (bold, large)
- Payment Information Card:
  - Total Amount
  - Amount Paid
  - Balance Due (or "Change")
  - Payment Method
  - "Update Payment" button
- Diagnosis/Notes Section:
  - Diagnosis text (if available)
  - Notes text (if available)

**Responsive Design:**
- Mobile: Stacked cards
- Desktop: 2-column layout (info left, summary right)

**Component Structure:**
```typescript
// app/(protected)/services/[id]/page.tsx
- ServiceOrderDetailPage
  - BackButton
  - JobHeader
    - JobNumber, Badges, ScheduledDate
    - ActionButtons (conditional)
  - CustomerInfoCard
  - VehicleInfoCard
  - AssignedMechanicCard
  - PartsUsedTable
    - PartRow[]
    - TotalRow
    - AddPartsButton
  - ServiceChargesCard
    - LaborCost
    - OtherCharges
    - TotalPartsCost
    - TotalAmount
  - PaymentInfoCard
  - DiagnosisNotesSection
```

---

### 4. New Service Form Page (`app/(protected)/services/new/page.tsx`)

**Layout:**
- Page header: "New Service Order"
- Form (multi-section):
  - **Branch Selection:** Dropdown (admin selects, salesperson sees own)
  - **Customer Information:**
    - Name (required)
    - Phone (required)
    - Email (optional)
    - Address (optional)
  - **Vehicle Information:**
    - Plate Number (required)
    - Make (optional)
    - Model (optional)
    - Year (optional)
  - **Service Details:**
    - Description (textarea, required, customer complaints/issues)
    - Diagnosis (textarea, optional, mechanic's assessment)
    - Priority (dropdown: Low, Medium, High, Urgent, default Medium)
    - Scheduled At (datetime input, optional)
  - **Assignment:**
    - Assigned Mechanic (dropdown, optional, list of mechanics in branch)
    - Note: If assigned, status auto-sets to "scheduled"; else "pending"
  - **Charges (Optional, can be updated later):**
    - Labor Cost (number input, optional)
    - Other Charges (number input, optional)
  - **Notes:** Textarea (optional, internal notes)
- Action buttons:
  - "Cancel" (black bg, white text)
  - "Create Service Order" (yellow bg, black text)

**Validation:**
- Branch: Required
- Customer name/phone: Required
- Plate number: Required
- Description: Required

**Responsive Design:**
- Mobile: Stacked sections
- Desktop: 2-column where appropriate

**Component Structure:**
```typescript
// app/(protected)/services/new/page.tsx
- NewServicePage
  - PageHeader
  - Form
    - BranchSelect
    - CustomerInfoSection
    - VehicleInfoSection
    - ServiceDetailsSection
      - Textarea (description)
      - Textarea (diagnosis)
      - Select (priority)
      - DatetimeInput (scheduledAt)
    - AssignmentSection
      - Select (assignedMechanic)
    - ChargesSection (optional)
      - Input (laborCost)
      - Input (otherCharges)
    - NotesSection
    - FormActions
```

---

### 5. Assign Mechanic Modal (`components/services/AssignMechanicModal.tsx`)

**Layout:**
- Modal overlay, centered card (max-w-md)
- Modal header: "Assign Mechanic"
- Current assignment display (if already assigned)
- Mechanic dropdown (list of mechanics in job's branch)
- Action buttons: "Cancel", "Assign" (yellow bg)

**Validation:**
- Mechanic: Required

**Component Structure:**
```typescript
// components/services/AssignMechanicModal.tsx
- AssignMechanicModal
  - ModalOverlay
  - ModalCard
    - ModalHeader
    - CurrentAssignmentDisplay (if any)
    - MechanicSelect
    - FormActions
```

---

### 6. Update Service Status Modal (`components/services/UpdateServiceStatusModal.tsx`)

**Layout:**
- Modal overlay, centered card (max-w-md)
- Modal header: "Update Job Status"
- Current status display (read-only)
- New status dropdown (only valid transitions):
  - Scheduled → In-Progress
  - Scheduled → Cancelled
  - In-Progress → Waiting Parts
  - In-Progress → Completed
  - In-Progress → Cancelled
  - Waiting Parts → In-Progress
  - Waiting Parts → Completed
- **Important:** On completion, parts are deducted from stock; cannot undo
- Confirmation message: "Change status from [current] to [new]?"
- Action buttons: "Cancel", "Update Status" (yellow bg)

**Validation:**
- New status must be a valid transition (backend enforces)

**Component Structure:**
```typescript
// components/services/UpdateServiceStatusModal.tsx
- UpdateServiceStatusModal
  - ModalOverlay
  - ModalCard
    - ModalHeader
    - CurrentStatusDisplay
    - NewStatusSelect (filtered)
    - WarningMessage (if completing)
    - ConfirmationMessage
    - FormActions
```

---

### 7. Update Parts Modal (`components/services/UpdatePartsModal.tsx`)

**Layout:**
- Modal overlay, centered card (max-w-lg)
- Modal header: "Update Parts Used"
- Current parts table (if any, read-only):
  - Part Name, SKU, Quantity, Unit Price
- Add new parts section:
  - Product select (searchable, show SKU and stock availability)
  - Quantity input (positive integer, <= available stock)
  - Unit Price input (pre-filled from stock.sellingPrice, editable)
  - "Add to List" button
  - Parts list (temporary, before submit):
    - Part Name, Quantity, Unit Price, Remove button
- Action buttons: "Cancel", "Update Parts" (yellow bg)

**Validation:**
- Product, quantity, unit price: Required
- Quantity <= available stock (backend validates)

**Component Structure:**
```typescript
// components/services/UpdatePartsModal.tsx
- UpdatePartsModal
  - ModalOverlay
  - ModalCard
    - ModalHeader
    - CurrentPartsTable (read-only)
    - AddPartsSection
      - ProductSelect (searchable)
      - Input (quantity)
      - Input (unitPrice)
      - AddToListButton
      - PartsListPreview
        - PartRow[]
          - PartInfo
          - RemoveButton
    - FormActions
```

---

### 8. Update Payment Modal (`components/services/UpdatePaymentModal.tsx`)

**Layout:**
- Same as sales order payment modal
- Current payment info (total, paid, balance)
- Additional amount input
- Payment method dropdown
- Calculated new totals

**Component Structure:**
```typescript
// components/services/UpdatePaymentModal.tsx
- UpdatePaymentModal (similar to sales)
  - ModalOverlay
  - ModalCard
    - ModalHeader
    - CurrentPaymentInfo
    - NewPaymentFields
    - CalculatedInfo
    - FormActions
```

---

### 9. Service Invoice View/Print (`app/(protected)/services/[id]/invoice/page.tsx`)

**Layout:**
- Similar to sales invoice
- Invoice header with job number
- Branch and customer info
- Vehicle info (plate number)
- Services Provided Table:
  - Description (job description)
  - Labor Cost
  - Other Charges
- Parts Used Table:
  - Part Name, Quantity, Unit Price, Total
- Summary:
  - Total Parts
  - Labor Cost
  - Other Charges
  - **Total Amount**
  - Amount Paid
  - Balance Due
- Payment method
- Footer
- Print button

**Responsive Design:**
- Print-friendly (A4/Letter size)

**Component Structure:**
```typescript
// app/(protected)/services/[id]/invoice/page.tsx
- ServiceInvoicePage
  - InvoiceHeader
  - BranchInfo
  - CustomerInfo
  - VehicleInfo
  - ServicesTable (description, labor, charges)
  - PartsTable
  - SummarySection
  - PaymentInfo
  - Footer
  - PrintButton
```

---

## Part B: Feature Implementation (Build After UI)

### 1. Service Order Types (`features/services/types.ts`)

**Implementation:**
```typescript
export interface ServiceOrder {
  _id: string;
  jobNumber: string;
  branch: string | Branch;
  customer: {
    name: string;
    phone: string;
    email?: string;
    address?: string;
  };
  vehicle: {
    plateNumber: string;
    make?: string;
    model?: string;
    year?: number;
  };
  description: string;
  diagnosis?: string;
  assignedTo?: string | User;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'scheduled' | 'in-progress' | 'waiting-parts' | 'completed' | 'cancelled';
  partsUsed: PartUsed[];
  totalParts: number;
  laborCost: number;
  otherCharges: number;
  totalAmount: number;
  payment: {
    method?: 'cash' | 'card' | 'bank_transfer' | 'other';
    amountPaid: number;
    balanceDue: number;
    status: 'unpaid' | 'partial' | 'paid' | 'overpaid';
    paidAt?: string;
  };
  scheduledAt?: string;
  completedAt?: string;
  notes?: string;
  createdBy: string | User;
  createdAt: string;
  updatedAt: string;
}

export interface PartUsed {
  _id: string;
  product: string | Product;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface CreateServiceOrderRequest {
  branch: string;
  customer: {
    name: string;
    phone: string;
    email?: string;
    address?: string;
  };
  vehicle: {
    plateNumber: string;
    make?: string;
    model?: string;
    year?: number;
  };
  description: string;
  diagnosis?: string;
  assignedTo?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  laborCost?: number;
  otherCharges?: number;
  scheduledAt?: string;
  notes?: string;
}

export interface UpdatePartsRequest {
  partsUsed: Array<{
    product: string;
    quantity: number;
    unitPrice?: number;
    sku?: string;
    name?: string;
  }>;
}

export interface ServiceOrderQuery {
  branch?: string;
  status?: string;
  priority?: string;
  assignedTo?: string;
  paymentStatus?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}
```

**Checklist:**
- [ ] Create `types.ts` for service orders
- [ ] Match backend ServiceOrder model exactly

---

### 2. Service Service (`features/services/services/serviceService.ts`)

**Implementation:**
```typescript
import apiClient from '@/lib/apiClient';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type { ServiceOrder, CreateServiceOrderRequest, UpdatePartsRequest, ServiceOrderQuery } from '../types';

export const serviceService = {
  async getAll(query: ServiceOrderQuery = {}): Promise<PaginatedResponse<ServiceOrder>> {
    const { data } = await apiClient.get<ApiResponse<ServiceOrder[]>>('/api/services', { params: query });
    return { data: data.data || [], pagination: data.pagination };
  },

  async getMyJobs(): Promise<ServiceOrder[]> {
    const { data } = await apiClient.get<ApiResponse<ServiceOrder[]>>('/api/services/my-jobs');
    return data.data || [];
  },

  async getById(id: string): Promise<ServiceOrder> {
    const { data } = await apiClient.get<ApiResponse<ServiceOrder>>(`/api/services/${id}`);
    if (!data.success || !data.data) throw new Error(data.message || 'Failed to fetch service order');
    return data.data;
  },

  async create(orderData: CreateServiceOrderRequest): Promise<ServiceOrder> {
    const { data } = await apiClient.post<ApiResponse<ServiceOrder>>('/api/services', orderData);
    if (!data.success || !data.data) throw new Error(data.message || 'Failed to create service order');
    return data.data;
  },

  async assignMechanic(id: string, mechanicId: string): Promise<ServiceOrder> {
    const { data } = await apiClient.put<ApiResponse<ServiceOrder>>(`/api/services/${id}/assign`, { mechanicId });
    if (!data.success || !data.data) throw new Error(data.message || 'Failed to assign mechanic');
    return data.data;
  },

  async updateStatus(id: string, status: string): Promise<ServiceOrder> {
    const { data } = await apiClient.put<ApiResponse<ServiceOrder>>(`/api/services/${id}/status`, { status });
    if (!data.success || !data.data) throw new Error(data.message || 'Failed to update status');
    return data.data;
  },

  async updateParts(id: string, partsData: UpdatePartsRequest): Promise<ServiceOrder> {
    const { data } = await apiClient.put<ApiResponse<ServiceOrder>>(`/api/services/${id}/parts`, partsData);
    if (!data.success || !data.data) throw new Error(data.message || 'Failed to update parts');
    return data.data;
  },

  async updatePayment(id: string, paymentData: any): Promise<ServiceOrder> {
    const { data } = await apiClient.put<ApiResponse<ServiceOrder>>(`/api/services/${id}/payment`, paymentData);
    if (!data.success || !data.data) throw new Error(data.message || 'Failed to update payment');
    return data.data;
  },

  async cancel(id: string): Promise<void> {
    const { data } = await apiClient.delete(`/api/services/${id}`);
    if (!data.success) throw new Error(data.message || 'Failed to cancel service order');
  },

  async getInvoice(id: string): Promise<any> {
    const { data } = await apiClient.get<ApiResponse<any>>(`/api/services/${id}/invoice`);
    return data.data;
  },
};
```

**Checklist:**
- [ ] Create `serviceService.ts` with all methods

---

### 3. Service Hooks (`features/services/hooks/useServices.ts`)

**Implementation:**
```typescript
import useSWR from 'swr';
import { serviceService } from '../services/serviceService';
import type { ServiceOrderQuery } from '../types';

export const useServiceOrders = (query: ServiceOrderQuery = {}) => {
  const { data, error, mutate } = useSWR(['/api/services', query], () => serviceService.getAll(query));
  return {
    orders: data?.data || [],
    pagination: data?.pagination,
    isLoading: !data && !error,
    error,
    refresh: mutate,
  };
};

export const useMyJobs = () => {
  const { data, error, mutate } = useSWR('/api/services/my-jobs', () => serviceService.getMyJobs());
  return {
    jobs: data || [],
    isLoading: !data && !error,
    error,
    refresh: mutate,
  };
};

export const useServiceOrder = (id: string) => {
  const { data, error, mutate } = useSWR(id ? `/api/services/${id}` : null, () => serviceService.getById(id));
  return {
    order: data,
    isLoading: !data && !error,
    error,
    refresh: mutate,
  };
};
```

**Checklist:**
- [ ] Create hooks for service orders with SWR

---

### 4. Connect UI to Services

**Service Order List:**
- Connect to `useServiceOrders` hook
- Implement filters (status, priority, mechanic, date range)
- Branch filter: admin sees all, salesperson sees own, mechanic sees assigned

**My Jobs Page:**
- Connect to `useMyJobs` hook (mechanic only)
- Implement status/priority filters

**New Service Form:**
- Implement with react-hook-form and Zod validation
- On submit: call `serviceService.create()`

**Service Order Details:**
- Connect to `useServiceOrder` hook
- Implement assign mechanic modal
- Implement status update modal
- Implement parts update modal
- Implement payment update modal

**Checklist:**
- [ ] Connect all pages to hooks
- [ ] Implement all modals
- [ ] Implement invoice view

---

## Part C: Validation & Security

### Zod Schemas

**Create Service Order Schema:**
```typescript
export const createServiceSchema = z.object({
  branch: z.string().min(1, 'Branch required'),
  customer: z.object({
    name: z.string().min(2, 'Customer name required'),
    phone: z.string().regex(/^\d{10}$/, 'Valid phone required'),
    email: z.string().email().optional().or(z.literal('')),
    address: z.string().optional(),
  }),
  vehicle: z.object({
    plateNumber: z.string().min(1, 'Plate number required'),
    make: z.string().optional(),
    model: z.string().optional(),
    year: z.number().int().positive().optional(),
  }),
  description: z.string().min(10, 'Description required'),
  diagnosis: z.string().optional(),
  assignedTo: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  laborCost: z.number().nonnegative().optional(),
  otherCharges: z.number().nonnegative().optional(),
  scheduledAt: z.string().optional(),
  notes: z.string().optional(),
});
```

**Security Checklist:**
- [ ] Admin/salesperson can create/update service orders
- [ ] Mechanics can only view/update assigned jobs
- [ ] Mechanics can update status and parts only
- [ ] Admin/manager can assign mechanics
- [ ] Validate parts quantity <= available stock (backend enforces)
- [ ] Validate status transitions (backend enforces)

---

## Part D: Testing & Validation

### Manual Testing Checklist

**Service Order Creation:**
- [ ] Create service order with valid data: Success
- [ ] Create with assigned mechanic: Status auto-sets to "scheduled"
- [ ] Create without mechanic: Status "pending"
- [ ] Validation errors for missing required fields

**Mechanic Assignment:**
- [ ] Assign mechanic to job: Success, status updates
- [ ] Reassign mechanic: Success

**Status Updates:**
- [ ] Update status with valid transitions: Success
- [ ] Cannot update with invalid transition: Error
- [ ] Complete job with parts: Parts deducted from stock, transaction created (if paid)

**Parts Management:**
- [ ] Add parts to job: Success, total recalculated
- [ ] Add parts with quantity > stock: Error
- [ ] Parts deducted on completion

**Payment:**
- [ ] Update payment: Success, balance recalculated
- [ ] Payment status updates correctly

**Mechanic Access:**
- [ ] Mechanic sees only assigned jobs in "My Jobs"
- [ ] Mechanic can view/update assigned jobs
- [ ] Mechanic cannot view other mechanics' jobs (unless admin/salesperson)

**Invoice:**
- [ ] View/print invoice with parts and charges

**Responsive Design:**
- [ ] Service list responsive
- [ ] My Jobs page responsive
- [ ] New service form responsive
- [ ] Invoice print-friendly

---

## Part E: Success Criteria

Phase 6 is complete when:
- [ ] Service order list displays with filters
- [ ] My Jobs page works for mechanics
- [ ] New service form works
- [ ] Mechanic assignment works
- [ ] Status updates work (with transitions)
- [ ] Parts tracking works (with stock deduction on completion)
- [ ] Payment updates work
- [ ] Invoice view/print works
- [ ] Mechanics restricted to assigned jobs
- [ ] All validation and authorization work
- [ ] All manual tests pass
- [ ] Responsive design works

---

## Part F: Next Steps

After completing Phase 6:
1. **MVP Complete:** All primary and secondary revenue streams functional
2. **Future Phases:**
   - Phase 7: Financial Management (Transaction listing, reports)
   - Phase 8: Reporting & Analytics (Dashboard, charts)
   - Phase 9: Notifications (Real-time alerts, low-stock, order updates)
   - Phase 10: Dashboard (Aggregated metrics, widgets)

---

## Common Pitfalls

1. **Not restricting mechanic access:** Mechanics should only see assigned jobs
2. **Not validating status transitions:** Backend enforces, but frontend should guide
3. **Parts deduction on wrong status:** Only on "completed"
4. **Not calculating totals correctly:** Total = parts + labor + other charges
5. **Missing stock availability check:** Validate parts quantity <= stock
6. **Not testing empty states:** Handle "No jobs" gracefully

---

**End of Phase 6**

**🎉 Frontend MVP Complete!** All six phases implemented, covering authentication, branch/product/stock/supplier management, sales orders, and service orders. The system is now ready for user acceptance testing and iterative improvements.

Refer to [Frontend-Guidelines.md](Frontend-Guidelines.md) for design system and [Planning.md](Planning.md) for endpoint contracts.
