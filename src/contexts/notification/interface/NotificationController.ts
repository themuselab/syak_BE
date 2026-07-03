import { Request, Response, NextFunction } from 'express';
import { GetNotificationsUseCase } from '../application/GetNotificationsUseCase';
import { GetSettingsUseCase } from '../application/GetSettingsUseCase';
import { UpdateSettingsUseCase } from '../application/UpdateSettingsUseCase';
import { DispatchSlotNotificationsUseCase } from '../application/DispatchSlotNotificationsUseCase';
import { MarkReadUseCase } from '../application/MarkReadUseCase';

export class NotificationController {
  constructor(
    private readonly getNotifications: GetNotificationsUseCase,
    private readonly getSettings: GetSettingsUseCase,
    private readonly updateSettings: UpdateSettingsUseCase,
    private readonly dispatch: DispatchSlotNotificationsUseCase,
    private readonly markReadUC: MarkReadUseCase,
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
}
