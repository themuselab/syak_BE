import { IAnalyticsRepository } from '../ports/IAnalyticsRepository';
import { ReservationClickEvent } from '../domain/Analytics';
import { logger } from '../../../shared/logger';

export class RecordReservationClickUseCase {
  constructor(private readonly repo: IAnalyticsRepository) {}

  async execute(event: ReservationClickEvent): Promise<void> {
    await this.repo.recordClick(event).catch((err: unknown) => {
      logger.warn({ err, shopId: event.shopId }, '예약 클릭 기록 실패');
    });
  }
}
