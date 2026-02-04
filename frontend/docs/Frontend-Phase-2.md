# Frontend Phase 2: Branch Management

**Aligned with Backend:** Phase 2 (Branch Management)  
**Complexity:** Low-Medium  
**Priority:** High (Organizational Foundation)  
**Estimated Effort:** 2-3 days  
**Dependencies:** Phase 1 (Auth) must be complete

---

## Overview

Phase 2 implements branch management functionality, allowing admins to create, view, edit, and manage branch locations. Branches are the organizational foundation for multi-location inventory and sales tracking. Non-admin users are restricted to viewing their assigned branch only.

**Core Features:**
- Branch listing with search and filtering
- Branch details view with stats
- Create new branch (admin only)
- Edit branch information (admin only)
- Deactivate/activate branches (admin only)
- Branch stats dashboard (staff, inventory, sales)

---

## Prerequisites

Before starting this phase:
- [x] Phase 1 complete (authentication working)
- [ ] Review backend Phase 2 docs and `/branches` endpoints
- [ ] Confirm admin role can access branch management routes
- [ ] Verify branch data structure matches backend model

---

## Part A: UI/Pages Design (Build First)

### 1. Branch List Page (`app/(protected)/branches/page.tsx`)

**Layout:**
- Page header: "Branches" title, "Add Branch" button (admin only, yellow bg, black text)
- Search bar: Text input for searching by name, code, or city
- Filter chips: "All", "Active", "Inactive" (yellow active state)
- Branch cards grid (3 columns on desktop, 2 on tablet, 1 on mobile)
- Pagination controls at bottom

**Branch Card:**
- Branch name (bold, text-lg)
- Branch code (gray-500, text-sm)
- Address (city, province) — truncated with ellipsis
- Contact phone and email icons
- Active status badge (yellow bg for active, gray for inactive)
- "View Details" button (black bg, white text)
- Admin-only: "Edit" and "Deactivate" icon buttons (top-right)

**Responsive Design:**
- Mobile: Stack cards, full-width search
- Tablet: 2-column grid
- Desktop: 3-column grid, filters as horizontal chips

**Empty State:**
- No branches: "No branches found. Add your first branch." with "Add Branch" button

**Component Structure:**
```typescript
// app/(protected)/branches/page.tsx
- BranchesPage (container, admin/salesperson access)
  - PageHeader
    - Title ("Branches")
    - AddBranchButton (admin only)
  - SearchBar
  - FilterChips (All, Active, Inactive)
  - BranchGrid
    - BranchCard[]
      - BranchInfo
      - StatusBadge
      - ActionButtons (Edit, Deactivate — admin only)
  - Pagination
```

---

### 2. Branch Details Page (`app/(protected)/branches/[id]/page.tsx`)

**Layout:**
- Back button (top-left, black text)
- Branch header: Name, code, status badge
- Action buttons (admin only): "Edit Branch", "Deactivate/Activate Branch"
- Information card (white bg, border):
  - **Contact Information:** Phone, email
  - **Address:** Street, city, province, postal code
  - **Manager:** Name (if assigned, link to user profile future)
  - **Settings:** Operating hours, timezone, etc. (display only for MVP)
- Stats cards (3-column grid):
  - **Staff:** Total, Active, Inactive counts
  - **Inventory:** Total items, low stock count, total value
  - **Sales:** Today's sales, this month, total revenue

**Responsive Design:**
- Mobile: Stacked cards, full-width
- Tablet: 2-column stats grid
- Desktop: 3-column stats grid

**Component Structure:**
```typescript
// app/(protected)/branches/[id]/page.tsx
- BranchDetailPage (container)
  - BackButton
  - BranchHeader
    - Name, Code, StatusBadge
    - ActionButtons (Edit, Deactivate — admin only)
  - InfoCard
    - ContactSection
    - AddressSection
    - ManagerSection
    - SettingsSection
  - StatsGrid
    - StatCard (Staff)
    - StatCard (Inventory)
    - StatCard (Sales)
```

---

### 3. Add/Edit Branch Form Modal (`components/branches/BranchFormModal.tsx`)

