import express from 'express';
import * as admin from '../controllers/adminController.js';
import asyncHandler from '../utils/asyncHandler.js';
import mountShared from './backOfficeShared.js';

const router = express.Router();

// Dashboard
router.get('/dashboard-stats', asyncHandler(admin.dashboardStats));

// Users
router.get('/users', asyncHandler(admin.getUsers));
router.get('/users/:id/orders', asyncHandler(admin.getUserOrders));
router.post('/users', asyncHandler(admin.createUser));
router.put('/users/:id', asyncHandler(admin.updateUser));
router.delete('/users/:id', asyncHandler(admin.deleteUser));
router.patch('/users/:id/status', asyncHandler(admin.toggleUserStatus));

// Managers
router.get('/managers', asyncHandler(admin.getManagers));
router.post('/managers', asyncHandler(admin.createManager));
router.put('/managers/:id', asyncHandler(admin.updateManager));
router.delete('/managers/:id', asyncHandler(admin.deleteManager));

// Restaurants
router.get('/restaurants', asyncHandler(admin.getRestaurants));
router.post('/restaurants', asyncHandler(admin.createRestaurant));
router.put('/restaurants/:id', asyncHandler(admin.updateRestaurant));
router.delete('/restaurants/:id', asyncHandler(admin.deleteRestaurant));

// Activity log
router.get('/audit-logs', asyncHandler(admin.getAuditLogs));
router.get('/integrations', asyncHandler(admin.getIntegrations));
router.post('/integrations/test', asyncHandler(admin.sendTestMessage));
router.get('/notification-log', asyncHandler(admin.getNotificationLog));
router.get('/security-events', asyncHandler(admin.getSecurityEvents));
router.post('/users/:id/unlock', asyncHandler(admin.unlockUser));
router.post('/users/:id/force-logout', asyncHandler(admin.forceLogoutUser));

mountShared(router);

export default router;
