import { Router } from 'express';
import { AuthController } from './AuthController';
import { requireAuth } from '../../../shared/middleware/auth.middleware';

export function authRouter(controller: AuthController): Router {
  const router = Router();

  router.post('/:provider', controller.login);
  router.post('/link/:provider', requireAuth, controller.link);   // 추가 소셜 계정 연동
  router.post('/token/refresh', controller.refresh);
  router.delete('/signout', requireAuth, controller.logout);

  return router;
}