**Layout:**
- Modal overlay (black with 50% opacity)
- Modal card (centered, max-w-2xl, white bg)
- Modal header: "Add Branch" or "Edit Branch" title, close icon button (top-right)
- Form fields (2-column on desktop, stacked on mobile):
  - **Branch Name:** Text input (required)
  - **Branch Code:** Text input (auto-generated or manual, required, uppercase)
  - **Phone:** Text input (required, phone format validation)
  - **Email:** Text input (optional, email format validation)
  - **Street Address:** Text input (required)
  - **City:** Text input (required)
  - **Province:** Text input (required)
  - **Postal Code:** Text input (optional)
  - **Manager:** Dropdown select (list of users with admin/salesperson role, optional)
  - **Status:** Toggle switch (Active/Inactive, default Active)
- Action buttons (bottom-right):
  - "Cancel" (black bg, white text)
  - "Save Branch" (yellow bg, black text, disabled until valid)

**Responsive Design:**
- Mobile: Full-screen modal, stacked fields
- Desktop: Centered modal (max-w-2xl), 2-column fields

**Validation:**
- Name: Required, 2-100 characters
- Code: Required, 2-10 characters, uppercase, alphanumeric
- Phone: Required, valid phone format (10 digits)
- Email: Optional, valid email format
- Address fields: Required (street, city, province)

**Component Structure:**
```typescript
// components/branches/BranchFormModal.tsx
- BranchFormModal (modal component)
  - ModalOverlay
  - ModalCard
    - ModalHeader (title, close button)
    - Form
      - Input (name)
      - Input (code)
      - Input (phone)
      - Input (email)
      - Input (street)
      - Input (city)
      - Input (province)
      - Input (postalCode)
      - Select (manager)
      - Toggle (status)
      - FormActions
        - CancelButton
        - SaveButton
```

---

### 4. Deactivate Confirmation Modal (`components/branches/DeactivateModal.tsx`)

**Layout:**
- Modal overlay (black with 50% opacity)
- Modal card (centered, max-w-md, white bg)
- Warning icon (yellow or red)
- Title: "Deactivate Branch?"
- Message: "This will prevent new sales and stock operations at [Branch Name]. Staff can still view data."
- Action buttons:
  - "Cancel" (black bg, white text)
  - "Deactivate" (black bg, red text)

**Component Structure:**
```typescript
// components/branches/DeactivateModal.tsx
- DeactivateModal
  - ModalOverlay
  - ModalCard
    - WarningIcon
    - Title
    - Message
    - ActionButtons
      - CancelButton
      - ConfirmButton
```

---

## Part B: Feature Implementation (Build After UI)

### 1. Branch Types (`features/branches/types.ts`)

**Implementation:**
```typescript
export interface Branch {
  _id: string;
  name: string;
  code: string;
  address: {
    street: string;
    city: string;
    province: string;
    postalCode?: string;
  };
  contact: {
    phone: string;
    email?: string;
  };
  manager?: string; // User ID
  isActive: boolean;
  settings?: {
    operatingHours?: any;
    timezone?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface BranchStats {
  staff: {
    total: number;
    active: number;
    inactive: number;
  };
  inventory: {
    totalItems: number;
    lowStockItems: number;
    totalValue: number;
  };
  sales: {
    today: number;
    thisMonth: number;
    totalRevenue: number;
  };
}

export interface CreateBranchRequest {
  name: string;
  code: string;
  address: {
    street: string;
    city: string;
    province: string;
    postalCode?: string;
  };
  contact: {
    phone: string;
    email?: string;
  };
  manager?: string;
  settings?: any;
}

export interface UpdateBranchRequest extends Partial<CreateBranchRequest> {}

export interface BranchListQuery {
  active?: boolean;
  city?: string;
  search?: string;
  page?: number;
  limit?: number;
}
```

**Checklist:**
- [ ] Create `types.ts` in `features/branches/`
- [ ] Define `Branch` interface matching backend model
- [ ] Define `BranchStats` interface for stats endpoint
- [ ] Define request/query types for API calls

---

### 2. Branch Service (`features/branches/services/branchService.ts`)

