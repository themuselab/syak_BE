import { Router } from 'express';
import { CatalogController } from './CatalogController';
import { optionalAuth } from '../../../shared/middleware/auth.middleware';

export function catalogRouter(controller: CatalogController): Router {
  const router = Router();

  router.get('/',                            controller.list);            // CA-009 CA-010 CA-011 CA-012
  // optionalAuth: 로그인 사용자면 shop_view_events/reservation_click_events.user_id 기록용(응답은 동일)
  router.get('/:shopId',                     optionalAuth, controller.detail);          // CA-013
  router.post('/:shopId/reservation-click',  optionalAuth, controller.reservationClick); // CA-014 AD-003

  return router;
}
