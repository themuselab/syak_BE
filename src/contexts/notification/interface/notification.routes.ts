import { Router } from 'express';
import { NotificationController } from './NotificationController';
import { requireAuth, requireInternalKey } from '../../../shared/middleware/auth.middleware';

export function notificationRouter(controller: NotificationController): Router {
  const router = Router();

  router.get('/', requireAuth, controller.list);
  router.get('/settings', requireAuth, controller.settings);
  router.patch('/settings', requireAuth, controller.updateSettingsHandler);

  // GitHub Actions → Express (internal, protected by INTERNAL_API_KEY header)
  router.post('/internal/dispatch', requireInternalKey, controller.dispatchHandler);

  return router;
}
