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
  Camera,
  Bike,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useBranches } from '@/hooks/useBranches';
import { useStockByBranch } from '@/hooks/useStock';
import { useCreateSalesOrder } from '@/hooks/useSales';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { BarcodeScanner } from '@/components/scanner/BarcodeScanner';
import { Combobox, type ComboboxOption } from '@/components/ui/Combobox';
import { useActiveMotorcycleModels, groupByMake } from '@/hooks/useMotorcycleModels';
import { MotorcycleModelBadges } from '@/components/motorcycle-models';
import {
  isPopulatedMotorcycleModel,
  motorcycleModelLabel,
} from '@/types/motorcycleModel';
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
  const [scannerOpen, setScannerOpen] = useState(false);
  // Last scan outcome, shown under the scanner. Without it a scan that matches
  // nothing is completely silent and reads as the camera being broken.
  const [scanFeedback, setScanFeedback] = useState<string | null>(null);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  // "Fits motorcycle" narrows the picker to parts for one bike. Single-select,
  // not multi: at the counter there is one customer with one motorcycle in
  // front of you.
  const [motorcycleFilter, setMotorcycleFilter] = useState('');
  
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

  // Motorcycle models for the fitment dropdown. Read through the offline
  // mirror like everything else on this screen, so the filter still works on a
  // dropped connection.
  const { data: motorcycleModels, isLoading: motorcycleModelsLoading } =
    useActiveMotorcycleModels();

  // Grouped by make and pre-sorted so the combobox can render make headings.
  const motorcycleOptions = useMemo<ComboboxOption[]>(
    () =>
      groupByMake(motorcycleModels ?? []).flatMap(({ make, models }) =>
        models.map((motorcycleModel) => ({
          value: motorcycleModel._id,
          label: motorcycleModelLabel(motorcycleModel),
          group: make,
        }))
      ),
    [motorcycleModels]
  );

  // Create order mutation
  const createOrderMutation = useCreateSalesOrder();

  // Form setup
  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
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

  // Filter stock by the fitment dropdown and the search box.
  //
  // The two are independent: picking a motorcycle alone lists everything that
  // fits it (no typing required), typing alone searches the whole branch, and
  // both together narrow to parts for that bike matching the text.
  //
  // Search is "mixed" — the same box matches a part (name, SKU, barcode, the
  // manufacturer's model designation) and a motorcycle ("Click 125i"), so a
  // salesperson does not have to decide which kind of thing they are typing
  // before they type it.
  const filteredStock = useMemo(() => {
    if (!branchStock) return [];
    if (!productSearch && !motorcycleFilter) return [];

    const searchLower = productSearch.toLowerCase();

    return branchStock
      .filter((stock) => {
        if (!isStockProductPopulated(stock.product)) return false;
        const product = stock.product;

        // Only show items with available stock
        if (stock.available <= 0) return false;

        const fitments = (product.motorcycleModels ?? []).filter(
          isPopulatedMotorcycleModel
        );

        if (motorcycleFilter && !fitments.some((m) => m._id === motorcycleFilter)) {
          return false;
        }

        if (!searchLower) return true;

        return (
          product.name.toLowerCase().includes(searchLower) ||
          product.sku.toLowerCase().includes(searchLower) ||
          (product.productModel?.toLowerCase().includes(searchLower) ?? false) ||
          (product.barcode?.toLowerCase().includes(searchLower) ?? false) ||
          fitments.some((m) =>
            motorcycleModelLabel(m).toLowerCase().includes(searchLower)
          )
        );
      })
      .slice(0, 10); // Limit to 10 results
  }, [branchStock, productSearch, motorcycleFilter]);

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

  // Resolve a scanned barcode against the branch stock already loaded for the
  // picker. That list comes from the offline mirror when there is no
  // connection, so scanning keeps working offline — which is the point.
  const handleScan = useCallback((code: string) => {
    const match = branchStock?.find(
      (stock) =>
        isStockProductPopulated(stock.product) &&
        stock.product.barcode &&
        stock.product.barcode.trim() === code
    );

    if (!match || !isStockProductPopulated(match.product)) {
      setScanFeedback(`No product at this branch has barcode ${code}.`);
      return;
    }

    if (match.available <= 0) {
      setScanFeedback(`${match.product.name} is out of stock at this branch.`);
      return;
    }

    handleAddProduct(match);
    setScanFeedback(`Added ${match.product.name}.`);
  }, [branchStock, handleAddProduct]);

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

  // Quick pay buttons.
  //
  // Denominations *add* to whatever has been entered so far, so tendered cash
  // can be tallied the way it is actually handed over — two ₱100 notes is two
  // taps, not mental arithmetic then a manual edit. 'Exact' and 'Clear' set
  // an absolute value instead, since those are corrections rather than counts.
  const quickPayAmounts: Array<{ label: string; amount: number; mode: 'add' | 'set' }> = [
    { label: 'Exact', amount: orderTotals.total, mode: 'set' },
    { label: 'Clear', amount: 0, mode: 'set' },
    { label: '₱100', amount: 100, mode: 'add' },
    { label: '₱500', amount: 500, mode: 'add' },
    { label: '₱1000', amount: 1000, mode: 'add' },
    { label: '₱2000', amount: 2000, mode: 'add' },
  ];

  const applyQuickPay = (qa: { amount: number; mode: 'add' | 'set' }) => {
    const current = Number(getValues('amountPaid')) || 0;
    setValue('amountPaid', qa.mode === 'add' ? current + qa.amount : qa.amount, {
      shouldValidate: true,
      shouldDirty: true,
    });
  };

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

              {/* Scan / search toggle. Scanning resolves against the same
                  branch stock the picker already holds, so it works offline. */}
              {activeBranchId && (
                <div className="mb-3">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setScannerOpen((open) => !open);
                      setScanFeedback(null);
                    }}
                    disabled={stockLoading}
                  >
                    <Camera className="w-4 h-4 mr-1" />
                    {scannerOpen ? 'Close scanner' : 'Scan barcode'}
                  </Button>
                </div>
              )}

              {activeBranchId && scannerOpen && (
                <div className="mb-4">
                  <BarcodeScanner
                    onScan={handleScan}
                    onClose={() => setScannerOpen(false)}
                    hint="Hold a barcode inside the frame. Items are added as they are scanned; scanning the same product again increases its quantity."
                  />
                  {scanFeedback && (
                    <p className="mt-2 text-sm text-black" role="status" aria-live="polite">
                      {scanFeedback}
                    </p>
                  )}
                </div>
              )}

              {/* Fits-motorcycle filter. Sits above the search box because it
                  is asked first at the counter — "what bike?" then "what
                  part?" — and on its own it lists every part for that bike
                  with nothing typed. */}
              {activeBranchId && (
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <Bike className="w-4 h-4 inline mr-1" />
                    Fits motorcycle
                  </label>
                  <Combobox
                    options={motorcycleOptions}
                    value={motorcycleFilter}
                    onChange={(next) => {
                      setMotorcycleFilter(next);
                      setShowProductDropdown(true);
                    }}
                    isLoading={motorcycleModelsLoading}
                    disabled={stockLoading}
                    placeholder="Any motorcycle"
                    emptyOptionLabel="Any motorcycle"
                  />
                </div>
              )}

              {/* Product Search */}
              {activeBranchId ? (
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by product, SKU, barcode or motorcycle..."
                    value={productSearch}
                    onChange={(e) => {
                      setProductSearch(e.target.value);
                      setShowProductDropdown(true);
                    }}
                    onFocus={() => setShowProductDropdown(true)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={stockLoading}
                  />

                  {/* Search Results Dropdown. Opens on a picked motorcycle as
                      well as on typed text — a fitment alone is a complete
                      query, so requiring two characters would hide the results
                      the dropdown was just told to show. */}
                  {showProductDropdown && (productSearch.length >= 2 || !!motorcycleFilter) && (
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
                                <div className="min-w-0">
                                  <p className="font-medium text-gray-900 dark:text-gray-100">
                                    {product.name}
                                  </p>
                                  <p className="text-sm text-gray-500">
                                    SKU: {product.sku} | Available: {stock.available}
                                  </p>
                                  {/* Fitment on the row itself: with a mixed
                                      search, a result can match on the bike
                                      rather than the part name, and without
                                      this the match looks arbitrary. */}
                                  <MotorcycleModelBadges
                                    motorcycleModels={product.motorcycleModels}
                                    max={3}
                                    className="mt-1"
                                  />
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
                          {motorcycleFilter
                            ? 'No products in stock for this motorcycle'
                            : 'No products found'}
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
                    onClick={() => applyQuickPay(qa)}
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
