import express from 'express';
import { createReservation, getMyReservations, cancelMyReservation, getAvailability } from '../controllers/reservationController.js';
import asyncHandler from '../utils/asyncHandler.js';

const router = express.Router();

router.post('/', asyncHandler(createReservation));
router.get('/my', asyncHandler(getMyReservations));
router.get('/availability', asyncHandler(getAvailability));
router.patch('/:id/cancel', asyncHandler(cancelMyReservation));

export default router;
