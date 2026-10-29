import { DispatchSlotNotificationsUseCase } from '../application/DispatchSlotNotificationsUseCase';
import { INotificationRepository, DispatchTarget } from '../ports/INotificationRepository';
import { IPushService } from '../ports/IPushService';
import { ISlotAlertRepository } from '../ports/ISlotAlertRepository';
import { SlotAlertMatch, kstNow, addDays } from '../domain/SlotAlert';

const favTarget: DispatchTarget = { userId: 'user-1', fcmToken: 'token-1', type: 'favorite' };
const nearTarget: DispatchTarget = { userId: 'user-2', fcmToken: 'token-2', type: 'near' };

function makeRepo(favTargets: DispatchTarget[] = [], nearTargets: DispatchTarget[] = []): INotificationRepository {
  return {
    findTodayByUser: jest.fn(),
    insert: jest.fn().mockResolvedValue({}),
    markRead: jest.fn(),
    markShopRead: jest.fn(),
    getSettings: jest.fn(),
    upsertSettings: jest.fn(),
    findFavoriteTargets: jest.fn().mockResolvedValue(favTargets),
    findNearbyTargets: jest.fn().mockResolvedValue(nearTargets),
  };
}

function makePush(): IPushService {
  return {
    send: jest.fn().mockResolvedValue(undefined),
    sendBatch: jest.fn().mockResolvedValue(undefined),
  };
}

// dispatch는 todayOnly=true 로 '오늘(KST)' 슬롯만 처리하므로 날짜를 오늘로 고정
const TODAY = kstNow().date;
const event = { shopId: 'shop-1', shopName: '태닝나우', shopLat: 37.5, shopLng: 127.0, slotDate: TODAY, slotTime: '14:00' };

describe('DispatchSlotNotificationsUseCase', () => {
  it('즐겨찾기 대상자에게 푸시를 발송한다', async () => {
    const push = makePush();
    const useCase = new DispatchSlotNotificationsUseCase(makeRepo([favTarget]), push);
    const result = await useCase.execute([event]);
    expect(push.send).toHaveBeenCalledWith('token-1', expect.objectContaining({ title: '태닝나우에 빈자리가 생겼어요!' }));
    expect(result.dispatched).toBe(1);
  });

  it('같은 유저가 즐겨찾기+주변 둘 다 해당해도 한 번만 발송한다', async () => {
    const duplicateNear: DispatchTarget = { userId: 'user-1', fcmToken: 'token-1', type: 'near' };
    const push = makePush();
    const useCase = new DispatchSlotNotificationsUseCase(makeRepo([favTarget], [duplicateNear]), push);
    const result = await useCase.execute([event]);
    expect(push.send).toHaveBeenCalledTimes(1);
    expect(result.dispatched).toBe(1);
  });

  it('push 발송 실패해도 다른 대상자에게는 계속 발송한다', async () => {
    const push = makePush();
    (push.send as jest.Mock)
      .mockRejectedValueOnce(new Error('FCM error'))
      .mockResolvedValue(undefined);
    const useCase = new DispatchSlotNotificationsUseCase(makeRepo([favTarget, nearTarget]), push);
    const result = await useCase.execute([event]);
    expect(push.send).toHaveBeenCalledTimes(2);
    // dispatched = 저장된 알림 수. push 실패는 로깅만 하고 알림은 저장되므로 2가 맞다.
    expect(result.dispatched).toBe(2);
  });

  it('같은 샵의 빈자리 여러 개는 알림 1개로 묶는다', async () => {
    const repo = makeRepo([favTarget]);
    const push = makePush();
    const useCase = new DispatchSlotNotificationsUseCase(repo, push);
    const result = await useCase.execute([
      { ...event, slotTime: '12:00' },
      { ...event, slotTime: '10:00' },
      { ...event, slotTime: '11:00' },
      { ...event, slotTime: '10:00' },
    ]);
    expect(push.send).toHaveBeenCalledTimes(1);
    expect(push.send).toHaveBeenCalledWith('token-1', expect.objectContaining({ body: '오늘 10:00 · 11:00 · 12:00 예약 가능' }));
    expect(repo.insert).toHaveBeenCalledWith(expect.objectContaining({ slotTime: '10:00 외 2개' }));
    expect(result.dispatched).toBe(1);
  });

  it('4개 이상이면 앞 3개만 보여주고 나머지는 개수로', async () => {
    const repo = makeRepo([favTarget]);
    const push = makePush();
    const useCase = new DispatchSlotNotificationsUseCase(repo, push);
    await useCase.execute(['10:00', '11:00', '12:00', '13:00', '14:00'].map((t) => ({ ...event, slotTime: t })));
    expect(push.send).toHaveBeenCalledWith('token-1', expect.objectContaining({ body: '오늘 10:00 · 11:00 · 12:00 외 2개 예약 가능' }));
  });

  it('샵이 다르면 샵마다 따로 보낸다', async () => {
    const repo = makeRepo([favTarget]);
    const push = makePush();
    const useCase = new DispatchSlotNotificationsUseCase(repo, push);
    await useCase.execute([event, { ...event, shopId: 'shop-2', shopName: '다른샵' }]);
    expect(push.send).toHaveBeenCalledTimes(2);
  });

  it('이벤트가 없으면 dispatched=0을 반환한다', async () => {
    const useCase = new DispatchSlotNotificationsUseCase(makeRepo(), makePush());
    const result = await useCase.execute([]);
    expect(result.dispatched).toBe(0);
  });
  it('todayOnly면 내일 슬롯은 즐겨찾기 대상에게 보내지 않는다', async () => {
    const repo = makeRepo([favTarget]);
    const push = makePush();
    await new DispatchSlotNotificationsUseCase(repo, push).execute([{ ...event, slotDate: addDays(TODAY, 1) }]);
    expect(push.send).not.toHaveBeenCalled();
    expect(repo.findFavoriteTargets).not.toHaveBeenCalled();
  });
});

