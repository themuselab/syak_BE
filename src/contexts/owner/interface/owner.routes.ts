import { Router } from 'express';
import { OwnerAuthController } from './OwnerAuthController';
import { OwnerSlotsController } from '../../owner-slots/interface/OwnerSlotsController';
import { AnalyticsController } from '../../analytics/interface/AnalyticsController';
import { OwnerDashboardController } from '../../owner-dashboard/interface/OwnerDashboardController';
import { requireOwnerAuth, requireLinkedShop } from '../../../shared/middleware/owner-auth.middleware';

export function ownerRouter(
  auth: OwnerAuthController,
  slots: OwnerSlotsController,
  analytics: AnalyticsController,
  dash: OwnerDashboardController,
): Router {
  const router = Router();

  // ── 인증 ─────────────────────────────────────────────────────
  router.post('/auth/:provider',         auth.login);                              // SO-001
  router.post('/auth/token/refresh',     auth.refresh);                            // SO-001a
  router.post('/auth/sign-out',          requireOwnerAuth, auth.logout);
  router.post('/auth/code',              requireOwnerAuth, auth.linkByCode);       // SO-002
  router.get('/auth/me',                 requireOwnerAuth, auth.me);

  // ── 슬롯 관리 (샵 연결 필수) ─────────────────────────────────
  router.get('/slots',                   requireOwnerAuth, requireLinkedShop, slots.list);    // SO-005
  router.post('/slots',                  requireOwnerAuth, requireLinkedShop, slots.create);  // SO-004 (+알림 발송)
  router.patch('/slots/:slotId',         requireOwnerAuth, requireLinkedShop, slots.update);  // SO-006
  router.delete('/slots/:slotId',        requireOwnerAuth, requireLinkedShop, slots.remove);  // SO-007
  router.post('/slots/:slotId/reserve',  requireOwnerAuth, requireLinkedShop, slots.reserve); // SO-008 예약 성사

  // ── 대시보드 / 활동 알림 / 프로필 / 매장 ─────────────────────
  router.get('/dashboard',               requireOwnerAuth, requireLinkedShop, dash.getDashboard); // SO-010
  router.get('/notifications',           requireOwnerAuth, dash.listNotifications);                // SO-011
  router.patch('/notifications/:id/read',requireOwnerAuth, dash.markNotifRead);
  router.get('/profile',                 requireOwnerAuth, dash.getProfile);                       // SO-012
  router.patch('/profile',               requireOwnerAuth, dash.updateProfile);
  router.get('/shop',                    requireOwnerAuth, requireLinkedShop, dash.getShop);       // SO-013
  router.patch('/shop',                  requireOwnerAuth, requireLinkedShop, dash.updateShop);

  // ── 레거시 분석 (shop_view_events; GA4 이전 후 참고용) ────────
  router.get('/analytics',               requireOwnerAuth, requireLinkedShop, analytics.getShopStats); // SO-003

  return router;
}
