import { getRdsPool } from '../shared/lib/database';

// Admin
import { AdminController } from '../contexts/admin/interface/AdminController';
import { InquiryController } from '../contexts/admin/interface/InquiryController';

// Owner
import { PgOwnerRepository } from '../contexts/owner/infrastructure/PgOwnerRepository';
import { PgPartnerCodeRepository } from '../contexts/owner/infrastructure/PgPartnerCodeRepository';
import { OwnerJwtTokenService } from '../contexts/owner/infrastructure/OwnerJwtTokenService';
import { OwnerSocialLoginUseCase } from '../contexts/owner/application/OwnerSocialLoginUseCase';
import { LinkShopByCodeUseCase } from '../contexts/owner/application/LinkShopByCodeUseCase';
import { RefreshOwnerTokenUseCase } from '../contexts/owner/application/RefreshOwnerTokenUseCase';
import { SignOutOwnerUseCase } from '../contexts/owner/application/SignOutOwnerUseCase';
import { GeneratePartnerCodeUseCase } from '../contexts/owner/application/GeneratePartnerCodeUseCase';
import { OwnerAuthController } from '../contexts/owner/interface/OwnerAuthController';
import { OwnerInternalController } from '../contexts/owner/interface/OwnerInternalController';

// Analytics
import { PgAnalyticsRepository } from '../contexts/analytics/infrastructure/PgAnalyticsRepository';
import { RecordShopViewUseCase } from '../contexts/analytics/application/RecordShopViewUseCase';
import { RecordReservationClickUseCase } from '../contexts/analytics/application/RecordReservationClickUseCase';
import { GetShopAnalyticsUseCase } from '../contexts/analytics/application/GetShopAnalyticsUseCase';
import { AnalyticsController } from '../contexts/analytics/interface/AnalyticsController';

// Owner Slots
import { PgOwnerSlotRepository } from '../contexts/owner-slots/infrastructure/PgOwnerSlotRepository';
import { GetOwnerSlotsUseCase } from '../contexts/owner-slots/application/GetOwnerSlotsUseCase';
import { CreateOwnerSlotUseCase } from '../contexts/owner-slots/application/CreateOwnerSlotUseCase';
import { UpdateOwnerSlotUseCase } from '../contexts/owner-slots/application/UpdateOwnerSlotUseCase';
import { DeleteOwnerSlotUseCase } from '../contexts/owner-slots/application/DeleteOwnerSlotUseCase';
import { ReserveOwnerSlotUseCase } from '../contexts/owner-slots/application/ReserveOwnerSlotUseCase';
import { RegisterAndNotifyUseCase } from '../contexts/owner-slots/application/RegisterAndNotifyUseCase';
import { DispatchSlotNotifier } from '../contexts/owner-slots/infrastructure/DispatchSlotNotifier';
import { OwnerSlotsController } from '../contexts/owner-slots/interface/OwnerSlotsController';

// Owner Dashboard (대시보드/활동알림/프로필/매장정보)
import { PgOwnerDashboardRepository } from '../contexts/owner-dashboard/infrastructure/PgOwnerDashboardRepository';
import { SupabaseShopService } from '../contexts/owner-dashboard/infrastructure/SupabaseShopService';
import { OwnerDashboardController } from '../contexts/owner-dashboard/interface/OwnerDashboardController';
import { RedisCacheService } from '../shared/cache/RedisCacheService';
import { InMemoryCacheService } from '../shared/cache/InMemoryCacheService';
import { ICacheService } from '../shared/cache/ICacheService';

// Auth
import { PgUserRepository } from '../contexts/auth/infrastructure/PgUserRepository';
import { JwtTokenService } from '../contexts/auth/infrastructure/JwtTokenService';
import { KakaoAuthProvider } from '../contexts/auth/infrastructure/KakaoAuthProvider';
import { NaverAuthProvider } from '../contexts/auth/infrastructure/NaverAuthProvider';
import { AppleAuthProvider } from '../contexts/auth/infrastructure/AppleAuthProvider';
import { SocialLoginUseCase } from '../contexts/auth/application/SocialLoginUseCase';
import { RefreshTokenUseCase } from '../contexts/auth/application/RefreshTokenUseCase';
import { SignOutUseCase } from '../contexts/auth/application/SignOutUseCase';
import { LinkSocialAccountUseCase } from '../contexts/auth/application/LinkSocialAccountUseCase';
import { AuthController } from '../contexts/auth/interface/AuthController';

