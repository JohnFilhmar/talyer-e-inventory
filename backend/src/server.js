import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import express from 'express';
import pinoHttp from 'pino-http';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import connectDB from './config/database.js';
import mongoose from 'mongoose';
import { connectRedis, getRedisClient, disconnectRedis } from './config/redis.js';

/** readyState numbers, for a health body a human can read. */
const MONGO_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];
import errorHandler from './middleware/errorHandler.js';
import sanitizeRequest from './middleware/sanitizeRequest.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { CORS } from './config/constants.js';
import { resolveTrustProxy } from './utils/trustProxy.js';
import { seedAdminUser } from './utils/seedAdmin.js';
import { UPLOADS_ROOT } from './utils/uploadsPath.js';
import logger from './utils/logger.js';
import { metricsMiddleware, startMetricsServer } from './utils/metrics.js';

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

// Reject Mongo operator syntax in request keys, immediately after the parsers
// that create the objects and before any router sees them. Routes that declare
// a validation rule are already safe; this covers the ones that do not, and the
// ones not written yet. See middleware/sanitizeRequest.js for why it rejects
// rather than strips.
app.use(sanitizeRequest);

// Cookie parser middleware (for the httpOnly refresh token and the CSRF token).
//
// Mounted on /api/auth rather than globally: those are the only handlers that
// read req.cookies. Parsing cookies for routes that never consult them buys
// nothing and widens the set of handlers a browser-attached cookie can reach,
// which is the precondition for CSRF. Every other router authenticates from an
// Authorization header a cross-site page cannot set.
app.use('/api/auth', cookieParser());

// Serve static files from uploads directory
// Same module-relative resolution the writer uses, so the served directory is
// always the written one regardless of where the process was launched from.
app.use('/uploads', express.static(UPLOADS_ROOT));

