import { Router } from 'express';
import { UserController } from './UserController';
import { requireAuth } from '../../../shared/middleware/auth.middleware';

export function userRouter(controller: UserController): Router {
  const router = Router();

  router.use(requireAuth);
  router.get('/me',    controller.me);           // CA-028
  router.patch('/me',  controller.updateProfile); // 닉네임 수정 (애플 등 이름 미설정 대비)
  router.delete('/me', controller.withdraw);      // CA-020 (회원 탈퇴)

  return router;
}
