# Talyer E-Inventory System

> **Version:** 1.0.0 (MVP Complete)  
> **Status:** ✅ Production Ready  
> **Last Updated:** February 4, 2026  
> **Test Coverage:** 272/272 tests passing (100%)

A comprehensive multi-branch inventory and business management system designed specifically for motorparts and automotive service businesses. This full-stack solution provides real-time inventory tracking, sales management, service order processing, and financial monitoring across multiple branch locations.

## 📊 Project Status

### MVP Completion (Phases 1-6) ✅

| Phase | Feature | Backend | Frontend | Tests | Status |
|-------|---------|---------|----------|-------|--------|
| 1 | Core Infrastructure & Auth | ✅ | ✅ | 41/41 | Complete |
| 2 | Branch Management | ✅ | ✅ | 35/35 | Complete |
| 3 | Product & Category | ✅ | ✅ | 76/76 | Complete |
| 4 | Stock & Suppliers | ✅ | ✅ | 82/82 | Complete |
| 5 | Sales Orders | ✅ | ✅ | -/- | Complete |
| 6 | Service Orders | ✅ | ✅ | 38/38 | Complete |
| - | User Management | ✅ | ✅ | -/- | Complete |

**Total Backend Tests:** 272 passing (100%)  
**Total Features Implemented:** 7 major modules  
**API Endpoints:** 70+ endpoints  
**Database Models:** 11 models  
**Frontend Pages:** 25+ pages  
**React Components:** 100+ components

### POST-MVP Phases (Planned)

| Phase | Feature | Priority | Estimated Effort |
|-------|---------|----------|-----------------|
| 7 | Financial Management | High | 2-3 weeks |
| 8 | Analytics & Reporting | High | 2-3 weeks |
| 9 | Notifications & Real-time | Medium | 1-2 weeks |
| 10 | Activity Logging & Audit | Medium | 1-2 weeks |

## 🎯 Problem Statement

Motorparts and services businesses with multiple branches face critical challenges:
- **Lack of centralized visibility** across all branch operations
- **Inefficient inventory tracking** leading to stock discrepancies
- **Poor cash flow monitoring** across different locations
- **Communication gaps** between branches and management
- **Manual order processing** causing delays and errors
- **Limited financial insights** for business decision-making

Motorparts E-Inventory provides a unified platform to monitor, manage, and optimize all aspects of multi-branch operations in real-time.

## ✨ Implemented Features (MVP Complete)

### 🏢 Multi-Branch Management
- **Branch CRUD operations** - Create, read, update, deactivate branches
- **Branch-specific inventory** - Independent stock levels and pricing per branch
- **Branch-specific operations** - Each branch maintains its own sales and service orders
- **Branch statistics** - Staff count, inventory levels, revenue per branch
- **Address & contact management** - Complete location information for each branch
- **Business settings** - Currency, timezone, business hours, stock thresholds per branch

### 🔐 Authentication & Security
- **JWT-based authentication** - Access tokens (7d) + refresh tokens (30d)
- **HTTP-only cookies** - Secure refresh token storage
- **Automatic token refresh** - Seamless session management
- **Password reset flow** - Email-based password recovery
- **Role-based access control** - Route-level authorization
- **User activation/deactivation** - Prevent access without deleting accounts
- **403 handling** - Automatic logout for deactivated users

### 👥 User Management
Four distinct user roles with tailored permissions:
- **Admin** - Full system access, user management, financial reports, all branches
- **Salesperson** - Sales processing, inventory viewing, branch-specific operations
- **Mechanic** - Service order viewing (assigned jobs only), read-only product access
- **Customer** - Registration, order history, service tracking (planned)

**Admin Features:**
- User CRUD operations (create, update, activate/deactivate)
- Password reset for any user
- Branch assignment for staff members
- Role-based filtering and search

### 📦 Product Catalog & Inventory
- **Hierarchical categories** - Unlimited parent-child category nesting
- **Product management** - Name, SKU, description, brand, images, specifications
- **Auto-generated SKUs** - Sequential product codes (PROD-000001)
- **Multiple product images** - Primary image designation
- **Full-text search** - Search by name, SKU, brand, barcode

### 📊 Branch-Specific Stock Management (Critical MVP Feature)
- **Independent pricing per branch** - Same product, different prices across branches
- **Quantity tracking** - Available vs reserved stock
- **Stock operations:**
  - Add stock to branch
  - Adjust stock (increase/decrease with reason)
  - Transfer stock between branches
  - Stock reservation system (prevents overselling)
- **Stock transfers** - Pending → approved → completed/rejected workflow
- **Reorder points** - Low stock threshold alerts
- **Cost & profit tracking** - Cost price, selling price, profit margin per branch

