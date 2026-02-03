# Phase 6: Service Order Management (MEDIUM PRIORITY)

> **IMPORTANT**: Before implementing any feature in this phase, always refer back to [Planning.md](./Planning.md) and [README.md](../README.md) to ensure alignment with system requirements and scope. This phase implements service order management for mechanics - a **MEDIUM priority feature** for MVP (secondary revenue stream after sales).

---

## 🎯 Phase Objectives

Build the service order management system for tracking repair and maintenance jobs. This includes:
- **Service order workflow** - Track jobs from intake to completion
- **Mechanic assignment** - Assign jobs to available mechanics
- **Parts tracking** - Track parts used in service jobs
- **Labor cost calculation** - Calculate service fees and labor charges
- **Service history** - Complete job history per customer vehicle
- **Revenue tracking** - Create transactions for completed services

**Expected Outcome**: A functional service management system where mechanics can track jobs, record parts used, and generate service invoices.

---

## 📋 Pre-requisites

### Must Be Completed First ✅
- [x] **Phase 1-5 Complete** - All MVP core features must be working
- [x] **Stock Management Working** - Parts deduction requires Phase 4
- [x] **Transaction System Ready** - Revenue tracking requires Phase 5

### Required Data ✅
- At least one mechanic user created
- Products available for parts usage
- Branch with stock available

---

## 🛠️ Implementation Steps

### Step 1: Create ServiceOrder Model
**File**: `src/models/ServiceOrder.js`

