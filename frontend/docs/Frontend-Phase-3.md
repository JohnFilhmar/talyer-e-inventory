# Frontend Phase 3: Category & Product Management

**Aligned with Backend:** Phase 3 (Category & Product Management)  
**Complexity:** Medium-High  
**Priority:** Critical (Inventory Foundation)  
**Estimated Effort:** 4-6 days  
**Dependencies:** Phase 1 (Auth), Phase 2 (Branches)

---

## Overview

Phase 3 implements category and product management, the foundation of the inventory system. Features include hierarchical category trees, product catalog with search/filtering, image management, and SKU generation. Admin-only mutations ensure data integrity.

**Core Features:**
- Hierarchical category tree (parent-child relationships)
- Product catalog with search, filtering, sorting
- Product details with images, specifications, pricing
- Product image management (upload, set primary, delete)
- SKU auto-generation
- Profit margin calculation
- Category and product activation/deactivation

---

## Prerequisites

Before starting this phase:
- [x] Phase 1 (Auth) and Phase 2 (Branches) complete
- [x] Review backend Phase 3 docs and `/api/categories`, `/api/products` endpoints
- [x] Confirm image upload strategy (**File upload with server compression chosen**)
- [x] Understand category hierarchy (parent-child relationships)

---

## Part A: UI/Pages Design (Build First)

### 1. Category List Page (`app/(protected)/categories/page.tsx`)

**Layout:**
- Page header: "Categories" title, "Add Category" button (admin only, yellow bg)
- Category tree view (hierarchical, collapsible)
  - Root categories at top level
  - Child categories indented
  - Expand/collapse icons for parent categories
- Category item row:
  - Color dot (category.color)
  - Category name (bold if parent)
  - Product count (gray text, small)
  - Active status badge (yellow for active, gray for inactive)
  - Admin actions: "Edit" and "Delete" icons (hover only)

**Responsive Design:**
- Mobile: Full-width tree, smaller text, collapse all by default
- Desktop: Max-width container, expand first level by default

**Empty State:**
- No categories: "No categories found. Add your first category."

**Component Structure:**
```typescript
// app/(protected)/categories/page.tsx
- CategoriesPage (admin/salesperson view)
  - PageHeader
    - Title
    - AddCategoryButton (admin only)
  - CategoryTree
    - CategoryNode[] (recursive)
      - ColorDot
      - CategoryName
      - ProductCount
      - StatusBadge
      - ActionButtons (Edit, Delete — admin only)
      - ChildCategories (recursive)
```

---

### 2. Add/Edit Category Modal (`components/categories/CategoryFormModal.tsx`)

**Layout:**
- Modal overlay, centered card (max-w-md)
- Modal header: "Add Category" or "Edit Category"
- Form fields:
  - **Name:** Text input (required)
  - **Description:** Textarea (optional)
  - **Parent Category:** Dropdown select (optional, list of categories excluding current)
  - **Color:** Color picker (hex input, default gray)
  - **Sort Order:** Number input (optional, default 0)
  - **Active:** Toggle switch (default true)
- Action buttons: "Cancel", "Save Category"

