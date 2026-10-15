import * as menu from '../controllers/menuController.js';
import * as orders from '../controllers/orderController.js';
import * as reports from '../controllers/reportController.js';
import * as reservations from '../controllers/reservationController.js';
import * as coupons from '../controllers/couponController.js';
import * as reviews from '../controllers/reviewController.js';
import * as tables from '../controllers/tableController.js';
import * as inventory from '../controllers/inventoryController.js';
import * as payments from '../controllers/paymentController.js';
import * as expenses from '../controllers/expenseController.js';
import * as service from '../controllers/serviceController.js';
import { uploadMenuImage } from '../controllers/uploadController.js';
import upload from '../middleware/upload.js';
import asyncHandler from '../utils/asyncHandler.js';

// Everything admin and manager share — each controller already scopes itself by
// req.restaurantId (manager = own restaurant, admin = all), so one definition serves both.
export default function mountShared(router) {
  router.get('/categories', asyncHandler(menu.getCategories));
  router.post('/categories', asyncHandler(menu.createCategory));
  router.delete('/categories/:id', asyncHandler(menu.deleteCategory));

  router.get('/menu', asyncHandler(menu.getMenuItems));
  router.post('/menu', asyncHandler(menu.createMenuItem));
  router.put('/menu/:id', asyncHandler(menu.updateMenuItem));
  router.delete('/menu/:id', asyncHandler(menu.deleteMenuItem));
  router.patch('/menu/:id/availability', asyncHandler(menu.toggleAvailability));
  router.patch('/menu/:id/discount', asyncHandler(menu.updateDiscount));
  router.patch('/menu/:id/stock', asyncHandler(menu.updateStock));
  router.post('/menu/upload-image', upload.single('image'), asyncHandler(uploadMenuImage));

  router.get('/orders', asyncHandler(orders.getOrders));
  router.get('/orders/kitchen', asyncHandler(orders.getKitchenOrders));
  router.get('/orders/:id/detail', asyncHandler(orders.getOrderDetail));
  router.patch('/orders/:id/status', asyncHandler(orders.updateOrderStatus));

  router.get('/reservations', asyncHandler(reservations.getReservations));
  router.patch('/reservations/:id/status', asyncHandler(reservations.updateReservationStatus));
  router.patch('/reservations/:id/table', asyncHandler(reservations.assignTable));

  router.get('/tables', asyncHandler(tables.getTables));
  router.post('/tables', asyncHandler(tables.createTable));
  router.put('/tables/:id', asyncHandler(tables.updateTable));
  router.delete('/tables/:id', asyncHandler(tables.deleteTable));

  router.get('/coupons', asyncHandler(coupons.getCoupons));
  router.post('/coupons', asyncHandler(coupons.createCoupon));
  router.put('/coupons/:id', asyncHandler(coupons.updateCoupon));
  router.patch('/coupons/:id/active', asyncHandler(coupons.toggleCoupon));
  router.delete('/coupons/:id', asyncHandler(coupons.deleteCoupon));

  router.get('/reviews', asyncHandler(reviews.getReviews));
  router.post('/reviews/:id/reply', asyncHandler(reviews.replyToReview));

  router.get('/inventory', asyncHandler(inventory.getInventory));
  router.get('/inventory/logs', asyncHandler(inventory.getInventoryLogs));
  router.post('/inventory', asyncHandler(inventory.createInventoryItem));
  router.put('/inventory/:id', asyncHandler(inventory.updateInventoryItem));
  router.patch('/inventory/:id/adjust', asyncHandler(inventory.adjustInventory));
  router.delete('/inventory/:id', asyncHandler(inventory.deleteInventoryItem));

  router.get('/service-requests', asyncHandler(service.getServiceRequests));
  router.patch('/service-requests/:id/done', asyncHandler(service.completeServiceRequest));

  router.get('/orders/riders', asyncHandler(orders.getRiders));
  router.patch('/orders/:id/rider', asyncHandler(orders.assignRider));

  router.get('/payments', asyncHandler(payments.getPayments));
  router.get('/payments/summary', asyncHandler(payments.getPaymentSummary));
  router.post('/payments/:id/refund', asyncHandler(payments.refund));
  router.get('/refund-requests', asyncHandler(payments.getRefundRequests));
  router.post('/refund-requests/:id/resolve', asyncHandler(payments.resolveRefundRequest));

  router.get('/expenses', asyncHandler(expenses.getExpenses));
  router.post('/expenses', asyncHandler(expenses.createExpense));
  router.delete('/expenses/:id', asyncHandler(expenses.deleteExpense));

  router.get('/reports', asyncHandler(reports.getReports));
}
