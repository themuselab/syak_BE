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
import { closePool, getRdsPool } from './shared/lib/database';

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

  app.use(express.json({ limit: '20mb' })); // 스크래퍼 슬롯 벌크 동기화(수만 행) 대비
  app.use(cookieParser());
  app.use(httpLogger);
}

// createApp은 테스트 전용 — 서버 리슨 없이 Express 앱만 반환
export function createApp(): Express {
  const app = express();
  applyMiddleware(app);
  const controllers = buildControllers();
  app.get('/health', (_req, res) => res.status(200).send('ok'));
  app.use('/api/v1', buildRouter(controllers));
  app.use(errorMiddleware);
  return app;
}

if (require.main === module) {
  const port = parseInt(process.env.PORT ?? '3000', 10);
  const { controllers } = buildDependencies();

  const app = express();
  applyMiddleware(app);
  app.get('/health', (_req, res) => res.status(200).send('ok'));
  app.use('/api/v1', buildRouter(controllers));
  app.use(errorMiddleware);

  // 관심 동네 컬럼(2026-10-27). 운영 DB에 수동 마이그레이션할 경로가 없어 기동 시 "없으면 추가"로 맞춘다.
  // 널 허용·기본값 없는 ADD COLUMN이라 즉시 끝나고, 이미 있으면 아무 일도 안 한다(db/migration_interest_region.sql 동일).
  getRdsPool()
    .query(
      `ALTER TABLE notification_settings
         ADD COLUMN IF NOT EXISTS region_code TEXT,
         ADD COLUMN IF NOT EXISTS region_name TEXT`,
    )
    // 예전 "내 주변 알림"이 저장한 기기 GPS 좌표 삭제(관심 동네 없이 저장된 좌표 = GPS). 사용자 요청 2026-10-27.
    // 위치기반서비스사업 신고 대상이 되지 않도록 서버에 GPS를 남기지 않는다. 매 기동 실행해도 같은 결과(멱등).
    .then(() =>
      getRdsPool().query(
        `UPDATE notification_settings
         SET near_lat = NULL, near_lng = NULL, near_enabled = false, updated_at = NOW()
         WHERE region_code IS NULL AND (near_lat IS NOT NULL OR near_lng IS NOT NULL)`,
      ),
    )
    .then((r) => logger.info({ cleared: r.rowCount }, 'legacy GPS near coords cleared'))
    .catch((err) => logger.error({ err }, 'interest region columns ensure / GPS cleanup failed'));

  const server = app.listen(port, () => {
    logger.info(`Syak backend running on port ${port} [${process.env.NODE_ENV ?? 'development'}]`);
  });

  const shutdown = async () => {
    logger.info('Shutting down...');
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
