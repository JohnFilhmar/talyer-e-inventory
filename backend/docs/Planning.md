# Backend Implementation Plan - Motorparts E-Inventory

## 🎯 Architecture Overview

### Design Principles
- **Scalability** - Support multiple branches and growing data
- **Maintainability** - Clean code, proper separation of concerns
- **Performance** - Redis caching for frequently accessed data
- **Security** - Role-based access control, input validation
- **Consistency** - Uniform API responses and error handling

### Technology Stack
- Node.js + Express.js 5.x
- MongoDB + Mongoose ODM
- Redis for caching
- Socket.io for real-time features
- JWT authentication

---

## 📐 Standardized Response Format

All API endpoints must follow this uniform structure:

### Success Response
```json
{
  "success": true,
  "message": "Operation description",
  "data": {}, // or [] for arrays
  "meta": {
    "timestamp": "2026-01-31T10:30:00.000Z",
    "page": 1,
    "limit": 10,
    "total": 100
  }
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error description",
  "errors": [
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ],
  "meta": {
    "timestamp": "2026-01-31T10:30:00.000Z"
  }
}
```

### Status Codes
- `200` - Success (GET, PUT)
- `201` - Created (POST)
- `204` - No Content (DELETE)
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (auth required)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `409` - Conflict (duplicate entry)
- `500` - Server Error

---

## 📁 File Structure Plan

```
backend/src/
├── config/
│   ├── database.js          ✅ EXISTS
│   ├── redis.js             ✅ EXISTS
│   ├── socket.js            ⬜ TO CREATE
│   └── constants.js         ⬜ TO CREATE
│
├── models/
│   ├── User.js              ✅ EXISTS
│   ├── Branch.js            ⬜ TO CREATE
│   ├── Product.js           ⬜ TO CREATE
│   ├── Category.js          ⬜ TO CREATE
│   ├── Supplier.js          ⬜ TO CREATE
│   ├── Stock.js             ⬜ TO CREATE
│   ├── StockTransfer.js     ⬜ TO CREATE
│   ├── SalesOrder.js        ⬜ TO CREATE
│   ├── ServiceOrder.js      ⬜ TO CREATE
│   ├── Transaction.js       ⬜ TO CREATE
│   ├── Expense.js           ⬜ TO CREATE
│   ├── Notification.js      ⬜ TO CREATE
│   └── ActivityLog.js       ⬜ TO CREATE
│
├── controllers/
│   ├── authController.js    ✅ EXISTS
│   ├── userController.js    ✅ EXISTS
│   ├── branchController.js  ⬜ TO CREATE
│   ├── productController.js ⬜ TO CREATE
│   ├── categoryController.js ⬜ TO CREATE
│   ├── supplierController.js ⬜ TO CREATE
│   ├── stockController.js   ⬜ TO CREATE
│   ├── salesController.js   ⬜ TO CREATE
│   ├── serviceController.js ⬜ TO CREATE
│   ├── financeController.js ⬜ TO CREATE
│   ├── reportController.js  ⬜ TO CREATE
│   ├── dashboardController.js ⬜ TO CREATE
│   └── notificationController.js ⬜ TO CREATE
│
├── routes/
│   ├── authRoutes.js        ✅ EXISTS
│   ├── userRoutes.js        ✅ EXISTS
│   ├── branchRoutes.js      ⬜ TO CREATE
│   ├── productRoutes.js     ⬜ TO CREATE
│   ├── categoryRoutes.js    ⬜ TO CREATE
│   ├── supplierRoutes.js    ⬜ TO CREATE
│   ├── stockRoutes.js       ⬜ TO CREATE
│   ├── salesRoutes.js       ⬜ TO CREATE
│   ├── serviceRoutes.js     ⬜ TO CREATE
│   ├── financeRoutes.js     ⬜ TO CREATE
│   ├── reportRoutes.js      ⬜ TO CREATE
│   ├── dashboardRoutes.js   ⬜ TO CREATE
│   └── notificationRoutes.js ⬜ TO CREATE
│
├── middleware/
│   ├── auth.js              ✅ EXISTS
│   ├── errorHandler.js      ✅ EXISTS
│   ├── validate.js          ⬜ TO CREATE
│   ├── branchAccess.js      ⬜ TO CREATE
│   ├── rateLimit.js         ⬜ TO CREATE
│   └── cache.js             ⬜ TO CREATE
│
├── utils/
│   ├── asyncHandler.js      ✅ EXISTS
│   ├── jwt.js               ✅ EXISTS
│   ├── apiResponse.js       ⬜ TO CREATE
│   ├── validators.js        ⬜ TO CREATE
│   ├── cache.js             ⬜ TO CREATE
│   ├── notifications.js     ⬜ TO CREATE
│   └── reports.js           ⬜ TO CREATE
│
├── services/
│   ├── emailService.js      ⬜ TO CREATE
│   ├── smsService.js        ⬜ TO CREATE
│   ├── cacheService.js      ⬜ TO CREATE
│   └── notificationService.js ⬜ TO CREATE
│
└── server.js                ✅ EXISTS
```

---

## 🗄️ Database Schema Design

### 1. Branch Model
```javascript
{
  name: String (required, unique),
  code: String (required, unique, uppercase),
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },
  contact: {
    phone: String,
    email: String
  },
  manager: ObjectId (ref: User),
  isActive: Boolean (default: true),
  settings: {
    currency: String (default: 'PHP'),
    timezone: String,
    lowStockThreshold: Number (default: 10)
  },
  createdAt: Date,
  updatedAt: Date
}
```

### 2. Product Model
```javascript
{
  sku: String (required, unique),
  name: String (required),
  description: String,
  category: ObjectId (ref: Category, required),
  brand: String,
  model: String,
  specifications: Object,
  images: [String], // URLs
  barcode: String,
  serialNumber: String,
  unit: String (pieces, liters, kg, etc.),
  reorderPoint: Number (default: 10),
  isActive: Boolean (default: true),
  createdBy: ObjectId (ref: User),
  createdAt: Date,
  updatedAt: Date
}
```

### 3. Category Model
```javascript
{
  name: String (required, unique),
  code: String (required, unique, uppercase),
  description: String,
  parent: ObjectId (ref: Category, null for root),
  icon: String,
  color: String,
  isActive: Boolean (default: true),
  createdAt: Date,
  updatedAt: Date
}
```

### 4. Stock Model
```javascript
{
  product: ObjectId (ref: Product, required),
  branch: ObjectId (ref: Branch, required),
  quantity: Number (required, default: 0),
  cost: Number (required), // Unit cost
  sellingPrice: Number (required),
  location: String, // Shelf/bin location
  minStock: Number (default: 10),
  maxStock: Number,
  lastRestocked: Date,
  lastUpdated: Date,
  // Compound unique index on product + branch
}
```