### 🛒 Sales Order Management
- **Complete sales workflow** - Pending → processing → completed/cancelled
- **Customer information** - Name, phone, email, address
- **Order items** - Product, quantity, price, discount, subtotal
- **Auto-calculations** - Subtotal, tax, discount, total amount
- **Payment tracking** - Method, amount paid, payment status
- **Stock integration** - Automatic stock deduction on completion
- **Auto-generated order numbers** - SO-YYYY-XXXXXX format
- **Transaction creation** - Automatic cash flow tracking for completed orders
- **Branch-specific pricing** - Uses branch stock prices

### 🔧 Service Order Management
- **Complete service workflow** - Pending → scheduled → in-progress → completed/cancelled
- **Vehicle information** - Make, model, year, plate number, VIN, mileage
- **Customer information** - Name, phone, email, address
- **Mechanic assignment** - Assign/reassign mechanics to jobs
- **Parts tracking** - Add parts used with automatic stock validation
- **Labor & charges** - Labor cost, other charges, auto-calculated total
- **Payment handling** - Track payment status (pending/partial/paid)
- **Priority system** - Low, normal, high, urgent
- **Auto-generated job numbers** - JOB-YYYY-XXXXXX format
- **Stock integration** - Parts deduction on completion
- **Invoice generation** - Print-friendly service invoices
- **My Jobs view** - Mechanics see only their assigned jobs

### 💰 Financial Management
- **Transaction tracking** - Automatic transaction creation for all revenue
- **Transaction types** - Sale, service, refund, expense, transfer
- **Auto-generated transaction numbers** - TXN-YYYYMM-XXXXXX format
- **Payment method tracking** - Cash, card, GCash, PayMaya, bank transfer
- **Branch-specific transactions** - Filter by branch for revenue analysis
- **Audit trail** - Complete reference linking to orders

### 🏭 Supplier Management
- **Supplier CRUD operations** - Name, contact, email, address, tax ID
- **Auto-generated codes** - SUP-XXXXX format
- **Product associations** - Track which suppliers provide which products
- **Active/inactive status** - Manage supplier relationships

### 🔍 Advanced Features
- **Redis caching** - Fast data retrieval with automatic cache invalidation
- **Pagination** - All list endpoints support pagination
- **Advanced filtering** - Search, status, date ranges, branch filters
- **Validation** - Express-validator for all inputs
- **Error handling** - Standardized API responses
- **Access control** - Branch-specific data access (non-admins see only their branch)

## 🛠️ Tech Stack

### Backend
- **Runtime:** Node.js 18+
- **Framework:** Express.js 5.x
- **Database:** MongoDB (via Mongoose ODM 8.x)
- **Caching:** Redis 7.x
- **Authentication:** JSON Web Tokens (JWT) with HTTP-only cookies
- **Password Hashing:** Bcrypt
- **Validation:** Express-validator
- **Testing:** Jest + Supertest + MongoDB Memory Server
- **Real-time:** Socket.io (ready for Phase 9)

### Frontend
- **Framework:** Next.js 15+ (App Router)
- **Language:** TypeScript 5+
- **UI Library:** React 19+
- **Styling:** Tailwind CSS 3.x
- **State Management:** 
  - TanStack Query (React Query) for server state
  - Zustand for auth state
- **Form Handling:** React Hook Form + Zod validation
- **HTTP Client:** Axios with interceptors
- **Icons:** Inline SVG

### Development Tools
- **Backend Dev Server:** Nodemon with hot reload
- **Code Quality:** ESLint
- **Environment:** dotenv for configuration
- **Version Control:** Git
- **Testing:** 100% test coverage for backend MVP features

## 📁 Project Structure

