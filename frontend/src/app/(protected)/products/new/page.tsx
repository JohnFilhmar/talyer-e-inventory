'use client';

import React, { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Save, TrendingUp, X, Plus, ScanLine } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  useProduct,
  useCreateProduct,
  useUpdateProduct,
  useUploadProductImage,
} from '@/hooks/useProducts';
import { BarcodeScanner } from '@/components/scanner/BarcodeScanner';
import { ProductImagePicker } from '@/components/products/ProductImagePicker';
import { MotorcycleModelPicker } from '@/components/motorcycle-models';
import { useActiveCategories } from '@/hooks/useCategories';
import { Input } from '@/components/ui/Input';
import { Combobox, type ComboboxOption } from '@/components/ui/Combobox';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { createProductSchema, updateProductSchema, type CreateProductFormData, type UpdateProductFormData } from '@/utils/validators/product';
import { calculateProfitMargin } from '@/types/product';
import {
  isPopulatedMotorcycleModel,
  motorcycleModelId,
  motorcycleModelLabel,
} from '@/types/motorcycleModel';

interface ProductFormProps {
  mode: 'create' | 'edit';
  productId?: string;
}

/**
 * ProductForm component
 * 
 * Shared form for creating and editing products
 * Features:
 * - Real-time profit margin calculation
 * - Category dropdown
 * - Tag management
 * - Specifications fields
 */
