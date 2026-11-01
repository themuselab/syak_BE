import { IFavoriteRepository, FavoriteAction } from '../ports/IFavoriteRepository';
import { logger } from '../../../shared/logger';

/**
 * favorite_events 기록 — fire-and-forget. 실패(테이블 미생성·DB 오류 등)해도
 * 즐겨찾기 API는 영향받지 않게 로그만 남긴다(동기 throw 포함).
 */
export function recordFavoriteEvent(
  repo: IFavoriteRepository, userId: string, shopId: string, action: FavoriteAction,
): void {
  void Promise.resolve()
    .then(() => repo.recordEvent(userId, shopId, action))
    .catch((err) => logger.warn({ err, userId, shopId, action }, 'favorite_events insert failed'));
}
