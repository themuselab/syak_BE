import { Request, Response, NextFunction } from 'express';
import { GetProfileUseCase } from '../application/GetProfileUseCase';
import { UpdateProfileUseCase } from '../application/UpdateProfileUseCase';
import { WithdrawUseCase } from '../application/WithdrawUseCase';
import { Errors } from '../../../shared/errors/AppError';

export class UserController {
  constructor(
    private readonly getProfileUseCase: GetProfileUseCase,
    private readonly updateProfileUseCase: UpdateProfileUseCase,
    private readonly withdrawUseCase: WithdrawUseCase,
  ) {}

  me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const profile = await this.getProfileUseCase.execute(req.user!.sub);
      res.json(profile);
    } catch (err) { next(err); }
  };

  updateProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { nickname } = req.body as { nickname?: unknown };
      if (typeof nickname !== 'string') {
        return next(Errors.validation({ nickname: '닉네임이 필요합니다' }));
      }
      const profile = await this.updateProfileUseCase.execute(req.user!.sub, nickname);
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
