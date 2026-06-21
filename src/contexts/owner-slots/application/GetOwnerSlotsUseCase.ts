import { IOwnerSlotRepository } from '../ports/IOwnerSlotRepository';
import { OwnerSlot } from '../domain/OwnerSlot';

export class GetOwnerSlotsUseCase {
  constructor(private readonly repo: IOwnerSlotRepository) {}

  async execute(shopId: string): Promise<OwnerSlot[]> {
    return this.repo.findByShop(shopId);
  }
}
