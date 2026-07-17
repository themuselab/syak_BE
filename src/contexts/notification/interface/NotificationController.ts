import { Request, Response, NextFunction } from 'express';
import { GetNotificationsUseCase } from '../application/GetNotificationsUseCase';
import { GetSettingsUseCase } from '../application/GetSettingsUseCase';
import { UpdateSettingsUseCase } from '../application/UpdateSettingsUseCase';
import { DispatchSlotNotificationsUseCase } from '../application/DispatchSlotNotificationsUseCase';
import { MarkReadUseCase } from '../application/MarkReadUseCase';
import { RegisterDeviceUseCase } from '../application/RegisterDeviceUseCase';
import { ListAppNewsUseCase } from '../application/ListAppNewsUseCase';
import { PublishAppNewsUseCase } from '../application/PublishAppNewsUseCase';
import { Errors } from '../../../shared/errors/AppError';

export class NotificationController {
  constructor(
    private readonly getNotifications: GetNotificationsUseCase,
    private readonly getSettings: GetSettingsUseCase,
    private readonly updateSettings: UpdateSettingsUseCase,
    private readonly dispatch: DispatchSlotNotificationsUseCase,
    private readonly markReadUC: MarkReadUseCase,
    private readonly registerDeviceUC: RegisterDeviceUseCase,
    private readonly listAppNewsUC: ListAppNewsUseCase,
    private readonly publishAppNewsUC: PublishAppNewsUseCase,
  ) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const items = await this.getNotifications.execute(req.user!.sub);
      res.json({ notifications: items });
    } catch (err) { next(err); }
  };

  settings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const settings = await this.getSettings.execute(req.user!.sub);
      res.json(settings);
    } catch (err) { next(err); }
  };

  updateSettingsHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const settings = await this.updateSettings.execute(req.user!.sub, req.body);
      res.json(settings);
    } catch (err) { next(err); }
  };

  markRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.markReadUC.execute(req.params.id, req.user!.sub);
      res.status(204).send();
    } catch (err) { next(err); }
  };

  dispatchHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.dispatch.execute(req.body.events ?? []);
      res.json(result);
    } catch (err) { next(err); }
  };

  // ── 앱 소식 (비로그인 포함) ─────────────────────────────────

  /** 익명 디바이스 등록/갱신 — 로그인 불필요 */
  registerDevice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { deviceId, fcmToken, platform, appNewsEnabled } = req.body ?? {};
      if (!deviceId || !fcmToken) {
        return next(Errors.validation({ device: 'deviceId와 fcmToken이 필요합니다' }));
      }
      await this.registerDeviceUC.execute({
        deviceId, fcmToken, platform,
        appNewsEnabled,
        userId: req.user?.sub ?? null,   // 로그인 상태면 연결(선택)
      });
      res.status(204).send();
    } catch (err) { next(err); }
  };

  /** 전역 앱 소식 목록 — 로그인 불필요 */
  listAppNews = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limit = parseInt(String(req.query.limit ?? '30'), 10) || 30;
      const items = await this.listAppNewsUC.execute(limit);
      res.json({ items });
    } catch (err) { next(err); }
  };

  /** 앱 소식 발행 (관리자) — 저장 + 전 디바이스 FCM 발송 */
  publishAppNews = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { title, body, link, imageUrl } = req.body ?? {};
      if (!title || !body) {
        return next(Errors.validation({ appNews: 'title과 body가 필요합니다' }));
      }
      const result = await this.publishAppNewsUC.execute({ title, body, link, imageUrl });
      res.status(201).json(result);
    } catch (err) { next(err); }
  };

  /** 앱 소식 삭제 (관리자) */
  deleteAppNews = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.publishAppNewsUC.remove(req.params.id);
      res.status(204).send();
    } catch (err) { next(err); }
  };
}