**Validation:**
- Name: Required, 2-50 characters
- Color: Valid hex color (e.g., #FBBF24)

**Component Structure:**
```typescript
// components/categories/CategoryFormModal.tsx
- CategoryFormModal
  - ModalOverlay
  - ModalCard
    - ModalHeader
    - Form
      - Input (name)
      - Textarea (description)
      - Select (parent category)
      - ColorPicker (color)
      - Input (sortOrder)
      - Toggle (active)
      - FormActions
```

---

### 3. Product List Page (`app/(protected)/products/page.tsx`)

**Layout:**
- Page header: "Products" title, "Add Product" button (admin only, yellow bg)
- Search bar: Text input for searching by name, SKU, or barcode
- Filter chips:
  - Category dropdown (all categories)
  - Brand dropdown (if multiple brands)
  - Status: "All", "Active", "Discontinued"
  - Price range sliders (min-max)
- Sort dropdown: "Name", "Price (Low-High)", "Price (High-Low)", "Newest"
- Product grid (4 columns on desktop, 2 on tablet, 1 on mobile)
- Pagination controls

**Product Card:**
- Product image (primary image, fallback to placeholder)
- Product name (bold, text-base, truncated)
- SKU (gray text, text-xs)
- Category name (gray text, text-xs)
- Selling price (bold, text-lg, black)
- Cost price (gray text, text-sm, strikethrough if different from selling)
- Status badge (yellow for active, gray for discontinued)
- "View Details" button (black bg, white text)
- Admin-only: "Edit" icon button (top-right)

**Responsive Design:**
- Mobile: 1-column grid, stacked filters
- Tablet: 2-column grid
- Desktop: 4-column grid, horizontal filters

**Empty State:**
- No products: "No products found. Add your first product."

**Component Structure:**
```typescript
// app/(protected)/products/page.tsx
- ProductsPage (container)
  - PageHeader
    - Title
    - AddProductButton (admin only)
  - SearchBar
  - FilterBar
    - CategoryDropdown
    - BrandDropdown
    - StatusChips
    - PriceRangeSliders
    - SortDropdown
  - ProductGrid
    - ProductCard[]
      - ProductImage
      - ProductInfo (name, SKU, category)
      - PriceInfo (selling, cost)
      - StatusBadge
      - ActionButtons (View, Edit — admin)
  - Pagination
```

---

### 4. Product Details Page (`app/(protected)/products/[id]/page.tsx`)

**Layout:**
- Back button (top-left)
- Product header: Name, SKU, status badge
- Action buttons (admin only): "Edit Product", "Discontinue/Activate Product"
- Main content (2-column on desktop, stacked on mobile):
  - **Left Column (Image Gallery):**
    - Primary image (large, square, white bg)
    - Thumbnail gallery (scroll horizontal, click to switch primary)
    - Admin-only: "Upload Image" button below thumbnails
  - **Right Column (Product Info):**
    - **Pricing Card:**
      - Selling Price (large, bold)
      - Cost Price (smaller, gray)
      - Profit Margin (calculated, percentage, yellow if >30%, else gray)
    - **Category & Brand:**
      - Category (with breadcrumb path, e.g., "Electronics > Phones")
      - Brand (if available)
      - Model (if available)
    - **Inventory Status:**
      - Barcode (if available)
      - Active/Discontinued badge
    - **Specifications:** (if available)
      - Key-value pairs (e.g., "Weight: 150g", "Color: Black")
    - **Description:** (if available)
      - Full description text

**Responsive Design:**
- Mobile: Stacked layout (image top, info below)
- Desktop: 2-column (image left, info right)

**Component Structure:**
```typescript
// app/(protected)/products/[id]/page.tsx
- ProductDetailPage
  - BackButton
  - ProductHeader (name, SKU, status)
  - ActionButtons (Edit, Discontinue — admin)
  - MainContent
    - ImageGallery
      - PrimaryImage
      - ThumbnailScroll
      - UploadImageButton (admin)
    - ProductInfo
      - PricingCard
      - CategoryBrandCard
      - InventoryStatusCard
      - SpecificationsCard
      - DescriptionCard
```

---

### 5. Add/Edit Product Form Page (`app/(protected)/products/new` or `/[id]/edit`)

**Layout:**
- Page header: "Add Product" or "Edit Product"
- Form (multi-column on desktop, stacked on mobile):
  - **Basic Information:**
    - Name (required)
    - Category (dropdown, required)
    - Brand (text input, optional)
    - Model (text input, optional)
  - **Pricing:**
    - Cost Price (number, required)
    - Selling Price (number, required)
    - Profit Margin (calculated, display-only, percentage)
  - **Identification:**
    - Barcode (text input, optional, unique)
    - SKU (auto-generated, display-only)
  - **Images:**
    - Image URL inputs (for MVP, allow manual URL entry)
    - "Add Image URL" button to add more inputs
    - Mark one as primary (radio button)
  - **Specifications:** (optional)
    - Key-Value pairs (e.g., "Weight: 150g")
    - "Add Specification" button
  - **Tags:** (optional)
    - Comma-separated text input
  - **Status:**
    - Active toggle (default true)
- Action buttons: "Cancel", "Save Product" (yellow bg)

**Validation:**
- Name: Required, 2-200 characters
- Category: Required
- Cost Price: Required, positive number
- Selling Price: Required, positive number, >= cost price
- Barcode: Optional, unique (backend validates)

**Responsive Design:**
- Mobile: Stacked fields
- Desktop: 2-column layout for basic info and pricing

**Component Structure:**
```typescript
// app/(protected)/products/new/page.tsx
- ProductFormPage
  - PageHeader
  - Form
    - BasicInfoSection
      - Input (name)
      - Select (category)
      - Input (brand)
      - Input (model)
    - PricingSection
      - Input (costPrice)
      - Input (sellingPrice)
      - Display (profitMargin)
    - IdentificationSection
      - Input (barcode)
      - Display (SKU)
    - ImagesSection
      - ImageURLInput[]
      - AddImageButton
      - PrimaryRadio
    - SpecificationsSection
      - KeyValueInput[]
      - AddSpecButton
    - TagsSection
      - Input (tags)
    - StatusSection
      - Toggle (active)
    - FormActions
      - CancelButton
      - SaveButton
```

---

### 6. Product Image Management (Admin Only)

**Image Upload/Delete Flow:**
- On product details page, admin sees "Upload Image" button
- Click opens modal or inline form with URL input (MVP: manual URL entry)
- Enter image URL, mark as primary (checkbox)
- Submit: POST `/api/products/:id/images` with `{ url, isPrimary }`
- Success: Image appears in gallery, refresh product details
- Delete: Click trash icon on thumbnail, confirmation modal, DELETE `/api/products/:id/images/:imageId`

**Component Structure:**
```typescript
// components/products/ImageUploadModal.tsx
- ImageUploadModal
  - ModalOverlay
  - ModalCard
    - Form
      - Input (imageURL)
      - Checkbox (isPrimary)
      - ActionButtons (Cancel, Upload)
```

---

## Part B: Feature Implementation (Build After UI)

### 1. Category & Product Types (`features/categories/types.ts`, `features/products/types.ts`)

**Category Types:**
```typescript
export interface Category {
  _id: string;
  name: string;
  description?: string;
  parent?: string; // Parent category ID
  fullPath: string; // e.g., "Electronics > Phones"
  level: number;
  color?: string;
  sortOrder: number;
  isActive: boolean;
  children?: Category[]; // Populated child categories
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCategoryRequest {
  name: string;
  description?: string;
  parent?: string;
  color?: string;
  sortOrder?: number;
}
```

**Product Types:**
```typescript
export interface Product {
  _id: string;
  name: string;
  sku: string;
  category: string | Category; // Can be populated
  brand?: string;
  model?: string;
  costPrice: number;
  sellingPrice: number;
  profitMargin: number; // Calculated
  barcode?: string;
  images: ProductImage[];
  primaryImage?: string;
  specifications?: Record<string, any>;
  tags?: string[];
  isActive: boolean;
  isDiscontinued: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductImage {
  _id: string;
  url: string;
  isPrimary: boolean;
  uploadedAt: string;
}

export interface CreateProductRequest {
  name: string;
  category: string;
  brand?: string;
  model?: string;
  costPrice: number;
  sellingPrice: number;
  barcode?: string;
  images?: { url: string; isPrimary?: boolean }[];
  specifications?: Record<string, any>;
  tags?: string[];
}

export interface ProductSearchQuery {
  category?: string;
  brand?: string;
  active?: boolean;
  discontinued?: boolean;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
```

**Checklist:**
- [x] Create `types.ts` for categories and products (in `src/types/`)
- [x] Match backend model fields exactly
- [x] Include request/query types for API calls

---

### 2. Category Service (`features/categories/services/categoryService.ts`)

**Implementation:**
```typescript
import apiClient from '@/lib/apiClient';
import type { ApiResponse } from '@/types/api';
import type { Category, CreateCategoryRequest } from '../types';

export const categoryService = {
  async getAll(includeChildren = true): Promise<Category[]> {
    const { data } = await apiClient.get<ApiResponse<Category[]>>('/api/categories', {
      params: { includeChildren },
    });
    return data.data || [];
  },

  async getById(id: string): Promise<Category> {
    const { data } = await apiClient.get<ApiResponse<Category>>(`/api/categories/${id}`);
    if (!data.success || !data.data) throw new Error(data.message || 'Failed to fetch category');
    return data.data;
  },

  async create(categoryData: CreateCategoryRequest): Promise<Category> {
    const { data } = await apiClient.post<ApiResponse<Category>>('/api/categories', categoryData);
    if (!data.success || !data.data) throw new Error(data.message || 'Failed to create category');
    return data.data;
  },

  async update(id: string, categoryData: Partial<CreateCategoryRequest>): Promise<Category> {
    const { data } = await apiClient.put<ApiResponse<Category>>(`/api/categories/${id}`, categoryData);
    if (!data.success || !data.data) throw new Error(data.message || 'Failed to update category');
    return data.data;
  },

  async delete(id: string): Promise<void> {
    const { data } = await apiClient.delete(`/api/categories/${id}`);
    if (!data.success) throw new Error(data.message || 'Failed to delete category');
  },
};
```

**Checklist:**
- [x] Create `categoryService.ts` (in `src/lib/services/`)
- [x] Implement getAll, getById, create, update, delete
- [x] Handle nested children (backend returns populated)

> **Note:** Service placed in `lib/services/` following project conventions

---

### 3. Product Service (`features/products/services/productService.ts`)

**Implementation:**
```typescript
import apiClient from '@/lib/apiClient';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type { Product, CreateProductRequest, ProductSearchQuery } from '../types';

export const productService = {
  async getAll(query: ProductSearchQuery = {}): Promise<PaginatedResponse<Product>> {
    const { data } = await apiClient.get<ApiResponse<Product[]>>('/api/products', { params: query });
    return {
      data: data.data || [],
      pagination: data.pagination,
    };
  },

  async search(q: string, limit = 10): Promise<Product[]> {
    const { data } = await apiClient.get<ApiResponse<Product[]>>('/api/products/search', {
      params: { q, limit },
    });
    return data.data || [];
  },

  async getById(id: string): Promise<Product> {
    const { data } = await apiClient.get<ApiResponse<Product>>(`/api/products/${id}`);
    if (!data.success || !data.data) throw new Error(data.message || 'Failed to fetch product');
    return data.data;
  },

  async create(productData: CreateProductRequest): Promise<Product> {
    const { data } = await apiClient.post<ApiResponse<Product>>('/api/products', productData);
    if (!data.success || !data.data) throw new Error(data.message || 'Failed to create product');
    return data.data;
  },

  async update(id: string, productData: Partial<CreateProductRequest>): Promise<Product> {
    const { data } = await apiClient.put<ApiResponse<Product>>(`/api/products/${id}`, productData);
    if (!data.success || !data.data) throw new Error(data.message || 'Failed to update product');
    return data.data;
  },

  async delete(id: string): Promise<void> {
    const { data } = await apiClient.delete(`/api/products/${id}`);
    if (!data.success) throw new Error(data.message || 'Failed to delete product');
  },

  async uploadImage(productId: string, imageUrl: string, isPrimary = false): Promise<Product> {
    const { data } = await apiClient.post<ApiResponse<Product>>(`/api/products/${productId}/images`, {
      url: imageUrl,
      isPrimary,
    });
    if (!data.success || !data.data) throw new Error(data.message || 'Failed to upload image');
    return data.data;
  },

  async deleteImage(productId: string, imageId: string): Promise<Product> {
    const { data } = await apiClient.delete<ApiResponse<Product>>(`/api/products/${productId}/images/${imageId}`);
    if (!data.success || !data.data) throw new Error(data.message || 'Failed to delete image');
    return data.data;
  },
};
```

**Checklist:**
- [x] Create `productService.ts` (in `src/lib/services/`)
- [x] Implement getAll, search, getById, create, update, delete
- [x] Implement uploadImage (file), addImageByUrl, deleteImage, setImageAsPrimary

> **Note:** Extended beyond MVP with file upload, drag-drop reorder support

---

### 4. Hooks (`features/categories/hooks/useCategories.ts`, `features/products/hooks/useProducts.ts`)

**Category Hooks:**
```typescript
import useSWR from 'swr';
import { categoryService } from '../services/categoryService';

export const useCategories = () => {
  const { data, error, mutate } = useSWR('/api/categories', () => categoryService.getAll(true));

  return {
    categories: data || [],
    isLoading: !data && !error,
    error,
    refresh: mutate,
  };
};
```

**Product Hooks:**
```typescript
import useSWR from 'swr';
import { productService } from '../services/productService';
import type { ProductSearchQuery } from '../types';

export const useProducts = (query: ProductSearchQuery = {}) => {
  const { data, error, mutate } = useSWR(
    ['/api/products', query],
    () => productService.getAll(query)
  );

  return {
    products: data?.data || [],
    pagination: data?.pagination,
    isLoading: !data && !error,
    error,
    refresh: mutate,
  };
};

export const useProduct = (id: string) => {
  const { data, error, mutate } = useSWR(
    id ? `/api/products/${id}` : null,
    () => productService.getById(id)
  );

  return {
    product: data,
    isLoading: !data && !error,
    error,
    refresh: mutate,
  };
};
```

**Checklist:**
- [x] Create hooks for categories and products (in `src/hooks/`)
- [x] Use **TanStack Query** for caching and revalidation

> **Note:** TanStack Query used instead of SWR for consistency with Phase 1/2

---

### 5. Connect UI to Services

**Product List Page:**
```typescript
'use client';

import { useState } from 'react';
import { useProducts } from '@/features/products/hooks/useProducts';
import ProductCard from '@/components/products/ProductCard';
import SearchBar from '@/components/ui/SearchBar';

export default function ProductsPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | undefined>();
  const [activeFilter, setActiveFilter] = useState<boolean | undefined>(undefined);

  const { products, isLoading, error } = useProducts({
    category,
    active: activeFilter,
    page: 1,
    limit: 20,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Products</h1>
      <SearchBar value={search} onChange={setSearch} placeholder="Search products..." />
      
      {/* Product grid */}
      {isLoading && <div>Loading products...</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {products.map((product) => (
          <ProductCard key={product._id} product={product} />
        ))}
      </div>
    </div>
  );
}
```

**Checklist:**
- [x] Connect product/category list pages to hooks
- [x] Implement search, filter, sort functionality (800ms debounce on all inputs)
- [x] Connect product details page to `useProduct` hook
- [x] Implement product form with create/update logic
- [x] Implement image upload/delete/reorder functionality

---

## Part C: Validation & Security

### Zod Schemas

**Category Schema:**
```typescript
export const categorySchema = z.object({
  name: z.string().min(2).max(50),
  description: z.string().optional(),
  parent: z.string().optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, 'Invalid hex color').optional(),
  sortOrder: z.number().int().optional(),
});
```

**Product Schema:**
```typescript
export const productSchema = z.object({
  name: z.string().min(2).max(200),
  category: z.string().min(1, 'Category required'),
  brand: z.string().optional(),
  model: z.string().optional(),
  costPrice: z.number().positive('Cost price must be positive'),
  sellingPrice: z.number().positive('Selling price must be positive'),
  barcode: z.string().optional(),
  specifications: z.record(z.any()).optional(),
  tags: z.array(z.string()).optional(),
}).refine(data => data.sellingPrice >= data.costPrice, {
  message: 'Selling price must be >= cost price',
  path: ['sellingPrice'],
});
```

**Security Checklist:**
- [x] Admin-only mutations (create, update, delete, image management)
- [x] Validate selling price >= cost price (Zod refine)
- [x] Sanitize text inputs (trim, escape HTML)
- [x] Validate image files (type check, 10MB size limit)

---

## Part D: Testing & Validation

### Manual Testing Checklist

**Categories:**
- [x] View hierarchical category tree
- [x] Create root category
- [x] Create child category (select parent or "Add subcategory" button)
- [x] Edit category (change name, color, parent)
- [x] Delete category (fails if has products or children)
- [x] Display product count per category

**Products:**
- [x] View product list with pagination
- [x] Search products by name, SKU (800ms debounce)
- [x] Filter by category, brand, status, price range
- [x] Sort by name, price, date
- [x] View product details (images, pricing, specs)
- [x] Create product (SKU auto-generated)
- [x] Edit product (update fields)
- [x] Delete product (soft delete)
- [x] Upload product image (**File upload implemented, not just URL**)
- [x] Set primary image
- [x] Delete product image (removes file from disk)
- [x] Drag-and-drop image reorder (**Extended feature**)
- [x] Calculate profit margin correctly

**Responsive Design:**
- [x] Product cards adjust to screen size (1/2/4 columns)
- [x] Forms work on mobile
- [x] Image gallery scrolls on mobile

---

## Part E: Success Criteria

Phase 3 is complete when:
- [x] Category tree displays with hierarchy
- [x] Admin can create, edit, delete categories
- [x] Product catalog displays with search/filter/sort
- [x] Admin can create, edit, delete products
- [x] Product images can be uploaded and managed (**File upload + URL**)
- [x] SKU auto-generates on product creation
- [x] Profit margin calculates correctly
- [x] All validation works
- [x] All manual tests pass
- [x] Responsive design works

✅ **ALL SUCCESS CRITERIA MET** - See `Frontend-Phase-3-done.md` for details

---

## Part F: Next Steps

After completing Phase 3:
1. **Proceed to Phase 4:** Stock & Supplier Management
2. **Enhanced Search:** Implement fuzzy search or autocomplete
3. **Bulk Operations:** Import products via CSV (future phase)

---

## Common Pitfalls

1. **Not handling category hierarchy:** Ensure parent-child relationships work ✅ Handled
2. **SKU not auto-generating:** Backend handles this, display-only on frontend ✅ Handled
3. **Image upload complexity:** ~~Use URL input for MVP, file upload later~~ **File upload implemented from start**
4. **Missing profit margin calculation:** Real-time client-side calculation with `calculateProfitMargin()` ✅
5. **Not testing empty states:** Handle "No products" gracefully ✅ Handled

---

## Implementation Status

**✅ PHASE 3 COMPLETE** - February 2, 2026

See [Frontend-Phase-3-done.md](Frontend-Phase-3-done.md) for:
- Complete file inventory
- API endpoints used
- Bug fixes applied
- Deviations from original spec

---

**End of Phase 3**
