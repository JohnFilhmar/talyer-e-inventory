'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import Image from 'next/image';
import {
  Star,
  Trash2,
  GripVertical,
  AlertCircle,
  ImagePlus,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { useUploadProductImage, useDeleteProductImage, useSetProductImageAsPrimary, useUpdateProduct } from '@/hooks/useProducts';
import type { ProductImage } from '@/types/product';

interface ProductImageEditorProps {
  productId: string;
  images: ProductImage[];
  onImagesChange?: () => void;
}

/**
 * Resolve image URL - handles both full URLs and legacy relative paths
 */
function resolveImageUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  if (url.startsWith('/uploads/')) {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
    return `${backendUrl}${url}`;
  }
  return url;
}

/**
 * ProductImageEditor component
 * 
 * Allows editing product images:
 * - Upload new images
 * - Delete images
 * - Set primary image
 * - Drag to reorder
 */
export const ProductImageEditor: React.FC<ProductImageEditorProps> = ({
  productId,
  images,
  onImagesChange,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [localImages, setLocalImages] = useState<ProductImage[]>(images);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Sync local images with props
  useEffect(() => {
    setLocalImages(images);
  }, [images]);

  // Mutations
  const uploadMutation = useUploadProductImage();
  const deleteMutation = useDeleteProductImage();
  const setPrimaryMutation = useSetProductImageAsPrimary();
  const updateMutation = useUpdateProduct();

  const isLoading = uploadMutation.isPending || deleteMutation.isPending || setPrimaryMutation.isPending || updateMutation.isPending;

  // Handle file selection
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadError(null);

    // Upload each file
    for (const file of Array.from(files)) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setUploadError(`${file.name} is not an image file`);
        continue;
      }

      // Validate file size (10MB max)
      if (file.size > 10 * 1024 * 1024) {
        setUploadError(`${file.name} is too large. Max size is 10MB`);
        continue;
      }

      try {
        // First image becomes primary if no images exist
        const isPrimary = localImages.length === 0;
        await uploadMutation.mutateAsync({ productId, file, isPrimary });
        onImagesChange?.();
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : 'Failed to upload image');
      }
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [productId, localImages.length, uploadMutation, onImagesChange]);

  // Handle delete
  const handleDelete = useCallback(async (imageId: string) => {
    if (!confirm('Are you sure you want to delete this image?')) return;

    try {
      await deleteMutation.mutateAsync({ productId, imageId });
      onImagesChange?.();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Failed to delete image');
    }
  }, [productId, deleteMutation, onImagesChange]);

  // Handle set as primary
  const handleSetPrimary = useCallback(async (imageId: string) => {
    try {
      await setPrimaryMutation.mutateAsync({ productId, imageId, currentImages: images });
      onImagesChange?.();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Failed to set primary image');
    }
  }, [productId, images, setPrimaryMutation, onImagesChange]);

  // Drag and drop handlers (for reordering)
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedIndex === null || draggedIndex === index) return;
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    // Reorder images locally first for instant feedback
    const reorderedImages = [...localImages];
    const [draggedImage] = reorderedImages.splice(draggedIndex, 1);
    reorderedImages.splice(dropIndex, 0, draggedImage);
    setLocalImages(reorderedImages);

    setDraggedIndex(null);
    setDragOverIndex(null);

    // Persist the new order to the backend
    try {
      const updatedImages = reorderedImages.map((img) => ({
        url: img.url,
        isPrimary: img.isPrimary,
      }));

      await updateMutation.mutateAsync({
        id: productId,
        payload: { images: updatedImages },
      });
      onImagesChange?.();
    } catch (error) {
      // Revert on error
      setLocalImages(images);
      setUploadError(error instanceof Error ? error.message : 'Failed to reorder images');
    }
  };

  return (
    <div className="space-y-4">
      {/* Error Alert */}
      {uploadError && (
        <Alert variant="error">
          <div className="flex items-center justify-between">
            <span>{uploadError}</span>
            <button
              type="button"
              onClick={() => setUploadError(null)}
              className="ml-4 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
            >
              ✕
            </button>
          </div>
        </Alert>
      )}

      {/* Upload Area */}
      <div
        className={`
          relative border-2 border-dashed rounded-lg p-6 text-center transition-colors
          ${isLoading
            ? 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50'
            : 'border-gray-300 dark:border-gray-600 hover:border-yellow-400 dark:hover:border-yellow-500 cursor-pointer'
          }
        `}
        onClick={() => !isLoading && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          disabled={isLoading}
        />

        {uploadMutation.isPending ? (
          <div className="flex flex-col items-center gap-2 text-gray-500 dark:text-gray-400">
            <Loader2 className="w-8 h-8 animate-spin text-yellow-500" />
            <span className="text-sm">Uploading...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-500 dark:text-gray-400">
            <ImagePlus className="w-8 h-8" />
            <span className="text-sm font-medium">Click to upload images</span>
            <span className="text-xs">JPEG, PNG, or WebP (max 10MB each)</span>
          </div>
        )}
      </div>

      {/* Images Grid */}
      {localImages.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {localImages.map((image, index) => (
            <div
              key={image._id}
              draggable={!isLoading}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDragEnd={handleDragEnd}
              onDrop={(e) => handleDrop(e, index)}
              className={`
                relative group rounded-lg overflow-hidden border-2 transition-all cursor-grab active:cursor-grabbing
                ${image.isPrimary
                  ? 'border-yellow-500 ring-2 ring-yellow-500/20'
                  : 'border-gray-200 dark:border-gray-700'
                }
                ${draggedIndex === index ? 'opacity-50 scale-95' : ''}
                ${dragOverIndex === index && draggedIndex !== index ? 'border-yellow-400 border-dashed scale-105' : ''}
              `}
            >
              {/* Image */}
              <div className="relative aspect-square bg-gray-100 dark:bg-gray-800">
                <Image
                  src={resolveImageUrl(image.url)}
                  alt={`Product image ${index + 1}`}
                  fill
                  className="object-cover pointer-events-none"
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                />

                {/* Primary Badge */}
                {image.isPrimary && (
                  <div className="absolute top-2 left-2 px-2 py-1 bg-yellow-500 text-white text-xs font-medium rounded">
                    Primary
                  </div>
                )}

                {/* Drag Handle */}
                <div className="absolute top-2 right-2 p-1 bg-black/50 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                  <GripVertical className="w-4 h-4 text-white" />
                </div>

                {/* Actions Overlay */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  {!image.isPrimary && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSetPrimary(image._id);
                      }}
                      disabled={isLoading}
                      title="Set as primary"
                    >
                      <Star className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(image._id);
                    }}
                    disabled={isLoading}
                    title="Delete image"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Image Index */}
              <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/50 text-white text-xs rounded">
                {index + 1}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {localImages.length === 0 && !uploadMutation.isPending && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No images uploaded yet</p>
          <p className="text-xs mt-1">Upload images to showcase your product</p>
        </div>
      )}

      {/* Image Count */}
      {localImages.length > 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          {localImages.length} image{localImages.length !== 1 ? 's' : ''} • Drag to reorder • First primary image is used as thumbnail
        </p>
      )}
    </div>
  );
};

export default ProductImageEditor;
