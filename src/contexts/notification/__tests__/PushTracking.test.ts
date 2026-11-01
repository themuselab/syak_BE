import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { DispatchSlotNotificationsUseCase } from '../application/DispatchSlotNotificationsUseCase';
import { MarkReadUseCase } from '../application/MarkReadUseCase';
import { NotificationController } from '../interface/NotificationController';
import { PgNotificationRepository } from '../infrastructure/PgNotificationRepository';
import { INotificationRepository } from '../ports/INotificationRepository';
import { IPushService } from '../ports/IPushService';
import { kstNow } from '../domain/SlotAlert';
import { ErrorCode } from '../../../shared/errors/ErrorCode';

const TODAY = kstNow().date;
const event = { shopId: 'shop-1', shopName: '태닝나우', shopLat: 37.5, shopLng: 127.0, slotDate: TODAY, slotTime: '14:00' };
const NOTIF_ID = '11111111-2222-4333-8444-555555555555';
const flush = () => new Promise((r) => setImmediate(r));

function makeRepo(over: Partial<INotificationRepository> = {}): INotificationRepository {
  return {
    findTodayByUser: jest.fn(),
    insert: jest.fn().mockResolvedValue({ id: NOTIF_ID }),
    markRead: jest.fn(),
    markShopRead: jest.fn(),
    markPushed: jest.fn().mockResolvedValue(undefined),
    markOpened: jest.fn().mockResolvedValue(undefined),
    getSettings: jest.fn(),
    upsertSettings: jest.fn(),
    findFavoriteTargets: jest.fn().mockResolvedValue([{ userId: 'user-1', fcmToken: 'token-1', type: 'favorite' }]),
    findNearbyTargets: jest.fn().mockResolvedValue([]),
    ...over,
  };
}
function makePush(accepted: boolean): IPushService {
  return { send: jest.fn().mockResolvedValue(accepted), sendBatch: jest.fn() };
}

describe('푸시 추적 — dispatch', () => {
  it('push data 에 저장된 알림 id(notificationId)를 기존 필드와 함께 넣는다', async () => {
    const push = makePush(true);
    await new DispatchSlotNotificationsUseCase(makeRepo(), push).execute([event]);
    expect(push.send).toHaveBeenCalledWith('token-1', expect.objectContaining({
      data: { shopId: 'shop-1', slotDate: TODAY, slotTime: '14:00', notificationId: NOTIF_ID },
    }));
  });

  it('Expo 가 접수(true)하면 pushed_at 을 기록한다', async () => {
    const repo = makeRepo();
    await new DispatchSlotNotificationsUseCase(repo, makePush(true)).execute([event]);
    await flush();
    expect(repo.markPushed).toHaveBeenCalledWith(NOTIF_ID);
  });

  it('Expo 접수 실패(false)·예외면 pushed_at 을 기록하지 않는다', async () => {
    const repo = makeRepo();
    await new DispatchSlotNotificationsUseCase(repo, makePush(false)).execute([event]);
    const push = makePush(true);
    (push.send as jest.Mock).mockRejectedValue(new Error('down'));
    await new DispatchSlotNotificationsUseCase(repo, push).execute([event]);
    await flush();
    expect(repo.markPushed).not.toHaveBeenCalled();
  });

  it('markPushed 실패는 dispatch 결과에 영향 없다', async () => {
    const repo = makeRepo({ markPushed: jest.fn().mockRejectedValue(new Error('no column')) });
    const result = await new DispatchSlotNotificationsUseCase(repo, makePush(true)).execute([event]);
    await flush();
    expect(result.dispatched).toBe(1);
  });
});

describe('PATCH /notifications/:id/opened', () => {
  function makeCtrl(repo: INotificationRepository) {
    const noop = { execute: jest.fn() } as never;
    return new NotificationController(noop, noop, noop, noop, new MarkReadUseCase(repo), noop, noop, noop);
  }
  function makeRes() {
    const res = { status: jest.fn(), send: jest.fn(), json: jest.fn() } as unknown as Response;
    (res.status as jest.Mock).mockReturnValue(res);
    return res;
  }
  const req = (id: string) => ({ params: { id }, user: { sub: 'u1' } } as unknown as Request);

  it('여러 번 불러도 매번 204 (멱등)', async () => {
    const repo = makeRepo();
    const ctrl = makeCtrl(repo);
    for (let i = 0; i < 2; i++) {
      const res = makeRes();
      const next = jest.fn() as NextFunction;
      await ctrl.markOpened(req(NOTIF_ID), res, next);
      expect(res.status).toHaveBeenCalledWith(204);
      expect(next).not.toHaveBeenCalled();
    }
    expect(repo.markOpened).toHaveBeenCalledWith(NOTIF_ID, 'u1');
  });

  it('UUID 가 아니면 VALIDATION_ERROR', async () => {
    const repo = makeRepo();
    const next = jest.fn() as NextFunction;
    await makeCtrl(repo).markOpened(req('abc'), makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: ErrorCode.VALIDATION_ERROR }));
    expect(repo.markOpened).not.toHaveBeenCalled();
  });

  it('SQL 은 opened_at/read_at 을 비어 있을 때만 채우고 본인 알림만 갱신한다', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    await new PgNotificationRepository({ query } as unknown as Pool).markOpened(NOTIF_ID, 'u1');
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/opened_at = COALESCE\(opened_at, NOW\(\)\)/);
    expect(sql).toMatch(/read_at = COALESCE\(read_at, NOW\(\)\)/);
    expect(sql).toMatch(/user_id = \$2/);
    expect(params).toEqual([NOTIF_ID, 'u1']);
  });
});

describe('region_set_at', () => {
  const settingsRow = (region: string | null) => ({ user_id: 'u1', region_code: region, region_name: region });

  it('관심 동네가 바뀌면 region_set_at 을 갱신한다', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [settingsRow(null)] })
      .mockResolvedValueOnce({ rows: [settingsRow('1168010100')] })
      .mockResolvedValueOnce({ rows: [] });
    await new PgNotificationRepository({ query } as unknown as Pool)
      .upsertSettings('u1', { regionCode: '1168010100', regionName: '역삼동' });
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[2][0]).toMatch(/region_set_at = NOW\(\)/);
  });

  it('같은 동네를 다시 저장하면 갱신하지 않는다', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [settingsRow('1168010100')] })
      .mockResolvedValueOnce({ rows: [settingsRow('1168010100')] });
    await new PgNotificationRepository({ query } as unknown as Pool)
      .upsertSettings('u1', { regionCode: '1168010100', regionName: '역삼동' });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('region_set_at 갱신 실패해도 설정 저장은 성공한다', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [settingsRow(null)] })
      .mockResolvedValueOnce({ rows: [settingsRow('1168010100')] })
      .mockRejectedValueOnce(new Error('column "region_set_at" does not exist'));
    const s = await new PgNotificationRepository({ query } as unknown as Pool)
      .upsertSettings('u1', { regionCode: '1168010100' });
    expect(s.regionCode).toBe('1168010100');
  });
});
