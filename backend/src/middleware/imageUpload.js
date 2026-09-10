import multer from 'multer';
import logger from '../utils/logger.js';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { PRODUCT_UPLOADS_DIR } from '../utils/uploadsPath.js';
import { UPLOAD } from '../config/constants.js';

// Upload policy comes from config/constants.js, so there is one list to edit.
// Output settings stay here: they describe how this middleware processes an
// accepted file, not what the API accepts.
const IMAGE_CONFIG = {
  MAX_FILE_SIZE: UPLOAD.MAX_FILE_SIZE,
  ALLOWED_TYPES: UPLOAD.ALLOWED_IMAGE_TYPES,
  OUTPUT_WIDTH: 800,
  OUTPUT_HEIGHT: 800,
  OUTPUT_QUALITY: 80,
  OUTPUT_FORMAT: 'jpeg',
};

// Ensure uploads directory exists (skip on read-only filesystems like Vercel)
// Resolved from the module's own location, not process.cwd(): see
// utils/uploadsPath.js for why the launch directory must not decide this.
const uploadsDir = PRODUCT_UPLOADS_DIR;
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
} catch (error) {
  // Ignore on serverless/read-only filesystems
  logger.warn({ err: { message: error.message } }, 'could not create uploads directory');
}

// Configure multer storage (memory storage for processing with sharp)
const storage = multer.memoryStorage();

// File filter to validate image types
const fileFilter = (req, file, cb) => {
  if (IMAGE_CONFIG.ALLOWED_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed types: ${IMAGE_CONFIG.ALLOWED_TYPES.join(', ')}`), false);
  }
};

// Multer upload configuration
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: IMAGE_CONFIG.MAX_FILE_SIZE,
  },
});

/**
 * Middleware to handle single image upload
 * Expects field name 'image' in FormData
 */
const uploadSingleImage = upload.single('image');

/**
 * Middleware to process and compress uploaded image
 * Resizes to 800x800 max, converts to JPEG, quality 80%
 */
const processImage = async (req, res, next) => {
  if (!req.file) {
    return next();
  }

  try {
    const filename = `${uuidv4()}.${IMAGE_CONFIG.OUTPUT_FORMAT}`;
    const outputPath = path.join(uploadsDir, filename);

    // Process image with sharp.
    //
    // .rotate() with no argument applies the EXIF orientation tag and is what
    // makes phone photos come out upright. A camera does not physically rotate
    // its sensor when the phone is turned; it writes the pixels in sensor order
    // and records the orientation in EXIF for the viewer to apply. sharp strips
    // metadata on output, so without this the tag is discarded while the pixels
    // stay as-shot — every portrait photo lands on its side, which is exactly
    // what the product grid was showing.
    //
    // It must come BEFORE .resize(), or the 800x800 bound is applied to the
    // pre-rotation dimensions and a portrait photo is fitted as if it were
    // landscape.
    await sharp(req.file.buffer)
      .rotate()
      .resize(IMAGE_CONFIG.OUTPUT_WIDTH, IMAGE_CONFIG.OUTPUT_HEIGHT, {
        fit: 'inside', // Maintain aspect ratio, fit within bounds
        withoutEnlargement: true, // Don't upscale small images
      })
      .jpeg({
        quality: IMAGE_CONFIG.OUTPUT_QUALITY,
        progressive: true,
      })
      .toFile(outputPath);

    // Get file stats for size information
    const stats = fs.statSync(outputPath);

    // Actual dimensions, read back from the written file. `fit: 'inside'`
    // preserves aspect ratio, so the output is only ever 800x800 for a square
    // source — reporting the configured bounds as the result was wrong for
    // every other image, and wrong in a new way now that orientation can swap
    // the axes.
    const { width, height } = await sharp(outputPath).metadata();

    // Get backend URL from environment variable (with fallback)
    const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;

    // Attach processed image info to request with full URL
    req.processedImage = {
      filename,
      path: outputPath,
      url: `${backendUrl}/uploads/products/${filename}`,
      size: stats.size,
      mimetype: `image/${IMAGE_CONFIG.OUTPUT_FORMAT}`,
      width,
      height,
    };

    next();
  } catch (error) {
    logger.error({ err: { name: error.name, message: error.message } }, 'image processing failed');
    // Forwarded rather than answered here. Writing the 500 directly bypassed
    // errorHandler, so `error.message` reached the client verbatim in every
    // environment: a sharp or filesystem failure returns the container's
    // absolute upload path and the errno. errorHandler already collapses 5xx
    // messages outside development and produces the ApiResponse envelope the
    // frontend types expect.
    return next(error);
  }
};

/**
 * Delete an image file from the uploads directory
 * @param {string} filename - The filename to delete
 * @returns {boolean} - Whether deletion was successful
 */
const deleteImageFile = (filename) => {
  try {
    const filePath = path.join(uploadsDir, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (error) {
    logger.warn({ err: { name: error.name, message: error.message } }, 'could not delete image file');
    return false;
  }
};

/**
 * Extract filename from URL path
 * @param {string} url - The URL or path (e.g., /uploads/products/abc.jpeg)
 * @returns {string} - The filename
 */
const getFilenameFromUrl = (url) => {
  if (!url) return null;
  const parts = url.split('/');
  return parts[parts.length - 1];
};

/**
 * Error handling middleware for multer errors
 */
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: `File too large. Maximum size is ${IMAGE_CONFIG.MAX_FILE_SIZE / (1024 * 1024)}MB`,
      });
    }
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  next();
};

export {
  uploadSingleImage,
  processImage,
  handleUploadError,
  deleteImageFile,
  getFilenameFromUrl,
  IMAGE_CONFIG
};
