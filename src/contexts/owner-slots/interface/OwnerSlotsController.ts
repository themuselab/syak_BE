import { Request, Response, NextFunction } from 'express';
import { GetOwnerSlotsUseCase } from '../application/GetOwnerSlotsUseCase';
import { RegisterAndNotifyUseCase } from '../application/RegisterAndNotifyUseCase';
import { UpdateOwnerSlotUseCase } from '../application/UpdateOwnerSlotUseCase';
import { DeleteOwnerSlotUseCase } from '../application/DeleteOwnerSlotUseCase';
import { ReserveOwnerSlotUseCase } from '../application/ReserveOwnerSlotUseCase';

export class OwnerSlotsController {
  constructor(
    private readonly getSlots:   GetOwnerSlotsUseCase,
    private readonly registerSlot: RegisterAndNotifyUseCase,
    private readonly updateSlot:  UpdateOwnerSlotUseCase,
    private readonly deleteSlot:  DeleteOwnerSlotUseCase,
    private readonly reserveSlot: ReserveOwnerSlotUseCase,
  ) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const slots = await this.getSlots.execute(req.owner!.shopId!);
      res.json({ slots });
    } catch (err) { next(err); }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const slot = await this.registerSlot.execute(
        req.owner!.shopId!,
        req.owner!.sub,
        {
          date: req.body.date,
          startTime: req.body.startTime,
          endTime: req.body.endTime ?? null,
          serviceItems: Array.isArray(req.body.serviceItems) ? req.body.serviceItems : [],
        },
        req.body.notify !== false, // 기본 true — 등록하고 알림 보내기
      );
      res.status(201).json(slot);
    } catch (err) { next(err); }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const slot = await this.updateSlot.execute(
        parseInt(req.params.slotId, 10),
        req.owner!.shopId!,
        {
          date: req.body.date,
          startTime: req.body.startTime,
          endTime: req.body.endTime,
          serviceItems: req.body.serviceItems,
        },
      );
      res.json(slot);
    } catch (err) { next(err); }
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.deleteSlot.execute(parseInt(req.params.slotId, 10), req.owner!.shopId!);
      res.status(204).send();
    } catch (err) { next(err); }
  };

  reserve = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const slot = await this.reserveSlot.execute(
        parseInt(req.params.slotId, 10),
        req.owner!.shopId!,
        req.owner!.sub,
        { amount: req.body.amount ?? null, customer: req.body.customer ?? null },
      );
      res.json(slot);
    } catch (err) { next(err); }
  };
}
