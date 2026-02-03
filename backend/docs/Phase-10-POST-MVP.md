# Phase 10: Activity Logging & Audit Trail (POST-MVP)

> **POST-MVP PHASE**: This phase should be implemented AFTER the core MVP is stable and tested. Always refer back to [Planning.md](./Planning.md) and [README.md](../README.md).

---

## 🎯 Phase Objectives

**POST-MVP Feature** - Implement comprehensive audit trail and activity logging:
- **User activity tracking** - Log all user actions
- **Change history** - Track modifications to records
- **Security audit** - Monitor login attempts and security events
- **System logs** - Record system events and errors
- **Search and filter logs** - Query activity history
- **Compliance and accountability** - Meet audit requirements

---

## 📋 Pre-requisites

### Must Be Completed First ✅
- [x] **Phases 1-9 Complete** - All features to be logged are implemented
- [x] **Production Ready** - MVP is stable and tested

---

## 🛠️ Implementation Steps

### Step 1: Create ActivityLog Model
**File**: `src/models/ActivityLog.js`

**Already defined in Planning.md** - Fields include:
- user (User reference)
- action (create, update, delete, login, logout, etc.)
- resource (model name)
- resourceId (document ID)
- description (human-readable description)
- changes (before/after data for updates)
- ipAddress, userAgent
- branch (if applicable)

---

### Step 2: Create Activity Logger Middleware
**File**: `src/middleware/activityLogger.js`

**Purpose**: Automatically log actions from API requests

**Implementation**:
```javascript
const ActivityLog = require('../models/ActivityLog');

const logActivity = (action, resource) => {
  return async (req, res, next) => {
    // Store original send
    const originalSend = res.send;
    
    // Override send to log after successful response
    res.send = function(data) {
      // Log activity if response is successful (2xx)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        ActivityLog.create({
          user: req.user._id,
          action,
          resource,
          resourceId: req.params.id || req.body._id,
          description: `${req.user.name} ${action}d ${resource}`,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          branch: req.user.branch
        }).catch(err => console.error('Activity log error:', err));
      }
      
      // Call original send
      originalSend.call(this, data);
    };
    
    next();
  };
};

module.exports = logActivity;
```

---

### Step 3: Create Activity Service
**File**: `src/services/activityService.js`

**Functions**:
- `logCreate(user, resource, resourceId, data)`
- `logUpdate(user, resource, resourceId, oldData, newData)`
- `logDelete(user, resource, resourceId, data)`
- `logLogin(user, ipAddress, userAgent, success)`
- `logLogout(user, ipAddress)`
- `logSecurityEvent(user, event, description)`
- `getRecentActivity(userId, limit)`
- `getResourceHistory(resource, resourceId)`

---

### Step 4: Create Activity Controller & Routes
**Files**:
- `src/controllers/activityController.js`
- `src/routes/activityRoutes.js`

**Endpoints**:
- `GET /api/activity` - Get all activity logs (Admin only)
- `GET /api/activity/user/:userId` - Get user activity
- `GET /api/activity/resource/:resource/:id` - Get resource history
- `GET /api/activity/branch/:branchId` - Get branch activity
- `DELETE /api/activity/old` - Clean up old logs (Admin only)

---

### Step 5: Integrate Activity Logging

**Update existing controllers to use activity service**:

**In authController.js**:
```javascript
// On successful login
await activityService.logLogin(user, req.ip, req.get('user-agent'), true);

// On logout
await activityService.logLogout(req.user, req.ip);
```

**In productController.js**:
```javascript
// After creating product
await activityService.logCreate(req.user, 'Product', product._id, product);

// After updating product
await activityService.logUpdate(req.user, 'Product', id, oldProduct, newProduct);
```

**Or use middleware on routes**:
```javascript
router.post('/products',
  protect,
  authorize(USER_ROLES.ADMIN),
  logActivity('create', 'Product'),
  createProduct
);
```

---

### Step 6: Add Activity Log Cleanup Job
**File**: `src/utils/cleanupLogs.js`

