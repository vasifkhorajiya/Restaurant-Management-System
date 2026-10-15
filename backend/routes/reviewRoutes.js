import express from 'express';
import { createReview } from '../controllers/reviewController.js';
import asyncHandler from '../utils/asyncHandler.js';

const router = express.Router();

router.post('/', asyncHandler(createReview));

export default router;