**Implementation**:
```javascript
const mongoose = require('mongoose');

const serviceOrderSchema = new mongoose.Schema(
  {
    jobNumber: {
      type: String,
      unique: true,
      required: true
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: [true, 'Branch is required']
    },
    customer: {
      name: {
        type: String,
        required: [true, 'Customer name is required'],
        trim: true
      },
      phone: {
        type: String,
        required: [true, 'Phone number is required'],
        trim: true
      },
      email: {
        type: String,
        lowercase: true
      },
      address: String
    },
    vehicle: {
      make: String,
      model: String,
      year: Number,
      plateNumber: String,
      vin: String,
      mileage: Number
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    description: {
      type: String,
      required: [true, 'Service description is required'],
      maxlength: [2000, 'Description cannot exceed 2000 characters']
    },
    diagnosis: {
      type: String,
      maxlength: [2000, 'Diagnosis cannot exceed 2000 characters']
    },
    partsUsed: [{
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
      },
      sku: String,
      name: String,
      quantity: {
        type: Number,
        required: true,
        min: 1
      },
      unitPrice: {
        type: Number,
        required: true,
        min: 0
      },
      total: Number
    }],
    laborCost: {
      type: Number,
      default: 0,
      min: [0, 'Labor cost cannot be negative']
    },
    otherCharges: {
      type: Number,
      default: 0,
      min: [0, 'Other charges cannot be negative']
    },
    totalParts: {
      type: Number,
      default: 0
    },
    totalAmount: {
      type: Number,
      default: 0
    },
    priority: {
      type: String,
      enum: ['low', 'normal', 'high', 'urgent'],
      default: 'normal'
    },
    status: {
      type: String,
      enum: ['pending', 'scheduled', 'in-progress', 'completed', 'cancelled'],
      default: 'pending'
    },
    payment: {
      method: {
        type: String,
        enum: ['cash', 'card', 'gcash', 'paymaya', 'bank-transfer']
      },
      amountPaid: {
        type: Number,
        default: 0,
        min: 0
      },
      status: {
        type: String,
        enum: ['pending', 'partial', 'paid'],
        default: 'pending'
      },
      paidAt: Date
    },
    scheduledAt: Date,
    startedAt: Date,
    completedAt: Date,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    notes: {
      type: String,
      maxlength: [1000, 'Notes cannot exceed 1000 characters']
    }
  },
  {
    timestamps: true
  }
);

// Indexes
serviceOrderSchema.index({ jobNumber: 1 });
serviceOrderSchema.index({ branch: 1, createdAt: -1 });
serviceOrderSchema.index({ assignedTo: 1 });
serviceOrderSchema.index({ status: 1 });
serviceOrderSchema.index({ 'customer.phone': 1 });

// Auto-generate job number
serviceOrderSchema.pre('save', async function(next) {
  if (this.isNew && !this.jobNumber) {
    const year = new Date().getFullYear();
    const count = await this.model('ServiceOrder').countDocuments();
    this.jobNumber = `JOB-${year}-${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

// Calculate totals before saving
serviceOrderSchema.pre('save', function(next) {
  // Calculate part totals
  this.partsUsed.forEach(part => {
    part.total = part.quantity * part.unitPrice;
  });
  
  // Calculate total parts cost
  this.totalParts = this.partsUsed.reduce((sum, part) => sum + part.total, 0);
  
  // Calculate total amount
  this.totalAmount = this.totalParts + this.laborCost + this.otherCharges;
  
  // Update payment status
  if (this.payment.amountPaid === 0) {
    this.payment.status = 'pending';
  } else if (this.payment.amountPaid < this.totalAmount) {
    this.payment.status = 'partial';
  } else if (this.payment.amountPaid >= this.totalAmount) {
    this.payment.status = 'paid';
    if (!this.payment.paidAt) {
      this.payment.paidAt = new Date();
    }
  }
  
  next();
});

const ServiceOrder = mongoose.model('ServiceOrder', serviceOrderSchema);

module.exports = ServiceOrder;
```

---

### Step 2: Create Service Controller
**File**: `src/controllers/serviceController.js`

**Implementation**: This file implements all service order operations including mechanic assignment and parts usage tracking. Refer to [Planning.md](./Planning.md) lines 1297-1496 for complete endpoint details.

**Key Features**:
- Get all service orders with filters
- Get single service order
- Get mechanic's assigned jobs
- Create new service order
- Assign/reassign mechanic
- Update service order status (with stock deduction on completion)
- Add/update parts used
- Update payment
- Cancel service order
- Generate service invoice

**Critical Implementation Notes**:
- When status changes to 'completed', deduct partsUsed from stock
- Create Transaction record when payment.status === 'paid' and status === 'completed'
- Allow mechanics to view only their assigned jobs
- Admins and salespersons can view all jobs at their branch

---

### Step 3: Create Service Routes
**File**: `src/routes/serviceRoutes.js`

**Implementation**: Define all service order endpoints with proper validation and authorization.

**Key Routes**:
- `GET /api/services` - All service orders (Admin, Salesperson, Mechanic)
- `GET /api/services/my-jobs` - Mechanic's assigned jobs
- `GET /api/services/:id` - Single service order
- `POST /api/services` - Create service order (Admin, Salesperson)
- `PUT /api/services/:id` - Update service order
- `PUT /api/services/:id/assign` - Assign mechanic (Admin, Manager)
- `PUT /api/services/:id/status` - Update status
- `PUT /api/services/:id/parts` - Update parts used (Mechanic)
- `PUT /api/services/:id/payment` - Update payment (Admin, Salesperson)
- `DELETE /api/services/:id` - Cancel order (Admin)
- `GET /api/services/:id/invoice` - Get invoice

---

### Step 4: Mount Routes in Server
**File**: `src/server.js` (MODIFY EXISTING)

```javascript
const serviceRoutes = require('./routes/serviceRoutes');
app.use('/api/services', serviceRoutes);
```

---

## ✅ Phase 6 Completion Checklist

### Files Created
- [ ] `src/models/ServiceOrder.js`
- [ ] `src/controllers/serviceController.js`
- [ ] `src/routes/serviceRoutes.js`

### Files Modified
- [ ] `src/server.js`

### Testing
- [ ] Create service order
- [ ] Assign mechanic to job
- [ ] Mechanic can view assigned jobs
- [ ] Update job status
- [ ] Add parts used to job
- [ ] Complete job (parts deducted from stock)
- [ ] Payment tracking works
- [ ] Transaction created on completion
- [ ] Generate service invoice
- [ ] Cancel service order

---

## 📊 Expected Outcomes

1. ✅ Complete service job workflow
2. ✅ Mechanic assignment and tracking
3. ✅ Parts usage recording
4. ✅ Labor cost calculation
5. ✅ Service revenue tracking
6. ✅ Customer vehicle history

---

## 🚀 Next Steps

1. **Create `Phase-6-done.md`** with test results
2. **Proceed to Phase 7** (Financial Management - POST-MVP)

---

## 📝 Notes

- **Job Number Format**: JOB-YYYY-XXXXXX
- **Status Flow**: pending → scheduled → in-progress → completed
- **Parts Deduction**: Only when status = 'completed'
- **Transaction Creation**: When completed AND payment.status = 'paid'
- **Mechanic Access**: Can only view/update assigned jobs

---

## 📚 References

- [Planning.md](./Planning.md) - Lines 1297-1496
- [Phase-5.md](./Phase-5.md) - Transaction creation pattern

---

> **COMPLETION NOTE**: Create `Phase-6-done.md` documenting service order implementation. Then proceed to POST-MVP phases (7-10).