```
talyer-e-inventory/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── constants.js           # System constants (roles, statuses, cache TTL)
│   │   │   ├── database.js            # MongoDB connection
│   │   │   └── redis.js               # Redis client setup
│   │   ├── controllers/
│   │   │   ├── authController.js      # Authentication (login, register, refresh)
│   │   │   ├── userController.js      # User CRUD (admin only)
│   │   │   ├── branchController.js    # Branch management
│   │   │   ├── categoryController.js  # Category hierarchy
│   │   │   ├── productController.js   # Product catalog
│   │   │   ├── stockController.js     # Stock operations & transfers
│   │   │   ├── supplierController.js  # Supplier management
│   │   │   ├── salesController.js     # Sales order processing
│   │   │   └── serviceController.js   # Service order workflow
│   │   ├── middleware/
│   │   │   ├── auth.js                # JWT verification & role authorization
│   │   │   ├── branchAccess.js        # Branch-level access control
│   │   │   ├── cache.js               # Response caching middleware
│   │   │   ├── errorHandler.js        # Global error handler
│   │   │   └── validate.js            # Input validation middleware
│   │   ├── models/
│   │   │   ├── User.js                # User schema with roles
│   │   │   ├── Branch.js              # Branch schema with settings
│   │   │   ├── Category.js            # Category hierarchy
│   │   │   ├── Product.js             # Product catalog
│   │   │   ├── Stock.js               # Branch-specific stock
│   │   │   ├── StockTransfer.js       # Inter-branch transfers
│   │   │   ├── Supplier.js            # Supplier information
│   │   │   ├── SalesOrder.js          # Sales orders
│   │   │   ├── ServiceOrder.js        # Service jobs
│   │   │   └── Transaction.js         # Financial transactions
│   │   ├── routes/
│   │   │   ├── authRoutes.js          # /api/auth/*
│   │   │   ├── userRoutes.js          # /api/users/*
│   │   │   ├── branchRoutes.js        # /api/branches/*
│   │   │   ├── categoryRoutes.js      # /api/categories/*
│   │   │   ├── productRoutes.js       # /api/products/*
│   │   │   ├── stockRoutes.js         # /api/stock/*
│   │   │   ├── supplierRoutes.js      # /api/suppliers/*
│   │   │   ├── salesRoutes.js         # /api/sales/*
│   │   │   └── serviceRoutes.js       # /api/services/*
│   │   ├── utils/
│   │   │   ├── apiResponse.js         # Standardized API responses
│   │   │   ├── asyncHandler.js        # Async error wrapper
│   │   │   ├── cache.js               # Redis cache utility
│   │   │   └── jwt.js                 # Token generation/verification
│   │   └── server.js                  # App entry point
│   ├── tests/                         # Comprehensive test suites
│   │   ├── setup/
│   │   │   └── testHelpers.js         # Test utilities
│   │   ├── auth.test.js               # 41 tests
│   │   ├── branch.test.js             # 35 tests
│   │   ├── category.test.js           # 32 tests
│   │   ├── product.test.js            # 44 tests
│   │   ├── stock.test.js              # 43 tests
│   │   ├── supplier.test.js           # 39 tests
│   │   └── service.test.js            # 38 tests
│   ├── docs/                          # Implementation documentation
│   ├── .env                           # Environment variables
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── (public)/              # Public routes (login, register)
│   │   │   │   └── (auth)/            # Auth pages
│   │   │   └── (protected)/           # Protected routes (dashboard, features)
│   │   │       ├── layout.tsx         # Protected layout with auth guard
│   │   │       ├── dashboard/         # Dashboard page
│   │   │       ├── branches/          # Branch management
│   │   │       ├── categories/        # Category management
│   │   │       ├── products/          # Product management
│   │   │       ├── stock/             # Stock operations
│   │   │       ├── sales/             # Sales orders
│   │   │       ├── services/          # Service orders
│   │   │       ├── suppliers/         # Supplier management
│   │   │       └── users/             # User management
│   │   ├── components/
│   │   │   ├── layouts/
│   │   │   │   └── Navbar.tsx         # Navigation with role-based items
│   │   │   ├── ui/                    # Reusable UI components
│   │   │   ├── branches/              # Branch-specific components
│   │   │   ├── categories/            # Category components
│   │   │   ├── products/              # Product components
│   │   │   ├── stock/                 # Stock operation components
│   │   │   ├── sales/                 # Sales components
│   │   │   ├── services/              # Service order components
│   │   │   ├── suppliers/             # Supplier components
│   │   │   └── users/                 # User management components
│   │   ├── hooks/
│   │   │   ├── useAuth.ts             # Authentication hook
│   │   │   ├── useBranches.ts         # Branch React Query hooks
│   │   │   ├── useCategories.ts       # Category hooks
│   │   │   ├── useProducts.ts         # Product hooks
│   │   │   ├── useStock.ts            # Stock hooks
│   │   │   ├── useSales.ts            # Sales hooks
│   │   │   ├── useServices.ts         # Service hooks
│   │   │   ├── useSuppliers.ts        # Supplier hooks
│   │   │   └── useUsers.ts            # User hooks
│   │   ├── lib/
│   │   │   ├── apiClient.ts           # Axios with token refresh
│   │   │   ├── tokenStorage.ts        # Token management
│   │   │   └── services/              # API service layer
│   │   ├── stores/
│   │   │   └── authStore.ts           # Zustand auth store
│   │   ├── types/
│   │   │   ├── api.ts                 # API response types
│   │   │   ├── auth.ts                # Auth types
│   │   │   ├── branch.ts              # Branch types
│   │   │   ├── category.ts            # Category types
│   │   │   ├── product.ts             # Product types
│   │   │   ├── stock.ts               # Stock types
│   │   │   ├── sales.ts               # Sales types
│   │   │   ├── service.ts             # Service types
│   │   │   ├── supplier.ts            # Supplier types
│   │   │   └── user.ts                # User types
│   │   └── utils/
│   │       └── validators/            # Zod validation schemas
│   ├── public/                        # Static assets
│   ├── docs/                          # Frontend implementation docs
│   └── package.json
└── README.md
```

