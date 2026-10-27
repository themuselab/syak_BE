import { UpdateSettingsUseCase } from '../application/UpdateSettingsUseCase';
import { INotificationRepository, DispatchTarget } from '../ports/INotificationRepository';
import { NotificationSettings } from '../domain/NotificationSettings';
import { ErrorCode } from '../../../shared/errors/ErrorCode';

const mockSettings: NotificationSettings = {
  userId: 'user-1', nearEnabled: true, nearLat: 37.5, nearLng: 127.0,
  radiusKm: 3, regionCode: null, regionName: null, favoriteEnabled: true, shopNewsEnabled: false, fcmToken: null, updatedAt: new Date(),
};

function makeRepo(): INotificationRepository {
  return {
    findTodayByUser: jest.fn(),
    insert: jest.fn(),
    markRead: jest.fn(),
    getSettings: jest.fn().mockResolvedValue(null),
    upsertSettings: jest.fn().mockResolvedValue(mockSettings),
    findFavoriteTargets: jest.fn(),
    findNearbyTargets: jest.fn(),
  };
}

describe('UpdateSettingsUseCase', () => {
  it('유효한 설정으로 업데이트한다', async () => {
    const useCase = new UpdateSettingsUseCase(makeRepo());
    const result = await useCase.execute('user-1', { radiusKm: 5 });
    expect(result).toBe(mockSettings);
  });

  it('관심 동네 없이 온 GPS 좌표는 저장하지 않는다(구버전 앱 내 주변 알림)', async () => {
    const repo = makeRepo();
    const useCase = new UpdateSettingsUseCase(repo);
    await useCase.execute('user-1', { nearEnabled: true, nearLat: 37.51, nearLng: 127.02, favoriteEnabled: true });
    expect(repo.upsertSettings).toHaveBeenCalledWith('user-1', { favoriteEnabled: true });
  });

  it('관심 동네와 함께 온 중심 좌표는 저장한다', async () => {
    const repo = makeRepo();
    const useCase = new UpdateSettingsUseCase(repo);
    const input = { regionCode: '1168064000', regionName: '역삼동', nearEnabled: true, nearLat: 37.5, nearLng: 127.03, radiusKm: 2 };
    await useCase.execute('user-1', input);
    expect(repo.upsertSettings).toHaveBeenCalledWith('user-1', input);
  });

  it('반경이 1 미만이면 VALIDATION_ERROR를 던진다', async () => {
    const useCase = new UpdateSettingsUseCase(makeRepo());
    await expect(useCase.execute('user-1', { radiusKm: 0 }))
      .rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
  });

  it('반경이 10 초과이면 VALIDATION_ERROR를 던진다', async () => {
    const useCase = new UpdateSettingsUseCase(makeRepo());
    await expect(useCase.execute('user-1', { radiusKm: 11 }))
      .rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
  });
});
