'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ShoppingCart,
  ArrowLeft,
  Search,
  Plus,
  Minus,
  Trash2,
  User,
  Phone,
  Mail,
  MapPin,
  Calculator,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useBranches } from '@/hooks/useBranches';
import { useStockByBranch } from '@/hooks/useStock';
import { useCreateSalesOrder } from '@/hooks/useSales';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import {
  PAYMENT_METHOD_OPTIONS,
  calculateOrderTotals,
  normalizePhoneNumber,
} from '@/types/sales';
import type { Stock, StockProduct } from '@/types/stock';
import type { CreateSalesOrderPayload } from '@/types/sales';

/**
 * Format currency in Philippine Peso
 */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(amount);
}

// Type guard for populated stock product
function isStockProductPopulated(product: Stock['product']): product is StockProduct {
  return typeof product === 'object' && product !== null && '_id' in product;
}

// Local item type for display (includes price info for calculations)
interface LocalOrderItem {
  product: string;
  productName: string;
  productSku: string;
  quantity: number;
  unitPrice: number;
  maxQuantity: number;
  discount: number;
}

// Form schema for validation (flattened structure matching backend)
const formSchema = z.object({
  branch: z.string().min(1, 'Branch is required'),
  customer: z.object({
    name: z.string().min(1, 'Customer name is required'),
    phone: z.string().optional(),
    email: z.string().email('Invalid email').optional().or(z.literal('')),
    address: z.string().optional(),
  }),
  taxRate: z.number().min(0).max(100),
  discount: z.number().min(0),
  paymentMethod: z.enum(['cash', 'card', 'gcash', 'paymaya', 'bank-transfer']),
  amountPaid: z.number().min(0),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;
type PaymentMethodType = FormData['paymentMethod'];

/**
 * New Sale Page
 *
 * Form for creating a new sales order.
 * Includes product search, customer info, and payment details.
 */
export default function NewSalePage() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  
  // State for product search
  const [productSearch, setProductSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  
  // Local state for order items (with display info)
  const [orderItems, setOrderItems] = useState<LocalOrderItem[]>([]);

  // Get user's branch or allow selection for admin
  const userBranchId = useMemo(() => {
    if (isAdmin() || !user?.branch) return undefined;
    return typeof user.branch === 'string' 
      ? user.branch 
      : (user.branch as { _id: string })._id;
  }, [user, isAdmin]);

  // Fetch branches for admin selection
  const { data: branchesData, isLoading: branchesLoading } = useBranches();
  const branches = useMemo(() => branchesData?.data || [], [branchesData]);

  // Selected branch state (for admin users)
  const [selectedBranchId, setSelectedBranchId] = useState<string>(userBranchId || '');

  // Active branch ID (user's branch or admin-selected)
  const activeBranchId = userBranchId || selectedBranchId;

  // Fetch stock for the active branch
  const { data: branchStock, isLoading: stockLoading } = useStockByBranch(activeBranchId);

  // Create order mutation
  const createOrderMutation = useCreateSalesOrder();

  // Form setup
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      branch: activeBranchId,
      customer: {
        name: '',
        phone: '',
        email: '',
        address: '',
      },
      taxRate: 12, // Default 12% VAT
      discount: 0,
      paymentMethod: 'cash',
      amountPaid: 0,
      notes: '',
    },
  });

  // Watch form values for calculations
  const taxRate = useWatch({ control, name: 'taxRate', defaultValue: 0 }) || 0;
  const discount = useWatch({ control, name: 'discount', defaultValue: 0 }) || 0;
  const paymentMethod = useWatch({ control, name: 'paymentMethod', defaultValue: 'cash' });
  const amountPaid = useWatch({ control, name: 'amountPaid', defaultValue: 0 }) || 0;

  // Update branch when activeBranchId changes
  useEffect(() => {
    if (activeBranchId) {
      setValue('branch', activeBranchId);
    }
  }, [activeBranchId, setValue]);

  // Calculate order totals from local items
  const orderTotals = useMemo(() => {
    const itemsForCalc = orderItems.map(item => ({
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount,
    }));
    return calculateOrderTotals(itemsForCalc, taxRate, discount);
  }, [orderItems, taxRate, discount]);

  // Calculate change
  const change = useMemo(() => {
    return Math.max(0, amountPaid - orderTotals.total);
  }, [amountPaid, orderTotals.total]);

  // Balance due
  const balanceDue = useMemo(() => {
    return Math.max(0, orderTotals.total - amountPaid);
  }, [amountPaid, orderTotals.total]);

  // Filter stock by search
  const filteredStock = useMemo(() => {
    if (!branchStock || !productSearch) return [];
    
    const searchLower = productSearch.toLowerCase();
    return branchStock.filter((stock) => {
      if (!isStockProductPopulated(stock.product)) return false;
      const product = stock.product;
      
      // Only show items with available stock
      if (stock.available <= 0) return false;

      return (
        product.name.toLowerCase().includes(searchLower) ||
        product.sku.toLowerCase().includes(searchLower)
      );
    }).slice(0, 10); // Limit to 10 results
  }, [branchStock, productSearch]);

  // Handle adding a product to order
  const handleAddProduct = useCallback((stock: Stock) => {
    if (!isStockProductPopulated(stock.product)) return;
    
    const product = stock.product;
    
    // Check if product already in items
    const existingIndex = orderItems.findIndex(
      (item) => item.product === product._id
    );

    if (existingIndex >= 0) {
      // Increase quantity if not exceeding available
      const currentQty = orderItems[existingIndex].quantity;
      if (currentQty < stock.available) {
        setOrderItems(prev => prev.map((item, idx) => 
          idx === existingIndex 
            ? { ...item, quantity: item.quantity + 1 }
            : item
        ));
      }
    } else {
      // Add new item
      setOrderItems(prev => [...prev, {
        product: product._id,
        productName: product.name,
        productSku: product.sku,
        quantity: 1,
        unitPrice: stock.sellingPrice,
        maxQuantity: stock.available,
        discount: 0,
      }]);
    }

    setProductSearch('');
    setShowProductDropdown(false);
  }, [orderItems]);

  // Handle quantity change
  const handleQuantityChange = useCallback((index: number, delta: number) => {
    setOrderItems(prev => {
      const item = prev[index];
      const newQuantity = item.quantity + delta;
      
      if (newQuantity < 1) {
        return prev.filter((_, idx) => idx !== index);
      } else if (newQuantity <= item.maxQuantity) {
        return prev.map((it, idx) => 
          idx === index ? { ...it, quantity: newQuantity } : it
        );
      }
      return prev;
    });
  }, []);

  // Handle item removal
  const handleRemoveItem = useCallback((index: number) => {
    setOrderItems(prev => prev.filter((_, idx) => idx !== index));
  }, []);

  // Handle form submission
  const handleFormSubmit = async (data: FormData) => {
    if (orderItems.length === 0) return;
    
    try {
      // Build the payload matching backend expectations
      // Note: unitPrice is NOT sent - backend fetches it from Stock.sellingPrice
      const payload: CreateSalesOrderPayload = {
        branch: data.branch,
        customer: {
          name: data.customer.name,
          phone: data.customer.phone ? normalizePhoneNumber(data.customer.phone) : undefined,
          email: data.customer.email || undefined,
          address: data.customer.address || undefined,
        },
        items: orderItems.map(item => ({
          product: item.product,
          quantity: item.quantity,
          discount: item.discount,
        })),
        taxRate: data.taxRate,
        discount: data.discount,
        paymentMethod: data.paymentMethod,
        amountPaid: data.amountPaid,
        notes: data.notes,
      };

      await createOrderMutation.mutateAsync(payload);
      
      // Navigate to sales list on success
      router.push('/sales');
    } catch (error) {
      console.error('Failed to create order:', error);
    }
  };

  // Quick pay buttons
  const quickPayAmounts = [
    { label: 'Exact', amount: orderTotals.total },
    { label: '₱100', amount: 100 },
    { label: '₱500', amount: 500 },
    { label: '₱1000', amount: 1000 },
    { label: '₱2000', amount: 2000 },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.back()}
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
              <ShoppingCart className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                New Sale
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Create a new sales order
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {createOrderMutation.error && (
        <Alert variant="error">
          Failed to create order: {createOrderMutation.error.message}
        </Alert>
      )}

      <form onSubmit={handleSubmit(handleFormSubmit)}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Products & Customer */}
          <div className="lg:col-span-2 space-y-6">
            {/* Branch Selection (Admin only) */}
            {isAdmin() && (
              <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Branch <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedBranchId}
                  onChange={(e) => {
                    setSelectedBranchId(e.target.value);
                    // Clear items when branch changes
                    setOrderItems([]);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={branchesLoading}
                >
                  <option value="">Select a branch</option>
                  {branches.map((branch) => (
                    <option key={branch._id} value={branch._id}>
                      {branch.name} ({branch.code})
                    </option>
                  ))}
                </select>
                {errors.branch && (
                  <p className="mt-1 text-sm text-red-600">{errors.branch.message}</p>
                )}
              </div>
            )}

            {/* Product Search & Selection */}
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Order Items
              </h3>

              {/* Product Search */}
              {activeBranchId ? (
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search products by name or SKU..."
                    value={productSearch}
                    onChange={(e) => {
                      setProductSearch(e.target.value);
                      setShowProductDropdown(true);
                    }}
                    onFocus={() => setShowProductDropdown(true)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={stockLoading}
                  />
                  
                  {/* Search Results Dropdown */}
                  {showProductDropdown && productSearch.length >= 2 && (
                    <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                      {stockLoading ? (
                        <div className="p-4 text-center">
                          <Spinner size="sm" />
                          <span className="ml-2 text-sm text-gray-500">Loading...</span>
                        </div>
                      ) : filteredStock.length > 0 ? (
                        filteredStock.map((stock) => {
                          const product = stock.product as StockProduct;
                          return (
                            <button
                              key={stock._id}
                              type="button"
                              onClick={() => handleAddProduct(stock)}
                              className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium text-gray-900 dark:text-gray-100">
                                    {product.name}
                                  </p>
                                  <p className="text-sm text-gray-500">
                                    SKU: {product.sku} | Available: {stock.available}
                                  </p>
                                </div>
                                <span className="font-medium text-green-600 dark:text-green-400">
                                  {formatCurrency(stock.sellingPrice)}
                                </span>
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <div className="p-4 text-center text-gray-500">
                          No products found
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <Alert variant="info" className="mb-4">
                  Please select a branch to search for products.
                </Alert>
              )}

              {/* Order Items List */}
              {orderItems.length > 0 ? (
                <div className="space-y-3">
                  {orderItems.map((item, index) => {
                    const itemTotal = item.quantity * item.unitPrice;
                    
                    return (
                      <div
                        key={`${item.product}-${index}`}
                        className="flex items-center gap-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                            {item.productName}
                          </p>
                          <p className="text-sm text-gray-500">
                            {formatCurrency(item.unitPrice)} each
                          </p>
                        </div>
                        
                        {/* Quantity Controls */}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleQuantityChange(index, -1)}
                            className="p-1 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="w-8 text-center font-medium">
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => handleQuantityChange(index, parseInt(e.target.value) - item.quantity)}
                              className="w-full text-center bg-transparent border-none focus:outline-none"
                              min="1"
                              max={item.maxQuantity}
                            />
                          </span>
                          <button
                            type="button"
                            onClick={() => handleQuantityChange(index, 1)}
                            className="p-1 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
                            disabled={item.quantity >= item.maxQuantity}
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Item Total */}
                        <div className="w-24 text-right">
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {formatCurrency(itemTotal)}
                          </span>
                        </div>

                        {/* Remove Button */}
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(index)}
                          className="p-1 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No items added yet</p>
                  <p className="text-sm">Search and add products above</p>
                </div>
              )}

              {orderItems.length === 0 && (
                <p className="mt-2 text-sm text-amber-600">At least one item is required</p>
              )}
            </div>

            {/* Customer Information */}
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Customer Information
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Customer Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <User className="w-4 h-4 inline mr-1" />
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    {...register('customer.name')}
                    type="text"
                    placeholder="Customer name"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  {errors.customer?.name && (
                    <p className="mt-1 text-sm text-red-600">{errors.customer.name.message}</p>
                  )}
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <Phone className="w-4 h-4 inline mr-1" />
                    Phone
                  </label>
                  <div className="flex">
                    <span className="inline-flex items-center px-3 py-2 rounded-l-lg border border-r-0 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-500 text-sm">
                      +63
                    </span>
                    <input
                      {...register('customer.phone')}
                      type="tel"
                      placeholder="9XXXXXXXXX"
                      maxLength={10}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-r-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Enter 10 digits starting with 9 (e.g., 9171234567)
                  </p>
                  {errors.customer?.phone && (
                    <p className="mt-1 text-sm text-red-600">{errors.customer.phone.message}</p>
                  )}
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <Mail className="w-4 h-4 inline mr-1" />
                    Email
                  </label>
                  <input
                    {...register('customer.email')}
                    type="email"
                    placeholder="customer@example.com"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  {errors.customer?.email && (
                    <p className="mt-1 text-sm text-red-600">{errors.customer.email.message}</p>
                  )}
                </div>

                {/* Address */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <MapPin className="w-4 h-4 inline mr-1" />
                    Address
                  </label>
                  <input
                    {...register('customer.address')}
                    type="text"
                    placeholder="Customer address"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  {errors.customer?.address && (
                    <p className="mt-1 text-sm text-red-600">{errors.customer.address.message}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Order Summary & Payment */}
          <div className="space-y-6">
            {/* Order Summary */}
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <Calculator className="w-5 h-5" />
                Order Summary
              </h3>

              <div className="space-y-3">
                {/* Subtotal */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Subtotal</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {formatCurrency(orderTotals.subtotal)}
                  </span>
                </div>

                {/* Tax */}
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600 dark:text-gray-400">Tax</span>
                    <input
                      {...register('taxRate', { valueAsNumber: true })}
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      className="w-16 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs text-center bg-white dark:bg-gray-800"
                    />
                    <span className="text-gray-500">%</span>
                  </div>
                  <span className="text-gray-900 dark:text-gray-100">
                    {formatCurrency(orderTotals.taxAmount)}
                  </span>
                </div>

                {/* Discount */}
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600 dark:text-gray-400">Discount</span>
                    <span className="text-gray-500">₱</span>
                    <input
                      {...register('discount', { valueAsNumber: true })}
                      type="number"
                      step="0.01"
                      min="0"
                      className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs bg-white dark:bg-gray-800"
                    />
                  </div>
                  <span className="text-red-600 dark:text-red-400">
                    -{formatCurrency(discount)}
                  </span>
                </div>

                <hr className="border-gray-200 dark:border-gray-700" />

                {/* Total */}
                <div className="flex items-center justify-between">
                  <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">Total</span>
                  <span className="text-xl font-bold text-blue-600 dark:text-blue-400">
                    {formatCurrency(orderTotals.total)}
                  </span>
                </div>
              </div>
            </div>

            {/* Payment */}
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Payment
              </h3>

              {/* Payment Method */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Payment Method
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {PAYMENT_METHOD_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setValue('paymentMethod', option.value as PaymentMethodType)}
                      className={`px-2 py-2 rounded-lg border text-xs font-medium transition-colors ${
                        paymentMethod === option.value
                          ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                          : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount Paid */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Amount Paid
                </label>
                <input
                  {...register('amountPaid', { valueAsNumber: true })}
                  type="number"
                  step="0.01"
                  min="0"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="0.00"
                />
              </div>

              {/* Quick Pay Buttons */}
              <div className="flex flex-wrap gap-2 mb-4">
                {quickPayAmounts.map((qa) => (
                  <button
                    key={qa.label}
                    type="button"
                    onClick={() => setValue('amountPaid', qa.amount)}
                    className="px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                  >
                    {qa.label}
                  </button>
                ))}
              </div>

              {/* Balance / Change Display */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-2">
                {change > 0 ? (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Change</span>
                    <span className="text-lg font-bold text-green-600 dark:text-green-400">
                      {formatCurrency(change)}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Balance Due</span>
                    <span className={`text-lg font-bold ${balanceDue > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                      {formatCurrency(balanceDue)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={
                createOrderMutation.isPending ||
                orderItems.length === 0 ||
                !activeBranchId
              }
              isLoading={createOrderMutation.isPending}
            >
              <ShoppingCart className="w-5 h-5 mr-2" />
              Create Order
            </Button>
          </div>
        </div>
      </form>

      {/* Click outside to close dropdown */}
      {showProductDropdown && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setShowProductDropdown(false)}
        />
      )}
    </div>
  );
}
