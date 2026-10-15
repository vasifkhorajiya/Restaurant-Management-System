import express from 'express';
import { getNotifications, markRead, markAllRead, clearAll } from '../controllers/notificationController.js';
import asyncHandler from '../utils/asyncHandler.js';

const router = express.Router();

router.get('/', asyncHandler(getNotifications));
router.patch('/read-all', asyncHandler(markAllRead));
router.patch('/:id/read', asyncHandler(markRead));
router.delete('/', asyncHandler(clearAll));

export default router;
