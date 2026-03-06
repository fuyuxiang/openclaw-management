import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { getSystemHealth, getSystemResources } from '../services/systemService';
import { sendSuccess } from '../utils/response';

const router = Router();

router.get(
  '/resources',
  asyncHandler(async (_req, res) => {
    const resources = await getSystemResources();
    sendSuccess(res, resources);
  })
);

router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const health = await getSystemHealth();
    sendSuccess(res, health);
  })
);

export default router;
