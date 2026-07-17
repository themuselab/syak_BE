import { Router } from 'express';
import { NotificationController } from './NotificationController';
import { requireAuth, requireInternalKey } from '../../../shared/middleware/auth.middleware';
import { requireAdminAuth } from '../../../shared/middleware/admin-auth.middleware';

export function notificationRouter(controller: NotificationController): Router {
  const router = Router();

  // ── 앱 소식 (비로그인 포함) — requireAuth 라우트보다 먼저 등록 ──
  router.post('/devices',        controller.registerDevice);   // 익명 디바이스 등록 (로그인 불필요)
  router.get('/app-news',        controller.listAppNews);      // 전역 앱 소식 목록 (로그인 불필요)
  router.post('/app-news',       requireAdminAuth, controller.publishAppNews); // 발행(관리자)
  router.delete('/app-news/:id', requireAdminAuth, controller.deleteAppNews);  // 삭제(관리자)

  router.get('/',                requireAuth, controller.list);                  // CA-031
  router.patch('/:id/read',      requireAuth, controller.markRead);             // 읽음 처리
  router.get('/settings',        requireAuth, controller.settings);             // CA-026~CA-027
  router.patch('/settings',      requireAuth, controller.updateSettingsHandler); // CA-017 CA-025~CA-027

  // 슬롯 오픈 감지 → FCM 발송 (스크래퍼가 새 빈자리만 호출, INTERNAL_API_KEY 필요)
  router.post('/internal/dispatch', requireInternalKey, controller.dispatchHandler); // CA-022 CA-023

  return router;
}
