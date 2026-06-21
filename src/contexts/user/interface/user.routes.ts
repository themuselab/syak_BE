import { Router } from 'express';
import { UserController } from './UserController';
import { requireAuth } from '../../../shared/middleware/auth.middleware';

export function userRouter(controller: UserController): Router {
  const router = Router();

  router.use(requireAuth);
  router.get('/me', controller.me);
  router.delete('/me', controller.withdraw);

  return router;
}