**Implementation:**
```typescript
import apiClient from '@/lib/apiClient';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type { Branch, BranchStats, CreateBranchRequest, UpdateBranchRequest, BranchListQuery } from '../types';

export const branchService = {
  // Get all branches with filters
  async getAll(query: BranchListQuery = {}): Promise<PaginatedResponse<Branch>> {
    const { data } = await apiClient.get<ApiResponse<Branch[]>>('/branches', { params: query });
    return {
      data: data.data || [],
      pagination: data.pagination,
    };
  },

  // Get single branch by ID
  async getById(id: string): Promise<Branch> {
    const { data } = await apiClient.get<ApiResponse<Branch>>(`/branches/${id}`);
    if (!data.success || !data.data) {
      throw new Error(data.message || 'Failed to fetch branch');
    }
    return data.data;
  },

  // Create new branch (admin only)
  async create(branchData: CreateBranchRequest): Promise<Branch> {
    const { data } = await apiClient.post<ApiResponse<Branch>>('/branches', branchData);
    if (!data.success || !data.data) {
      throw new Error(data.message || 'Failed to create branch');
    }
    return data.data;
  },

  // Update branch (admin only)
  async update(id: string, branchData: UpdateBranchRequest): Promise<Branch> {
    const { data } = await apiClient.put<ApiResponse<Branch>>(`/branches/${id}`, branchData);
    if (!data.success || !data.data) {
      throw new Error(data.message || 'Failed to update branch');
    }
    return data.data;
  },

  // Deactivate branch (admin only)
  async deactivate(id: string): Promise<void> {
    const { data } = await apiClient.delete<ApiResponse<Branch>>(`/branches/${id}`);
    if (!data.success) {
      throw new Error(data.message || 'Failed to deactivate branch');
    }
  },

  // Get branch stats
  async getStats(id: string): Promise<BranchStats> {
    const { data } = await apiClient.get<ApiResponse<BranchStats>>(`/branches/${id}/stats`);
    if (!data.success || !data.data) {
      throw new Error(data.message || 'Failed to fetch branch stats');
    }
    return data.data;
  },
};
```

**Checklist:**
- [ ] Create `branchService.ts` in `features/branches/services/`
- [ ] Implement `getAll()` with query params
- [ ] Implement `getById()` for details page
- [ ] Implement `create()` for adding branches
- [ ] Implement `update()` for editing branches
- [ ] Implement `deactivate()` for soft delete
- [ ] Implement `getStats()` for branch stats

---

### 3. Branch Hooks (`features/branches/hooks/useBranches.ts`)

**Implementation:**
```typescript
import useSWR from 'swr';
import { branchService } from '../services/branchService';
import type { BranchListQuery } from '../types';

export const useBranches = (query: BranchListQuery = {}) => {
  const { data, error, mutate } = useSWR(
    ['/branches', query],
    () => branchService.getAll(query),
    {
      revalidateOnFocus: true,
      dedupingInterval: 30000, // 30 seconds
    }
  );

  return {
    branches: data?.data || [],
    pagination: data?.pagination,
    isLoading: !data && !error,
    error,
    refresh: mutate,
  };
};

export const useBranch = (id: string) => {
  const { data, error, mutate } = useSWR(
    id ? `/branches/${id}` : null,
    () => branchService.getById(id),
    {
      revalidateOnFocus: true,
    }
  );

  return {
    branch: data,
    isLoading: !data && !error,
    error,
    refresh: mutate,
  };
};

export const useBranchStats = (id: string) => {
  const { data, error, mutate } = useSWR(
    id ? `/branches/${id}/stats` : null,
    () => branchService.getStats(id),
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000, // 1 minute
    }
  );

  return {
    stats: data,
    isLoading: !data && !error,
    error,
    refresh: mutate,
  };
};
```

**Checklist:**
- [ ] Create `useBranches.ts` in `features/branches/hooks/`
- [ ] Implement `useBranches()` hook with SWR for list
- [ ] Implement `useBranch()` hook for single branch
- [ ] Implement `useBranchStats()` hook for stats

---

### 4. Connect UI to Services

