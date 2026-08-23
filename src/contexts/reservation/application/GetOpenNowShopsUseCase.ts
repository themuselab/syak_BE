import { ISlotRepository } from '../ports/ISlotRepository';

/** 지금 열려있는 샵 id (초록핀 재계산용, 스크래퍼 reconcile이 호출) */
export class GetOpenNowShopsUseCase {
  constructor(private readonly repo: ISlotRepository) {}

  async execute(date: string, after: string): Promise<string[]> {
    return this.repo.openNowShopIds(date, after);
  }
}