### Key Architectural Patterns

#### Backend
- **Controller-Service Pattern** - Controllers handle HTTP, services contain business logic
- **Middleware Chain** - Authentication → Authorization → Validation → Caching
- **Repository Pattern** - Models encapsulate database operations
- **Factory Pattern** - Centralized response formatting (ApiResponse)
- **Caching Strategy** - Redis for GET endpoints, invalidate on mutations

#### Frontend
- **Server State Management** - TanStack Query for API data
- **Client State Management** - Zustand for auth state
- **Component Organization** - Feature-based folders
- **Form Handling** - React Hook Form + Zod schemas
- **API Layer** - Axios with automatic token refresh
- **Route Protection** - Layout-based auth guards

## 🚀 Getting Started

### Prerequisites
- **Node.js 18+** installed
- **MongoDB** instance (local or cloud like MongoDB Atlas)
- **Redis server** (optional but recommended for caching)
- **Git** for version control

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd talyer-e-inventory
```

2. **Backend Setup**
```bash
cd backend
npm install

# Configure environment variables
cp .env.example .env
# Edit .env with your configuration
```

3. **Frontend Setup**
```bash
cd ../frontend
npm install

# Configure environment variables
# Create .env.local file
```

### Environment Configuration

#### Backend `.env`

```env
# Server Configuration
NODE_ENV=development
PORT=5000

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/talyer-e-inventory

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRE=7d
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-this-in-production
JWT_REFRESH_EXPIRE=30d

# Cookie Configuration (for refresh token)
COOKIE_SECURE=false  # Set to true in production
COOKIE_DOMAIN=localhost  # Set to your domain in production

# Redis Configuration (optional)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Frontend URL (for CORS)
CLIENT_URL=http://localhost:3000

# Password Reset Token Expiry (in minutes)
RESET_PASSWORD_EXPIRE=10
```

#### Frontend `.env.local`

```env
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:5000
```

### Running the Application

#### Development Mode

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```
Backend runs on `http://localhost:5000`

**Terminal 2 - Redis (optional but recommended):**
```bash
redis-server
```
Redis runs on `localhost:6379`

**Terminal 3 - Frontend:**
```bash
cd frontend
npm run dev
```
Frontend runs on `http://localhost:3000`

#### Production Mode

**Backend:**
```bash
cd backend
npm start
```

**Frontend:**
```bash
cd frontend
npm run build
npm start
```

### Testing

**Run Backend Tests:**
```bash
cd backend
npm test                    # Run all tests
npm test -- auth.test.js   # Run specific test file
npm test -- --coverage     # Run with coverage report
```

**Current Test Results:**
- Total Tests: 272
- Passing: 272 (100%)
- Coverage: Comprehensive coverage of all MVP features

### Initial Setup

After starting the application:

1. **Create Admin User** (via backend console or seed script)
2. **Login** at `http://localhost:3000/login`
3. **Create Branches** in Branch Management
4. **Add Users** in User Management
5. **Set up Product Catalog** (Categories → Products)
6. **Add Stock** to branches
7. **Start Processing Orders** (Sales & Services)

## 📡 API Endpoints

### Authentication (`/api/auth`)
- `POST /register` - Register new customer
- `POST /register-customer` - Public customer registration
- `POST /login` - User login (returns access token + httpOnly refresh cookie)
- `POST /logout` - User logout
- `POST /refresh-token` - Refresh access token (reads from httpOnly cookie)
- `POST /forgot-password` - Request password reset
- `POST /reset-password` - Reset password with token
- `GET /me` - Get current user profile

### User Management (`/api/users`) - Admin Only
- `GET /` - List all users (paginated, filterable)
- `GET /all` - Get all users (no pagination)
- `GET /managers` - Get admin/salesperson users
- `GET /:id` - Get single user
- `POST /` - Create new user
- `PUT /:id` - Update user
- `PATCH /:id/deactivate` - Deactivate user
- `PATCH /:id/activate` - Activate user
- `PATCH /:id/password` - Change user password (admin)

### Branch Management (`/api/branches`)
- `GET /` - List branches (cached, filterable)
- `GET /:id` - Get single branch (cached)
- `GET /:id/stats` - Get branch statistics
- `POST /` - Create branch (admin)
- `PUT /:id` - Update branch (admin)
- `DELETE /:id` - Deactivate branch (admin)