### 5. Supplier Model
```javascript
{
  name: String (required, unique),
  code: String (required, unique, uppercase),
  contact: {
    person: String,
    phone: String,
    email: String
  },
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },
  products: [ObjectId] (ref: Product),
  paymentTerms: String,
  rating: Number (1-5),
  isActive: Boolean (default: true),
  createdAt: Date,
  updatedAt: Date
}
```

### 6. StockTransfer Model
```javascript
{
  transferNumber: String (auto-generated, unique),
  fromBranch: ObjectId (ref: Branch, required),
  toBranch: ObjectId (ref: Branch, required),
  items: [{
    product: ObjectId (ref: Product),
    quantity: Number,
    cost: Number
  }],
  status: String (pending, in-transit, completed, cancelled),
  requestedBy: ObjectId (ref: User),
  approvedBy: ObjectId (ref: User),
  receivedBy: ObjectId (ref: User),
  notes: String,
  requestedDate: Date,
  approvedDate: Date,
  receivedDate: Date,
  createdAt: Date,
  updatedAt: Date
}
```

### 7. SalesOrder Model
```javascript
{
  orderNumber: String (auto-generated, unique),
  branch: ObjectId (ref: Branch, required),
  customer: {
    name: String,
    phone: String,
    email: String,
    address: String
  },
  items: [{
    product: ObjectId (ref: Product),
    quantity: Number,
    unitPrice: Number,
    discount: Number (default: 0),
    subtotal: Number
  }],
  subtotal: Number,
  discount: Number (default: 0),
  tax: Number (default: 0),
  total: Number,
  payment: {
    method: String (cash, card, gcash, bank-transfer),
    status: String (pending, partial, paid, refunded),
    paidAmount: Number (default: 0),
    balance: Number,
    transactionId: String
  },
  status: String (pending, processing, completed, cancelled),
  notes: String,
  soldBy: ObjectId (ref: User),
  createdAt: Date,
  updatedAt: Date
}
```

### 8. ServiceOrder Model
```javascript
{
  jobNumber: String (auto-generated, unique),
  branch: ObjectId (ref: Branch, required),
  customer: {
    name: String (required),
    phone: String (required),
    email: String,
    vehicleInfo: {
      make: String,
      model: String,
      year: Number,
      plateNumber: String
    }
  },
  serviceType: String (repair, maintenance, installation, diagnostic),
  description: String (required),
  assignedTo: ObjectId (ref: User), // Mechanic
  partsUsed: [{
    product: ObjectId (ref: Product),
    quantity: Number,
    unitPrice: Number,
    subtotal: Number
  }],
  laborCost: Number (default: 0),
  otherCharges: Number (default: 0),
  subtotal: Number,
  discount: Number (default: 0),
  tax: Number (default: 0),
  total: Number,
  payment: {
    method: String,
    status: String,
    paidAmount: Number,
    balance: Number
  },
  status: String (pending, in-progress, completed, cancelled),
  priority: String (low, normal, high, urgent),
  scheduledDate: Date,
  startedDate: Date,
  completedDate: Date,
  notes: String,
  createdBy: ObjectId (ref: User),
  createdAt: Date,
  updatedAt: Date
}
```

### 9. Transaction Model
```javascript
{
  transactionNumber: String (auto-generated, unique),
  branch: ObjectId (ref: Branch, required),
  type: String (sale, service, expense, transfer),
  referenceId: ObjectId, // SalesOrder, ServiceOrder, or Expense
  referenceType: String,
  amount: Number (required),
  method: String (cash, card, gcash, bank-transfer),
  category: String,
  description: String,
  cashier: ObjectId (ref: User),
  date: Date (required),
  createdAt: Date,
  updatedAt: Date
}
```

### 10. Expense Model
```javascript
{
  expenseNumber: String (auto-generated, unique),
  branch: ObjectId (ref: Branch, required),
  category: String (rent, utilities, salaries, supplies, maintenance, other),
  description: String (required),
  amount: Number (required),
  payment: {
    method: String,
    referenceNumber: String
  },
  supplier: ObjectId (ref: Supplier),
  receipts: [String], // Receipt image URLs
  approvedBy: ObjectId (ref: User),
  date: Date (required),
  status: String (pending, approved, rejected),
  notes: String,
  createdBy: ObjectId (ref: User),
  createdAt: Date,
  updatedAt: Date
}
```

### 11. Notification Model
```javascript
{
  recipient: ObjectId (ref: User, required),
  type: String (info, warning, alert, success),
  category: String (stock, order, payment, system),
  title: String (required),
  message: String (required),
  data: Object, // Additional context
  isRead: Boolean (default: false),
  readAt: Date,
  link: String, // Deep link to relevant page
  createdAt: Date,
  updatedAt: Date
}
```

### 12. ActivityLog Model
```javascript
{
  user: ObjectId (ref: User, required),
  action: String (create, update, delete, login, logout),
  resource: String (user, product, order, etc.),
  resourceId: ObjectId,
  branch: ObjectId (ref: Branch),
  description: String,
  ipAddress: String,
  userAgent: String,
  changes: Object, // Before/after values
  createdAt: Date
}
```

---

## 🔧 Implementation Phases

### Phase 1: Core Infrastructure (Foundation)
**Priority: HIGH | Estimated Time: 2-3 days**

#### 1.1 Utility Files
**Files to Create:**
- `src/utils/apiResponse.js`
- `src/utils/validators.js`
- `src/utils/cache.js`
- `src/config/constants.js`

**apiResponse.js Structure:**
```javascript
class ApiResponse {
  static success(res, statusCode, message, data, meta = {})
  static error(res, statusCode, message, errors = [])
  static paginate(res, data, page, limit, total)
}
```

**constants.js Content:**
```javascript
module.exports = {
  USER_ROLES: { ADMIN: 'admin', SALESPERSON: 'salesperson', MECHANIC: 'mechanic', CUSTOMER: 'customer' },
  ORDER_STATUS: { PENDING: 'pending', PROCESSING: 'processing', COMPLETED: 'completed', CANCELLED: 'cancelled' },
  PAYMENT_METHODS: { CASH: 'cash', CARD: 'card', GCASH: 'gcash', BANK_TRANSFER: 'bank-transfer' },
  PAYMENT_STATUS: { PENDING: 'pending', PARTIAL: 'partial', PAID: 'paid', REFUNDED: 'refunded' },
  STOCK_TRANSFER_STATUS: { PENDING: 'pending', IN_TRANSIT: 'in-transit', COMPLETED: 'completed', CANCELLED: 'cancelled' },
  SERVICE_PRIORITY: { LOW: 'low', NORMAL: 'normal', HIGH: 'high', URGENT: 'urgent' },
  NOTIFICATION_TYPES: { INFO: 'info', WARNING: 'warning', ALERT: 'alert', SUCCESS: 'success' },
  CACHE_TTL: {
    SHORT: 300,      // 5 minutes
    MEDIUM: 1800,    // 30 minutes
    LONG: 3600,      // 1 hour
    VERY_LONG: 86400 // 24 hours
  }
}
```

