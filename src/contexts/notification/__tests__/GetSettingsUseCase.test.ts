import { GetSettingsUseCase } from '../application/GetSettingsUseCase';
import { INotificationRepository } from '../ports/INotificationRepository';
import { NotificationSettings } from '../domain/NotificationSettings';

const mockSettings: NotificationSettings = {
  userId: 'u1', nearEnabled: true, nearLat: null, nearLng: null,
  radiusKm: 3, favoriteEnabled: true, shopNewsEnabled: false, fcmToken: null, updatedAt: new Date(),
};

function makeRepo(settings: NotificationSettings | null = mockSettings): INotificationRepository {
  return {
    findTodayByUser: jest.fn(),
    insert: jest.fn(),
    markRead: jest.fn(),
    getSettings: jest.fn().mockResolvedValue(settings),
    upsertSettings: jest.fn().mockResolvedValue(mockSettings),
    findFavoriteTargets: jest.fn(),
    findNearbyTargets: jest.fn(),
  };
}

describe('GetSettingsUseCase', () => {
  it('기존 설정이 있으면 반환한다', async () => {
    const useCase = new GetSettingsUseCase(makeRepo());
    const result = await useCase.execute('u1');
    expect(result).toBe(mockSettings);
  });

  it('설정이 없으면 기본값으로 upsert하고 반환한다', async () => {
    const repo = makeRepo(null);
    const useCase = new GetSettingsUseCase(repo);
    await useCase.execute('u1');
    expect(repo.upsertSettings).toHaveBeenCalledWith('u1', {});
  });
});
