import { getRdsPool, getSupabasePool, getSupabaseClient } from '../shared/lib/database';
import { SlotListener } from '../shared/lib/slotListener';

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
import { OwnerSlotsController } from '../contexts/owner-slots/interface/OwnerSlotsController';
import { RedisCacheService } from '../shared/cache/RedisCacheService';
import { NullCacheService } from '../shared/cache/NullCacheService';
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

// Reservation
import { PgSlotRepository } from '../contexts/reservation/infrastructure/PgSlotRepository';
import { GetShopSlotsUseCase } from '../contexts/reservation/application/GetShopSlotsUseCase';
import { SearchAvailableSlotsUseCase } from '../contexts/reservation/application/SearchAvailableSlotsUseCase';
import { ReservationController } from '../contexts/reservation/interface/ReservationController';

// Favorite
import { PgFavoriteRepository } from '../contexts/favorite/infrastructure/PgFavoriteRepository';
import { GetFavoritesUseCase } from '../contexts/favorite/application/GetFavoritesUseCase';
import { AddFavoriteUseCase } from '../contexts/favorite/application/AddFavoriteUseCase';
import { RemoveFavoriteUseCase } from '../contexts/favorite/application/RemoveFavoriteUseCase';
import { FavoriteController } from '../contexts/favorite/interface/FavoriteController';

// Notification
import { PgNotificationRepository } from '../contexts/notification/infrastructure/PgNotificationRepository';
import { FcmPushService } from '../contexts/notification/infrastructure/FcmPushService';
import { GetNotificationsUseCase } from '../contexts/notification/application/GetNotificationsUseCase';
import { GetSettingsUseCase } from '../contexts/notification/application/GetSettingsUseCase';
import { UpdateSettingsUseCase } from '../contexts/notification/application/UpdateSettingsUseCase';
import { DispatchSlotNotificationsUseCase } from '../contexts/notification/application/DispatchSlotNotificationsUseCase';
import { MarkReadUseCase } from '../contexts/notification/application/MarkReadUseCase';
import { NotificationController } from '../contexts/notification/interface/NotificationController';

// User
import { PgUserProfileRepository } from '../contexts/user/infrastructure/PgUserProfileRepository';
import { GetProfileUseCase } from '../contexts/user/application/GetProfileUseCase';
import { WithdrawUseCase } from '../contexts/user/application/WithdrawUseCase';
import { UserController } from '../contexts/user/interface/UserController';

export interface Controllers {
  auth: AuthController;
  catalog: CatalogController;
  reservation: ReservationController;
  favorite: FavoriteController;
  notification: NotificationController;
  user: UserController;
  ownerAuth: OwnerAuthController;
  ownerInternal: OwnerInternalController;
  ownerSlots: OwnerSlotsController;
  analytics: AnalyticsController;
  admin: AdminController;
  inquiry: InquiryController;
}

export interface AppDependencies {
  controllers: Controllers;
  slotListener: SlotListener;
}

export function buildDependencies(): AppDependencies {
  // ── DB 연결 ─────────────────────────────────────────────────
  // rds      : 사용자 데이터 (users, favorites, notifications, ...)
  // sbClient : 샵/슬롯 읽기 + 어드민 CRUD (Supabase REST API — 무료)
  // supabase : LISTEN/NOTIFY 전용 Pool (SlotListener만 사용)
  const rds = getRdsPool();
  const supabase = getSupabasePool();        // SlotListener 전용
  const sbClient = getSupabaseClient();      // 샵/슬롯/어드민

  // ── Redis 캐시 (샵 목록/상세 캐싱) ───────────────────────────
  // REDIS_URL 없으면 NullCacheService로 fallback (캐시 미사용)
  const cache: ICacheService = process.env.REDIS_URL
    ? new RedisCacheService(process.env.REDIS_URL)
    : new NullCacheService();

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
  const shopRepo = new PgShopRepository(sbClient, cache);
  const catalogController = new CatalogController(
    new GetShopsUseCase(shopRepo),
    new GetShopDetailUseCase(shopRepo),
    recordView,
    recordClick,
  );

  // ── Reservation (Supabase REST API — 읽기 전용) ─────────────
  const slotRepo = new PgSlotRepository(sbClient);
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
  const pushService = new FcmPushService();
  const dispatchUseCase = new DispatchSlotNotificationsUseCase(notifRepo, pushService);
  const notificationController = new NotificationController(
    new GetNotificationsUseCase(notifRepo),
    new GetSettingsUseCase(notifRepo),
    new UpdateSettingsUseCase(notifRepo),
    dispatchUseCase,
    new MarkReadUseCase(notifRepo),
  );

  // ── User (RDS) ────────────────────────────────────────────
  const userProfileRepo = new PgUserProfileRepository(rds);
  const userController = new UserController(
    new GetProfileUseCase(userProfileRepo),
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

  // ── Owner Slots (RDS — 사장님 등록 슬롯 CRUD) ─────────────────
  const ownerSlotRepo = new PgOwnerSlotRepository(rds);
  const ownerSlotsController = new OwnerSlotsController(
    new GetOwnerSlotsUseCase(ownerSlotRepo),
    new CreateOwnerSlotUseCase(ownerSlotRepo),
    new UpdateOwnerSlotUseCase(ownerSlotRepo),
    new DeleteOwnerSlotUseCase(ownerSlotRepo),
  );

  // ── Admin (env 기반 단일 계정) ───────────────────────────────
  const adminController = new AdminController(rds, sbClient);
  const inquiryController = new InquiryController(rds);

  // ── Real-time (Supabase LISTEN/NOTIFY) ───────────────────
  const slotListener = new SlotListener(dispatchUseCase);

  const controllers: Controllers = {
    auth: authController,
    catalog: catalogController,
    reservation: reservationController,
    favorite: favoriteController,
    notification: notificationController,
    user: userController,
    ownerAuth: ownerAuthController,
    ownerInternal: ownerInternalController,
    ownerSlots: ownerSlotsController,
    analytics: analyticsController,
    admin: adminController,
    inquiry: inquiryController,
  };
  return { controllers, slotListener };
}

export function buildControllers(): Controllers {
  return buildDependencies().controllers;
}
