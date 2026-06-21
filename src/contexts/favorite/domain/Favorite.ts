export interface Favorite {
  id: string;
  userId: string;
  shopId: string;
  shopName: string;
  shopRegion: string | null;
  createdAt: Date;
}
