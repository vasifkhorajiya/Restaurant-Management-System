import express from 'express';
import * as pay from '../controllers/paymentController.js';
import asyncHandler from '../utils/asyncHandler.js';

const router = express.Router();

router.post('/create-order', asyncHandler(pay.createPaymentOrder));
router.post('/fake-gateway/pay', asyncHandler(pay.fakeGatewayPay));
router.post('/fake-gateway/otp', asyncHandler(pay.fakeGatewayOtp));
router.post('/verify', asyncHandler(pay.verifyPayment));
router.post('/cancel', asyncHandler(pay.cancelPaymentOrder));

export default router;
