import { IAnalyticsRepository } from '../ports/IAnalyticsRepository';
import { ShopViewEvent } from '../domain/Analytics';
import { logger } from '../../../shared/logger';

export class RecordShopViewUseCase {
  constructor(private readonly repo: IAnalyticsRepository) {}

  // fire-and-forget: 실패해도 사용자 요청에 영향 없음
  async execute(event: ShopViewEvent): Promise<void> {
    await this.repo.recordView(event).catch((err: unknown) => {
      logger.warn({ err, shopId: event.shopId }, 'shop view 기록 실패');
    });
  }
}
