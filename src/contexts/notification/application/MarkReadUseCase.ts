import { INotificationRepository } from '../ports/INotificationRepository';

export class MarkReadUseCase {
  constructor(private readonly notifRepo: INotificationRepository) {}

  async execute(notificationId: string, userId: string): Promise<void> {
    await this.notifRepo.markRead(notificationId, userId);
  }
}
