import { Request, Response, NextFunction } from 'express';
import { IOwnerDashboardRepository } from '../ports/IOwnerDashboardRepository';
import { IOwnerSlotRepository } from '../../owner-slots/ports/IOwnerSlotRepository';
import { SupabaseShopService } from '../infrastructure/SupabaseShopService';
import { ga4ShopViewsDaily } from '../../admin/infrastructure/GA4Service';
import { Errors } from '../../../shared/errors/AppError';
import { logger } from '../../../shared/logger';

const sum = (arr: { value: number }[]) => arr.reduce((a, b) => a + b.value, 0);

export class OwnerDashboardController {
  constructor(
    private readonly repo: IOwnerDashboardRepository,
    private readonly slotRepo: IOwnerSlotRepository,
    private readonly shop: SupabaseShopService,
  ) {}

  // ── 대시보드 요약 ────────────────────────────────────────────
  getDashboard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const shopId = req.owner!.shopId!;
      const ownerId = req.owner!.sub;
      await this.repo.reconcileExpired(shopId, ownerId).catch(() => {});

      const [core, recent, views, category] = await Promise.all([
        this.repo.getCore(shopId, ownerId),
        this.slotRepo.findByShop(shopId).then(s => s.slice(0, 6)),
        this.views(shopId),
        this.categorySafe(shopId),
      ]);

      res.json({
        shopCategory: category,
        today: { registered: core.todayRegistered, notificationsSent: core.notificationsSentToday },
        week: {
          reservedCount: core.reservedCount,
          reservedDelta: core.reservedDeltaWeek,
          recoveredRevenue: core.recoveredRevenue,
        },
        views,
        favorites: { count: core.favoritesCount, deltaWeek: core.favoritesDeltaWeek, recent: core.favoritesRecent },
        recent,
      });
    } catch (err) { next(err); }
  };

  private async categorySafe(shopId: string): Promise<string | null> {
    try { return (await this.shop.getInfo(shopId)).category; } catch { return null; }
  }

  /** GA4 shop_view 14일 → 최근7/직전7 비교 + 오늘값 + 일별(최근7) */
  private async views(shopId: string): Promise<{ total: number; today: number; deltaVsPrev: number; daily: { date: string; value: number }[] }> {
    try {
      const rows = await ga4ShopViewsDaily(shopId, 14);
      const last7 = rows.slice(-7);
      const prev7 = rows.slice(-14, -7);
      const todayStr = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
      return {
        total: sum(last7),
        today: last7.find(r => r.date === todayStr)?.value ?? 0,
        deltaVsPrev: sum(last7) - sum(prev7),
        daily: last7,
      };
    } catch (err) {
      logger.warn({ err, shopId }, 'GA4 조회수 조회 실패 — 0으로 대체');
      return { total: 0, today: 0, deltaVsPrev: 0, daily: [] };
    }
  }

  // ── 사장님 활동 알림 ──────────────────────────────────────────
  listNotifications = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { items, unread } = await this.repo.listNotifications(req.owner!.sub);
      res.json({ notifications: items, unread });
    } catch (err) { next(err); }
  };

  markNotifRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.repo.markNotifRead(req.params.id, req.owner!.sub);
      res.status(204).send();
    } catch (err) { next(err); }
  };

  // ── 계정 프로필 ──────────────────────────────────────────────
  getProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const profile = await this.repo.getProfile(req.owner!.sub);
      if (!profile) throw Errors.validation({ owner: '계정을 찾을 수 없습니다' });
      res.json(profile);
    } catch (err) { next(err); }
  };

  updateProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, phone, email } = req.body ?? {};
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        throw Errors.validation({ email: '이메일 형식이 올바르지 않습니다' });
      }
      const profile = await this.repo.updateProfile(req.owner!.sub, { name, phone, email });
      res.json(profile);
    } catch (err) { next(err); }
  };

  // ── 매장 정보 (Supabase) ─────────────────────────────────────
  getShop = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const info = await this.shop.getInfo(req.owner!.shopId!);
      res.json(info);
    } catch (err) {
      logger.warn({ err }, '매장 정보 조회 실패(Supabase 정지 가능)');
      res.status(503).json({ code: 'SHOP_INFO_UNAVAILABLE', message: '매장 정보를 불러올 수 없습니다. 잠시 후 다시 시도해주세요.' });
    }
  };

  updateShop = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, address, serviceItems } = req.body ?? {};
      const info = await this.shop.updateInfo(req.owner!.shopId!, { name, address, serviceItems });
      res.json(info);
    } catch (err) {
      logger.warn({ err }, '매장 정보 수정 실패(Supabase 정지 가능)');
      res.status(503).json({ code: 'SHOP_INFO_UNAVAILABLE', message: '매장 정보를 저장할 수 없습니다. 잠시 후 다시 시도해주세요.' });
    }
  };
}
