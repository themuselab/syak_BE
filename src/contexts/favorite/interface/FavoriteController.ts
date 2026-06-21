import { Request, Response, NextFunction } from 'express';
import { GetFavoritesUseCase } from '../application/GetFavoritesUseCase';
import { AddFavoriteUseCase } from '../application/AddFavoriteUseCase';
import { RemoveFavoriteUseCase } from '../application/RemoveFavoriteUseCase';

export class FavoriteController {
  constructor(
    private readonly getFavorites: GetFavoritesUseCase,
    private readonly addFavorite: AddFavoriteUseCase,
    private readonly removeFavorite: RemoveFavoriteUseCase,
  ) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const favorites = await this.getFavorites.execute(req.user!.sub);
      res.json({ favorites });
    } catch (err) { next(err); }
  };

  add = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const favorite = await this.addFavorite.execute(req.user!.sub, req.params.shopId);
      res.status(201).json(favorite);
    } catch (err) { next(err); }
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.removeFavorite.execute(req.user!.sub, req.params.shopId);
      res.status(204).send();
    } catch (err) { next(err); }
  };
}
