'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Star, Trash2, Package, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { ProductImage } from '@/types/product';

/**
 * Resolve image URL to full URL
 * Handles both full URLs and legacy relative paths
 */
function resolveImageUrl(url: string): string {
  // If already a full URL, return as-is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  // If relative path (legacy), prepend backend URL
  if (url.startsWith('/uploads/')) {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
    return `${backendUrl}${url}`;
  }
  // Return as-is for other cases
  return url;
}

interface ProductImageGalleryProps {
  images: ProductImage[];
  productName: string;
  onDeleteImage?: (imageId: string) => void;
  onSetPrimary?: (imageId: string) => void;
  isAdmin?: boolean;
  isDeleting?: boolean;
}

/**
 * ProductImageGallery component
 * 
 * Displays product images with navigation and zoom modal
 */
export const ProductImageGallery: React.FC<ProductImageGalleryProps> = ({
  images,
  productName,
  onDeleteImage,
  onSetPrimary,
  isAdmin = false,
  isDeleting = false,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);

  // Sort images to show primary first
  const sortedImages = [...images].sort((a, b) => {
    if (a.isPrimary && !b.isPrimary) return -1;
    if (!a.isPrimary && b.isPrimary) return 1;
    return 0;
  });

  const activeImage = sortedImages[activeIndex];

  const goToPrevious = () => {
    setActiveIndex((prev) => (prev === 0 ? sortedImages.length - 1 : prev - 1));
  };

  const goToNext = () => {
    setActiveIndex((prev) => (prev === sortedImages.length - 1 ? 0 : prev + 1));
  };

  if (images.length === 0) {
    return (
      <div className="aspect-square bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
        <div className="text-center">
          <Package className="w-20 h-20 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
          <p className="text-gray-500 dark:text-gray-400">No images</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* Main Image */}
        <div className="relative aspect-square bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden group">
          <Image
            src={resolveImageUrl(activeImage.url)}
            alt={`${productName} - Image ${activeIndex + 1}`}
            fill
            className="object-contain cursor-zoom-in"
            sizes="(max-width: 768px) 100vw, 50vw"
            onClick={() => setIsZoomed(true)}
            priority
          />

          {/* Primary badge */}
          {activeImage.isPrimary && (
            <div className="absolute top-3 left-3 px-2 py-1 bg-yellow-500 text-white text-xs font-medium rounded-full flex items-center gap-1">
              <Star className="w-3 h-3 fill-current" />
              Primary
            </div>
          )}

          {/* Navigation arrows */}
          {sortedImages.length > 1 && (
            <>
              <button
                onClick={goToPrevious}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/80 dark:bg-gray-900/80 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white dark:hover:bg-gray-900"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                onClick={goToNext}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/80 dark:bg-gray-900/80 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white dark:hover:bg-gray-900"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}

          {/* Admin actions */}
          {isAdmin && (
            <div className="absolute bottom-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              {!activeImage.isPrimary && onSetPrimary && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onSetPrimary(activeImage._id)}
                  className="bg-white/90 dark:bg-gray-900/90 hover:bg-white dark:hover:bg-gray-900"
                >
                  <Star className="w-4 h-4 mr-1" />
                  Set Primary
                </Button>
              )}
              {onDeleteImage && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onDeleteImage(activeImage._id)}
                  disabled={isDeleting}
                  className="bg-white/90 dark:bg-gray-900/90 hover:bg-red-50 dark:hover:bg-red-900/50 text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Thumbnails */}
        {sortedImages.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {sortedImages.map((image, index) => (
              <button
                key={image._id}
                onClick={() => setActiveIndex(index)}
                className={`
                  relative w-16 h-16 rounded-lg overflow-hidden shrink-0
                  ring-2 transition-all
                  ${index === activeIndex
                    ? 'ring-yellow-500'
                    : 'ring-transparent hover:ring-gray-300 dark:hover:ring-gray-600'
                  }
                `}
              >
                <Image
                  src={resolveImageUrl(image.url)}
                  alt={`${productName} - Thumbnail ${index + 1}`}
                  fill
                  className="object-cover"
                  sizes="64px"
                />
                {image.isPrimary && (
                  <div className="absolute bottom-0 inset-x-0 bg-yellow-500 text-white text-[10px] text-center py-0.5">
                    Primary
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Zoom Modal */}
      {isZoomed && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setIsZoomed(false)}
        >
          <button
            onClick={() => setIsZoomed(false)}
            className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>

          <div className="relative w-full h-full max-w-4xl max-h-[90vh] m-4">
            <Image
              src={resolveImageUrl(activeImage.url)}
              alt={`${productName} - Zoomed`}
              fill
              className="object-contain"
              sizes="100vw"
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          {/* Navigation in zoom mode */}
          {sortedImages.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  goToPrevious();
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors"
              >
                <ChevronLeft className="w-8 h-8" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  goToNext();
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors"
              >
                <ChevronRight className="w-8 h-8" />
              </button>
            </>
          )}

          {/* Image counter */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 bg-white/10 rounded-full text-white text-sm">
            {activeIndex + 1} / {sortedImages.length}
          </div>
        </div>
      )}
    </>
  );
};