#### 1.2 Middleware Enhancements
**Files to Create:**
- `src/middleware/validate.js` - Express-validator integration
- `src/middleware/branchAccess.js` - Branch permission checking
- `src/middleware/cache.js` - Redis caching middleware
- `src/middleware/rateLimit.js` - API rate limiting

**validate.js Implementation:**
```javascript
const { validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return ApiResponse.error(res, 400, 'Validation failed', 
      errors.array().map(err => ({ field: err.param, message: err.msg }))
    );
  }
  next();
};
```

**branchAccess.js Implementation:**
```javascript
// Check if user has access to specific branch
const checkBranchAccess = (req, res, next) => {
  const { branchId } = req.params;
  const user = req.user;
  
  // Admin can access all branches
  if (user.role === 'admin') return next();
  
  // Other users can only access their assigned branch
  if (user.branch.toString() !== branchId) {
    return ApiResponse.error(res, 403, 'Access denied to this branch');
  }
  
  next();
};
```

#### 1.3 Update User Model
**Changes Required:**
- Add `branch` field (ObjectId, ref: Branch)
- Update role enum to include all four roles
- Add `permissions` array for granular access control

---

### Phase 2: Branch Management
**Priority: HIGH | Estimated Time: 1-2 days**

#### 2.1 Create Branch Model
**File:** `src/models/Branch.js`

**Validation Rules:**
- Name and code must be unique
- Code must be uppercase, alphanumeric
- Manager must be a valid user with appropriate role

#### 2.2 Create Branch Controller
**File:** `src/controllers/branchController.js`

**Endpoints:**

| Method | Endpoint | Description | Auth | Role |
|--------|----------|-------------|------|------|
| GET | `/api/branches` | Get all branches | ✅ | All |
| GET | `/api/branches/:id` | Get single branch | ✅ | All |
| POST | `/api/branches` | Create branch | ✅ | Admin |
| PUT | `/api/branches/:id` | Update branch | ✅ | Admin |
| DELETE | `/api/branches/:id` | Delete branch | ✅ | Admin |
| GET | `/api/branches/:id/stats` | Get branch statistics | ✅ | Admin, Manager |

**Request/Response Examples:**

**POST /api/branches**
```json
// Request
{
  "name": "Main Branch - Manila",
  "code": "MNL01",
  "address": {
    "street": "123 EDSA",
    "city": "Manila",
    "state": "Metro Manila",
    "zipCode": "1000",
    "country": "Philippines"
  },
  "contact": {
    "phone": "+639123456789",
    "email": "manila@motorparts.com"
  },
  "managerId": "507f1f77bcf86cd799439011",
  "settings": {
    "currency": "PHP",
    "timezone": "Asia/Manila",
    "lowStockThreshold": 15
  }
}

// Response 201
{
  "success": true,
  "message": "Branch created successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439012",
    "name": "Main Branch - Manila",
    "code": "MNL01",
    "address": {...},
    "contact": {...},
    "manager": {...},
    "isActive": true,
    "settings": {...},
    "createdAt": "2026-01-31T10:00:00.000Z",
    "updatedAt": "2026-01-31T10:00:00.000Z"
  },
  "meta": {
    "timestamp": "2026-01-31T10:00:00.000Z"
  }
}
```

**GET /api/branches?page=1&limit=10&active=true**
```json
// Response 200
{
  "success": true,
  "message": "Branches retrieved successfully",
  "data": [
    {
      "_id": "507f1f77bcf86cd799439012",
      "name": "Main Branch - Manila",
      "code": "MNL01",
      "isActive": true,
      "manager": {
        "_id": "507f1f77bcf86cd799439011",
        "name": "John Doe",
        "email": "john@motorparts.com"
      },
      "stats": {
        "totalProducts": 1250,
        "totalStock": 15680,
        "activeOrders": 45
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 5,
    "totalPages": 1,
    "timestamp": "2026-01-31T10:00:00.000Z"
  }
}
```

#### 2.3 Caching Strategy
- Cache branch list (TTL: 1 hour)
- Invalidate on branch create/update/delete
- Cache individual branch data (TTL: 30 minutes)

#### 2.4 Create Branch Routes
**File:** `src/routes/branchRoutes.js`

---

### Phase 3: Product & Category Management
**Priority: HIGH | Estimated Time: 3-4 days**

#### 3.1 Create Category Model
**File:** `src/models/Category.js`

**Features:**
- Hierarchical categories (parent-child relationship)
- Auto-generate code from name
- Soft delete support

#### 3.2 Create Product Model
**File:** `src/models/Product.js`

**Features:**
- Auto-generate SKU if not provided
- Image upload support (store URLs)
- Full-text search indexing
- Validation for required fields

#### 3.3 Create Category Controller & Routes
**File:** `src/controllers/categoryController.js`, `src/routes/categoryRoutes.js`

**Endpoints:**

| Method | Endpoint | Description | Auth | Role |
|--------|----------|-------------|------|------|
| GET | `/api/categories` | Get all categories | ✅ | All |
| GET | `/api/categories/:id` | Get single category | ✅ | All |
| GET | `/api/categories/:id/children` | Get subcategories | ✅ | All |
| POST | `/api/categories` | Create category | ✅ | Admin |
| PUT | `/api/categories/:id` | Update category | ✅ | Admin |
| DELETE | `/api/categories/:id` | Delete category | ✅ | Admin |

**Request Example:**
```json
// POST /api/categories
{
  "name": "Engine Parts",
  "code": "ENG",
  "description": "All engine related components",
  "parent": null,
  "icon": "engine-icon.svg",
  "color": "#FF5722"
}

// Response 201
{
  "success": true,
  "message": "Category created successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439013",
    "name": "Engine Parts",
    "code": "ENG",
    "description": "All engine related components",
    "parent": null,
    "icon": "engine-icon.svg",
    "color": "#FF5722",
    "isActive": true,
    "createdAt": "2026-01-31T10:00:00.000Z"
  }
}
```

#### 3.4 Create Product Controller & Routes
**File:** `src/controllers/productController.js`, `src/routes/productRoutes.js`

**Endpoints:**

