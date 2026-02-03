'use client';

import React, { useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Edit,
  Trash2,
  Archive,
  Upload,
  Tag,
  ChevronRight,
  Package,
  Barcode,
  Calendar,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  useProduct,
  useDeleteProduct,
  useUploadProductImage,
  useDeleteProductImage,
  useSetProductImageAsPrimary,
} from '@/hooks/useProducts';
import { ProductImageGallery, ImageUploadModal, DeleteProductModal, ProductBranchStock } from '@/components/products';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { calculateProfitMargin, isPopulatedCategory } from '@/types/product';

/**
 * Format price in Philippine Peso
 */
function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(amount);
}

/**
 * Format date
 */
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Product detail page
 * 
 * Features:
 * - Image gallery with zoom and navigation
 * - Full product information display
 * - Admin can edit, delete, upload/manage images
 */
export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params.id as string;
  const { user, isAdmin } = useAuth();
  const showAdminActions = isAdmin();

  // Modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Fetch product
  const { data: product, isLoading, error } = useProduct(productId);

  // Mutations
  const deleteMutation = useDeleteProduct();
  const uploadMutation = useUploadProductImage();
  const deleteImageMutation = useDeleteProductImage();
  const setPrimaryMutation = useSetProductImageAsPrimary();

  // Handlers
  const handleEdit = useCallback(() => {
    router.push(`/products/${productId}/edit`);
  }, [router, productId]);

  const handleDelete = useCallback(() => {
    setShowDeleteModal(true);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    try {
      await deleteMutation.mutateAsync(productId);
      router.push('/products');
    } catch {
      // Error handled by mutation state
    }
  }, [deleteMutation, productId, router]);

  const handleUploadImage = useCallback(async (file: File, isPrimary: boolean) => {
    await uploadMutation.mutateAsync({
      productId,
      file,
      isPrimary,
    });
    setShowUploadModal(false);
  }, [uploadMutation, productId]);

  const handleDeleteImage = useCallback(async (imageId: string) => {
    if (!window.confirm('Are you sure you want to delete this image?')) return;
    await deleteImageMutation.mutateAsync({ productId, imageId });
  }, [deleteImageMutation, productId]);

  const handleSetPrimary = useCallback(async (imageId: string) => {
    if (!product) return;
    await setPrimaryMutation.mutateAsync({
      productId,
      imageId,
      currentImages: product.images,
    });
  }, [setPrimaryMutation, productId, product]);

  // Check if user has access
  if (!user) {
    return (
      <div className="text-center py-12">
        <Alert variant="error">
          Please log in to view this page.
        </Alert>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-6">
        <Alert variant="error" title="Error loading product">
          {error.message}
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

  if (!product) {
    return (
      <div className="container mx-auto px-4 py-6">
        <Alert variant="warning" title="Product not found">
          The product you&apos;re looking for does not exist or has been removed.
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

  const profitMargin = calculateProfitMargin(product.costPrice, product.sellingPrice);
  const categoryName = isPopulatedCategory(product.category)
    ? product.category.name
    : 'Uncategorized';
  const categoryColor = isPopulatedCategory(product.category)
    ? product.category.color
    : undefined;

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-6">
        <Link href="/products" className="hover:text-gray-700 dark:hover:text-gray-200">
          Products
        </Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 dark:text-gray-100 truncate">{product.name}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column - Image Gallery */}
        <div>
          <ProductImageGallery
            images={product.images}
            productName={product.name}
            onDeleteImage={showAdminActions ? handleDeleteImage : undefined}
            onSetPrimary={showAdminActions ? handleSetPrimary : undefined}
            isAdmin={showAdminActions}
            isDeleting={deleteImageMutation.isPending}
          />

          {/* Upload Image Button */}
          {showAdminActions && (
            <Button
              variant="secondary"
              className="w-full mt-4"
              onClick={() => setShowUploadModal(true)}
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload Image
            </Button>
          )}
        </div>

        {/* Right Column - Product Info */}
        <div>
          {/* Status Badges */}
          <div className="flex items-center gap-2 mb-3">
            {!product.isActive && <Badge variant="warning">Inactive</Badge>}
            {product.isDiscontinued && <Badge variant="error">Discontinued</Badge>}
          </div>

          {/* Category */}
          <div className="flex items-center gap-2 mb-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: categoryColor ?? '#6B7280' }}
            />
            <span className="text-sm text-gray-500 dark:text-gray-400">{categoryName}</span>
          </div>

          {/* Product Name */}
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            {product.name}
          </h1>

          {/* SKU */}
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-4">
            <Package className="w-4 h-4" />
            <span>SKU: {product.sku}</span>
          </div>

          {/* Brand & Model */}
          {(product.brand || product.model) && (
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              {product.brand}{product.brand && product.model && ' • '}{product.model}
            </p>
          )}

          {/* Prices */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">Selling Price</span>
              <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {formatPrice(product.sellingPrice)}
              </span>
            </div>
            {showAdminActions && (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Cost Price</span>
                  <span className="text-lg text-gray-700 dark:text-gray-300">
                    {formatPrice(product.costPrice)}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Profit Margin</span>
                  <Badge
                    variant={profitMargin >= 20 ? 'success' : profitMargin >= 10 ? 'warning' : 'error'}
                  >
                    {profitMargin.toFixed(1)}%
                  </Badge>
                </div>
              </>
            )}
          </div>

          {/* Description */}
          {product.description && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Description
              </h2>
              <p className="text-gray-600 dark:text-gray-300 whitespace-pre-line">
                {product.description}
              </p>
            </div>
          )}

          {/* Barcode */}
          {product.barcode && (
            <div className="flex items-center gap-2 mb-4">
              <Barcode className="w-4 h-4 text-gray-500" />
              <span className="text-gray-600 dark:text-gray-300">{product.barcode}</span>
            </div>
          )}

          {/* Tags */}
          {product.tags && product.tags.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <Tag className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Tags</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {product.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-1 text-sm bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Specifications */}
          {product.specifications && Object.keys(product.specifications).length > 0 && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Specifications
              </h2>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
                {product.specifications.weight && (
                  <div className="flex justify-between py-2 px-4">
                    <span className="text-gray-500 dark:text-gray-400">Weight</span>
                    <span className="text-gray-900 dark:text-gray-100">{product.specifications.weight} kg</span>
                  </div>
                )}
                {product.specifications.dimensions && (
                  <div className="flex justify-between py-2 px-4">
                    <span className="text-gray-500 dark:text-gray-400">Dimensions</span>
                    <span className="text-gray-900 dark:text-gray-100">
                      {product.specifications.dimensions.length ?? '-'} ×{' '}
                      {product.specifications.dimensions.width ?? '-'} ×{' '}
                      {product.specifications.dimensions.height ?? '-'} cm
                    </span>
                  </div>
                )}
                {product.specifications.color && (
                  <div className="flex justify-between py-2 px-4">
                    <span className="text-gray-500 dark:text-gray-400">Color</span>
                    <span className="text-gray-900 dark:text-gray-100">{product.specifications.color}</span>
                  </div>
                )}
                {product.specifications.material && (
                  <div className="flex justify-between py-2 px-4">
                    <span className="text-gray-500 dark:text-gray-400">Material</span>
                    <span className="text-gray-900 dark:text-gray-100">{product.specifications.material}</span>
                  </div>
                )}
                {product.specifications.warranty && (
                  <div className="flex justify-between py-2 px-4">
                    <span className="text-gray-500 dark:text-gray-400">Warranty</span>
                    <span className="text-gray-900 dark:text-gray-100">{product.specifications.warranty}</span>
                  </div>
                )}
                {product.specifications.origin && (
                  <div className="flex justify-between py-2 px-4">
                    <span className="text-gray-500 dark:text-gray-400">Origin</span>
                    <span className="text-gray-900 dark:text-gray-100">{product.specifications.origin}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 mb-6">
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              <span>Added {formatDate(product.createdAt)}</span>
            </div>
            {product.updatedAt !== product.createdAt && (
              <span>• Updated {formatDate(product.updatedAt)}</span>
            )}
          </div>

          {/* Admin Actions */}
          {showAdminActions && (
            <div className="flex items-center gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <Button variant="primary" onClick={handleEdit} className="flex-1">
                <Edit className="w-4 h-4 mr-2" />
                Edit Product
              </Button>
              <Button
                variant="secondary"
                onClick={handleDelete}
                className={product.isActive ? '' : 'text-red-600 hover:text-red-700'}
              >
                {product.isActive ? (
                  <>
                    <Archive className="w-4 h-4 mr-2" />
                    Archive
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Stock by Branch Section */}
      <div className="mt-8">
        <ProductBranchStock
          productId={productId}
          productName={product.name}
          isAdmin={showAdminActions}
        />
      </div>

      {/* Upload Modal */}
      <ImageUploadModal
        isOpen={showUploadModal}
        productId={productId}
        productName={product.name}
        onClose={() => setShowUploadModal(false)}
        onUpload={handleUploadImage}
        isUploading={uploadMutation.isPending}
        error={uploadMutation.error}
      />

      {/* Delete Modal */}
      <DeleteProductModal
        product={product}
        isOpen={showDeleteModal}
        isLoading={deleteMutation.isPending}
        error={deleteMutation.error}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
