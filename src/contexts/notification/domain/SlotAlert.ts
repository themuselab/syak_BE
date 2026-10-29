/**
 * 빈자리 알림 신청(slot alert).
 *
 * 로그인 유저가 (샵, 날짜, 30분 단위 시간)을 골라 "이 시간이 비면 알려줘"라고 신청한다.
 * - 알림을 한 번 받으면 그 신청은 끝난다(notified_at 기록).
 * - 시간이 지나도 끝난다 — 별도 크론 없이 조회 시점에 KST 기준으로 계산한다.
 */
export type SlotAlertStatus = 'active' | 'ended';
export type SlotAlertEndedReason = 'notified' | 'expired';

/** DB row(+샵 정보 조인) */
export interface SlotAlertRecord {
  id: string;
  userId: string;
  shopId: string;
  shopName: string | null;
  shopRegion: string | null;
  shopPhoto: string | null;
  slotDate: string;   // YYYY-MM-DD
  slotTime: string;   // HH:MM
  notifiedAt: Date | null;
  createdAt: Date;
}

/** GET /notifications/slot-alerts 응답 항목 */
export interface SlotAlertView {
  id: string;
  shopId: string;
  shopName: string;
  shopRegion: string | null;
  shopPhoto: string | null;
  date: string;
  time: string;
  status: SlotAlertStatus;
  endedReason: SlotAlertEndedReason | null;
  notifiedAt: string | null;
  createdAt: string;
}

/** 디스패치 시 신청 매칭 결과 */
export interface SlotAlertMatch {
  alertId: string;
  userId: string;
  fcmToken: string | null;
  slotDate: string;
  slotTime: string;
}

// ── KST 시간 유틸 ──────────────────────────────────────────────

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** KST 기준 현재 날짜/시각 */
export function kstNow(now: Date = new Date()): { date: string; time: string } {
  const iso = new Date(now.getTime() + KST_OFFSET_MS).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/** YYYY-MM-DD 에 n일 더하기 */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 오늘/내일/M월 D일 */
export function dayLabel(date: string, today: string): string {
  if (date === today) return '오늘';
  if (date === addDays(today, 1)) return '내일';
  const [, m, d] = date.split('-');
  return `${Number(m)}월 ${Number(d)}일`;
}

/** 슬롯 시작 시각이 이미 지났는가(KST). 시작 시각 정각부터 지난 것으로 본다. */
export function isSlotPast(date: string, time: string, now: Date = new Date()): boolean {
  const k = kstNow(now);
  return `${date} ${time}` <= `${k.date} ${k.time}`;
}

export function toSlotAlertView(r: SlotAlertRecord, now: Date = new Date()): SlotAlertView {
  let status: SlotAlertStatus = 'active';
  let endedReason: SlotAlertEndedReason | null = null;
  if (r.notifiedAt) {
    status = 'ended';
    endedReason = 'notified';
  } else if (isSlotPast(r.slotDate, r.slotTime, now)) {
    status = 'ended';
    endedReason = 'expired';
  }
  return {
    id: r.id,
    shopId: r.shopId,
    shopName: r.shopName ?? '',
    shopRegion: r.shopRegion,
    shopPhoto: r.shopPhoto,
    date: r.slotDate,
    time: r.slotTime,
    status,
    endedReason,
    notifiedAt: r.notifiedAt ? new Date(r.notifiedAt).toISOString() : null,
    createdAt: new Date(r.createdAt).toISOString(),
  };
}