### Category Management (`/api/categories`)
- `GET /` - List categories (hierarchical)
- `GET /:id` - Get single category with children
- `POST /` - Create category (admin)
- `PUT /:id` - Update category (admin)
- `DELETE /:id` - Delete category (admin, checks for products/children)

### Product Management (`/api/products`)
- `GET /` - List products (paginated, searchable, filterable)
- `GET /search` - Search products (full-text)
- `GET /:id` - Get single product
- `POST /` - Create product (admin, salesperson)
- `PUT /:id` - Update product (admin, salesperson)
- `DELETE /:id` - Delete product (admin)
- `POST /:id/images` - Add product image
- `DELETE /:id/images/:imageId` - Delete product image

### Stock Management (`/api/stock`)
- `GET /` - List stock by branch (paginated, filterable)
- `GET /branch/:branchId` - Get branch stock
- `GET /product/:productId` - Get product stock across branches
- `GET /:id` - Get single stock record
- `POST /add` - Add stock to branch (admin, salesperson)
- `POST /adjust` - Adjust stock quantity (admin, salesperson)
- `POST /transfer` - Create stock transfer (admin, salesperson)
- `GET /transfers` - List transfers (paginated)
- `PATCH /transfers/:id/approve` - Approve transfer (admin, destination branch manager)
- `PATCH /transfers/:id/complete` - Complete transfer (admin)
- `PATCH /transfers/:id/reject` - Reject transfer (admin, destination branch manager)

### Supplier Management (`/api/suppliers`)
- `GET /` - List suppliers (paginated)
- `GET /:id` - Get single supplier
- `POST /` - Create supplier (admin)
- `PUT /:id` - Update supplier (admin)
- `DELETE /:id` - Delete supplier (admin)

### Sales Management (`/api/sales`)
- `GET /` - List sales orders (paginated, filterable)
- `GET /:id` - Get single sales order
- `GET /:id/invoice` - Get sales invoice
- `POST /` - Create sales order (admin, salesperson)
- `PUT /:id/status` - Update order status (admin, salesperson)
- `PUT /:id/payment` - Update payment (admin, salesperson)
- `DELETE /:id` - Cancel order (admin)

### Service Management (`/api/services`)
- `GET /` - List service orders (paginated, filterable)
- `GET /my-jobs` - Get mechanic's assigned jobs (mechanic)
- `GET /:id` - Get single service order
- `GET /:id/invoice` - Get service invoice
- `POST /` - Create service order (admin, salesperson)
- `PUT /:id/assign` - Assign mechanic (admin)
- `PUT /:id/status` - Update status (admin, mechanic)
- `PUT /:id/parts` - Update parts used (admin, mechanic)
- `PUT /:id/payment` - Update payment (admin, salesperson)
- `DELETE /:id` - Cancel service (admin)

## 🔒 Authentication & Authorization

### Authentication Flow
1. **Login** - User provides credentials
2. **Token Generation** - Server returns:
   - Access token (JWT, 7 days) in response body
   - Refresh token (30 days) in httpOnly cookie
3. **API Requests** - Client includes `Authorization: Bearer <token>` header
4. **Token Expiration** - When access token expires:
   - Frontend automatically calls refresh endpoint
   - Refresh token is read from httpOnly cookie
   - New access token is returned
5. **Logout** - Clear tokens from client and server

### Role-Based Authorization

| Feature | Admin | Salesperson | Mechanic | Customer |
|---------|-------|-------------|----------|----------|
| **Users** |
| View all users | ✅ | ❌ | ❌ | ❌ |
| Create/edit users | ✅ | ❌ | ❌ | ❌ |
| Activate/deactivate users | ✅ | ❌ | ❌ | ❌ |
| **Branches** |
| View all branches | ✅ | ✅ | ✅ | ✅ |
| View own branch only | - | ✅ | ✅ | ✅ |
| Create/edit branches | ✅ | ❌ | ❌ | ❌ |
| **Products & Categories** |
| View products | ✅ | ✅ | ✅ | ✅ |
| Create/edit products | ✅ | ✅ | ❌ | ❌ |
| Create/edit categories | ✅ | ❌ | ❌ | ❌ |
| **Stock** |
| View stock | ✅ | ✅ | ✅ | ❌ |
| Add/adjust stock | ✅ | ✅ | ❌ | ❌ |
| Transfer stock | ✅ | ✅ | ❌ | ❌ |
| Approve transfers | ✅ | ✅ (dest branch) | ❌ | ❌ |
| **Sales** |
| View sales | ✅ | ✅ (own branch) | ❌ | ❌ |
| Create sales | ✅ | ✅ | ❌ | ❌ |
| Process payments | ✅ | ✅ | ❌ | ❌ |
| **Services** |
| View all services | ✅ | ✅ (own branch) | ❌ | ❌ |
| View assigned jobs | - | - | ✅ | ❌ |
| Create services | ✅ | ✅ | ❌ | ❌ |
| Assign mechanics | ✅ | ❌ | ❌ | ❌ |
| Update status | ✅ | ❌ | ✅ (assigned only) | ❌ |
| Update parts | ✅ | ❌ | ✅ (assigned only) | ❌ |
| Process payments | ✅ | ✅ | ❌ | ❌ |
| **Suppliers** |
| View suppliers | ✅ | ✅ | ❌ | ❌ |
| Create/edit suppliers | ✅ | ❌ | ❌ | ❌ |
| **Financial** |
| View transactions | ✅ | ✅ (own branch) | ❌ | ❌ |
| View reports | ✅ | ✅ (own branch) | ❌ | ❌ |

