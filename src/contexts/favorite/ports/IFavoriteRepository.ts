import { Favorite } from '../domain/Favorite';

export interface IFavoriteRepository {
  findByUser(userId: string): Promise<Favorite[]>;
  exists(userId: string, shopId: string): Promise<boolean>;
  add(userId: string, shopId: string, shopName: string, shopRegion: string | null): Promise<Favorite>;
  remove(userId: string, shopId: string): Promise<void>;
}