| Method | Endpoint | Description | Auth | Role |
|--------|----------|-------------|------|------|
| GET | `/api/products` | Get all products (with filters) | ✅ | All |
| GET | `/api/products/:id` | Get single product | ✅ | All |
| GET | `/api/products/search` | Search products | ✅ | All |
| GET | `/api/products/:id/stock` | Get stock by branch | ✅ | All |
| POST | `/api/products` | Create product | ✅ | Admin |
| PUT | `/api/products/:id` | Update product | ✅ | Admin |
| DELETE | `/api/products/:id` | Delete product | ✅ | Admin |
| POST | `/api/products/:id/images` | Upload product images | ✅ | Admin |
| DELETE | `/api/products/:id/images/:imageId` | Delete product image | ✅ | Admin |

**Request Examples:**

**GET /api/products?page=1&limit=20&category=507f&search=brake&branch=507f**
```json
{
  "success": true,
  "message": "Products retrieved successfully",
  "data": [
    {
      "_id": "507f1f77bcf86cd799439014",
      "sku": "BRK-001",
      "name": "Brake Pad Set - Front",
      "description": "High performance ceramic brake pads",
      "category": {
        "_id": "507f1f77bcf86cd799439013",
        "name": "Brake System",
        "code": "BRK"
      },
      "brand": "Brembo",
      "model": "P-123",
      "images": ["https://cdn.example.com/brake-pad-1.jpg"],
      "barcode": "1234567890123",
      "unit": "set",
      "reorderPoint": 10,
      "stock": {
        "quantity": 45,
        "branch": "507f1f77bcf86cd799439012",
        "sellingPrice": 2500
      },
      "isActive": true
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 156,
    "totalPages": 8,
    "timestamp": "2026-01-31T10:00:00.000Z"
  }
}
```

**POST /api/products**
```json
// Request
{
  "sku": "OIL-001",
  "name": "Engine Oil 10W-40",
  "description": "Synthetic motor oil",
  "category": "507f1f77bcf86cd799439013",
  "brand": "Castrol",
  "model": "GTX",
  "specifications": {
    "viscosity": "10W-40",
    "volume": "1L",
    "type": "Synthetic"
  },
  "unit": "bottle",
  "reorderPoint": 20,
  "barcode": "9876543210987"
}

// Response 201
{
  "success": true,
  "message": "Product created successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439015",
    "sku": "OIL-001",
    "name": "Engine Oil 10W-40",
    "description": "Synthetic motor oil",
    "category": {...},
    "brand": "Castrol",
    "specifications": {...},
    "images": [],
    "isActive": true,
    "createdBy": "507f1f77bcf86cd799439011",
    "createdAt": "2026-01-31T10:00:00.000Z"
  }
}
```

#### 3.5 Caching Strategy
- Cache product list by category (TTL: 30 minutes)
- Cache individual product (TTL: 1 hour)
- Cache search results (TTL: 5 minutes)
- Invalidate on product changes

---

### Phase 4: Inventory & Stock Management
**Priority: HIGH | Estimated Time: 3-4 days**

#### 4.1 Create Stock Model
**File:** `src/models/Stock.js`

**Features:**
- Compound unique index on product + branch
- Automatic stock level calculations
- Low stock detection methods

#### 4.2 Create Supplier Model
**File:** `src/models/Supplier.js`

#### 4.3 Create StockTransfer Model
**File:** `src/models/StockTransfer.js`

**Features:**
- Auto-generate transfer number
- Update stock levels on completion
- Track transfer history

#### 4.4 Create Stock Controller & Routes
**File:** `src/controllers/stockController.js`, `src/routes/stockRoutes.js`

**Endpoints:**

| Method | Endpoint | Description | Auth | Role |
|--------|----------|-------------|------|------|
| GET | `/api/stock` | Get all stock records | ✅ | Admin, Sales |
| GET | `/api/stock/branch/:branchId` | Get stock by branch | ✅ | All |
| GET | `/api/stock/product/:productId` | Get stock for product | ✅ | All |
| GET | `/api/stock/low-stock` | Get low stock items | ✅ | Admin, Sales |
| POST | `/api/stock/adjust` | Adjust stock quantity | ✅ | Admin, Sales |
| POST | `/api/stock/restock` | Add stock (restock) | ✅ | Admin, Sales |
| GET | `/api/stock/transfers` | Get transfer history | ✅ | Admin |
| POST | `/api/stock/transfers` | Create stock transfer | ✅ | Admin, Manager |
| PUT | `/api/stock/transfers/:id` | Update transfer status | ✅ | Admin, Manager |
| GET | `/api/stock/transfers/:id` | Get transfer details | ✅ | Admin, Manager |

**Request Examples:**

**GET /api/stock/branch/:branchId?page=1&limit=50&lowStock=true**
```json
{
  "success": true,
  "message": "Stock records retrieved successfully",
  "data": [
    {
      "_id": "507f1f77bcf86cd799439016",
      "product": {
        "_id": "507f1f77bcf86cd799439014",
        "sku": "BRK-001",
        "name": "Brake Pad Set - Front",
        "category": "Brake System"
      },
      "branch": {
        "_id": "507f1f77bcf86cd799439012",
        "name": "Main Branch - Manila",
        "code": "MNL01"
      },
      "quantity": 8,
      "cost": 1800,
      "sellingPrice": 2500,
      "location": "A-12-3",
      "minStock": 10,
      "maxStock": 100,
      "status": "low",
      "lastRestocked": "2026-01-25T10:00:00.000Z",
      "lastUpdated": "2026-01-30T15:30:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 50,
    "total": 23,
    "totalPages": 1,
    "timestamp": "2026-01-31T10:00:00.000Z"
  }
}
```

**POST /api/stock/restock**
```json
// Request
{
  "product": "507f1f77bcf86cd799439014",
  "branch": "507f1f77bcf86cd799439012",
  "quantity": 50,
  "cost": 1800,
  "sellingPrice": 2500,
  "supplier": "507f1f77bcf86cd799439020",
  "location": "A-12-3",
  "notes": "Regular monthly restock"
}

// Response 201
{
  "success": true,
  "message": "Stock updated successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439016",
    "product": {...},
    "branch": {...},
    "quantity": 58,
    "previousQuantity": 8,
    "quantityAdded": 50,
    "cost": 1800,
    "sellingPrice": 2500,
    "location": "A-12-3",
    "lastRestocked": "2026-01-31T10:00:00.000Z"
  }
}
```

**POST /api/stock/transfers**
```json
// Request
{
  "fromBranch": "507f1f77bcf86cd799439012",
  "toBranch": "507f1f77bcf86cd799439018",
  "items": [
    {
      "product": "507f1f77bcf86cd799439014",
      "quantity": 10,
      "cost": 1800
    }
  ],
  "notes": "Branch A has excess stock"
}

// Response 201
{
  "success": true,
  "message": "Stock transfer created successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439025",
    "transferNumber": "STR-2026-001",
    "fromBranch": {...},
    "toBranch": {...},
    "items": [...],
    "status": "pending",
    "requestedBy": {...},
    "requestedDate": "2026-01-31T10:00:00.000Z",
    "createdAt": "2026-01-31T10:00:00.000Z"
  }
}
```

