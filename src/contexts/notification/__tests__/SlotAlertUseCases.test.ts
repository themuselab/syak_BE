import {
  CreateSlotAlertsUseCase, ListSlotAlertsUseCase, DeleteSlotAlertsUseCase,
} from '../application/SlotAlertUseCases';
import { ISlotAlertRepository } from '../ports/ISlotAlertRepository';
import { SlotAlertRecord } from '../domain/SlotAlert';
import { ErrorCode } from '../../../shared/errors/ErrorCode';

// 2026-10-29 10:00 KST
const NOW = new Date('2026-10-29T01:00:00Z');
const now = () => NOW;

function makeRepo(over: Partial<ISlotAlertRepository> = {}): ISlotAlertRepository {
  return {
    shopExists: jest.fn().mockResolvedValue(true),
    createMany: jest.fn().mockImplementation(async (_u, _s, _d, times: string[]) => times.length),
    listRecentByUser: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn().mockResolvedValue(0),
    findActiveMatches: jest.fn(),
    markNotified: jest.fn(),
    ...over,
  };
}

describe('CreateSlotAlertsUseCase', () => {
  it('정상 신청 — 중복 시간 제거·정렬 후 생성 개수를 반환', async () => {
    const repo = makeRepo();
    const res = await new CreateSlotAlertsUseCase(repo, now)
      .execute('u1', { shopId: 'shop-1', date: '2026-10-30', times: ['11:00', '10:30', '11:00'] });
    expect(repo.createMany).toHaveBeenCalledWith('u1', 'shop-1', '2026-10-30', ['10:30', '11:00']);
    expect(res).toEqual({ created: 2 });
  });

  it('이미 활성 신청이 있으면 repo가 건너뛴 만큼 created가 줄어든다(멱등)', async () => {
    const repo = makeRepo({ createMany: jest.fn().mockResolvedValue(0) });
    const res = await new CreateSlotAlertsUseCase(repo, now)
      .execute('u1', { shopId: 'shop-1', date: '2026-10-29', times: ['12:00'] });
    expect(res).toEqual({ created: 0 });
  });

  it('오늘 이미 지난 시간은 만들지 않는다', async () => {
    const repo = makeRepo();
    await new CreateSlotAlertsUseCase(repo, now)
      .execute('u1', { shopId: 'shop-1', date: '2026-10-29', times: ['09:30', '10:00', '10:30'] });
    expect(repo.createMany).toHaveBeenCalledWith('u1', 'shop-1', '2026-10-29', ['10:30']);
  });

  it.each([
    ['날짜 형식 오류', { shopId: 's', date: '2026/10/29', times: ['10:30'] }],
    ['어제', { shopId: 's', date: '2026-10-28', times: ['10:30'] }],
    ['글피(오늘+3)', { shopId: 's', date: '2026-11-01', times: ['10:30'] }],
    ['times 비어 있음', { shopId: 's', date: '2026-10-30', times: [] }],
    ['times 49개', { shopId: 's', date: '2026-10-30', times: Array(49).fill('10:00') }],
    ['times 형식 오류', { shopId: 's', date: '2026-10-30', times: ['9:00'] }],
    ['times 범위 오류', { shopId: 's', date: '2026-10-30', times: ['25:00'] }],
    ['shopId 없음', { date: '2026-10-30', times: ['10:00'] }],
  ])('%s → VALIDATION_ERROR', async (_label, input) => {
    const repo = makeRepo();
    await expect(new CreateSlotAlertsUseCase(repo, now).execute('u1', input))
      .rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR, statusCode: 400 });
    expect(repo.createMany).not.toHaveBeenCalled();
  });

  it('모레(오늘+2)까지는 허용', async () => {
    const repo = makeRepo();
    await expect(new CreateSlotAlertsUseCase(repo, now)
      .execute('u1', { shopId: 's', date: '2026-10-31', times: ['00:00'] })).resolves.toEqual({ created: 1 });
  });

  it('없는 샵 → SHOP_NOT_FOUND', async () => {
    const repo = makeRepo({ shopExists: jest.fn().mockResolvedValue(false) });
    await expect(new CreateSlotAlertsUseCase(repo, now)
      .execute('u1', { shopId: 'nope', date: '2026-10-30', times: ['10:00'] }))
      .rejects.toMatchObject({ code: ErrorCode.SHOP_NOT_FOUND, statusCode: 404 });
  });

  it('KST 자정 직후에도 오늘은 KST 날짜(UTC 전날 아님)', async () => {
    // 2026-10-29 15:30 UTC = 2026-10-30 00:30 KST
    const repo = makeRepo();
    await expect(new CreateSlotAlertsUseCase(repo, () => new Date('2026-10-29T15:30:00Z'))
      .execute('u1', { shopId: 's', date: '2026-11-01', times: ['10:00'] })).resolves.toEqual({ created: 1 });
  });
});

