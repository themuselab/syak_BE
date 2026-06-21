import { UpdateSettingsUseCase } from '../application/UpdateSettingsUseCase';
import { INotificationRepository, DispatchTarget } from '../ports/INotificationRepository';
import { NotificationSettings } from '../domain/NotificationSettings';
import { ErrorCode } from '../../../shared/errors/ErrorCode';

const mockSettings: NotificationSettings = {
  userId: 'user-1', nearEnabled: true, nearLat: 37.5, nearLng: 127.0,
  radiusKm: 3, favoriteEnabled: true, shopNewsEnabled: false, fcmToken: null, updatedAt: new Date(),
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
