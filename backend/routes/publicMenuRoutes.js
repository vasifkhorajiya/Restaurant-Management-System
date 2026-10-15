import express from 'express';
import { getPublicMenu, getPopularMenu, getPublicCategories, getPublicRestaurants } from '../controllers/menuController.js';
import { getItemReviews } from '../controllers/reviewController.js';
import asyncHandler from '../utils/asyncHandler.js';

const router = express.Router();

router.get('/menu', asyncHandler(getPublicMenu));
router.get('/menu/popular', asyncHandler(getPopularMenu));
router.get('/menu/:id/reviews', asyncHandler(getItemReviews));
router.get('/categories', asyncHandler(getPublicCategories));
router.get('/restaurants', asyncHandler(getPublicRestaurants));

export default router;
