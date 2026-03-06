import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { createManagedInstance, deleteManagedInstance, getManagedInstanceLogs, listManagedInstances } from '../services/dockerService';
import { getSystemHealth } from '../services/systemService';
import { AppError } from '../utils/errors';
import { sendSuccess } from '../utils/response';

const router = Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const instances = await listManagedInstances();
    sendSuccess(res, instances);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const name = req.body?.name;
    if (typeof name !== 'string') {
      throw new AppError(400, 'INVALID_BODY', '请求体必须包含字符串类型的 name 字段');
    }

    const health = await getSystemHealth();
    if (!health.canCreate) {
      throw new AppError(409, 'SYSTEM_NOT_READY', '系统当前不允许创建实例', {
        reasons: health.reasons
      });
    }

    const instance = await createManagedInstance(name);
    sendSuccess(res, instance, '实例创建成功', 201);
  })
);

router.delete(
  '/:name',
  asyncHandler(async (req, res) => {
    await deleteManagedInstance(req.params.name);
    sendSuccess(
      res,
      {
        name: req.params.name.toLowerCase()
      },
      `实例已删除: ${req.params.name.toLowerCase()}`
    );
  })
);

router.get(
  '/:name/logs',
  asyncHandler(async (req, res) => {
    const logs = await getManagedInstanceLogs(req.params.name, 100);
    sendSuccess(res, {
      name: req.params.name.toLowerCase(),
      logs
    });
  })
);

export default router;
