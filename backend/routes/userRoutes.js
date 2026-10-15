import express from 'express';
import { getProfile, updateProfile, changePassword } from '../controllers/userController.js';
import * as addr from '../controllers/addressController.js';
import * as fav from '../controllers/favoriteController.js';
import asyncHandler from '../utils/asyncHandler.js';

const router = express.Router();

router.get('/profile', asyncHandler(getProfile));
router.put('/profile', asyncHandler(updateProfile));
router.put('/change-password', asyncHandler(changePassword));

// Saved addresses
router.get('/addresses', asyncHandler(addr.getAddresses));
router.post('/addresses', asyncHandler(addr.createAddress));
router.patch('/addresses/:id/default', asyncHandler(addr.setDefaultAddress));
router.delete('/addresses/:id', asyncHandler(addr.deleteAddress));

// Favourite dishes
router.get('/favorites', asyncHandler(fav.getFavorites));
router.get('/favorites/ids', asyncHandler(fav.getFavoriteIds));
router.post('/favorites/:itemId', asyncHandler(fav.toggleFavorite));

export default router;
