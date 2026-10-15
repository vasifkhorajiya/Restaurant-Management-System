import express from 'express';
import { createOrder, quoteOrder, getMyOrders, cancelMyOrder, getReorderItems, requestRefund } from '../controllers/orderController.js';
import { getAvailableCoupons } from '../controllers/couponController.js';
import { createServiceRequest } from '../controllers/serviceController.js';
import asyncHandler from '../utils/asyncHandler.js';

const router = express.Router();

router.post('/', asyncHandler(createOrder));
router.post('/quote', asyncHandler(quoteOrder));
router.get('/coupons', asyncHandler(getAvailableCoupons));
router.get('/my', asyncHandler(getMyOrders));
router.get('/:id/reorder', asyncHandler(getReorderItems));
router.patch('/:id/cancel', asyncHandler(cancelMyOrder));
router.post('/:id/refund-request', asyncHandler(requestRefund));
router.post('/:id/service-request', asyncHandler(createServiceRequest));

export default router;