## 🎯 Roadmap & Future Features

### Phase 7: Financial Management (POST-MVP) 📊
- Expense tracking per branch
- Expense approval workflow
- Cash flow reports (income vs expenses)
- Daily/weekly/monthly financial summaries
- Revenue analysis by product/service
- Profit & loss statements

### Phase 8: Analytics & Reporting (POST-MVP) 📈
- Dashboard with key metrics and KPIs
- Sales analytics (best-selling products, trends)
- Inventory reports (turnover rates, aging analysis)
- Branch performance comparison
- Customer purchase patterns
- Profit margin analysis
- Export reports (CSV/PDF)

### Phase 9: Notifications & Real-time Features (POST-MVP) 🔔
- Low stock alerts
- Order status notifications
- Transfer notifications
- Real-time updates via Socket.io
- Notification center/inbox
- Email/SMS integration
- Push notifications

### Phase 10: Activity Logging & Audit Trail (POST-MVP) 📝
- Complete user activity tracking
- Change history for all records
- Security audit logs
- System event logging
- Search and filter logs
- Compliance reporting
- IP address and user agent tracking

### Additional Planned Features 🚀
- [ ] **Mobile App** - Native iOS and Android apps
- [ ] **Barcode Scanner** - Mobile scanning for inventory
- [ ] **Customer Portal** - Self-service order tracking
- [ ] **Receipt Printing** - POS thermal printer support
- [ ] **Multi-currency Support** - For international branches
- [ ] **Backup & Restore** - Automated database backups
- [ ] **Advanced Search** - Elasticsearch integration
- [ ] **File Management** - Document uploads (quotes, receipts)
- [ ] **Appointment System** - Service booking calendar
- [ ] **Loyalty Program** - Customer rewards system
- [ ] **Inventory Forecasting** - AI-based demand prediction
- [ ] **Supplier Integration** - Direct ordering from suppliers
- [ ] **Multi-language Support** - i18n implementation

## 🏗️ Architecture Overview

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend Layer                        │
│  Next.js 15 + React 19 + TypeScript + Tailwind CSS         │
│  • App Router (Protected & Public Routes)                   │
│  • TanStack Query (Server State)                            │
│  • Zustand (Auth State)                                     │
│  • React Hook Form + Zod Validation                         │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTP/HTTPS (REST API)
                     │ JSON + JWT Bearer Token
┌────────────────────┴────────────────────────────────────────┐
│                      API Gateway Layer                       │
│                    Express.js 5.x Server                     │
│  • Authentication Middleware (JWT)                          │
│  • Authorization Middleware (Role-based)                    │
│  • Validation Middleware (express-validator)                │
│  • Cache Middleware (Redis)                                 │
│  • Error Handler                                            │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
┌───────▼──────┐         ┌───────▼──────┐
│   Business   │         │    Cache     │
│ Logic Layer  │◄────────┤    Layer     │
│              │         │              │
│ Controllers  │         │   Redis      │
│   • Auth     │         │              │
│   • Users    │         │  • GET cache │
│   • Branches │         │  • TTL mgmt  │
│   • Products │         │  • Invalidate│
│   • Stock    │         └──────────────┘
│   • Sales    │
│   • Services │
└──────┬───────┘
       │
┌──────▼───────────────────────────────────────────────┐
│              Data Access Layer                       │
│                 Mongoose ODM                         │
│  • User Model         • Stock Model                 │
│  • Branch Model       • StockTransfer Model         │
│  • Category Model     • SalesOrder Model            │
│  • Product Model      • ServiceOrder Model          │
│  • Supplier Model     • Transaction Model           │
└──────┬───────────────────────────────────────────────┘
       │
