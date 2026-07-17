import { DispatchSlotNotificationsUseCase } from '../application/DispatchSlotNotificationsUseCase';
import { INotificationRepository, DispatchTarget } from '../ports/INotificationRepository';
import { IPushService } from '../ports/IPushService';

const favTarget: DispatchTarget = { userId: 'user-1', fcmToken: 'token-1', type: 'favorite' };
const nearTarget: DispatchTarget = { userId: 'user-2', fcmToken: 'token-2', type: 'near' };

function makeRepo(favTargets: DispatchTarget[] = [], nearTargets: DispatchTarget[] = []): INotificationRepository {
  return {
    findTodayByUser: jest.fn(),
    insert: jest.fn().mockResolvedValue({}),
    markRead: jest.fn(),
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

// dispatch는 todayOnly=true 로 '오늘' 슬롯만 처리하므로 날짜를 오늘로 고정
const TODAY = new Date().toISOString().slice(0, 10);
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

  it('이벤트가 없으면 dispatched=0을 반환한다', async () => {
    const useCase = new DispatchSlotNotificationsUseCase(makeRepo(), makePush());
    const result = await useCase.execute([]);
    expect(result.dispatched).toBe(0);
  });
});
