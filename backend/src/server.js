const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const connectDB = require('./config/database');
const { connectRedis } = require('./config/redis');
const errorHandler = require('./middleware/errorHandler');
const { CORS } = require('./config/constants');

// Initialize express app
const app = express();

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cookie parser middleware (for httpOnly refresh token)
app.use(cookieParser());

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Request logger middleware
app.use((req, res, next) => {
  const start = Date.now();
  
  // Log request
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  
  // Capture response
  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusColor = res.statusCode >= 500 ? '\x1b[31m' : 
                       res.statusCode >= 400 ? '\x1b[33m' : 
                       res.statusCode >= 300 ? '\x1b[36m' : '\x1b[32m';
    const resetColor = '\x1b[0m';
    
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.url} ${statusColor}${res.statusCode}${resetColor} - ${duration}ms`
    );
  });
  
  next();
});

// CORS middleware using constants configuration
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  // Check if the origin is in the allowed list
  if (CORS.ALLOWED_ORIGINS.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  
  res.header('Access-Control-Allow-Methods', CORS.ALLOWED_METHODS.join(', '));
  res.header('Access-Control-Allow-Headers', CORS.ALLOWED_HEADERS.join(', '));
  res.header('Access-Control-Expose-Headers', CORS.EXPOSED_HEADERS.join(', '));
  res.header('Access-Control-Allow-Credentials', String(CORS.CREDENTIALS));
  res.header('Access-Control-Max-Age', String(CORS.MAX_AGE));
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const branchRoutes = require('./routes/branchRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const productRoutes = require('./routes/productRoutes');
const stockRoutes = require('./routes/stockRoutes');
const supplierRoutes = require('./routes/supplierRoutes');
const salesRoutes = require('./routes/salesRoutes');
const serviceRoutes = require('./routes/serviceRoutes');

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/services', serviceRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Talyer E-Inventory API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      branches: '/api/branches',
      categories: '/api/categories',
      products: '/api/products',
      stock: '/api/stock',
      suppliers: '/api/suppliers',
      sales: '/api/sales',
      health: '/health',
    },
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// Error handler (must be last)
app.use(errorHandler);

// Connect to database and start server
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();
    
    // Connect to Redis (optional)
    await connectRedis();
    
    // Start server
    app.listen(PORT, () => {
      console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;
