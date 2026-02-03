# Phase 9: Notifications & Real-time Features (POST-MVP)

> **POST-MVP PHASE**: This phase should be implemented AFTER the core MVP is stable and tested. Always refer back to [Planning.md](./Planning.md) and [README.md](../README.md).

---

## 🎯 Phase Objectives

**POST-MVP Feature** - Implement real-time notifications and live updates:
- **Low stock alerts** - Automatic notifications when stock is low
- **Order notifications** - Notify relevant users of order updates
- **Transfer notifications** - Alert destination branch of incoming transfers
- **Real-time updates** - Live data updates via Socket.io
- **Notification center** - User notification inbox
- **Email/SMS integration** (optional)

---

## 📋 Pre-requisites

### Must Be Completed First ✅
- [x] **Phases 1-8 Complete** - All features generating events
- [x] **Socket.io Installed** - Already in package.json

---

## 🛠️ Implementation Steps

### Step 1: Setup Socket.io
**File**: `src/config/socket.js`

**Configure**:
- Socket.io server initialization
- Authentication middleware for sockets
- Room management (per branch, per user)
- Event emitters

---

### Step 2: Create Notification Model
**File**: `src/models/Notification.js`

**Already defined in Planning.md** - Fields include:
- recipient (User)
- type (info, warning, error, success)
- category (stock, order, transfer, system)
- title, message
- link (optional navigation)
- isRead, readAt

---

### Step 3: Create Notification Service
**File**: `src/services/notificationService.js`

**Functions**:
- `createNotification(userId, type, category, title, message, link)`
- `sendLowStockAlert(product, branch)`
- `sendOrderNotification(order, recipients)`
- `sendTransferNotification(transfer, recipients)`
- `markAsRead(notificationId, userId)`
- `deleteNotification(notificationId, userId)`

---

### Step 4: Create Notification Controller & Routes
**Files**:
- `src/controllers/notificationController.js`
- `src/routes/notificationRoutes.js`

**Endpoints**:
- `GET /api/notifications` - Get user notifications
- `GET /api/notifications/unread` - Get unread count
- `PUT /api/notifications/:id/read` - Mark as read
- `PUT /api/notifications/read-all` - Mark all as read
- `DELETE /api/notifications/:id` - Delete notification

---

### Step 5: Integrate Socket.io Events
**Modify existing controllers to emit events**:

**In stockController.js**:
```javascript
// When stock goes below reorder point
io.to(`branch:${branchId}`).emit('lowStock', { product, stock });
```

**In salesController.js**:
```javascript
// When order completed
io.to(`branch:${branchId}`).emit('orderCompleted', { order });
```

**In stockController.js (transfers)**:
```javascript
// When transfer created
io.to(`branch:${toBranchId}`).emit('transferIncoming', { transfer });
```

---

### Step 6: Update Server.js
**File**: `src/server.js`

```javascript
const http = require('http');
const socketIO = require('socket.io');
const { setupSocketIO } = require('./config/socket');

const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: process.env.CLIENT_URL,
    methods: ['GET', 'POST']
  }
});

setupSocketIO(io);

// Change app.listen to server.listen
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

---

## ✅ Phase 9 Completion Checklist

- [ ] Socket.io configured
- [ ] Notification model created
- [ ] Notification service implemented
- [ ] Notification controller and routes
- [ ] Low stock alerts working
- [ ] Order notifications sent
- [ ] Transfer notifications sent
- [ ] Real-time updates functional
- [ ] Frontend can connect to Socket.io

---

## 📚 References

- [Planning.md](./Planning.md) - Notification model (lines 420-429)
- [Socket.io Docs](https://socket.io/docs/)

---

> **COMPLETION NOTE**: Create `Phase-9-done.md`. Proceed to Phase 10 (Activity Logging - POST-MVP).
