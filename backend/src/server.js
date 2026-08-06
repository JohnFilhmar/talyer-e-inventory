import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import connectDB from './config/database.js';
import { connectRedis } from './config/redis.js';
import errorHandler from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { CORS } from './config/constants.js';
import { resolveTrustProxy } from './utils/trustProxy.js';
import { seedAdminUser } from './utils/seedAdmin.js';

// Initialize express app
const app = express();

// express-rate-limit keys clients by req.ip. Behind a reverse proxy that is the
// proxy's address unless Express is told how many hops to trust, which would
// collapse every client into one rate-limit bucket. Left at 0, X-Forwarded-For
// is ignored — correct when this app is exposed directly, and it stops a client
// from spoofing the header to get a fresh bucket.
app.set('trust proxy', resolveTrustProxy(process.env.TRUST_PROXY));

// Security headers. crossOriginResourcePolicy is relaxed so the frontend on a
// different origin can still load images served from /uploads.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// Body parser middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Cookie parser middleware (for httpOnly refresh token)
app.use(cookieParser());

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

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
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import branchRoutes from './routes/branchRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import motorcycleModelRoutes from './routes/motorcycleModelRoutes.js';
import productRoutes from './routes/productRoutes.js';
import stockRoutes from './routes/stockRoutes.js';
import supplierRoutes from './routes/supplierRoutes.js';
import salesRoutes from './routes/salesRoutes.js';
import serviceRoutes from './routes/serviceRoutes.js';

// Mount routes
app.use('/api/auth', apiLimiter, authRoutes);
app.use('/api/users', apiLimiter, userRoutes);
app.use('/api/branches', apiLimiter, branchRoutes);
app.use('/api/categories', apiLimiter, categoryRoutes);
app.use('/api/motorcycle-models', apiLimiter, motorcycleModelRoutes);
app.use('/api/products', apiLimiter, productRoutes);
app.use('/api/stock', apiLimiter, stockRoutes);
app.use('/api/suppliers', apiLimiter, supplierRoutes);
app.use('/api/sales', apiLimiter, salesRoutes);
app.use('/api/services', apiLimiter, serviceRoutes);

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
      auth: '/auth',
      users: '/users',
      branches: '/branches',
      categories: '/categories',
      motorcycleModels: '/motorcycle-models',
      products: '/products',
      stock: '/stock',
      suppliers: '/suppliers',
      sales: '/sales',
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
    // Connect to MongoDB — required, so a failure here aborts startup.
    await connectDB();

    // Bootstrap the first admin from SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD, if
    // configured. Safe to call on every boot of every replica: it no-ops
    // when the variables are absent, when an admin already exists, and when
    // a concurrent replica wins the create race. Must run after connectDB()
    // (needs the database) and before app.listen() so the outcome is in the
    // logs before traffic can arrive.
    const seedResult = await seedAdminUser();
    if (seedResult.status === 'created') {
      console.log('Seeded initial admin user from SEED_ADMIN_EMAIL.');
    } else {
      console.log(`Skipped admin seeding (reason: ${seedResult.reason}).`);
    }

    // Connect to Redis (optional). This is intentionally NOT awaited:
    // node-redis's default retry/backoff behavior on an absent or
    // unreachable Redis can take far longer than any reasonable startup
    // window, and CacheUtil already treats a falsy client as "no cache" on
    // every code path. Kicking this off in the background guarantees a
    // slow or missing Redis can never delay app.listen().
    connectRedis()
      .then((client) => {
        if (!client) {
          console.log('Starting without Redis cache (cache disabled).');
        }
      })
      .catch((error) => {
        // connectRedis() already catches its own connection errors and
        // resolves to null, so this only guards against a truly unexpected
        // failure (e.g. a bug in connectRedis itself).
        console.error('Unexpected error initializing Redis:', error);
      });

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

export default app;
