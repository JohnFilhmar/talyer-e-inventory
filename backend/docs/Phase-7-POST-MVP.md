# Phase 7: Financial Management (POST-MVP)

> **POST-MVP PHASE**: This phase should be implemented AFTER the core MVP is stable and tested. Always refer back to [Planning.md](./Planning.md) and [README.md](../README.md).

---

## 🎯 Phase Objectives

**POST-MVP Feature** - Implement comprehensive financial management beyond basic transaction tracking:
- **Expense tracking** - Record business expenses per branch
- **Cash flow reports** - Analyze income vs expenses
- **Financial summaries** - Daily, weekly, monthly reports
- **Expense approval workflow** - Manager approval for expenses
- **Revenue analysis** - Sales and service revenue breakdown

**Note**: Basic transaction creation (from sales/services) is already implemented in Phases 5-6. This phase adds expense tracking and reporting.

---

## 📋 Pre-requisites

### Must Be Completed First ✅
- [x] **Phases 1-6 Complete** - All MVP features working
- [x] **Transaction Model Exists** - Created in Phase 5
- [x] **Sales & Service Orders Working** - Revenue sources operational

---

## 🛠️ Implementation Steps

### Step 1: Create Expense Model
**File**: `src/models/Expense.js`

**Key Features**:
- Auto-generate expense number (EXP-YYYY-XXXXXX)
- Category (rent, utilities, salaries, supplies, marketing, maintenance, other)
- Approval workflow (pending, approved, rejected)
- Receipt image upload support
- Branch-specific expenses

---

### Step 2: Create Finance Controller
**File**: `src/controllers/financeController.js`

**Endpoints**:
- Get all transactions (Admin only)
- Get branch transactions
- Get all expenses
- Create expense
- Update expense
- Approve/reject expense
- Delete expense
- Get cash flow summary (income - expenses by date range)
- Get income report (sales + services)
- Get expense report by category

---

### Step 3: Create Finance Routes
**File**: `src/routes/financeRoutes.js`

**Routes**:
- `GET /api/finance/transactions` - All transactions
- `GET /api/finance/transactions/branch/:branchId` - Branch transactions
- `GET /api/finance/expenses` - All expenses
- `POST /api/finance/expenses` - Create expense
- `PUT /api/finance/expenses/:id` - Update expense
- `PUT /api/finance/expenses/:id/approve` - Approve expense
- `DELETE /api/finance/expenses/:id` - Delete expense
- `GET /api/finance/cash-flow` - Cash flow summary
- `GET /api/finance/income-report` - Income analysis

---

### Step 4: Mount Routes
**File**: `src/server.js`

```javascript
const financeRoutes = require('./routes/financeRoutes');
app.use('/api/finance', financeRoutes);
```

---

## ✅ Phase 7 Completion Checklist

- [ ] Expense model created
- [ ] Finance controller with all endpoints
- [ ] Finance routes with validation
- [ ] Expense approval workflow tested
- [ ] Cash flow report accurate
- [ ] Income vs expense comparison working

---

## 📚 References

- [Planning.md](./Planning.md) - Lines 1497-1660

---

> **COMPLETION NOTE**: Create `Phase-7-done.md`. Proceed to Phase 8 (Analytics & Reporting - POST-MVP).
