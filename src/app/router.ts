import { Router } from 'express';
import { Controllers } from './composition-root';
import { authRouter } from '../contexts/auth/interface/auth.routes';
import { catalogRouter } from '../contexts/catalog/interface/catalog.routes';
import { reservationRouter } from '../contexts/reservation/interface/reservation.routes';
import { favoriteRouter } from '../contexts/favorite/interface/favorite.routes';
import { notificationRouter } from '../contexts/notification/interface/notification.routes';
import { userRouter } from '../contexts/user/interface/user.routes';
import { ownerRouter } from '../contexts/owner/interface/owner.routes';
import { webRouter } from '../contexts/catalog/interface/web.routes';
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
  router.use('/owner',         ownerRouter(controllers.ownerAuth, controllers.ownerSlots, controllers.analytics, controllers.ownerDashboard));
  router.use('/web',           webRouter(controllers.webCatalog));  // 소비자 웹 raw 카탈로그(RDS)
  router.use('/admin',         adminRouter(controllers.admin));

  router.post('/inquiries', controllers.inquiry.submit);  // SO-000a
  router.get('/marketing/img/:date/:file', controllers.admin.marketingImg); // 마케팅 이미지(S3 presigned 302, 공개)
  router.get('/img/*', controllers.admin.imgProxy); // 범용 이미지(샵 사진 등) S3 presigned 302, 공개

  // 내부 관리 API (X-Internal-Key 필요, 서버간 통신용)
  router.post('/internal/partner-codes', requireInternalKey, controllers.ownerInternal.createCode);
  router.get('/internal/partner-engagement', requireInternalKey, controllers.admin.partnerEngagement); // 디코 리포트용
  router.post('/internal/slots/sync', requireInternalKey, controllers.slotSync.handle); // 스크래퍼 → RDS 슬롯 동기화
  router.get('/internal/slots/open-now', requireInternalKey, controllers.slotSync.openNowHandler); // 초록핀 재계산용
  router.get('/internal/shops/targets',  requireInternalKey, controllers.shopInternal.targets);   // 스크래퍼 타깃
  router.get('/internal/shops/meta',     requireInternalKey, controllers.shopInternal.meta);      // 알림용 샵 메타
  router.post('/internal/shops/summary', requireInternalKey, controllers.shopInternal.summary);   // slot_summary
  router.post('/internal/shops/reconcile-today-open', requireInternalKey, controllers.shopInternal.reconcileTodayOpen);
  router.post('/internal/marketing/snapshot', requireInternalKey, controllers.admin.internalMarketingSnapshot); // 마케팅 스킬
  router.get('/internal/shops/price-targets',  requireInternalKey, controllers.shopInternal.priceTargets);    // price_sync
  router.post('/internal/shops/prices',        requireInternalKey, controllers.shopInternal.updatePrices);
  router.get('/internal/shops/partner-unsynced', requireInternalKey, controllers.shopInternal.partnerUnsynced); // sync_partners
  router.post('/internal/shops/enrich',        requireInternalKey, controllers.shopInternal.enrichShop);

  return router;
}
