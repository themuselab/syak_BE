import { OwnerSlot, CreateSlotDto } from '../domain/OwnerSlot';

export interface IOwnerSlotRepository {
  findByShop(shopId: string): Promise<OwnerSlot[]>;
  findById(id: number): Promise<OwnerSlot | null>;
  create(shopId: string, ownerId: string, dto: CreateSlotDto): Promise<OwnerSlot>;
  update(id: number, dto: Partial<CreateSlotDto>): Promise<OwnerSlot>;
  delete(id: number): Promise<void>;
}
