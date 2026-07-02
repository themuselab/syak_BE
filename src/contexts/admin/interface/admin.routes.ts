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

  router.get('/events',                      admin.stream);            // SSE 실시간 (AD-002~AD-012 대시보드)
  router.get('/dashboard',                   admin.dashboardSummary);  // AD-001 (SSE fallback 초기 로드)

  // 사장님 계정 관리
  router.get('/owners',                      admin.listOwners);            // AD-012
  router.delete('/owners/:ownerId/shop',     admin.unlinkOwner);           // AD-011

  // 파트너 코드 발급
  router.post('/partner-codes',              admin.createPartnerCode);           // AD-010 (기존 shopId 기반)
  router.post('/partner-codes/from-naver',   admin.createPartnerCodeFromNaver);  // 네이버 플레이스 기반
  router.get('/naver-place/:placeId',        admin.naverPlaceSearch);            // 네이버 플레이스 조회

  // 파트너샵 연동 현황
  router.get('/partner-shops',              admin.listPartnerShops);       // AD-011

  // 전체 샵 DB 조회 + 등록/수정/삭제
  router.get('/shops',                      admin.listAllShops);           // AD-009
  router.post('/shops',                     admin.createShop);             // AD-008
  router.patch('/shops/:shopId',            admin.updateShop);             // AD-009
  router.delete('/shops/:shopId',           admin.deleteShop);             // AD-009

  // 소비자 회원 목록 + 정지/차단
  router.get('/users',                      admin.listUsers);              // AD-006
  router.patch('/users/:userId/status',     admin.updateUserStatus);       // AD-007

  // 도입 문의 (SO-000a 폼 → 관리자 검토 → AD-008 샵 등록)
  router.get('/inquiries',                  admin.listInquiries);          // AD-008
  router.patch('/inquiries/:inquiryId',     admin.updateInquiry);          // AD-008

  // 통계
  router.get('/stats/shop-views',           admin.shopViewStats);          // AD-002
  router.get('/stats/reservation-clicks',   admin.reservationClickStats);  // AD-003
  router.get('/stats/cancel-requests',      admin.cancelRequestStats);     // AD-004
  router.get('/stats/partner-conversion',   admin.partnerConversionStats); // AD-005
  router.get('/stats/visitors',             admin.visitorTrend);            // web 방문자 추이
  router.get('/trends',                     admin.getTrends);               // 트렌드 (30일)

  return router;
}
