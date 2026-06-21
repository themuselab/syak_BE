import { Request, Response, NextFunction } from 'express';
import { GeneratePartnerCodeUseCase } from '../application/GeneratePartnerCodeUseCase';
import { Errors } from '../../../shared/errors/AppError';

export class OwnerInternalController {
  constructor(private readonly generateCode: GeneratePartnerCodeUseCase) {}

  createCode = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { shopId } = req.body;
    if (!shopId) {
      return next(Errors.validation({ shopId: 'shopId가 필요합니다' }));
    }
    try {
      const result = await this.generateCode.execute(shopId);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  };
}
