import { GetNotificationsUseCase } from '../application/GetNotificationsUseCase';
import { INotificationRepository } from '../ports/INotificationRepository';
import { Notification } from '../domain/Notification';

const mockNotifs: Notification[] = [
  { id: 'n1', userId: 'u1', shopId: 's1', shopName: '테스트샵', type: 'favorite', slotTime: '14:00', slotDate: '2025-01-01', readAt: null, createdAt: new Date() },
];

function makeRepo(): INotificationRepository {
  return {
    findTodayByUser: jest.fn().mockResolvedValue(mockNotifs),
    insert: jest.fn(),
    markRead: jest.fn(),
    getSettings: jest.fn(),
    upsertSettings: jest.fn(),
    findFavoriteTargets: jest.fn(),
    findNearbyTargets: jest.fn(),
  };
}

describe('GetNotificationsUseCase', () => {
  it('오늘 알림 목록을 반환한다', async () => {
    const useCase = new GetNotificationsUseCase(makeRepo());
    const result = await useCase.execute('u1');
    expect(result).toBe(mockNotifs);
  });

  it('알림이 없으면 빈 배열을 반환한다', async () => {
    const repo = makeRepo();
    (repo.findTodayByUser as jest.Mock).mockResolvedValue([]);
    const result = await new GetNotificationsUseCase(repo).execute('u1');
    expect(result).toEqual([]);
  });
});
