import { Request, Response, NextFunction } from 'express';
import { GetProfileUseCase } from '../application/GetProfileUseCase';
import { WithdrawUseCase } from '../application/WithdrawUseCase';

export class UserController {
  constructor(
    private readonly getProfileUseCase: GetProfileUseCase,
    private readonly withdrawUseCase: WithdrawUseCase,
  ) {}

  me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const profile = await this.getProfileUseCase.execute(req.user!.sub);
      res.json(profile);
    } catch (err) { next(err); }
  };

  withdraw = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.withdrawUseCase.execute(req.user!.sub);
      res.status(204).send();
    } catch (err) { next(err); }
  };
}
