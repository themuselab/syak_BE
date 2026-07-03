import { Router } from 'express';
import { NotificationController } from './NotificationController';
import { requireAuth, requireInternalKey } from '../../../shared/middleware/auth.middleware';

export function notificationRouter(controller: NotificationController): Router {
  const router = Router();

  router.get('/',                requireAuth, controller.list);                  // CA-031
  router.patch('/:id/read',      requireAuth, controller.markRead);             // 읽음 처리
  router.get('/settings',        requireAuth, controller.settings);             // CA-026~CA-027
  router.patch('/settings',      requireAuth, controller.updateSettingsHandler); // CA-017 CA-025~CA-027

  // 슬롯 오픈 감지 → FCM 발송 (GitHub Actions에서 호출, INTERNAL_API_KEY 필요)
  router.post('/internal/dispatch', requireInternalKey, controller.dispatchHandler); // CA-022 CA-023

  return router;
}
