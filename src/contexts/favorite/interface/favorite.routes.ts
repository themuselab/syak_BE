import { Router } from 'express';
import { FavoriteController } from './FavoriteController';
import { requireAuth } from '../../../shared/middleware/auth.middleware';

export function favoriteRouter(controller: FavoriteController): Router {
  const router = Router();

  router.use(requireAuth);
  router.get('/',           controller.list);    // CA-021
  router.post('/:shopId',   controller.add);     // CA-015
  router.delete('/:shopId', controller.remove);  // CA-016

  return router;
}
