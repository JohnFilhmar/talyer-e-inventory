class ApiResponse {
  /**
   * Send success response
   * @param {Object} res - Express response object
   * @param {Number} statusCode - HTTP status code
   * @param {String} message - Success message
   * @param {Object|Array} data - Response data
   * @param {Object} meta - Additional metadata (pagination, etc.)
   */
  static success(res, statusCode = 200, message = 'Success', data = null, meta = {}) {
    const response = {
      success: true,
      message,
      ...(data !== null && { data }),
      meta: {
        timestamp: new Date().toISOString(),
        ...meta
      }
    };

    return res.status(statusCode).json(response);
  }

  /**
   * Send error response
   * @param {Object} res - Express response object
   * @param {Number} statusCode - HTTP status code
   * @param {String} message - Error message
   * @param {Array} errors - Array of detailed errors
   */
  static error(res, statusCode = 500, message = 'An error occurred', errors = []) {
    const response = {
      success: false,
      message,
      ...(errors.length > 0 && { errors }),
      meta: {
        timestamp: new Date().toISOString()
      }
    };

    return res.status(statusCode).json(response);
  }

  /**
   * Send paginated response
   * @param {Object} res - Express response object
   * @param {Array} data - Array of items
   * @param {Number} page - Current page number
   * @param {Number} limit - Items per page
   * @param {Number} total - Total number of items
   * @param {String} message - Success message
   */
  static paginate(res, data, page, limit, total, message = 'Data retrieved successfully') {
    const totalPages = Math.ceil(total / limit);

    const response = {
      success: true,
      message,
      data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: totalPages
      },
      meta: {
        timestamp: new Date().toISOString()
      }
    };

    return res.status(200).json(response);
  }
}

module.exports = ApiResponse;
