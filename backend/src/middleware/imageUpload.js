const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Configuration constants
const IMAGE_CONFIG = {
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'],
  OUTPUT_WIDTH: 800,
  OUTPUT_HEIGHT: 800,
  OUTPUT_QUALITY: 80,
  OUTPUT_FORMAT: 'jpeg',
};

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads/products');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
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

    // Process image with sharp
    await sharp(req.file.buffer)
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

    // Get backend URL from environment variable (with fallback)
    const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;

    // Attach processed image info to request with full URL
    req.processedImage = {
      filename,
      path: outputPath,
      url: `${backendUrl}/uploads/products/${filename}`,
      size: stats.size,
      mimetype: `image/${IMAGE_CONFIG.OUTPUT_FORMAT}`,
      width: IMAGE_CONFIG.OUTPUT_WIDTH,
      height: IMAGE_CONFIG.OUTPUT_HEIGHT,
    };

    next();
  } catch (error) {
    console.error('Image processing error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process image',
      error: error.message,
    });
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
    console.error('Error deleting image file:', error);
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

module.exports = {
  uploadSingleImage,
  processImage,
  handleUploadError,
  deleteImageFile,
  getFilenameFromUrl,
  IMAGE_CONFIG,
};