**Purpose**: Periodically clean up old activity logs (e.g., older than 1 year)

**Implementation**:
```javascript
const ActivityLog = require('../models/ActivityLog');

const cleanupOldLogs = async (daysToKeep = 365) => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  
  const result = await ActivityLog.deleteMany({
    createdAt: { $lt: cutoffDate }
  });
  
  console.log(`Cleaned up ${result.deletedCount} old activity logs`);
  return result;
};

// Schedule to run daily
const schedule = require('node-schedule');
schedule.scheduleJob('0 2 * * *', () => {
  cleanupOldLogs().catch(console.error);
});

module.exports = cleanupOldLogs;
```

---

### Step 7: Mount Routes
**File**: `src/server.js`

```javascript
const activityRoutes = require('./routes/activityRoutes');
app.use('/api/activity', activityRoutes);
```

---

## ✅ Phase 10 Completion Checklist

### Files Created
- [ ] `src/models/ActivityLog.js` - Activity log model
- [ ] `src/middleware/activityLogger.js` - Logging middleware
- [ ] `src/services/activityService.js` - Activity service functions
- [ ] `src/controllers/activityController.js` - Activity controller
- [ ] `src/routes/activityRoutes.js` - Activity routes
- [ ] `src/utils/cleanupLogs.js` - Log cleanup utility

### Files Modified
- [ ] `src/server.js` - Activity routes mounted
- [ ] `src/controllers/authController.js` - Login/logout logging
- [ ] Various controllers - Activity logging integrated

### Testing
- [ ] Activity logs created on user actions
- [ ] Login attempts logged
- [ ] Resource changes tracked
- [ ] Get activity by user works
- [ ] Get activity by resource works
- [ ] Get activity by branch works
- [ ] Old logs cleanup works
- [ ] Activity search and filtering works

---

## 📊 Expected Outcomes

After completing Phase 10:

1. ✅ **Complete Audit Trail** - Every action is logged
2. ✅ **User Accountability** - Track who did what and when
3. ✅ **Security Monitoring** - Login attempts and security events logged
4. ✅ **Change History** - Before/after data for updates
5. ✅ **Compliance Ready** - Meet audit and regulatory requirements
6. ✅ **Troubleshooting** - Debug issues by reviewing activity logs

---

## 🚀 Next Steps

1. **Create Phase 10 Completion Document**: `backend/Phase-10-done.md`
   - Document all activity log features
   - Include sample activity log entries
   - Test results for all log types

2. **System Complete**: All 10 phases implemented!
   - Core MVP (Phases 1-5): Authentication, Branches, Products, Stock, Sales ✅
   - Secondary MVP (Phase 6): Service Orders ✅
   - POST-MVP (Phases 7-10): Finance, Analytics, Notifications, Activity Logs ✅

3. **Next Focus**: Frontend Development
   - Build Next.js frontend using the completed API
   - Implement authentication flow
   - Create dashboards and forms
   - Integrate Socket.io for real-time updates

---

## 📝 Notes

- **Storage Considerations**: Activity logs can grow large - implement cleanup strategy
- **Performance**: Index frequently queried fields (user, resource, createdAt)
- **Privacy**: Be careful not to log sensitive data (passwords, tokens, etc.)
- **Retention Policy**: Define how long to keep logs (1 year recommended)
- **Sensitive Actions**: Always log security-related events (login failures, permission changes)
- **Change Tracking**: For updates, store both old and new values for comparison

---

## ⚠️ Common Issues & Solutions

### Issue 1: Activity Logs Growing Too Large
**Problem**: Database size increasing rapidly
**Solution**: Implement cleanup job, archive old logs to separate collection

### Issue 2: Performance Impact
**Problem**: Logging slows down API responses
**Solution**: Make logging asynchronous, use fire-and-forget pattern

### Issue 3: Missing Logs
**Problem**: Some actions not being logged
**Solution**: Review all controllers, ensure logActivity middleware or service calls exist