function makeAlertRepo(matches: SlotAlertMatch[] = []): ISlotAlertRepository {
  return {
    shopExists: jest.fn(),
    createMany: jest.fn(),
    listRecentByUser: jest.fn(),
    deleteMany: jest.fn(),
    findActiveMatches: jest.fn().mockResolvedValue(matches),
    markNotified: jest.fn().mockResolvedValue(undefined),
  };
}

describe('DispatchSlotNotificationsUseCase — 빈자리 알림 신청', () => {
  const alertMatch = (o: Partial<SlotAlertMatch> = {}): SlotAlertMatch => ({
    alertId: 'a-1', userId: 'user-9', fcmToken: 'token-9', slotDate: TODAY, slotTime: '14:00', ...o,
  });

  it('신청만 한 유저에게 신청 문구로 보내고 신청을 종료 처리한다', async () => {
    const repo = makeRepo();
    const push = makePush();
    const alerts = makeAlertRepo([alertMatch()]);
    const result = await new DispatchSlotNotificationsUseCase(repo, push, alerts).execute([event]);

    expect(alerts.findActiveMatches).toHaveBeenCalledWith('shop-1', [{ date: TODAY, time: '14:00' }]);
    expect(push.send).toHaveBeenCalledWith('token-9', {
      title: '태닝나우에 빈자리가 생겼어요!',
      body: '신청하신 오늘 14:00 자리가 났어요',
      data: { shopId: 'shop-1', slotDate: TODAY, slotTime: '14:00' },
    });
    expect(repo.insert).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-9', type: 'alert', slotTime: '14:00' }));
    expect(alerts.markNotified).toHaveBeenCalledWith(['a-1']);
    expect(result.dispatched).toBe(1);
  });

  it('즐겨찾기+신청 같은 유저는 푸시 1번(신청 문구)만, 신청은 종료', async () => {
    const repo = makeRepo([favTarget]);
    const push = makePush();
    const alerts = makeAlertRepo([
      alertMatch({ alertId: 'a-1', userId: 'user-1', fcmToken: 'token-1', slotTime: '10:00' }),
      alertMatch({ alertId: 'a-2', userId: 'user-1', fcmToken: 'token-1', slotTime: '10:30' }),
    ]);
    const result = await new DispatchSlotNotificationsUseCase(repo, push, alerts).execute([
      { ...event, slotTime: '10:00' }, { ...event, slotTime: '10:30' }, { ...event, slotTime: '11:00' },
    ]);
    expect(push.send).toHaveBeenCalledTimes(1);
    expect(push.send).toHaveBeenCalledWith('token-1', expect.objectContaining({ body: '신청하신 오늘 10:00 · 10:30 자리가 났어요' }));
    expect(repo.insert).toHaveBeenCalledTimes(1);
    expect(repo.insert).toHaveBeenCalledWith(expect.objectContaining({ type: 'alert', slotTime: '10:00 외 1개' }));
    expect(alerts.markNotified).toHaveBeenCalledWith(['a-1', 'a-2']);
    expect(result.dispatched).toBe(1);
  });

  it('즐겨찾기 유저와 신청 유저가 다르면 각자 문구로 1번씩', async () => {
    const push = makePush();
    const alerts = makeAlertRepo([alertMatch()]);
    await new DispatchSlotNotificationsUseCase(makeRepo([favTarget]), push, alerts).execute([event]);
    expect(push.send).toHaveBeenCalledTimes(2);
    expect(push.send).toHaveBeenCalledWith('token-1', expect.objectContaining({ body: '오늘 14:00 예약 가능' }));
    expect(push.send).toHaveBeenCalledWith('token-9', expect.objectContaining({ body: '신청하신 오늘 14:00 자리가 났어요' }));
  });

  it('todayOnly여도 내일 슬롯 신청은 매칭해서 보낸다(날짜 라벨 내일)', async () => {
    const tomorrow = addDays(TODAY, 1);
    const repo = makeRepo([favTarget]);
    const push = makePush();
    const alerts = makeAlertRepo([alertMatch({ slotDate: tomorrow })]);
    await new DispatchSlotNotificationsUseCase(repo, push, alerts).execute([{ ...event, slotDate: tomorrow }]);
    expect(repo.findFavoriteTargets).not.toHaveBeenCalled();
    expect(push.send).toHaveBeenCalledTimes(1);
    expect(push.send).toHaveBeenCalledWith('token-9', expect.objectContaining({ body: '신청하신 내일 14:00 자리가 났어요' }));
    expect(alerts.markNotified).toHaveBeenCalledWith(['a-1']);
  });

  it('푸시 실패·토큰 없음이어도 신청은 종료 처리한다', async () => {
    const push = makePush();
    (push.send as jest.Mock).mockRejectedValue(new Error('push down'));
    const alerts = makeAlertRepo([
      alertMatch({ alertId: 'a-1', userId: 'u-a' }),
      alertMatch({ alertId: 'a-2', userId: 'u-b', fcmToken: null }),
    ]);
    await new DispatchSlotNotificationsUseCase(makeRepo(), push, alerts).execute([event]);
    expect(push.send).toHaveBeenCalledTimes(1); // 토큰 없는 유저는 푸시 생략
    expect(alerts.markNotified).toHaveBeenCalledWith(['a-1', 'a-2']);
  });

  it('신청 매칭이 없으면 markNotified를 부르지 않는다', async () => {
    const alerts = makeAlertRepo([]);
    await new DispatchSlotNotificationsUseCase(makeRepo([favTarget]), makePush(), alerts).execute([event]);
    expect(alerts.markNotified).not.toHaveBeenCalled();
  });
});