#### 4.5 Create Supplier Controller & Routes
**File:** `src/controllers/supplierController.js`, `src/routes/supplierRoutes.js`

**Endpoints:**

| Method | Endpoint | Description | Auth | Role |
|--------|----------|-------------|------|------|
| GET | `/api/suppliers` | Get all suppliers | ✅ | Admin, Sales |
| GET | `/api/suppliers/:id` | Get single supplier | ✅ | Admin, Sales |
| POST | `/api/suppliers` | Create supplier | ✅ | Admin |
| PUT | `/api/suppliers/:id` | Update supplier | ✅ | Admin |
| DELETE | `/api/suppliers/:id` | Delete supplier | ✅ | Admin |
| GET | `/api/suppliers/:id/products` | Get supplier products | ✅ | Admin, Sales |

#### 4.6 Notification Triggers
- Send notification when stock falls below reorder point
- Notify manager when stock transfer is created
- Notify receiver when transfer is in-transit

---

### Phase 5: Sales Order Management
**Priority: HIGH | Estimated Time: 3-4 days**

#### 5.1 Create SalesOrder Model
**File:** `src/models/SalesOrder.js`

**Features:**
- Auto-generate order number (format: SO-YYYY-XXXX)
- Calculate totals automatically
- Update stock on order completion
- Create transaction record

#### 5.2 Create Sales Controller & Routes
**File:** `src/controllers/salesController.js`, `src/routes/salesRoutes.js`

**Endpoints:**

| Method | Endpoint | Description | Auth | Role |
|--------|----------|-------------|------|------|
| GET | `/api/sales` | Get all sales orders | ✅ | Admin, Sales |
| GET | `/api/sales/:id` | Get single order | ✅ | Admin, Sales |
| GET | `/api/sales/branch/:branchId` | Get orders by branch | ✅ | Admin, Sales |
| POST | `/api/sales` | Create sales order | ✅ | Admin, Sales |
| PUT | `/api/sales/:id` | Update order | ✅ | Admin, Sales |
| PUT | `/api/sales/:id/status` | Update order status | ✅ | Admin, Sales |
| PUT | `/api/sales/:id/payment` | Update payment | ✅ | Admin, Sales |
| DELETE | `/api/sales/:id` | Cancel order | ✅ | Admin |
| GET | `/api/sales/:id/invoice` | Generate invoice | ✅ | Admin, Sales |

**Request Examples:**

**POST /api/sales**
```json
// Request
{
  "branch": "507f1f77bcf86cd799439012",
  "customer": {
    "name": "Juan Dela Cruz",
    "phone": "+639123456789",
    "email": "juan@email.com",
    "address": "123 Street, Manila"
  },
  "items": [
    {
      "product": "507f1f77bcf86cd799439014",
      "quantity": 2,
      "unitPrice": 2500,
      "discount": 0
    },
    {
      "product": "507f1f77bcf86cd799439015",
      "quantity": 4,
      "unitPrice": 450,
      "discount": 50
    }
  ],
  "discount": 200,
  "tax": 0,
  "payment": {
    "method": "cash",
    "paidAmount": 6500
  },
  "notes": "Walk-in customer"
}

// Response 201
{
  "success": true,
  "message": "Sales order created successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439030",
    "orderNumber": "SO-2026-0001",
    "branch": {...},
    "customer": {...},
    "items": [
      {
        "product": {
          "_id": "507f1f77bcf86cd799439014",
          "sku": "BRK-001",
          "name": "Brake Pad Set - Front"
        },
        "quantity": 2,
        "unitPrice": 2500,
        "discount": 0,
        "subtotal": 5000
      },
      {
        "product": {
          "_id": "507f1f77bcf86cd799439015",
          "sku": "OIL-001",
          "name": "Engine Oil 10W-40"
        },
        "quantity": 4,
        "unitPrice": 450,
        "discount": 50,
        "subtotal": 1750
      }
    ],
    "subtotal": 6750,
    "discount": 200,
    "tax": 0,
    "total": 6550,
    "payment": {
      "method": "cash",
      "status": "paid",
      "paidAmount": 6500,
      "balance": -50,
      "change": 50
    },
    "status": "completed",
    "soldBy": {...},
    "createdAt": "2026-01-31T10:00:00.000Z"
  }
}
```

**GET /api/sales?branch=507f&status=completed&startDate=2026-01-01&endDate=2026-01-31&page=1**
```json
{
  "success": true,
  "message": "Sales orders retrieved successfully",
  "data": [
    {
      "_id": "507f1f77bcf86cd799439030",
      "orderNumber": "SO-2026-0001",
      "branch": {...},
      "customer": {
        "name": "Juan Dela Cruz",
        "phone": "+639123456789"
      },
      "total": 6550,
      "payment": {
        "method": "cash",
        "status": "paid"
      },
      "status": "completed",
      "soldBy": {
        "name": "Maria Santos"
      },
      "createdAt": "2026-01-31T10:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 245,
    "totalPages": 13,
    "summary": {
      "totalAmount": 1567890,
      "averageOrderValue": 6398,
      "totalOrders": 245
    },
    "timestamp": "2026-01-31T10:00:00.000Z"
  }
}
```

#### 5.3 Business Logic
- Check stock availability before creating order
- Deduct stock quantity on order completion
- Create transaction record automatically
- Generate order number sequentially
- Calculate change if payment exceeds total

#### 5.4 Notifications
- Notify manager of large orders (>10,000)
- Alert if payment is partial
- Notify customer via SMS (if implemented)

---

### Phase 6: Service Order Management
**Priority: MEDIUM | Estimated Time: 3-4 days**

#### 6.1 Create ServiceOrder Model
**File:** `src/models/ServiceOrder.js`

**Features:**
- Auto-generate job number (format: JOB-YYYY-XXXX)
- Track mechanic assignment and progress
- Calculate total including labor and parts
- Update stock for parts used

#### 6.2 Create Service Controller & Routes
**File:** `src/controllers/serviceController.js`, `src/routes/serviceRoutes.js`

**Endpoints:**

