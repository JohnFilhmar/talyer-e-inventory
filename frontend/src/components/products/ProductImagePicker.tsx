'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, ImagePlus, X } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { maxUploadBytes, maxUploadLabel } from '@/lib/imageDownscale';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGES = 6;

interface ProductImagePickerProps {
  /** Files staged for upload. Owned by the parent form. */
  files: File[];
  onChange: (files: File[]) => void;
  /** How many images the product already has — only relevant when editing. */
  existingCount?: number;
  disabled?: boolean;
}

/**
 * Stages product photos on the create/edit form.
 *
 * The upload endpoint is `POST /products/:id/images`, so on a *new* product
 * there is no id to upload against yet. Files are therefore held here and
 * uploaded by the form once the product exists. That ordering is why this is a
 * picker rather than an uploader.
 *
 * "Take photo" uses `capture` on a file input rather than getUserMedia: it hands
 * off to the device camera app, which needs no permission plumbing of our own
 * and gives a far better photo than a canvas grab of a video preview. On desktop
 * the attribute is ignored and it behaves as a normal file picker.
 */
export const ProductImagePicker: React.FC<ProductImagePickerProps> = ({
  files,
  onChange,
  existingCount = 0,
  disabled = false,
}) => {
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Object URLs are a manual resource. Derived rather than held in state: the
  // React Compiler rejects setState inside an effect, and this needs no state —
  // the URLs are a pure function of `files`, and the effect exists only to
  // revoke the previous batch. Lists are at most MAX_IMAGES long.
  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);

  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  const addFiles = useCallback(
    (incoming: FileList | null) => {
      if (!incoming || incoming.length === 0) return;

      const accepted: File[] = [];
      let rejection: string | null = null;

      for (const file of Array.from(incoming)) {
        if (!ALLOWED_TYPES.includes(file.type)) {
          rejection = `${file.name} is not a JPEG, PNG, WebP or GIF.`;
          continue;
        }
        // Measured against what will actually be sent: uploads are downscaled
        // in the browser first, so a normal 9MB phone photo is fine even though
        // the server's own limit is 5MB. Checking the raw file against that
        // limit would reject the camera path for images that upload cleanly.
        if (file.size > maxUploadBytes(file)) {
          rejection = `${file.name} is larger than ${maxUploadLabel(file)}.`;
          continue;
        }
        accepted.push(file);
      }

      const room = MAX_IMAGES - existingCount - files.length;
      if (accepted.length > room) {
        rejection = `Only ${MAX_IMAGES} images are allowed per product.`;
      }

      setError(rejection);
      if (accepted.length > 0) {
        onChange([...files, ...accepted.slice(0, Math.max(room, 0))]);
      }
    },
    [existingCount, files, onChange]
  );

  const handleInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(event.target.files);
    // Reset so picking the same file twice in a row still fires onChange.
    event.target.value = '';
  };

  const removeAt = (index: number) => {
    setError(null);
    onChange(files.filter((_, i) => i !== index));
  };

  const isFull = existingCount + files.length >= MAX_IMAGES;

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Product Photos (Optional)
      </label>

      {error && (
        <Alert variant="error" className="mb-3">
          {error}
        </Alert>
      )}

      <div className="flex flex-wrap gap-2 mb-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isFull}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ImagePlus className="w-4 h-4" />
          Choose photos
        </button>

        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          disabled={disabled || isFull}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Camera className="w-4 h-4" />
          Take photo
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_TYPES.join(',')}
          multiple
          onChange={handleInput}
          className="hidden"
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleInput}
          className="hidden"
        />
      </div>

      {files.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {files.map((file, index) => (
            <div
              key={`${file.name}-${file.lastModified}-${index}`}
              className="relative aspect-square border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden bg-gray-100 dark:bg-gray-800"
            >
              {previews[index] && (
                // next/image cannot take a blob: URL, and these are local
                // previews that never reach the optimiser.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previews[index]}
                  alt={`Selected product photo ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              )}
              <button
                type="button"
                onClick={() => removeAt(index)}
                disabled={disabled}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black text-white flex items-center justify-center disabled:opacity-50"
                aria-label={`Remove photo ${index + 1}`}
              >
                <X className="w-3 h-3" />
              </button>
              {existingCount === 0 && index === 0 && (
                <span className="absolute bottom-0 inset-x-0 bg-yellow-400 text-black text-[10px] font-medium text-center py-0.5">
                  Primary
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        {isFull
          ? `Maximum of ${MAX_IMAGES} images reached.`
          : `JPEG, PNG, WebP or GIF. Large photos are shrunk automatically. Photos upload after the product is saved.`}
      </p>
    </div>
  );
};

export default ProductImagePicker;
