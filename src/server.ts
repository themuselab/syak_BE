import 'dotenv/config';
import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { httpLogger } from './shared/middleware/httpLogger.middleware';
import { errorMiddleware } from './shared/middleware/error.middleware';
import { buildControllers, buildDependencies } from './app/composition-root';
import { buildRouter } from './app/router';
import { logger } from './shared/logger';
import { closePool } from './shared/lib/database';

// CSRF 미제거 이유: 이 API는 네이티브 모바일 앱 전용.
// 브라우저는 제3자 사이트의 요청에 쿠키를 자동 첨부하여 CSRF가 위험하지만,
// 네이티브 앱은 HTTP 클라이언트가 쿠키를 명시적으로 관리하므로 CSRF 공격 자체가 성립하지 않음.
// 웹 클라이언트가 이 API를 사용하게 된다면 CSRF 미들웨어를 다시 활성화해야 함.

function applyMiddleware(app: Express): void {
  app.use(helmet());

  // TODO: 프로덕션 배포 전 허용 도메인을 명시적으로 지정해야 합니다
  // 예: origin: process.env.CORS_ORIGIN?.split(',') ?? []
  app.use(cors({
    origin: (_origin, cb) => cb(null, true),  // 임시: 모든 도메인 허용 (운영 전 수정 필요)
    credentials: true,
  }));

  app.use(express.json());
  app.use(cookieParser());
  app.use(httpLogger);
}

// createApp은 테스트 전용 — SlotListener 시작 없이 Express 앱만 반환
export function createApp(): Express {
  const app = express();
  applyMiddleware(app);
  const controllers = buildControllers();
  app.use('/api/v1', buildRouter(controllers));
  app.use(errorMiddleware);
  return app;
}

if (require.main === module) {
  const port = parseInt(process.env.PORT ?? '3000', 10);
  const { controllers, slotListener } = buildDependencies();

  const app = express();
  applyMiddleware(app);
  app.use('/api/v1', buildRouter(controllers));
  app.use(errorMiddleware);

  const server = app.listen(port, async () => {
    logger.info(`Syak backend running on port ${port} [${process.env.NODE_ENV ?? 'development'}]`);
    await slotListener.start();
  });

  const shutdown = async () => {
    logger.info('Shutting down...');
    await slotListener.stop();
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