| Method | Endpoint | Description | Auth | Role |
|--------|----------|-------------|------|------|
| GET | `/api/services` | Get all service orders | ✅ | Admin, Sales, Mechanic |
| GET | `/api/services/:id` | Get single order | ✅ | Admin, Sales, Mechanic |
| GET | `/api/services/assigned-to-me` | Get my assigned jobs | ✅ | Mechanic |
| POST | `/api/services` | Create service order | ✅ | Admin, Sales |
| PUT | `/api/services/:id` | Update order | ✅ | Admin, Sales, Mechanic |
| PUT | `/api/services/:id/status` | Update status | ✅ | Admin, Sales, Mechanic |
| PUT | `/api/services/:id/assign` | Assign mechanic | ✅ | Admin, Manager |
| PUT | `/api/services/:id/parts` | Add/update parts used | ✅ | Mechanic |
| PUT | `/api/services/:id/payment` | Update payment | ✅ | Admin, Sales |
| DELETE | `/api/services/:id` | Cancel order | ✅ | Admin |
| GET | `/api/services/:id/invoice` | Generate invoice | ✅ | Admin, Sales |

**Request Examples:**

**POST /api/services**
```json
// Request
{
  "branch": "507f1f77bcf86cd799439012",
  "customer": {
    "name": "Pedro Garcia",
    "phone": "+639987654321",
    "vehicleInfo": {
      "make": "Toyota",
      "model": "Vios",
      "year": 2020,
      "plateNumber": "ABC-1234"
    }
  },
  "serviceType": "maintenance",
  "description": "Regular maintenance - Change oil, check brakes",
  "scheduledDate": "2026-02-01T09:00:00.000Z",
  "priority": "normal",
  "notes": "Customer will wait"
}

// Response 201
{
  "success": true,
  "message": "Service order created successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439035",
    "jobNumber": "JOB-2026-0001",
    "branch": {...},
    "customer": {...},
    "serviceType": "maintenance",
    "description": "Regular maintenance - Change oil, check brakes",
    "assignedTo": null,
    "partsUsed": [],
    "laborCost": 0,
    "total": 0,
    "payment": {
      "status": "pending",
      "paidAmount": 0,
      "balance": 0
    },
    "status": "pending",
    "priority": "normal",
    "scheduledDate": "2026-02-01T09:00:00.000Z",
    "createdBy": {...},
    "createdAt": "2026-01-31T10:00:00.000Z"
  }
}
```

**PUT /api/services/:id/parts**
```json
// Request
{
  "partsUsed": [
    {
      "product": "507f1f77bcf86cd799439015",
      "quantity": 4,
      "unitPrice": 450
    },
    {
      "product": "507f1f77bcf86cd799439014",
      "quantity": 1,
      "unitPrice": 2500
    }
  ],
  "laborCost": 800,
  "otherCharges": 0
}

// Response 200
{
  "success": true,
  "message": "Service order updated successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439035",
    "jobNumber": "JOB-2026-0001",
    "partsUsed": [...],
    "laborCost": 800,
    "otherCharges": 0,
    "subtotal": 4300,
    "tax": 0,
    "total": 4300,
    "payment": {
      "status": "pending",
      "balance": 4300
    },
    "status": "in-progress",
    "updatedAt": "2026-01-31T11:30:00.000Z"
  }
}
```

#### 6.3 Business Logic
- Auto-assign to available mechanic (optional)
- Track job duration (scheduled -> completed)
- Deduct parts from stock when job is completed
- Create transaction record on completion
- Send SMS notification to customer when ready

---

### Phase 7: Financial Management
**Priority: MEDIUM | Estimated Time: 2-3 days**

#### 7.1 Create Transaction Model
**File:** `src/models/Transaction.js`

**Features:**
- Auto-generate transaction number
- Link to source (SalesOrder, ServiceOrder, Expense)
- Support all payment methods

#### 7.2 Create Expense Model
**File:** `src/models/Expense.js`

**Features:**
- Auto-generate expense number
- Support receipt image uploads
- Approval workflow

#### 7.3 Create Finance Controller & Routes
**File:** `src/controllers/financeController.js`, `src/routes/financeRoutes.js`

**Endpoints:**

| Method | Endpoint | Description | Auth | Role |
|--------|----------|-------------|------|------|
| GET | `/api/finance/transactions` | Get all transactions | ✅ | Admin |
| GET | `/api/finance/transactions/branch/:branchId` | Get branch transactions | ✅ | Admin, Manager |
| GET | `/api/finance/expenses` | Get all expenses | ✅ | Admin |
| POST | `/api/finance/expenses` | Create expense | ✅ | Admin, Manager |
| PUT | `/api/finance/expenses/:id` | Update expense | ✅ | Admin |
| PUT | `/api/finance/expenses/:id/approve` | Approve expense | ✅ | Admin |
| DELETE | `/api/finance/expenses/:id` | Delete expense | ✅ | Admin |
| GET | `/api/finance/cash-flow` | Get cash flow summary | ✅ | Admin, Manager |
| GET | `/api/finance/income-report` | Get income report | ✅ | Admin, Manager |

**Request Examples:**

**GET /api/finance/cash-flow?branch=507f&startDate=2026-01-01&endDate=2026-01-31**
```json
{
  "success": true,
  "message": "Cash flow data retrieved successfully",
  "data": {
    "branch": {...},
    "period": {
      "start": "2026-01-01T00:00:00.000Z",
      "end": "2026-01-31T23:59:59.000Z"
    },
    "income": {
      "sales": 1250000,
      "services": 450000,
      "total": 1700000
    },
    "expenses": {
      "rent": 50000,
      "utilities": 15000,
      "salaries": 180000,
      "supplies": 250000,
      "maintenance": 25000,
      "other": 30000,
      "total": 550000
    },
    "netCashFlow": 1150000,
    "paymentMethodBreakdown": {
      "cash": 850000,
      "card": 650000,
      "gcash": 150000,
      "bank-transfer": 50000
    }
  },
  "meta": {
    "timestamp": "2026-01-31T10:00:00.000Z"
  }
}
```

**POST /api/finance/expenses**
```json
// Request
{
  "branch": "507f1f77bcf86cd799439012",
  "category": "utilities",
  "description": "Electricity bill - January 2026",
  "amount": 15000,
  "payment": {
    "method": "bank-transfer",
    "referenceNumber": "REF-123456"
  },
  "date": "2026-01-31",
  "receipts": ["https://cdn.example.com/receipt-123.jpg"]
}

// Response 201
{
  "success": true,
  "message": "Expense recorded successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439040",
    "expenseNumber": "EXP-2026-0015",
    "branch": {...},
    "category": "utilities",
    "description": "Electricity bill - January 2026",
    "amount": 15000,
    "payment": {...},
    "receipts": [...],
    "status": "pending",
    "createdBy": {...},
    "date": "2026-01-31T00:00:00.000Z",
    "createdAt": "2026-01-31T10:00:00.000Z"
  }
}
```

#### 7.4 Automatic Transaction Creation
- Create transaction on sales order completion
- Create transaction on service order completion
- Create transaction on expense approval

---

### Phase 8: Analytics & Reporting
**Priority: MEDIUM | Estimated Time: 3-4 days**