// Request logging.
//
// One JSON object per request on stdout, replacing a hand-rolled console line
// that embedded ANSI colour escapes mid-message. Those made the line unreadable
// in any aggregator and unparseable by anything, and the fields were positional
// rather than named.
//
// Every log line carries a request id, and so does the response, as
// `X-Request-Id`. An id supplied by a proxy in front of the app is honoured so
// one request keeps a single id across hops; otherwise one is generated. That
// id is what lets an error in the log be tied to the request that produced it,
// which is the whole reason `errorHandler` logs `req.id`.
//
// The serialisers are deliberately narrow. `pino-http` will happily log the
// whole request and response, including every header; naming the four fields
// worth keeping bounds the line and keeps credentials out by construction, on
// top of the redaction configured in utils/logger.js.
app.use(
  pinoHttp({
    logger,
    genReqId: (req, res) => {
      const existing = req.headers['x-request-id'];
      const id = typeof existing === 'string' && existing.length <= 200 ? existing : randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
    // 5xx is ours to fix, 4xx is the caller's, everything else is routine.
    customLogLevel: (req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    serializers: {
      req: (req) => ({ id: req.id, method: req.method, url: req.url }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  })
);

// Observe every request. Mounted before the routers so `req.route` is set by
// the time the response finishes, which is what lets the metric label the
// matched *pattern* rather than the URL. See utils/metrics.js: labelling by URL
// is how a scanner probing random paths turns into unbounded cardinality.
app.use(metricsMiddleware);

// CORS middleware using constants configuration
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
// Set before the allow-list test, and unconditionally, so it is present on
  // rejected origins too. The allow-origin header varies by request; without
  // this a shared cache in front of the stack (docs/DEPLOYMENT.md prescribes
  // nginx) can serve a response cached for one origin to another, carrying a
  // mismatched allow-origin header.
  res.header('Vary', 'Origin');

    // Check if the origin is in the allowed list
  if (CORS.ALLOWED_ORIGINS.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  
  res.header('Access-Control-Allow-Methods', CORS.ALLOWED_METHODS.join(', '));
  res.header('Access-Control-Allow-Headers', CORS.ALLOWED_HEADERS.join(', '));
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

// Health check endpoint.
//
// This used to be a static 200, so Docker's HEALTHCHECK kept the container
// marked healthy after Mongo became unreachable, `restart: unless-stopped`
// never fired, and the deploy workflow reported "Backend is healthy" on a stack
// where every request 500s. A deploy could be declared successful on a dead
// application.
//
// Redis is optional by design: CacheUtil treats a missing client as "no cache"
// on every path, so its state is reported but never fails the check. The
// response stays additive, so the existing CI and deploy polls, which read only
// the status code, are unaffected.
app.get('/health', (req, res) => {
  const mongoConnected = mongoose.connection.readyState === 1;
  const redisClient = getRedisClient();

  const body = {
    success: mongoConnected,
    message: mongoConnected ? 'Server is running' : 'Server is not ready',
    dependencies: {
      mongo: MONGO_STATES[mongoose.connection.readyState] || 'unknown',
      redis: redisClient ? 'available' : 'unavailable',
    },
    timestamp: new Date().toISOString(),
  };

  return res.status(mongoConnected ? 200 : 503).json(body);
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Talyer E-Inventory API',
    version: '1.0.0',
    // These are the paths as mounted. They carried no `/api` prefix and omitted
    // services, so the one response whose whole job is to tell a caller where
    // things are sent them to a 404. `/health` is genuinely unprefixed.
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      branches: '/api/branches',
      categories: '/api/categories',
      motorcycleModels: '/api/motorcycle-models',
      products: '/api/products',
      stock: '/api/stock',
      suppliers: '/api/suppliers',
      sales: '/api/sales',
      services: '/api/services',
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
      logger.info('seeded initial admin user from SEED_ADMIN_EMAIL');
    } else {
      logger.info({ reason: seedResult.reason }, 'skipped admin seeding');
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
          logger.warn('starting without redis cache');
        }
      })
      .catch((error) => {
        // connectRedis() already catches its own connection errors and
        // resolves to null, so this only guards against a truly unexpected
        // failure (e.g. a bug in connectRedis itself).
        logger.error({ err: { name: error.name, message: error.message } }, 'redis init failed');
      });

    // Start server
    const server = app.listen(PORT, () => {
      logger.info({ env: process.env.NODE_ENV, port: PORT }, 'server listening');
    });

    // Without this an EADDRINUSE surfaces as an unhandled 'error' event rather
    // than reaching the failure path below, so the process dies with no useful
    // log line.
    server.on('error', (error) => {
      logger.error({ err: { name: error.name, message: error.message } }, 'http server error');
      process.exit(1);
    });

    // Its own port, published to nothing. See utils/metrics.js for why it is
    // not mounted on the application port.
    const metricsServer = startMetricsServer();

    registerShutdownHandlers(server, metricsServer);
  } catch (error) {
    logger.error({ err: { name: error.name, message: error.message } }, 'failed to start server');
    process.exit(1);
  }
};

/**
 * Stop accepting connections, let in-flight requests finish, then close the
 * connections they depend on.
 *
 * Order matters. Closing Mongo first, which is what the old per-module SIGINT
 * handlers effectively did, cuts off a request that is midway through the
 * three-step stock write: quantity saved, StockMovement not yet written. That
 * sequence is the audit trail, so a deploy during business hours could punch
 * holes in the ledger with nothing detecting the divergence.
 *
 * The force-exit timer is the backstop for a connection that never drains, so a
 * hung request cannot hold the deploy open indefinitely. It is unref'd so it
 * never itself keeps the process alive.
 */
const SHUTDOWN_GRACE_MS = Number(process.env.SHUTDOWN_GRACE_MS) || 10000;

let shuttingDown = false;

const registerShutdownHandlers = (server, metricsServer) => {
  const shutdown = async (signal) => {
    // A second signal during shutdown must not start a second sequence.
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, 'shutting down');

    const forceExit = setTimeout(() => {
      logger.error({ graceMs: SHUTDOWN_GRACE_MS }, 'did not drain in time, exiting anyway');
      process.exit(1);
    }, SHUTDOWN_GRACE_MS);
    forceExit.unref();

    try {
      await new Promise((resolve) => server.close(resolve));
      logger.info('http server closed');

      // Closed after the application server, not before: it is what a scrape
      // reads, and keeping it up until the last request has drained means the
      // final seconds of a shutdown are still observable.
      if (metricsServer) {
        await new Promise((resolve) => metricsServer.close(resolve));
      }

      await disconnectRedis();
      await mongoose.connection.close();
      logger.info('database connection closed');

      clearTimeout(forceExit);
      process.exit(0);
    } catch (error) {
      logger.error({ err: { name: error.name, message: error.message } }, 'error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

startServer();

export default app;
