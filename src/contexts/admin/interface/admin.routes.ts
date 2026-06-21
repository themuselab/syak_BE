import { Router } from 'express';
import { AdminController } from './AdminController';
import { requireAdminAuth } from '../../../shared/middleware/admin-auth.middleware';

export function adminRouter(admin: AdminController): Router {
  const router = Router();

  // ── 로그인/로그아웃 (인증 불필요) ──────────────────────────────
  router.post('/auth/login',  admin.login);
  router.post('/auth/logout', admin.logout);

  // ── 이하 관리자 인증 필요 ─────────────────────────────────────
  router.use(requireAdminAuth);

  // SSE 실시간 스트림 (대시보드 전체 상태 15초마다 push)
  router.get('/events',                 admin.stream);

  // 대시보드 요약 (초기 로드 또는 SSE 미지원 fallback)
  router.get('/dashboard',              admin.dashboardSummary);

  // 사장님 계정
  router.get('/owners',                 admin.listOwners);
  router.delete('/owners/:ownerId/shop', admin.unlinkOwner);

  // 파트너 코드 발급
  router.post('/partner-codes',         admin.createPartnerCode);

  // 파트너샵 (연동 완료된 샵만)
  router.get('/partner-shops',          admin.listPartnerShops);

  // 전체 샵 DB
  router.get('/shops',                  admin.listAllShops);

  // 소비자 회원 목록
  router.get('/users',                  admin.listUsers);

  // 통계
  router.get('/stats/shop-views',       admin.shopViewStats);
  router.get('/stats/cancel-requests',  admin.cancelRequestStats);
  router.get('/stats/partner-conversion', admin.partnerConversionStats);

  return router;
}