### Issue 4: Sensitive Data in Logs
**Problem**: Passwords or tokens logged
**Solution**: Filter sensitive fields before logging, use a sanitization function

---

## 📚 References

- [Planning.md](./Planning.md) - ActivityLog model (lines 437-445)
- [README.md](../README.md) - Audit trail features
- [Node Schedule](https://github.com/node-schedule/node-schedule) - Job scheduling

---

## 🎉 Congratulations!

You've completed all 10 phases of the Motorparts E-Inventory backend implementation:

### ✅ MVP Core (Phases 1-5) - COMPLETED
1. **Core Infrastructure** - ApiResponse, Cache, Validation, Constants
2. **Branch Management** - Multi-branch operations
3. **Product & Category Management** - Product catalog
4. **Inventory & Stock Management** - Branch-specific pricing, stock tracking
5. **Sales Order Management** - Cash flow tracking, order processing

### ✅ Secondary MVP (Phase 6) - COMPLETED
6. **Service Order Management** - Mechanic jobs, parts tracking

### ✅ POST-MVP (Phases 7-10) - COMPLETED
7. **Financial Management** - Expense tracking, reports
8. **Analytics & Reporting** - Business intelligence
9. **Notifications & Real-time** - Socket.io, alerts
10. **Activity Logging** - Audit trail, compliance

---

## 📋 Final System Checklist

Before deploying to production:

### Core Functionality
- [ ] All user roles working (admin, salesperson, mechanic, customer)
- [ ] Authentication and JWT refresh tokens functional
- [ ] Branch-specific pricing verified
- [ ] Stock reservation and deduction working
- [ ] Sales orders create transactions
- [ ] Service orders track parts and create transactions
- [ ] Cash flow accurately tracked

### Data Integrity
- [ ] All unique indexes created
- [ ] Compound indexes for performance
- [ ] Data validation on all inputs
- [ ] Proper error handling everywhere
- [ ] Cascade deletions or soft deletes implemented

### Security
- [ ] All sensitive endpoints protected
- [ ] Role-based access control enforced
- [ ] Branch access restrictions working
- [ ] Input sanitization implemented
- [ ] Rate limiting configured (if Phase 1 rateLimit.js created)
- [ ] Environment variables secured

### Performance
- [ ] Redis caching working
- [ ] Cache invalidation on updates
- [ ] Pagination on all list endpoints
- [ ] Database indexes optimized
- [ ] Full-text search configured

### Testing
- [ ] All endpoints manually tested
- [ ] Edge cases handled (insufficient stock, duplicate codes, etc.)
- [ ] Error responses uniform and informative
- [ ] Success responses follow ApiResponse format
- [ ] Branch-specific pricing proven
- [ ] Transaction creation verified

### Documentation
- [ ] All Phase-#-done.md files created
- [ ] API endpoint documentation complete
- [ ] Environment variables documented
- [ ] Deployment instructions ready
- [ ] Database seeding scripts available

---

## 🚀 Deployment Preparation

**Before production deployment:**

1. **Environment Setup**
   - Set NODE_ENV=production
   - Use strong JWT secrets
   - Configure production MongoDB (MongoDB Atlas)
   - Setup production Redis
   - Configure CORS for production domain

2. **Security Hardening**
   - Enable rate limiting
   - Add helmet.js for security headers
   - Setup HTTPS/SSL
   - Implement API versioning
   - Add request logging

3. **Monitoring**
   - Setup error tracking (Sentry, LogRocket)
   - Configure performance monitoring
   - Setup uptime monitoring
   - Database backup strategy
   - Log aggregation

4. **Scaling**
   - Consider load balancing
   - Database replication
   - Redis clustering
   - CDN for static assets
   - Horizontal scaling strategy

---

> **FINAL NOTE**: Create `Phase-10-done.md` and a **DEPLOYMENT.md** file with production deployment instructions. Your backend is now complete and ready for integration with the Next.js frontend!

**Great job completing all 10 phases! 🎊**
