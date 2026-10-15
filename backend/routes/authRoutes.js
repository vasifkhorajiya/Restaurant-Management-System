import express from 'express';
import * as auth from '../controllers/authController.js';
import { verifyToken } from '../middleware/authMiddleware.js';
import asyncHandler from '../utils/asyncHandler.js';

const router = express.Router();

// public (rate-limited in server.js)
router.post('/register', asyncHandler(auth.register));
router.post('/login', asyncHandler(auth.login));
router.post('/forgot-password', asyncHandler(auth.forgotPassword));
router.post('/reset-password', asyncHandler(auth.resetPassword));

// signed-in only
router.post('/logout', verifyToken, asyncHandler(auth.logout));
router.get('/sessions', verifyToken, asyncHandler(auth.getSessions));
router.delete('/sessions/:id', verifyToken, asyncHandler(auth.revokeSession));
router.post('/logout-others', verifyToken, asyncHandler(auth.logoutOthers));
router.get('/security-events', verifyToken, asyncHandler(auth.getMySecurityEvents));

export default router;