// Catalog
import { PgShopRepository } from '../contexts/catalog/infrastructure/PgShopRepository';
import { GetShopsUseCase } from '../contexts/catalog/application/GetShopsUseCase';
import { GetShopDetailUseCase } from '../contexts/catalog/application/GetShopDetailUseCase';
import { CatalogController } from '../contexts/catalog/interface/CatalogController';
import { WebCatalogController } from '../contexts/catalog/interface/WebCatalogController';
import { ShopSyncService } from '../contexts/catalog/infrastructure/ShopSyncService';
import { ShopInternalController } from '../contexts/catalog/interface/ShopInternalController';

// Reservation
import { PgSlotRepository } from '../contexts/reservation/infrastructure/PgSlotRepository';
import { GetShopSlotsUseCase } from '../contexts/reservation/application/GetShopSlotsUseCase';
import { SearchAvailableSlotsUseCase } from '../contexts/reservation/application/SearchAvailableSlotsUseCase';
import { SyncScraperSlotsUseCase } from '../contexts/reservation/application/SyncScraperSlotsUseCase';
import { GetOpenNowShopsUseCase } from '../contexts/reservation/application/GetOpenNowShopsUseCase';
import { ReservationController } from '../contexts/reservation/interface/ReservationController';
import { SlotSyncController } from '../contexts/reservation/interface/SlotSyncController';

// Favorite
import { PgFavoriteRepository } from '../contexts/favorite/infrastructure/PgFavoriteRepository';
import { GetFavoritesUseCase } from '../contexts/favorite/application/GetFavoritesUseCase';
import { AddFavoriteUseCase } from '../contexts/favorite/application/AddFavoriteUseCase';
import { RemoveFavoriteUseCase } from '../contexts/favorite/application/RemoveFavoriteUseCase';
import { FavoriteController } from '../contexts/favorite/interface/FavoriteController';

// Notification
import { PgNotificationRepository } from '../contexts/notification/infrastructure/PgNotificationRepository';
import { PgAppNewsRepository } from '../contexts/notification/infrastructure/PgAppNewsRepository';
import { ExpoPushService } from '../contexts/notification/infrastructure/ExpoPushService';
import { GetNotificationsUseCase } from '../contexts/notification/application/GetNotificationsUseCase';
import { GetSettingsUseCase } from '../contexts/notification/application/GetSettingsUseCase';
import { UpdateSettingsUseCase } from '../contexts/notification/application/UpdateSettingsUseCase';
import { DispatchSlotNotificationsUseCase } from '../contexts/notification/application/DispatchSlotNotificationsUseCase';
import { MarkReadUseCase } from '../contexts/notification/application/MarkReadUseCase';
import { RegisterDeviceUseCase } from '../contexts/notification/application/RegisterDeviceUseCase';
import { ListAppNewsUseCase } from '../contexts/notification/application/ListAppNewsUseCase';
import { PublishAppNewsUseCase } from '../contexts/notification/application/PublishAppNewsUseCase';
import { NotificationController } from '../contexts/notification/interface/NotificationController';

// User
import { PgUserProfileRepository } from '../contexts/user/infrastructure/PgUserProfileRepository';
import { GetProfileUseCase } from '../contexts/user/application/GetProfileUseCase';
import { UpdateProfileUseCase } from '../contexts/user/application/UpdateProfileUseCase';
import { WithdrawUseCase } from '../contexts/user/application/WithdrawUseCase';
import { UserController } from '../contexts/user/interface/UserController';

export interface Controllers {
  auth: AuthController;
  catalog: CatalogController;
  reservation: ReservationController;
  slotSync: SlotSyncController;
  webCatalog: WebCatalogController;
  shopInternal: ShopInternalController;
  favorite: FavoriteController;
  notification: NotificationController;
  user: UserController;
  ownerAuth: OwnerAuthController;
  ownerInternal: OwnerInternalController;
  ownerSlots: OwnerSlotsController;
  ownerDashboard: OwnerDashboardController;
  analytics: AnalyticsController;
  admin: AdminController;
  inquiry: InquiryController;
}

