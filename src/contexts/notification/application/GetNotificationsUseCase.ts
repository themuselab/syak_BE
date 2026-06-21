import { INotificationRepository } from '../ports/INotificationRepository';
import { Notification } from '../domain/Notification';

export class GetNotificationsUseCase {
  constructor(private readonly notifRepo: INotificationRepository) {}

  async execute(userId: string): Promise<Notification[]> {
    return this.notifRepo.findTodayByUser(userId);
  }
}
