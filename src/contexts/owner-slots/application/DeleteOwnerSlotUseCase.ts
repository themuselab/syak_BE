import { IOwnerSlotRepository } from '../ports/IOwnerSlotRepository';
import { Errors } from '../../../shared/errors/AppError';

export class DeleteOwnerSlotUseCase {
  constructor(private readonly repo: IOwnerSlotRepository) {}

  async execute(slotId: number, shopId: string): Promise<void> {
    const slot = await this.repo.findById(slotId);
    if (!slot) throw Errors.slotNotFound();
    if (slot.shopId !== shopId) throw Errors.slotForbidden();
    await this.repo.delete(slotId);
  }
}