export interface AppDependencies {
  controllers: Controllers;
}

export function buildDependencies(): AppDependencies {
  // ── DB 연결 ─────────────────────────────────────────────────
  // rds : 전 데이터(users/favorites/notifications + shops/slots/marketing_snapshots/leads).
  //       Supabase는 전면 이전 완료 — 더 이상 사용하지 않는다.
  const rds = getRdsPool();

  // ── 캐시 (샵 목록/상세) ──────────────────────────────────────
  // REDIS_URL 있으면 Redis, 없으면 프로세스 내 인메모리(LRU+TTL)로 fallback.
  // 예전엔 NullCacheService(no-op)라 운영(Redis 미설정)에서 소비자 카탈로그가
  // 전혀 캐시되지 않고 매번 Supabase로 직행했다.
  // 상한 300: 운영 EC2가 912MB 소형이라 보수적으로 잡음(리스트 엔트리가 커질 수 있음).
  // 핫셋(인기 샵 상세 + 흔한 목록/지도 뷰포트)엔 충분. 부족하면 Redis/큰 인스턴스로.
  const cache: ICacheService = process.env.REDIS_URL
    ? new RedisCacheService(process.env.REDIS_URL)
    : new InMemoryCacheService(300);

  // ── Auth (RDS) ────────────────────────────────────────────
  const userRepo = new PgUserRepository(rds);
  const tokenService = new JwtTokenService();
  const socialProviders = {
    kakao: new KakaoAuthProvider(),
    naver: new NaverAuthProvider(),
    apple: new AppleAuthProvider(),
  };
  const authController = new AuthController(
    new SocialLoginUseCase(userRepo, tokenService, socialProviders),
    new RefreshTokenUseCase(userRepo, tokenService),
    new SignOutUseCase(userRepo),
    new LinkSocialAccountUseCase(userRepo, socialProviders),
  );

  // ── Analytics (RDS — 뷰/클릭 이벤트 기록) ────────────────────
  const analyticsRepo = new PgAnalyticsRepository(rds);
  const recordView = new RecordShopViewUseCase(analyticsRepo);
  const recordClick = new RecordReservationClickUseCase(analyticsRepo);
  const analyticsController = new AnalyticsController(new GetShopAnalyticsUseCase(analyticsRepo));

  // ── Catalog (Supabase REST API — 읽기 전용, Redis 캐시) ──────
  const shopRepo = new PgShopRepository(rds, cache);
  const webCatalogController = new WebCatalogController(rds);
  const shopInternalController = new ShopInternalController(new ShopSyncService(rds));
  const catalogController = new CatalogController(
    new GetShopsUseCase(shopRepo),
    new GetShopDetailUseCase(shopRepo),
    recordView,
    recordClick,
  );

  // ── Reservation (Supabase REST API — 읽기 전용) ─────────────
  // 슬롯은 RDS에서 읽고(egress 회피) + Redis/인메모리 캐시. 샵 이름만 Supabase(캐시).
  const slotRepo = new PgSlotRepository(rds, cache);
  const slotSyncController = new SlotSyncController(
    new SyncScraperSlotsUseCase(slotRepo),
    new GetOpenNowShopsUseCase(slotRepo),
  );
  const reservationController = new ReservationController(
    new GetShopSlotsUseCase(slotRepo),
    new SearchAvailableSlotsUseCase(slotRepo),
  );

  // ── Favorite (RDS + Supabase 샵 조회) ──────────────────────
  const favoriteRepo = new PgFavoriteRepository(rds);
  const favoriteController = new FavoriteController(
    new GetFavoritesUseCase(favoriteRepo),
    new AddFavoriteUseCase(favoriteRepo, shopRepo),  // shopRepo: Supabase에서 샵명/지역 조회
    new RemoveFavoriteUseCase(favoriteRepo),
  );

  // ── Notification (RDS) ────────────────────────────────────
  const notifRepo = new PgNotificationRepository(rds);
  const appNewsRepo = new PgAppNewsRepository(rds);
  const pushService = new ExpoPushService(); // 소비자 앱 expo-notifications 전환 → Expo Push 발송
  const dispatchUseCase = new DispatchSlotNotificationsUseCase(notifRepo, pushService);
  const notificationController = new NotificationController(
    new GetNotificationsUseCase(notifRepo),
    new GetSettingsUseCase(notifRepo),
    new UpdateSettingsUseCase(notifRepo),
    dispatchUseCase,
    new MarkReadUseCase(notifRepo),
    new RegisterDeviceUseCase(appNewsRepo),
    new ListAppNewsUseCase(appNewsRepo),
    new PublishAppNewsUseCase(appNewsRepo, pushService),
  );

  // ── User (RDS) ────────────────────────────────────────────
  const userProfileRepo = new PgUserProfileRepository(rds);
  const userController = new UserController(
    new GetProfileUseCase(userProfileRepo),
    new UpdateProfileUseCase(userProfileRepo),
    new WithdrawUseCase(userProfileRepo),
  );

  // ── Owner (RDS) ──────────────────────────────────────────────
  const ownerRepo = new PgOwnerRepository(rds);
  const partnerCodeRepo = new PgPartnerCodeRepository(rds);
  const ownerTokenService = new OwnerJwtTokenService();
  const ownerAuthController = new OwnerAuthController(
    new OwnerSocialLoginUseCase(ownerRepo, ownerTokenService, socialProviders),
    new LinkShopByCodeUseCase(ownerRepo, partnerCodeRepo, ownerTokenService),
    new RefreshOwnerTokenUseCase(ownerRepo, ownerTokenService),
    new SignOutOwnerUseCase(ownerRepo),
  );
  const ownerInternalController = new OwnerInternalController(
    new GeneratePartnerCodeUseCase(partnerCodeRepo),
  );

  // ── Owner Dashboard 인프라 (RDS 집계 + Supabase 샵 + 활동알림) ─
  const ownerDashRepo = new PgOwnerDashboardRepository(rds);
  const shopInfoService = new SupabaseShopService(rds);
  const slotNotifier = new DispatchSlotNotifier(dispatchUseCase);

  // ── Owner Slots (RDS — 사장님 등록 슬롯 CRUD + 알림 발송) ──────
  const ownerSlotRepo = new PgOwnerSlotRepository(rds);
  const ownerSlotsController = new OwnerSlotsController(
    new GetOwnerSlotsUseCase(ownerSlotRepo),
    new RegisterAndNotifyUseCase(
      new CreateOwnerSlotUseCase(ownerSlotRepo),
      ownerSlotRepo, shopInfoService, slotNotifier, ownerDashRepo,
    ),
    new UpdateOwnerSlotUseCase(ownerSlotRepo),
    new DeleteOwnerSlotUseCase(ownerSlotRepo),
    new ReserveOwnerSlotUseCase(ownerSlotRepo, ownerDashRepo),
  );

  // ── Owner Dashboard 컨트롤러 ─────────────────────────────────
  const ownerDashboardController = new OwnerDashboardController(
    ownerDashRepo, ownerSlotRepo, shopInfoService,
  );

  // ── Admin (env 기반 단일 계정) ───────────────────────────────
  const adminController = new AdminController(rds);
  const inquiryController = new InquiryController(rds);

  // 빈자리 알림은 스크래퍼(themuselab/syak)가 새 슬롯만 골라
  // POST /notifications/internal/dispatch 로 밀어준다.
  // (과거 Supabase LISTEN/NOTIFY 방식은 스크래퍼의 삭제→재삽입 패턴과 맞지 않아 폐기)

  const controllers: Controllers = {
    auth: authController,
    catalog: catalogController,
    reservation: reservationController,
    slotSync: slotSyncController,
    webCatalog: webCatalogController,
    shopInternal: shopInternalController,
    favorite: favoriteController,
    notification: notificationController,
    user: userController,
    ownerAuth: ownerAuthController,
    ownerInternal: ownerInternalController,
    ownerSlots: ownerSlotsController,
    ownerDashboard: ownerDashboardController,
    analytics: analyticsController,
    admin: adminController,
    inquiry: inquiryController,
  };
  return { controllers };
}

export function buildControllers(): Controllers {
  return buildDependencies().controllers;
}