┌──────▼──────────────────────────────────────────────┐
│              Database Layer                          │
│                  MongoDB                             │
│  • Document-oriented storage                        │
│  • Indexes for performance                          │
│  • Referential integrity                            │
│  • Compound unique indexes                          │
└─────────────────────────────────────────────────────┘
```

### Data Flow

#### Read Operations (GET)
```
User Request → API Gateway → Check Redis Cache
                              ├─ Cache HIT → Return cached data
                              └─ Cache MISS → Query MongoDB
                                              → Store in Redis
                                              → Return data
```

#### Write Operations (POST/PUT/PATCH/DELETE)
```
User Request → API Gateway → Validate Input
                           → Check Authorization
                           → Execute Business Logic
                           → Update MongoDB
                           → Invalidate Redis Cache
                           → Return Response
```

#### Transaction Flow (Sales/Services)
```
Create Order → Validate Stock → Reserve Stock
             → Process Payment → Deduct Stock
             → Create Transaction Record
             → Invalidate Cache
             → Return Success
```

### Security Architecture

```
┌─────────────────────────────────────────────────────┐
│              Security Layers                        │
├─────────────────────────────────────────────────────┤
│ 1. Authentication (JWT)                            │
│    • Access Token (7 days)                         │
│    • Refresh Token (30 days, httpOnly cookie)      │
│    • Automatic token refresh                        │
├─────────────────────────────────────────────────────┤
│ 2. Authorization (RBAC)                            │
│    • Role-based route protection                    │
│    • Branch-level data isolation                    │
│    • Mechanic job assignment check                  │
├─────────────────────────────────────────────────────┤
│ 3. Input Validation                                │
│    • express-validator on all inputs                │
│    • Zod schemas on frontend                        │
│    • MongoDB schema validation                      │
├─────────────────────────────────────────────────────┤
│ 4. Data Protection                                 │
│    • Password hashing (bcrypt)                      │
│    • HTTP-only cookies                              │
│    • CORS configuration                             │
│    • Sensitive field exclusion                      │
└─────────────────────────────────────────────────────┘
```

### Caching Strategy

| Resource | Cache TTL | Cache Key Format | Invalidation Trigger |
|----------|-----------|------------------|---------------------|
| Branches List | 1 hour | `cache:branches:/api/branches?params` | Create/Update/Delete Branch |
| Branch Detail | 30 min | `cache:branch:/api/branches/:id` | Update Branch |
| Categories | 30 min | `cache:categories:/api/categories?params` | Create/Update/Delete Category |
| Products | 30 min | `cache:products:/api/products?params` | Create/Update/Delete Product |
| Stock | Not cached | - | Real-time data |
| Orders | Not cached | - | Real-time data |

### Database Design Principles

1. **Denormalization for Performance** - Store branch name/code in orders for fast queries
2. **Compound Indexes** - Unique constraint on (product + branch) for stock
3. **Virtual Population** - Branch staff count, product images
4. **Reference Patterns** - ObjectId references for relationships
5. **Soft Deletes** - `isActive` field instead of hard deletes
6. **Auto-generated IDs** - Sequential SKU, order numbers, transaction numbers

### Testing Strategy

```
┌─────────────────────────────────────────────────────┐
│              Testing Pyramid                        │
├─────────────────────────────────────────────────────┤
│                  E2E Tests                          │
│                   (Planned)                         │
├─────────────────────────────────────────────────────┤
│             Integration Tests                       │
│              (API Endpoints)                        │
│  • 272 tests (100% passing)                        │
│  • Jest + Supertest                                 │
│  • MongoDB Memory Server                            │
├─────────────────────────────────────────────────────┤
│               Unit Tests                            │
│         (Business Logic)                            │
│  • Model validation                                 │
│  • Utility functions                                │
│  • Middleware                                       │
└─────────────────────────────────────────────────────┘
```

## 🔧 Development Guidelines

### Backend Conventions

**File Naming:**
- Models: PascalCase (e.g., `User.js`, `SalesOrder.js`)
- Controllers: camelCase with suffix (e.g., `authController.js`)
- Routes: camelCase with suffix (e.g., `authRoutes.js`)
- Utils: camelCase (e.g., `apiResponse.js`)

**Code Structure:**
```javascript
// Controller pattern
exports.functionName = asyncHandler(async (req, res) => {
  // 1. Extract & validate
  const { param } = req.body;
  
  // 2. Business logic
  const result = await Model.findOne({ param });
  
  // 3. Response
  return ApiResponse.success(res, 200, 'Success message', result);
});
```

**Error Handling:**
- Use `asyncHandler` wrapper for async functions
- Use `ApiResponse.error()` for consistent error format
- Throw errors for validation failures
- Global error handler catches all

**Validation:**
- Use express-validator chains in routes
- Validate on route level, not controller
- Return structured errors with field names

### Frontend Conventions

**File Naming:**
- Components: PascalCase (e.g., `UserTable.tsx`)
- Hooks: camelCase with prefix (e.g., `useAuth.ts`)
- Types: camelCase (e.g., `user.ts`)
- Pages: lowercase (e.g., `page.tsx`)

**Component Structure:**
```tsx
'use client';

