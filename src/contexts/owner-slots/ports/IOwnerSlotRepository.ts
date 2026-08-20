import { OwnerSlot, CreateSlotDto, UpdateSlotDto } from '../domain/OwnerSlot';

export interface IOwnerSlotRepository {
  findByShop(shopId: string): Promise<OwnerSlot[]>;
  findById(id: number): Promise<OwnerSlot | null>;
  create(shopId: string, ownerId: string, dto: CreateSlotDto): Promise<OwnerSlot>;
  update(id: number, dto: UpdateSlotDto): Promise<OwnerSlot>;
  delete(id: number): Promise<void>;
  /** 알림 발송 후: 상태=notified, 수신자 수 기록 */
  markNotified(id: number, recipientCount: number): Promise<OwnerSlot>;
  /** 예약 성사 처리: 상태=reserved + 금액/고객 */
  reserve(id: number, amount: number | null, customer: string | null): Promise<OwnerSlot>;
}

/** 알림 발송에 필요한 샵 기본정보 (Supabase) */
export interface IShopInfoProvider {
  getBasic(shopId: string): Promise<{ name: string; lat: number | null; lng: number | null } | null>;
}

/** 취소석 알림 발송(소비자 대상) */
export interface ISlotNotifier {
  dispatch(event: {
    shopId: string; shopName: string; shopLat: number | null; shopLng: number | null;
    slotDate: string; slotTime: string;
  }): Promise<{ dispatched: number }>;
}

/** 사장님 활동 알림 로깅 */
export interface IOwnerActivityLog {
  logDispatched(input: { ownerId: string; shopId: string; slotId: number; recipients: number; slotTime: string; serviceItems: string[] }): Promise<void>;
  logReserved(input: { ownerId: string; shopId: string; slotId: number; customer: string | null; slotTime: string }): Promise<void>;
}
