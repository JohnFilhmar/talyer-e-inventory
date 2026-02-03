'use client';

import React, { useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Save, TrendingUp, X, Plus, ImageIcon } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProduct, useUpdateProduct } from '@/hooks/useProducts';
import { useActiveCategories } from '@/hooks/useCategories';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { ProductImageEditor } from '@/components/products';
import { updateProductSchema, type UpdateProductFormData } from '@/utils/validators/product';
import { calculateProfitMargin } from '@/types/product';

/**
 * Edit Product Page
 * 
 * Dedicated page for editing existing products
 * Features real-time profit margin calculation and image management
 */
export default function EditProductPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params.id as string;
  const { user, isAdmin } = useAuth();
  // Fetch product
  const { data: product, isLoading: productLoading, error: productError } = useProduct(productId);

  // Fetch categories for dropdown
  const { data: categories, isLoading: categoriesLoading } = useActiveCategories();

  // Mutation
  const updateMutation = useUpdateProduct();

  // Form setup
  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors },
  } = useForm<UpdateProductFormData>({
    resolver: zodResolver(updateProductSchema),
    defaultValues: {
      name: '',
      sku: '',
      description: '',
      category: '',
      brand: '',
      model: '',
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
      isActive: true,
      isDiscontinued: false,
    },
  });

  // Watch prices for real-time profit margin calculation
  const costPrice = useWatch({ control, name: 'costPrice' }) ?? 0;
  const sellingPrice = useWatch({ control, name: 'sellingPrice' }) ?? 0;
  const tags = useWatch({ control, name: 'tags' }) ?? [];

  // Calculate profit margin in real-time
  const profitMargin = useMemo(() => {
    return calculateProfitMargin(costPrice, sellingPrice);
  }, [costPrice, sellingPrice]);

  // Populate form when product loads
  useEffect(() => {
    if (product) {
      const categoryId = typeof product.category === 'object' 
        ? product.category._id 
        : product.category;
      
      reset({
        name: product.name,
        sku: product.sku,
        description: product.description ?? '',
        category: categoryId,
        brand: product.brand ?? '',
        model: product.model ?? '',
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
        isActive: product.isActive,
        isDiscontinued: product.isDiscontinued,
      });
    }
  }, [product, reset]);

  // Handle form submission
  const onSubmit = async (data: UpdateProductFormData) => {
    try {
      // Clean up empty optional fields
      const cleanData = {
        ...data,
        sku: data.sku || undefined,
        description: data.description || undefined,
        brand: data.brand || undefined,
        model: data.model || undefined,
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

      await updateMutation.mutateAsync({
        id: productId,
        payload: cleanData,
      });
      router.push(`/products/${productId}`);
    } catch {
      // Error handled by mutation state
    }
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
          You do not have permission to edit products.
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

  // Loading state
  if (productLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner size="lg" />
      </div>
    );
  }

  // Error state
  if (productError) {
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

  // Not found
  if (!product) {
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
        <Link href={`/products/${productId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Edit Product
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {product.name}
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* Error Alert */}
        {updateMutation.error && (
          <Alert variant="error">
            {updateMutation.error.message}
          </Alert>
        )}

        {/* Status Controls */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Status
          </h2>
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 text-yellow-500 border-gray-300 rounded focus:ring-yellow-500"
                {...register('isActive')}
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Active (visible in listings)
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 text-red-500 border-gray-300 rounded focus:ring-red-500"
                {...register('isDiscontinued')}
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Discontinued
              </span>
            </label>
          </div>
        </div>

        {/* Product Images */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-2 mb-4">
            <ImageIcon className="w-5 h-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Product Images
            </h2>
          </div>
          <ProductImageEditor
            productId={productId}
            images={product.images ?? []}
            onImagesChange={() => {
              // Refetch product to get updated images
              // The hook will automatically refetch due to query invalidation
            }}
          />
        </div>

        {/* Basic Information */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Basic Information
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Input
                label="Product Name"
                placeholder="e.g., Cordless Power Drill 20V"
                error={errors.name?.message}
                {...register('name')}
              />
            </div>

            <Input
              label="SKU"
              placeholder="e.g., PROD-000001"
              error={errors.sku?.message}
              {...register('sku')}
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Category
              </label>
              {categoriesLoading ? (
                <div className="flex items-center gap-2 p-2">
                  <Spinner size="sm" />
                  <span className="text-sm text-gray-500">Loading categories...</span>
                </div>
              ) : (
                <select
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                  {...register('category')}
                >
                  <option value="">Select a category</option>
                  {categories?.map((cat) => (
                    <option key={cat._id} value={cat._id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              )}
              {errors.category?.message && (
                <p className="mt-1 text-sm text-red-600">{errors.category.message}</p>
              )}
            </div>

            <Input
              label="Brand"
              placeholder="e.g., DeWalt"
              error={errors.brand?.message}
              {...register('brand')}
            />

            <Input
              label="Model"
              placeholder="e.g., DCD771C2"
              error={errors.model?.message}
              {...register('model')}
            />

            <Input
              label="Barcode"
              placeholder="e.g., 123456789012"
              error={errors.barcode?.message}
              {...register('barcode')}
            />

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description
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
                  label="Cost Price (₱)"
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
                  label="Selling Price (₱)"
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
            Tags
          </h2>

          <div className="space-y-3">
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
            Specifications
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
          <Link href={`/products/${productId}`}>
            <Button type="button" variant="secondary" disabled={updateMutation.isPending}>
              Cancel
            </Button>
          </Link>
          <Button type="submit" variant="primary" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? (
              <span className="flex items-center gap-2">
                <Spinner size="sm" />
                Saving...
              </span>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
