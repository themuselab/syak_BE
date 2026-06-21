import { Router } from 'express';
import { Controllers } from './composition-root';
import { authRouter } from '../contexts/auth/interface/auth.routes';
import { catalogRouter } from '../contexts/catalog/interface/catalog.routes';
import { reservationRouter } from '../contexts/reservation/interface/reservation.routes';
import { favoriteRouter } from '../contexts/favorite/interface/favorite.routes';
import { notificationRouter } from '../contexts/notification/interface/notification.routes';
import { userRouter } from '../contexts/user/interface/user.routes';
import { ownerRouter } from '../contexts/owner/interface/owner.routes';
import { adminRouter } from '../contexts/admin/interface/admin.routes';
import { requireInternalKey } from '../shared/middleware/auth.middleware';

export function buildRouter(controllers: Controllers): Router {
  const router = Router();

  router.get('/health', (_req, res) => res.json({ status: 'ok' }));

  router.use('/auth',          authRouter(controllers.auth));
  router.use('/shops',         catalogRouter(controllers.catalog));
  router.use('/slots',         reservationRouter(controllers.reservation));
  router.use('/favorites',     favoriteRouter(controllers.favorite));
  router.use('/notifications', notificationRouter(controllers.notification));
  router.use('/users',         userRouter(controllers.user));
  router.use('/owner',         ownerRouter(controllers.ownerAuth, controllers.ownerSlots, controllers.analytics));
  router.use('/admin',         adminRouter(controllers.admin));

  router.post('/inquiries', controllers.inquiry.submit);  // SO-000a

  // 내부 관리 API (X-Internal-Key 필요, 서버간 통신용)
  router.post('/internal/partner-codes', requireInternalKey, controllers.ownerInternal.createCode);

  return router;
}