**Branch List Page:**
```typescript
'use client';

import { useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useBranches } from '@/features/branches/hooks/useBranches';
import { withRoleGuard } from '@/middleware/roleGuard';
import BranchCard from '@/components/branches/BranchCard';
import BranchFormModal from '@/components/branches/BranchFormModal';
import SearchBar from '@/components/ui/SearchBar';
import Button from '@/components/ui/Button';

function BranchesPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<boolean | undefined>(undefined);
  const [showModal, setShowModal] = useState(false);

  const { branches, isLoading, error, refresh } = useBranches({
    search,
    active: activeFilter,
    page: 1,
    limit: 20,
  });

  const handleCreateBranch = () => {
    setShowModal(true);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Branches</h1>
        {user?.role === 'admin' && (
          <Button variant="primary" onClick={handleCreateBranch}>
            Add Branch
          </Button>
        )}
      </div>

      <SearchBar value={search} onChange={setSearch} placeholder="Search branches..." />

      {/* Filter chips */}
      <div className="flex gap-2 my-4">
        <button onClick={() => setActiveFilter(undefined)} className={activeFilter === undefined ? 'bg-yellow-400 text-black px-4 py-2 rounded' : 'bg-gray-200 text-black px-4 py-2 rounded'}>
          All
        </button>
        <button onClick={() => setActiveFilter(true)} className={activeFilter === true ? 'bg-yellow-400 text-black px-4 py-2 rounded' : 'bg-gray-200 text-black px-4 py-2 rounded'}>
          Active
        </button>
        <button onClick={() => setActiveFilter(false)} className={activeFilter === false ? 'bg-yellow-400 text-black px-4 py-2 rounded' : 'bg-gray-200 text-black px-4 py-2 rounded'}>
          Inactive
        </button>
      </div>

      {/* Branch grid */}
      {isLoading && <div>Loading branches...</div>}
      {error && <div className="text-red-600">Error loading branches</div>}
      {!isLoading && branches.length === 0 && <div>No branches found</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {branches.map((branch) => (
          <BranchCard key={branch._id} branch={branch} onUpdate={refresh} />
        ))}
      </div>

      {showModal && <BranchFormModal onClose={() => setShowModal(false)} onSuccess={refresh} />}
    </div>
  );
}

export default withRoleGuard(BranchesPage, ['admin', 'salesperson']);
```

**Branch Details Page:**
```typescript
'use client';

import { useParams } from 'next/navigation';
import { useBranch, useBranchStats } from '@/features/branches/hooks/useBranches';
import { withAuthGuard } from '@/middleware/authGuard';
import StatCard from '@/components/ui/StatCard';

function BranchDetailPage() {
  const params = useParams();
  const { branch, isLoading, error } = useBranch(params.id as string);
  const { stats, isLoading: statsLoading } = useBranchStats(params.id as string);

  if (isLoading) return <div>Loading...</div>;
  if (error || !branch) return <div>Branch not found</div>;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{branch.name}</h1>
        <p className="text-gray-500">{branch.code}</p>
      </div>

      {/* Contact and address info */}
      <div className="bg-white border border-gray-200 rounded p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Phone</p>
            <p>{branch.contact.phone}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Email</p>
            <p>{branch.contact.email || 'N/A'}</p>
          </div>
          <div className="md:col-span-2">
            <p className="text-sm text-gray-500">Address</p>
            <p>{branch.address.street}, {branch.address.city}, {branch.address.province}</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <h2 className="text-lg font-semibold mb-4">Statistics</h2>
      {statsLoading && <div>Loading stats...</div>}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard title="Staff" value={stats.staff.total} subtitle={`${stats.staff.active} active`} />
          <StatCard title="Inventory Items" value={stats.inventory.totalItems} subtitle={`${stats.inventory.lowStockItems} low stock`} />
          <StatCard title="Total Revenue" value={`₱${stats.sales.totalRevenue.toFixed(2)}`} subtitle={`₱${stats.sales.today} today`} />
        </div>
      )}
    </div>
  );
}

export default withAuthGuard(BranchDetailPage);
```

**Checklist:**
- [ ] Connect branch list page to `useBranches` hook
- [ ] Implement search and filter functionality
- [ ] Show/hide "Add Branch" button based on role
- [ ] Connect branch details page to `useBranch` and `useBranchStats` hooks
- [ ] Implement branch form modal with create/update logic
- [ ] Implement deactivate confirmation modal