// 1. Imports
import React from 'react';

// 2. Types
interface ComponentProps {
  prop: string;
}

// 3. Component
export const Component: React.FC<ComponentProps> = ({ prop }) => {
  // 4. Hooks
  const { data } = useQuery();
  
  // 5. Handlers
  const handleClick = () => {};
  
  // 6. Render
  return <div>{prop}</div>;
};
```

**State Management:**
- Server state: TanStack Query
- Global client state: Zustand
- Local state: useState
- Form state: React Hook Form

### Git Workflow

```bash
# Feature branch
git checkout -b feature/user-management
git add .
git commit -m "feat: implement user CRUD operations"
git push origin feature/user-management

# Bug fix
git checkout -b fix/cache-invalidation
git commit -m "fix: invalidate branch cache on update"

# Documentation
git commit -m "docs: update API documentation"
```

### API Response Format

**Success Response:**
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... },
  "meta": {
    "timestamp": "2026-02-04T10:00:00.000Z"
  }
}
```

**Paginated Response:**
```json
{
  "success": true,
  "message": "Data retrieved",
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  },
  "meta": {
    "timestamp": "2026-02-04T10:00:00.000Z"
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    { "field": "email", "message": "Invalid email format" }
  ],
  "meta": {
    "timestamp": "2026-02-04T10:00:00.000Z"
  }
}
```

## � Troubleshooting

### Common Issues

**Backend won't start:**
```bash
# Check if MongoDB is running
mongod --version
# Check if port 5000 is available
netstat -ano | findstr :5000  # Windows
lsof -i :5000                  # Mac/Linux

# Check .env configuration
# Ensure MONGODB_URI is correct
```

**Redis connection failed:**
```bash
# Check if Redis is running
redis-cli ping  # Should return "PONG"

# Start Redis
redis-server    # or
redis-server --port 6379
```

**Frontend API connection:**
```
# Verify NEXT_PUBLIC_API_URL in .env.local
# Check CORS settings in backend server.js
# Ensure backend is running on correct port
```

**Token refresh not working:**
```
# Check cookie settings in backend .env
# COOKIE_SECURE should be false in development
# COOKIE_DOMAIN should match your domain
```

**Tests failing:**
```bash
# Clear test cache
npm test -- --clearCache

# Run with verbose output
npm test -- --verbose

# Run specific test file
npm test -- auth.test.js
```

### Performance Optimization

**Backend:**
- Enable Redis caching (significant performance boost)
- Add database indexes for frequently queried fields
- Use pagination for large datasets
- Implement query field selection (don't fetch unnecessary data)

**Frontend:**
- Use React Query staleTime and cacheTime effectively
- Implement virtual scrolling for large lists
- Lazy load images and components
- Use Next.js Image component for optimization

## 📚 Additional Resources

### Documentation
- [Backend Implementation Phases](backend/docs/) - Detailed phase-by-phase implementation docs
- [Frontend Implementation Phases](frontend/docs/) - Frontend development documentation
- [API Testing Guide](backend/tests/README.md) - How to run and write tests

### External Dependencies
- [Express.js Documentation](https://expressjs.com/)
- [Next.js Documentation](https://nextjs.org/docs)
- [MongoDB Documentation](https://docs.mongodb.com/)
- [Redis Documentation](https://redis.io/documentation)
- [TanStack Query](https://tanstack.com/query/latest)
- [Zod Validation](https://zod.dev/)

## 🤝 Contributing

Contributions are welcome! To contribute:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Follow coding conventions (see Development Guidelines)
4. Write tests for new features
5. Ensure all tests pass: `npm test`
6. Commit with conventional commits: `git commit -m 'feat: add amazing feature'`
7. Push to your fork: `git push origin feature/amazing-feature`
8. Open a Pull Request

### Commit Message Convention
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting, no logic change)
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

## 📝 License

This project is proprietary software. All rights reserved.

## 📧 Support & Contact

For questions, bug reports, or feature requests:
- Open an issue in the repository
- Contact the development team

---

## 🙏 Acknowledgments

Built with dedication for modern motorparts and automotive service businesses.

**Tech Stack Credits:**
- Next.js team for the amazing React framework
- MongoDB for flexible document storage
- Redis for lightning-fast caching
- Express.js for robust API development
- TanStack Query for excellent server state management

---

**MVP Complete ✅ | Production Ready 🚀 | Built with ❤️**
