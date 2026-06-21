import { Request, Response, NextFunction } from 'express';
import { GetOwnerSlotsUseCase } from '../application/GetOwnerSlotsUseCase';
import { CreateOwnerSlotUseCase } from '../application/CreateOwnerSlotUseCase';
import { UpdateOwnerSlotUseCase } from '../application/UpdateOwnerSlotUseCase';
import { DeleteOwnerSlotUseCase } from '../application/DeleteOwnerSlotUseCase';

export class OwnerSlotsController {
  constructor(
    private readonly getSlots:    GetOwnerSlotsUseCase,
    private readonly createSlot:  CreateOwnerSlotUseCase,
    private readonly updateSlot:  UpdateOwnerSlotUseCase,
    private readonly deleteSlot:  DeleteOwnerSlotUseCase,
  ) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const slots = await this.getSlots.execute(req.owner!.shopId!);
      res.json({ slots });
    } catch (err) { next(err); }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const slot = await this.createSlot.execute(
        req.owner!.shopId!,
        req.owner!.sub,
        { date: req.body.date, startTime: req.body.startTime },
      );
      res.status(201).json(slot);
    } catch (err) { next(err); }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const slot = await this.updateSlot.execute(
        parseInt(req.params.slotId, 10),
        req.owner!.shopId!,
        { date: req.body.date, startTime: req.body.startTime },
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
}
