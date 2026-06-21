import { Router } from 'express';
import { OwnerAuthController } from './OwnerAuthController';
import { OwnerSlotsController } from '../../owner-slots/interface/OwnerSlotsController';
import { AnalyticsController } from '../../analytics/interface/AnalyticsController';
import { requireOwnerAuth, requireLinkedShop } from '../../../shared/middleware/owner-auth.middleware';

export function ownerRouter(
  auth: OwnerAuthController,
  slots: OwnerSlotsController,
  analytics: AnalyticsController,
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
  router.post('/slots',                  requireOwnerAuth, requireLinkedShop, slots.create);  // SO-004
  router.patch('/slots/:slotId',         requireOwnerAuth, requireLinkedShop, slots.update);  // SO-006
  router.delete('/slots/:slotId',        requireOwnerAuth, requireLinkedShop, slots.remove);  // SO-007

  // ── 대시보드 분석 (샵 연결 필수) ──────────────────────────────
  router.get('/analytics',               requireOwnerAuth, requireLinkedShop, analytics.getShopStats); // SO-003

  return router;
}
