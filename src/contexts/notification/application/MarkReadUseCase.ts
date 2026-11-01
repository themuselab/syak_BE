import { INotificationRepository } from '../ports/INotificationRepository';

export class MarkReadUseCase {
  constructor(private readonly notifRepo: INotificationRepository) {}

  async execute(notificationId: string, userId: string): Promise<void> {
    await this.notifRepo.markRead(notificationId, userId);
  }

  /** 푸시 탭으로 열림(opened_at, 멱등) */
  async executeOpened(notificationId: string, userId: string): Promise<void> {
    await this.notifRepo.markOpened(notificationId, userId);
  }

  async executeShop(shopId: string, userId: string): Promise<void> {
    await this.notifRepo.markShopRead(shopId, userId);
  }
}