#### 8.1 Create Report Controller & Routes
**File:** `src/controllers/reportController.js`, `src/routes/reportRoutes.js`

**Endpoints:**

| Method | Endpoint | Description | Auth | Role |
|--------|----------|-------------|------|------|
| GET | `/api/reports/sales` | Sales report | ✅ | Admin, Manager |
| GET | `/api/reports/inventory` | Inventory report | ✅ | Admin, Manager |
| GET | `/api/reports/best-selling` | Best selling products | ✅ | Admin, Manager |
| GET | `/api/reports/branch-performance` | Branch comparison | ✅ | Admin |
| GET | `/api/reports/profit-loss` | P&L statement | ✅ | Admin |
| GET | `/api/reports/customer-insights` | Customer analytics | ✅ | Admin, Manager |
| GET | `/api/reports/employee-performance` | Staff performance | ✅ | Admin, Manager |
| POST | `/api/reports/custom` | Generate custom report | ✅ | Admin |

**Request Examples:**

**GET /api/reports/sales?branch=507f&period=monthly&year=2026&month=1**
```json
{
  "success": true,
  "message": "Sales report generated successfully",
  "data": {
    "branch": {...},
    "period": {
      "type": "monthly",
      "start": "2026-01-01T00:00:00.000Z",
      "end": "2026-01-31T23:59:59.000Z"
    },
    "summary": {
      "totalSales": 1250000,
      "totalOrders": 245,
      "averageOrderValue": 5102,
      "totalCustomers": 198,
      "newCustomers": 45,
      "returningCustomers": 153
    },
    "dailyBreakdown": [
      {
        "date": "2026-01-01",
        "sales": 45000,
        "orders": 12,
        "avgOrderValue": 3750
      }
      // ... more days
    ],
    "topProducts": [
      {
        "product": {...},
        "quantitySold": 150,
        "revenue": 225000
      }
    ],
    "paymentMethods": {
      "cash": 650000,
      "card": 450000,
      "gcash": 120000,
      "bank-transfer": 30000
    }
  },
  "meta": {
    "timestamp": "2026-01-31T10:00:00.000Z"
  }
}
```

**GET /api/reports/inventory?branch=507f&category=507f**
```json
{
  "success": true,
  "message": "Inventory report generated successfully",
  "data": {
    "branch": {...},
    "summary": {
      "totalProducts": 450,
      "totalStockValue": 2500000,
      "lowStockItems": 23,
      "outOfStockItems": 5
    },
    "categoryBreakdown": [
      {
        "category": {...},
        "products": 75,
        "totalValue": 850000,
        "avgTurnoverRate": 4.5
      }
    ],
    "lowStockItems": [...],
    "fastMoving": [
      {
        "product": {...},
        "turnoverRate": 12.5,
        "avgMonthlySales": 45
      }
    ],
    "slowMoving": [
      {
        "product": {...},
        "turnoverRate": 0.5,
        "lastSaleDate": "2025-11-15T00:00:00.000Z"
      }
    ]
  },
  "meta": {
    "timestamp": "2026-01-31T10:00:00.000Z"
  }
}
```

#### 8.2 Dashboard Controller & Routes
**File:** `src/controllers/dashboardController.js`, `src/routes/dashboardRoutes.js`

**Endpoints:**

| Method | Endpoint | Description | Auth | Role |
|--------|----------|-------------|------|------|
| GET | `/api/dashboard/overview` | General overview | ✅ | All |
| GET | `/api/dashboard/branch/:branchId` | Branch dashboard | ✅ | All |
| GET | `/api/dashboard/stats` | Key statistics | ✅ | Admin |

**GET /api/dashboard/overview?branch=507f**
```json
{
  "success": true,
  "message": "Dashboard data retrieved successfully",
  "data": {
    "branch": {...},
    "today": {
      "sales": 45000,
      "orders": 12,
      "services": 8,
      "revenue": 52000
    },
    "thisMonth": {
      "sales": 1250000,
      "services": 450000,
      "expenses": 550000,
      "profit": 1150000
    },
    "alerts": [
      {
        "type": "warning",
        "message": "23 items are below reorder point"
      },
      {
        "type": "info",
        "message": "5 pending stock transfers"
      }
    ],
    "recentOrders": [...],
    "lowStockProducts": [...],
    "topProducts": [...]
  },
  "meta": {
    "timestamp": "2026-01-31T10:00:00.000Z"
  }
}
```

#### 8.3 Caching Strategy
- Cache dashboard data (TTL: 5 minutes)
- Cache reports (TTL: 1 hour)
- Invalidate on relevant data changes

---

### Phase 9: Notifications & Real-time Features
**Priority: LOW | Estimated Time: 2-3 days**

#### 9.1 Create Notification Model
**File:** `src/models/Notification.js`

#### 9.2 Setup Socket.io
**File:** `src/config/socket.js`

**Features:**
- Connection authentication
- Room-based messaging (per branch)
- Event types: stock-alert, order-update, system-message

#### 9.3 Create Notification Controller & Routes
**File:** `src/controllers/notificationController.js`, `src/routes/notificationRoutes.js`

**Endpoints:**

| Method | Endpoint | Description | Auth | Role |
|--------|----------|-------------|------|------|
| GET | `/api/notifications` | Get user notifications | ✅ | All |
| GET | `/api/notifications/unread` | Get unread count | ✅ | All |
| PUT | `/api/notifications/:id/read` | Mark as read | ✅ | All |
| PUT | `/api/notifications/read-all` | Mark all as read | ✅ | All |
| DELETE | `/api/notifications/:id` | Delete notification | ✅ | All |

**GET /api/notifications?page=1&limit=20&unread=true**
```json
{
  "success": true,
  "message": "Notifications retrieved successfully",
  "data": [
    {
      "_id": "507f1f77bcf86cd799439045",
      "type": "warning",
      "category": "stock",
      "title": "Low Stock Alert",
      "message": "Brake Pad Set - Front is running low (8 units left)",
      "data": {
        "productId": "507f1f77bcf86cd799439014",
        "quantity": 8,
        "minStock": 10
      },
      "isRead": false,
      "link": "/inventory/products/507f1f77bcf86cd799439014",
      "createdAt": "2026-01-31T09:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 15,
    "unreadCount": 8,
    "timestamp": "2026-01-31T10:00:00.000Z"
  }
}
```

#### 9.4 Notification Service
**File:** `src/services/notificationService.js`

**Methods:**
- `sendNotification(userId, type, title, message, data)`
- `sendBranchNotification(branchId, type, title, message)`
- `sendRoleNotification(role, type, title, message)`

#### 9.5 Trigger Points
- Low stock detection (daily cron job)
- New order created
- Order status changed
- Stock transfer status changed
- Large transaction (>50,000)
- Payment received/due

---

