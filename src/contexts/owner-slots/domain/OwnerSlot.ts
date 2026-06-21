export interface OwnerSlot {
  id: number;
  shopId: string;
  date: string;
  startTime: string;
  source: 'owner';
  ownerId: string;
}

export interface CreateSlotDto {
  date: string;
  startTime: string;
}
