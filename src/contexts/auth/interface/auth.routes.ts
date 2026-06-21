import { Router } from 'express';
import { AuthController } from './AuthController';
import { requireAuth } from '../../../shared/middleware/auth.middleware';

export function authRouter(controller: AuthController): Router {
  const router = Router();

  router.post('/:provider',      controller.login);                   // CA-002 CA-003 CA-004
  router.post('/link/:provider', requireAuth, controller.link);       // CA-002 CA-003 CA-004 (추가 소셜 연동)
  router.post('/token/refresh',  controller.refresh);                 // SO-001a
  router.delete('/signout',      requireAuth, controller.logout);

  return router;
}
