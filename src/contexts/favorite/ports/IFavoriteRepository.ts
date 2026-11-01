import { Favorite } from '../domain/Favorite';

export interface IFavoriteRepository {
  findByUser(userId: string): Promise<Favorite[]>;
  exists(userId: string, shopId: string): Promise<boolean>;
  add(userId: string, shopId: string, shopName: string, shopRegion: string | null): Promise<Favorite>;
  remove(userId: string, shopId: string): Promise<void>;
  /** 추가/해제 이력(favorite_events) 1행 기록 — 추적용. 호출부는 fire-and-forget */
  recordEvent(userId: string, shopId: string, action: FavoriteAction): Promise<void>;
}

export type FavoriteAction = 'add' | 'remove';