function ProductForm({ mode, productId }: ProductFormProps) {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const isEditing = mode === 'edit';

  // Fetch product for editing
  const { data: product, isLoading: productLoading, error: productError } = useProduct(
    isEditing ? productId : undefined
  );

  // Fetch categories for dropdown
  const { data: categories, isLoading: categoriesLoading } = useActiveCategories();

  // Categories are a flat list here rather than the indented tree the old
  // select showed — the combobox filters by substring, so hierarchy is not what
  // the user navigates by any more.
  const categoryOptions = useMemo<ComboboxOption[]>(
    () => (categories ?? []).map((cat) => ({ value: cat._id, label: cat.name })),
    [categories]
  );

  // Mutations
  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct();
  const uploadImageMutation = useUploadProductImage();

  // Scanning fills the barcode field instead of the user reading 13 digits off a
  // label and typing them. A misread digit here is worse than at the counter:
  // it is baked into the catalog and every later scan of the real product misses.
  const [scannerOpen, setScannerOpen] = React.useState(false);
  const [pendingImages, setPendingImages] = React.useState<File[]>([]);
  const [imageError, setImageError] = React.useState<string | null>(null);

  const isSubmitting =
    createMutation.isPending || updateMutation.isPending || uploadImageMutation.isPending;
  const error = createMutation.error || updateMutation.error;

  // Form setup
  const schema = isEditing ? updateProductSchema : createProductSchema;
  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors },
  } = useForm<CreateProductFormData | UpdateProductFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      sku: '',
      description: '',
      category: '',
      brand: '',
      productModel: '',
      motorcycleModels: [],
      costPrice: 0,
      sellingPrice: 0,
      barcode: '',
      tags: [],
      specifications: {
        weight: undefined,
        dimensions: { length: undefined, width: undefined, height: undefined },
        color: '',
        material: '',
        warranty: '',
        origin: '',
      },
    },
  });

  // Watch prices for real-time profit margin calculation
  const costPrice = useWatch({ control, name: 'costPrice' }) ?? 0;
  const sellingPrice = useWatch({ control, name: 'sellingPrice' }) ?? 0;
  const tags = useWatch({ control, name: 'tags' }) ?? [];
  const motorcycleModels = useWatch({ control, name: 'motorcycleModels' }) ?? [];

  // Calculate profit margin in real-time
  const profitMargin = useMemo(() => {
    return calculateProfitMargin(costPrice, sellingPrice);
  }, [costPrice, sellingPrice]);

  // Labels for motorcycles this product is already tagged with but that are no
  // longer active, so their chips read as names rather than raw ids. Without
  // this, deactivating a motorcycle turns every product still carrying it into
  // a row of "Unknown motorcycle".
  const motorcycleModelFallbackLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const entry of product?.motorcycleModels ?? []) {
      if (isPopulatedMotorcycleModel(entry)) {
        labels[entry._id] = motorcycleModelLabel(entry);
      }
    }
    return labels;
  }, [product]);

  // Populate form when editing
  useEffect(() => {
    if (isEditing && product) {
      const categoryId = typeof product.category === 'object' 
        ? product.category._id 
        : product.category;
      
      reset({
        name: product.name,
        sku: product.sku,
        description: product.description ?? '',
        category: categoryId,
        brand: product.brand ?? '',
        productModel: product.productModel ?? '',
        motorcycleModels: (product.motorcycleModels ?? []).map(motorcycleModelId),
        costPrice: product.costPrice,
        sellingPrice: product.sellingPrice,
        barcode: product.barcode ?? '',
        tags: product.tags ?? [],
        specifications: {
          weight: product.specifications?.weight,
          dimensions: product.specifications?.dimensions ?? { length: undefined, width: undefined, height: undefined },
          color: product.specifications?.color ?? '',
          material: product.specifications?.material ?? '',
          warranty: product.specifications?.warranty ?? '',
          origin: product.specifications?.origin ?? '',
        },
      });
    }
  }, [isEditing, product, reset]);

  // Handle form submission
  const onSubmit = async (data: CreateProductFormData | UpdateProductFormData) => {
    try {
      // Clean up empty optional fields
      const cleanData = {
        ...data,
        sku: data.sku || undefined,
        description: data.description || undefined,
        brand: data.brand || undefined,
        productModel: data.productModel || undefined,
        // Sent even when empty, unlike the other optional fields: [] is a
        // meaningful value here ("fits nothing in particular"), and dropping
        // it would make a cleared fitment list impossible to save.
        motorcycleModels: data.motorcycleModels ?? [],
        barcode: data.barcode || undefined,
        tags: data.tags && data.tags.length > 0 ? data.tags : undefined,
        specifications: data.specifications ? {
          ...data.specifications,
          color: data.specifications.color || undefined,
          material: data.specifications.material || undefined,
          warranty: data.specifications.warranty || undefined,
          origin: data.specifications.origin || undefined,
        } : undefined,
      };

      let targetId: string;
      if (isEditing && productId) {
        await updateMutation.mutateAsync({
          id: productId,
          payload: cleanData as UpdateProductFormData,
        });
        targetId = productId;
      } else {
        const newProduct = await createMutation.mutateAsync(cleanData as CreateProductFormData);
        targetId = newProduct._id;
      }

      // Photos can only be uploaded once the product has an id, so this runs
      // after the save rather than as part of it. A failure leaves a perfectly
      // good product behind — say so and stay put rather than navigating away
      // and losing the message.
      const uploaded = await uploadPendingImages(targetId);
      if (!uploaded) return;

      router.push(`/products/${targetId}`);
    } catch {
      // Error handled by mutation state
    }
  };

  /**
   * Uploads staged photos one at a time. Sequential, not parallel: the server
   * resizes each image with sharp, and a burst of concurrent uploads from a
   * phone camera is a memory spike on the box for no gain in wall-clock time.
   */
  const uploadPendingImages = async (targetId: string): Promise<boolean> => {
    if (pendingImages.length === 0) return true;

    setImageError(null);
    const alreadyHasImages = (product?.images?.length ?? 0) > 0;

    for (const [index, file] of pendingImages.entries()) {
      try {
        await uploadImageMutation.mutateAsync({
          productId: targetId,
          file,
          isPrimary: !alreadyHasImages && index === 0,
        });
      } catch (cause) {
        const reason = cause instanceof Error ? cause.message : 'the upload failed';
        setImageError(
          `The product was saved, but "${file.name}" could not be uploaded (${reason}). ` +
            'Remaining photos were not uploaded — retry below, or add them from the product page.'
        );
        // Drop the ones that already landed so a retry does not duplicate them.
        setPendingImages(pendingImages.slice(index));
        return false;
      }
    }

    setPendingImages([]);
    return true;
  };

  // Tag management
  const [tagInput, setTagInput] = React.useState('');

  const handleAddTag = () => {
    const trimmed = tagInput.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed) && tags.length < 20) {
      setValue('tags', [...tags, trimmed]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setValue('tags', tags.filter(t => t !== tag));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  // Auth check
  if (!user || !isAdmin()) {
    return (
      <div className="container mx-auto px-4 py-6">
        <Alert variant="error">
          You do not have permission to {isEditing ? 'edit' : 'create'} products.
        </Alert>
        <div className="mt-4">
          <Link href="/products">
            <Button variant="secondary">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Products
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Loading state for edit
  if (isEditing && productLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner size="lg" />
      </div>
    );
  }

  // Error state for edit
  if (isEditing && productError) {
    return (
      <div className="container mx-auto px-4 py-6">
        <Alert variant="error" title="Error loading product">
          {productError.message}
        </Alert>
        <div className="mt-4">
          <Button variant="secondary" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  // Not found for edit
  if (isEditing && !product) {
    return (
      <div className="container mx-auto px-4 py-6">
        <Alert variant="warning" title="Product not found">
          The product you&apos;re trying to edit does not exist.
        </Alert>
        <div className="mt-4">
          <Link href="/products">
            <Button variant="secondary">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Products
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href={isEditing && productId ? `/products/${productId}` : '/products'}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {isEditing ? 'Edit Product' : 'Add New Product'}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {isEditing ? 'Update product information' : 'Fill in the details for the new product'}
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* Error Alert */}
        {error && (
          <Alert variant="error">
            {error.message}
          </Alert>
        )}

        {/* The product saved but a photo did not — a partial success, not a
            failure, so it is worded so the user does not re-create the product. */}
        {imageError && (
          <Alert variant="warning" title="Product saved, photo upload failed">
            {imageError}
          </Alert>
        )}

        {/* Basic Information */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Basic Information
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Input
                label="Product Name *"
                placeholder="e.g., Cordless Power Drill 20V"
                error={errors.name?.message}
                {...register('name')}
              />
            </div>

            <Input
              label="SKU (Optional)"
              placeholder="Auto-generated if empty"
              error={errors.sku?.message}
              {...register('sku')}
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Category *
              </label>
              <Controller
                name="category"
                control={control}
                render={({ field }) => (
                  <Combobox
                    options={categoryOptions}
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    isLoading={categoriesLoading}
                    placeholder="Search categories..."
                    error={errors.category?.message}
                  />
                )}
              />
            </div>

            <Input
              label="Brand (Optional)"
              placeholder="e.g., DeWalt"
              error={errors.brand?.message}
              {...register('brand')}
            />

            <Input
              label="Product Model (Optional)"
              placeholder="e.g., 45120-KVB-901"
              error={errors.productModel?.message}
              {...register('productModel')}
            />

            <div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Input
                    label="Barcode (Optional)"
                    placeholder="e.g., 123456789012"
                    error={errors.barcode?.message}
                    {...register('barcode')}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setScannerOpen((open) => !open)}
                  disabled={isSubmitting}
                  className="mb-px inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  aria-expanded={scannerOpen}
                >
                  <ScanLine className="w-4 h-4" />
                  {scannerOpen ? 'Close' : 'Scan'}
                </button>
              </div>

              {scannerOpen && (
                <div className="mt-3">
                  <BarcodeScanner
                    onScan={(value) => {
                      // One product has one barcode, so a read replaces the
                      // field and closes the scanner rather than staying open
                      // and overwriting on the next stray read.
                      setValue('barcode', value, { shouldValidate: true, shouldDirty: true });
                      setScannerOpen(false);
                    }}
                    onClose={() => setScannerOpen(false)}
                    hint="Hold the product barcode inside the frame. The code fills the field and the scanner closes."
                  />
                </div>
              )}
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description (Optional)
              </label>
              <textarea
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent resize-none"
                rows={4}
                placeholder="Detailed product description..."
                {...register('description')}
              />
              {errors.description?.message && (
                <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
              )}
            </div>

            <div className="md:col-span-2">
              <MotorcycleModelPicker
                value={motorcycleModels}
                onChange={(ids) =>
                  setValue('motorcycleModels', ids, { shouldDirty: true })
                }
                disabled={isSubmitting}
                label="Fits Motorcycles (Optional)"
                helperText="Add every motorcycle this part fits. Staff can then filter products and search sales by motorcycle."
                error={errors.motorcycleModels?.message}
                fallbackLabels={motorcycleModelFallbackLabels}
              />
            </div>

            <div className="md:col-span-2">
              <ProductImagePicker
                files={pendingImages}
                onChange={setPendingImages}
                existingCount={product?.images?.length ?? 0}
                disabled={isSubmitting}
              />
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Pricing
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Controller
              name="costPrice"
              control={control}
              render={({ field }) => (
                <Input
                  type="number"
                  label="Cost Price (₱) *"
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  error={errors.costPrice?.message}
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : 0)}
                />
              )}
            />

            <Controller
              name="sellingPrice"
              control={control}
              render={({ field }) => (
                <Input
                  type="number"
                  label="Selling Price (₱) *"
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  error={errors.sellingPrice?.message}
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : 0)}
                />
              )}
            />

            {/* Real-time Profit Margin Display */}
            <div className="flex flex-col">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Profit Margin
              </label>
              <div className={`
                flex items-center gap-2 px-3 py-2 rounded-md border
                ${profitMargin >= 20
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                  : profitMargin >= 10
                    ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                }
              `}>
                <TrendingUp className={`
                  w-5 h-5
                  ${profitMargin >= 20
                    ? 'text-green-600 dark:text-green-400'
                    : profitMargin >= 10
                      ? 'text-yellow-600 dark:text-yellow-400'
                      : 'text-red-600 dark:text-red-400'
                  }
                `} />
                <span className={`
                  text-lg font-bold
                  ${profitMargin >= 20
                    ? 'text-green-700 dark:text-green-300'
                    : profitMargin >= 10
                      ? 'text-yellow-700 dark:text-yellow-300'
                      : 'text-red-700 dark:text-red-300'
                  }
                `}>
                  {profitMargin.toFixed(1)}%
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {profitMargin >= 20
                  ? 'Good profit margin'
                  : profitMargin >= 10
                    ? 'Moderate profit margin'
                    : profitMargin > 0
                      ? 'Low profit margin'
                      : 'No profit or loss'}
              </p>
            </div>
          </div>
        </div>

        {/* Tags */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Tags (Optional)
          </h2>

          <div className="space-y-3">
            {/* Tag input */}
            <div className="flex gap-2">
              <Input
                placeholder="Add a tag..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                className="flex-1"
              />
              <Button type="button" variant="secondary" onClick={handleAddTag}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            {/* Tags list */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded text-sm"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {tags.length}/20 tags
            </p>
          </div>
        </div>

        {/* Specifications */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Specifications (Optional)
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Controller
              name="specifications.weight"
              control={control}
              render={({ field }) => (
                <Input
                  type="number"
                  label="Weight (kg)"
                  placeholder="0.0"
                  step="0.01"
                  min="0"
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                />
              )}
            />

            <Input
              label="Color"
              placeholder="e.g., Black"
              {...register('specifications.color')}
            />

            <Input
              label="Material"
              placeholder="e.g., Steel"
              {...register('specifications.material')}
            />

            <Input
              label="Warranty"
              placeholder="e.g., 1 year"
              {...register('specifications.warranty')}
            />

            <Input
              label="Origin"
              placeholder="e.g., Japan"
              {...register('specifications.origin')}
            />
          </div>

          {/* Dimensions */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Dimensions (cm)
            </label>
            <div className="grid grid-cols-3 gap-4">
              <Controller
                name="specifications.dimensions.length"
                control={control}
                render={({ field }) => (
                  <Input
                    type="number"
                    placeholder="Length"
                    step="0.1"
                    min="0"
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                  />
                )}
              />
              <Controller
                name="specifications.dimensions.width"
                control={control}
                render={({ field }) => (
                  <Input
                    type="number"
                    placeholder="Width"
                    step="0.1"
                    min="0"
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                  />
                )}
              />
              <Controller
                name="specifications.dimensions.height"
                control={control}
                render={({ field }) => (
                  <Input
                    type="number"
                    placeholder="Height"
                    step="0.1"
                    min="0"
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                  />
                )}
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <Link href={isEditing && productId ? `/products/${productId}` : '/products'}>
            <Button type="button" variant="secondary" disabled={isSubmitting}>
              Cancel
            </Button>
          </Link>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <Spinner size="sm" />
                {isEditing ? 'Saving...' : 'Creating...'}
              </span>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                {isEditing ? 'Save Changes' : 'Create Product'}
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

// Page components
export default function NewProductPage() {
  return <ProductForm mode="create" />;
}
