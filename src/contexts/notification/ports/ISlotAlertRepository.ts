import { SlotAlertMatch, SlotAlertRecord } from '../domain/SlotAlert';

export interface ISlotAlertRepository {
  /** 샵의 파트너 여부. 샵이 없으면 null. (빈자리 알림은 파트너 샵 전용) */
  findShopPartner(shopId: string): Promise<boolean | null>;
  /** 활성 신청이 이미 있으면 건너뛴다(멱등). 새로 만든 개수 반환. */
  createMany(userId: string, shopId: string, date: string, times: string[]): Promise<number>;
  /** 활성 + 최근 7일 내 종료된 신청(샵 정보 조인), 최신순 */
  listRecentByUser(userId: string): Promise<SlotAlertRecord[]>;
  /** 본인 소유 row만 삭제 */
  deleteMany(userId: string, ids: string[]): Promise<number>;

  /** 디스패치: 이 샵의 (날짜, 시간)과 맞는 활성 신청 — 샵이 지금 파트너(shops.is_partner)일 때만 */
  findActiveMatches(shopId: string, slots: Array<{ date: string; time: string }>): Promise<SlotAlertMatch[]>;
  markNotified(ids: string[]): Promise<void>;
}
