import { Router } from 'express';
import { UserController } from './UserController';
import { requireAuth } from '../../../shared/middleware/auth.middleware';

export function userRouter(controller: UserController): Router {
  const router = Router();

  router.use(requireAuth);
  router.get('/me',    controller.me);       // CA-028
  router.delete('/me', controller.withdraw); // CA-020 (회원 탈퇴)

  return router;
}
