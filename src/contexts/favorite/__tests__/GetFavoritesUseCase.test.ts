import { GetFavoritesUseCase } from '../application/GetFavoritesUseCase';
import { IFavoriteRepository } from '../ports/IFavoriteRepository';
import { Favorite } from '../domain/Favorite';

const mockFavs: Favorite[] = [
  { id: 'f1', userId: 'u1', shopId: 's1', shopName: '테스트샵', shopRegion: '강남', createdAt: new Date() },
];

function makeRepo(): IFavoriteRepository {
  return {
    findByUser: jest.fn().mockResolvedValue(mockFavs),
    exists: jest.fn(),
    add: jest.fn(),
    remove: jest.fn(),
  };
}

describe('GetFavoritesUseCase', () => {
  it('유저의 즐겨찾기 목록을 반환한다', async () => {
    const useCase = new GetFavoritesUseCase(makeRepo());
    const result = await useCase.execute('u1');
    expect(result).toBe(mockFavs);
  });

  it('빈 목록도 정상 반환한다', async () => {
    const repo = makeRepo();
    (repo.findByUser as jest.Mock).mockResolvedValue([]);
    const useCase = new GetFavoritesUseCase(repo);
    const result = await useCase.execute('u1');
    expect(result).toEqual([]);
  });
});
