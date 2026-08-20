export type SlotStatus = 'waiting' | 'notified' | 'reserved' | 'expired';

export interface OwnerSlot {
  id: number;
  shopId: string;
  date: string;              // YYYY-MM-DD
  startTime: string;         // HH:mm
  endTime: string | null;    // HH:mm
  serviceItems: string[];    // 시술 항목
  status: SlotStatus;
  recipientCount: number;    // 취소석 알림을 받은 고객 수
  reservedAmount: number | null;
  reservedCustomer: string | null;
  source: 'owner';
  ownerId: string;
  createdAt: string;
}

export interface CreateSlotDto {
  date: string;
  startTime: string;
  endTime?: string | null;
  serviceItems?: string[];
}

export interface UpdateSlotDto {
  date?: string;
  startTime?: string;
  endTime?: string | null;
  serviceItems?: string[];
}
