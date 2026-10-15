import express from 'express';
import * as manager from '../controllers/managerController.js';
import { createPosOrder } from '../controllers/posController.js';
import asyncHandler from '../utils/asyncHandler.js';
import mountShared from './backOfficeShared.js';

const router = express.Router();

// Dashboard
router.get('/dashboard-stats', asyncHandler(manager.dashboardStats));
router.patch('/restaurant/open', asyncHandler(manager.toggleRestaurantOpen));

// Staff
router.get('/staff', asyncHandler(manager.getStaff));
router.post('/staff', asyncHandler(manager.createStaff));
router.put('/staff/:id', asyncHandler(manager.updateStaff));
router.delete('/staff/:id', asyncHandler(manager.deleteStaff));

// Attendance
router.get('/attendance', asyncHandler(manager.getAttendance));
router.post('/attendance/:id/check-in', asyncHandler(manager.checkIn));
router.post('/attendance/:id/check-out', asyncHandler(manager.checkOut));

// POS (counter orders)
router.post('/pos/orders', asyncHandler(createPosOrder));

// Customers
router.get('/customers', asyncHandler(manager.getCustomers));
router.get('/customers/:id/orders', asyncHandler(manager.getCustomerOrders));

mountShared(router);

export default router;
