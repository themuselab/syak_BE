import { Request, Response, NextFunction } from 'express';
import {
  CreateSlotAlertsUseCase, ListSlotAlertsUseCase, DeleteSlotAlertsUseCase,
} from '../application/SlotAlertUseCases';

/** 빈자리 알림 신청 — 전부 requireAuth 뒤에서 호출 */
export class SlotAlertController {
  constructor(
    private readonly createUC: CreateSlotAlertsUseCase,
    private readonly listUC: ListSlotAlertsUseCase,
    private readonly deleteUC: DeleteSlotAlertsUseCase,
  ) {}

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.createUC.execute(req.user!.sub, req.body ?? {});
      res.status(201).json(result);
    } catch (err) { next(err); }
  };

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await this.listUC.execute(req.user!.sub));
    } catch (err) { next(err); }
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.deleteUC.execute(req.user!.sub, req.body?.ids);
      res.status(204).send();
    } catch (err) { next(err); }
  };
}
