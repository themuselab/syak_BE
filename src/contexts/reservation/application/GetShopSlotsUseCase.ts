import { ISlotRepository } from '../ports/ISlotRepository';
import { Slot } from '../domain/Slot';

export class GetShopSlotsUseCase {
  constructor(private readonly slotRepo: ISlotRepository) {}

  async execute(shopId: string, dates?: string[]): Promise<Slot[]> {
    const targetDates = dates ?? this.nextThreeDays();
    return this.slotRepo.findByShop(shopId, targetDates);
  }

  private nextThreeDays(): string[] {
    return Array.from({ length: 3 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      return d.toISOString().slice(0, 10);
    });
  }
}
