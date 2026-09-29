import express from 'express';
import { apiLimiter } from '../middleware/rateLimit.js';
import {
  getPublicProducts,
  getPublicProduct,
  getPublicCategories,
  getPublicMotorcycleModels,
} from '../controllers/publicCatalogController.js';

const router = express.Router();

// No `protect`: this is the public storefront. The limiter sits on each route
// rather than on the mount, because a request refused at the mount never
// reaches the router and is labelled `unmatched` in the metrics, which would
// hide these 429s from the TalyerPublicCatalogRateLimited alert.
//
// ponytail: server-rendered catalog pages all reach this from the frontend
// container's address, so the whole public site shares one IP bucket.
// Forwarding the visitor's address (after verifying TRUST_PROXY) lifts it.
router.get('/products', apiLimiter, getPublicProducts);
router.get('/products/:id', apiLimiter, getPublicProduct);
router.get('/categories', apiLimiter, getPublicCategories);
router.get('/motorcycle-models', apiLimiter, getPublicMotorcycleModels);

export default router;