---

## Part C: Validation & Security

### Input Validation (Zod Schema)

```typescript
import { z } from 'zod';

export const branchSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  code: z.string().min(2).max(10).regex(/^[A-Z0-9]+$/, 'Code must be uppercase alphanumeric'),
  contact: z.object({
    phone: z.string().regex(/^\d{10}$/, 'Phone must be 10 digits'),
    email: z.string().email('Invalid email').optional().or(z.literal('')),
  }),
  address: z.object({
    street: z.string().min(5, 'Street address required'),
    city: z.string().min(2, 'City required'),
    province: z.string().min(2, 'Province required'),
    postalCode: z.string().optional(),
  }),
  manager: z.string().optional(),
});
```

**Checklist:**
- [ ] Create Zod schema for branch form
- [ ] Integrate with react-hook-form
- [ ] Display field-level validation errors
- [ ] Auto-uppercase branch code input

---

### Security Checklist

- [ ] **Admin-Only Access:** Wrap branch create/edit/delete actions with role check
- [ ] **Input Sanitization:** Trim all text inputs, validate email/phone formats
- [ ] **Authorization:** Salespersons can view but not modify branches
- [ ] **Branch Scoping:** Non-admin users see only their branch (filter on backend)
- [ ] **No Direct API Calls:** All requests go through `branchService`

---

## Part D: Testing & Validation

### Manual Testing Checklist

**Branch Listing:**
- [ ] Admin sees all branches
- [ ] Salesperson sees only their branch (if scoped)
- [ ] Search by name, code, city works
- [ ] Filter by active/inactive works
- [ ] Pagination works (if >20 branches)

**Branch Details:**
- [ ] View branch information and stats
- [ ] Stats display correctly (staff, inventory, sales)
- [ ] Admin sees "Edit" and "Deactivate" buttons
- [ ] Salesperson does not see admin actions

**Create Branch:**
- [ ] Admin can open "Add Branch" modal
- [ ] Non-admin cannot see "Add Branch" button
- [ ] Form validates all required fields
- [ ] Branch code auto-uppercases
- [ ] Success: Branch appears in list, modal closes
- [ ] Error: Display error message

**Edit Branch:**
- [ ] Admin can open edit modal from list or details page
- [ ] Form pre-fills with existing data
- [ ] Success: Branch updates in list and details
- [ ] Error: Display error message

**Deactivate Branch:**
- [ ] Admin can deactivate from details page
- [ ] Confirmation modal appears
- [ ] Success: Branch marked inactive, removed from active filter
- [ ] Cannot deactivate if branch has active operations (backend handles)

**Responsive Design:**
- [ ] Branch cards stack on mobile
- [ ] Form modal full-screen on mobile
- [ ] Stats grid adjusts to screen size

---

## Part E: Success Criteria

Phase 2 is complete when:
- [ ] All UI pages are built and styled per design system
- [ ] Branch list displays with search and filters
- [ ] Branch details page shows information and stats
- [ ] Admin can create, edit, and deactivate branches
- [ ] Non-admin users cannot perform mutations
- [ ] Salespersons see only their branch (if backend enforces scoping)
- [ ] All validation works (client-side)
- [ ] All manual tests pass
- [ ] Responsive design works on mobile, tablet, desktop
- [ ] No console errors or warnings

---

## Part F: Next Steps

After completing Phase 2:
1. **Proceed to Phase 3:** Category & Product Management
2. **Branch Context Provider:** Create context to provide current branch to all components (used in future phases)
3. **Branch Stats Dashboard:** Expand stats to include more detailed reports (future phase)

---

## Common Pitfalls

1. **Not restricting admin actions:** Allow only admins to create/edit/delete
2. **Ignoring branch scoping:** Non-admin users should see only their branch
3. **Not validating phone/email formats:** Leads to invalid data
4. **Hardcoding branch code:** Allow auto-generation or manual input
5. **Not testing empty states:** Handle "No branches found" gracefully
6. **Missing loading states:** Show spinners during API calls

---

**End of Phase 2**

Refer to [Frontend-Guidelines.md](Frontend-Guidelines.md) for design system and [Planning.md](Planning.md) for endpoint contracts.
