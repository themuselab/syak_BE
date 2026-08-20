export interface FavoriteCustomer {
  id: string;
  nickname: string | null;
  profileImage: string | null;
}

export interface DashboardCore {
  todayRegistered: number;
  notificationsSentToday: number;
  reservedCount: number;      // 이번 주 예약 전환
  reservedDeltaWeek: number;  // vs 지난주
  recoveredRevenue: number;   // 이번 주 회수 매출(SUM reserved_amount)
  favoritesCount: number;
  favoritesDeltaWeek: number;
  favoritesRecent: FavoriteCustomer[];
}

export interface OwnerProfile {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  nickname: string | null;
  profileImage: string | null;
}

export interface OwnerNotif {
  id: string;
  kind: 'dispatched' | 'reserved' | 'expired';
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface IOwnerDashboardRepository {
  reconcileExpired(shopId: string, ownerId: string): Promise<void>;
  getCore(shopId: string, ownerId: string): Promise<DashboardCore>;
  listNotifications(ownerId: string): Promise<{ items: OwnerNotif[]; unread: number }>;
  markNotifRead(id: string, ownerId: string): Promise<void>;
  getProfile(ownerId: string): Promise<OwnerProfile | null>;
  updateProfile(ownerId: string, patch: { name?: string; phone?: string; email?: string }): Promise<OwnerProfile>;
}