describe('ListSlotAlertsUseCase', () => {
  const base: SlotAlertRecord = {
    id: 'a', userId: 'u1', shopId: 'shop-1', shopName: '모아래쉬', shopRegion: '강남구',
    shopPhoto: 'https://img/1.jpg', slotDate: '2026-10-29', slotTime: '14:00',
    notifiedAt: null, createdAt: new Date('2026-10-28T03:00:00Z'),
  };

  it('notified / expired / active 상태를 계산한다', async () => {
    const repo = makeRepo({
      listRecentByUser: jest.fn().mockResolvedValue([
        { ...base, id: 'active' },
        { ...base, id: 'notified', notifiedAt: new Date('2026-10-29T00:30:00Z') },
        { ...base, id: 'expired', slotTime: '09:30' },
        { ...base, id: 'boundary', slotTime: '10:00' },          // 지금 정각 → 지난 것
        { ...base, id: 'yesterday', slotDate: '2026-10-28', slotTime: '23:30' },
      ]),
    });
    const { alerts } = await new ListSlotAlertsUseCase(repo, now).execute('u1');
    const byId = Object.fromEntries(alerts.map((a) => [a.id, a]));

    expect(byId.active).toEqual({
      id: 'active', shopId: 'shop-1', shopName: '모아래쉬', shopRegion: '강남구', shopPhoto: 'https://img/1.jpg',
      date: '2026-10-29', time: '14:00', status: 'active', endedReason: null, notifiedAt: null,
      createdAt: '2026-10-28T03:00:00.000Z',
    });
    expect(byId.notified).toMatchObject({ status: 'ended', endedReason: 'notified', notifiedAt: '2026-10-29T00:30:00.000Z' });
    expect(byId.expired).toMatchObject({ status: 'ended', endedReason: 'expired', notifiedAt: null });
    expect(byId.boundary).toMatchObject({ status: 'ended', endedReason: 'expired' });
    expect(byId.yesterday).toMatchObject({ status: 'ended', endedReason: 'expired' });
    expect(alerts.map((a) => a.id)).toEqual(['active', 'notified', 'expired', 'boundary', 'yesterday']); // repo 순서 유지
  });

  it('샵 정보가 없으면 shopName은 빈 문자열', async () => {
    const repo = makeRepo({ listRecentByUser: jest.fn().mockResolvedValue([{ ...base, shopName: null, shopPhoto: null, shopRegion: null }]) });
    const { alerts } = await new ListSlotAlertsUseCase(repo, now).execute('u1');
    expect(alerts[0]).toMatchObject({ shopName: '', shopPhoto: null, shopRegion: null });
  });
});

describe('DeleteSlotAlertsUseCase', () => {
  const id1 = '11111111-1111-4111-8111-111111111111';
  const id2 = '22222222-2222-4222-8222-222222222222';

  it('호출자 userId로 범위를 제한해 삭제한다', async () => {
    const repo = makeRepo();
    await new DeleteSlotAlertsUseCase(repo).execute('u1', [id1, id2, id1]);
    expect(repo.deleteMany).toHaveBeenCalledWith('u1', [id1, id2]);
  });

  it('빈 배열이면 아무것도 하지 않는다', async () => {
    const repo = makeRepo();
    await new DeleteSlotAlertsUseCase(repo).execute('u1', []);
    expect(repo.deleteMany).not.toHaveBeenCalled();
  });

  it.each([[undefined], ['abc'], [['not-a-uuid']], [[123]]])('잘못된 ids(%p) → VALIDATION_ERROR', async (ids) => {
    const repo = makeRepo();
    await expect(new DeleteSlotAlertsUseCase(repo).execute('u1', ids))
      .rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
    expect(repo.deleteMany).not.toHaveBeenCalled();
  });
});
