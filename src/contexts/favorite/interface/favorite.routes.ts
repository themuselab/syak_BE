import { Router } from 'express';
import { FavoriteController } from './FavoriteController';
import { requireAuth } from '../../../shared/middleware/auth.middleware';

export function favoriteRouter(controller: FavoriteController): Router {
  const router = Router();

  router.use(requireAuth);
  router.get('/', controller.list);
  router.post('/:shopId', controller.add);
  router.delete('/:shopId', controller.remove);

  return router;
}