### Phase 10: Activity Logging & Audit Trail
**Priority: LOW | Estimated Time: 1-2 days**

#### 10.1 Create ActivityLog Model
**File:** `src/models/ActivityLog.js`

#### 10.2 Create Logging Middleware
**File:** `src/middleware/activityLogger.js`

**Features:**
- Auto-log all write operations (POST, PUT, DELETE)
- Store before/after values for updates
- Capture user, IP, and timestamp

#### 10.3 Activity Routes
**File:** `src/routes/activityRoutes.js`

**Endpoints:**

| Method | Endpoint | Description | Auth | Role |
|--------|----------|-------------|------|------|
| GET | `/api/activities` | Get activity logs | ✅ | Admin |
| GET | `/api/activities/user/:userId` | Get user activities | ✅ | Admin |
| GET | `/api/activities/resource/:type/:id` | Get resource history | ✅ | Admin |

---

## 🔄 Caching Strategy Summary

### Redis Cache Keys Structure
```
cache:branches:all
cache:branch:{id}
cache:categories:all
cache:category:{id}
cache:products:list:{filters-hash}
cache:product:{id}
cache:stock:branch:{branchId}
cache:stock:product:{productId}
cache:dashboard:{branchId}
cache:report:{type}:{filters-hash}
```

### Cache Invalidation Rules
- **Branch changes** → Invalidate branch cache
- **Product changes** → Invalidate product + stock cache
- **Stock changes** → Invalidate stock + dashboard cache
- **Order completed** → Invalidate dashboard + reports cache
- **Category changes** → Invalidate category + product list cache

### TTL Settings (from constants.js)
- **SHORT (5 min)**: Search results, dashboard, real-time data
- **MEDIUM (30 min)**: Product lists, stock lists
- **LONG (1 hour)**: Individual products, branches, reports
- **VERY_LONG (24 hours)**: Categories, configurations

---

## 🔒 Security Enhancements

### 1. Rate Limiting
**File:** `src/middleware/rateLimit.js`

- **General API**: 100 requests/15 minutes per IP
- **Auth endpoints**: 5 requests/15 minutes per IP
- **Search endpoints**: 30 requests/1 minute per IP

### 2. Input Validation
**Use express-validator for all endpoints**

Example validation chains:
```javascript
// Product creation
body('sku').trim().notEmpty().isLength({ max: 50 }),
body('name').trim().notEmpty().isLength({ max: 200 }),
body('category').isMongoId(),
body('reorderPoint').isInt({ min: 0 })
```

### 3. File Upload Security
**If implementing image uploads:**
- Use multer with file size limit (5MB)
- Validate file types (jpeg, png, pdf only)
- Scan for malware
- Store in separate storage (S3, Cloudinary)
- Never serve user uploads directly

### 4. SQL/NoSQL Injection Prevention
- Use Mongoose built-in sanitization
- Never use `$where` operator with user input
- Validate all ObjectIds before queries

---

## 📊 Database Indexing Strategy

### Critical Indexes

**User Model:**
```javascript
email: { unique: true, index: true }
role: { index: true }
branch: { index: true }
```

**Branch Model:**
```javascript
code: { unique: true, index: true }
isActive: { index: true }
```

**Product Model:**
```javascript
sku: { unique: true, index: true }
category: { index: true }
barcode: { index: true }
name: { text: true } // Full-text search
```

**Stock Model:**
```javascript
{ product: 1, branch: 1 }: { unique: true }
branch: { index: true }
quantity: { index: true }
```

**SalesOrder Model:**
```javascript
orderNumber: { unique: true, index: true }
branch: { index: true }
status: { index: true }
createdAt: { index: true }
{ branch: 1, createdAt: -1 }: compound index for queries
```

**Transaction Model:**
```javascript
transactionNumber: { unique: true, index: true }
branch: { index: true }
date: { index: true }
type: { index: true }
{ branch: 1, date: -1 }: compound index
```

---

## 🚀 Deployment Checklist

### Environment Variables (Production)
```env
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/motorparts
JWT_SECRET=<strong-random-string>
JWT_REFRESH_SECRET=<different-strong-random-string>
REDIS_HOST=<redis-host>
REDIS_PORT=6379
REDIS_PASSWORD=<redis-password>
CLIENT_URL=https://yourfrontend.com
```

### Pre-deployment Tasks
- [ ] Set strong JWT secrets
- [ ] Enable MongoDB authentication
- [ ] Setup Redis password
- [ ] Configure CORS properly
- [ ] Enable rate limiting
- [ ] Setup error logging (Sentry, LogRocket)
- [ ] Setup automated backups
- [ ] Configure SSL/TLS
- [ ] Setup monitoring (PM2, New Relic)
- [ ] Create admin user via script
- [ ] Test all endpoints
- [ ] Load testing
- [ ] Security audit

---

## 📝 Development Guidelines

### Code Style
- Use ES6+ features
- Async/await over promises
- Proper error handling with try-catch
- Meaningful variable names
- Comments for complex logic
- Follow existing patterns

### Git Workflow
- Feature branches from `develop`
- Descriptive commit messages
- Pull requests for code review
- Merge to `develop`, then `main` for production

### Testing (Future Implementation)
- Unit tests for utilities
- Integration tests for API endpoints
- E2E tests for critical flows
- Use Jest + Supertest

---

## 🎯 Implementation Priority Summary

### Phase Priority
1. ✅ **COMPLETED**: Core Infrastructure, Auth, User Management
2. 🔴 **HIGH**: Branch, Product, Inventory, Sales (Core Features)
3. 🟡 **MEDIUM**: Service Orders, Finance, Reports (Essential Features)
4. 🟢 **LOW**: Notifications, Activity Logs (Nice-to-have Features)

### Estimated Timeline
- **HIGH Priority**: 10-12 days
- **MEDIUM Priority**: 8-10 days
- **LOW Priority**: 3-5 days
- **Total**: ~4-5 weeks for complete implementation

### Success Metrics
- All endpoints return uniform responses
- Response times < 500ms (without caching), < 100ms (with caching)
- Zero data inconsistencies
- Proper error handling on all routes
- Comprehensive validation on all inputs
- Role-based access working correctly
- Redis cache hit rate > 70%
- Stock updates are atomic and accurate

---

## 🔚 Final Notes

This plan provides a comprehensive blueprint for implementing a production-ready, scalable backend system. Follow the phases sequentially, and ensure each phase is properly tested before moving to the next.

**Key Success Factors:**
- Maintain uniform response structure across all endpoints
- Implement proper caching to reduce database load
- Use middleware for cross-cutting concerns
- Keep controllers thin, move business logic to services
- Document API changes as you go
- Test thoroughly at each phase

**Remember:** The goal is not just to make it work, but to make it maintainable, scalable, and production-ready. Quality over speed!
