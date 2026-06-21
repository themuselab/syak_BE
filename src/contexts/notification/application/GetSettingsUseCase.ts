import { INotificationRepository } from '../ports/INotificationRepository';
import { NotificationSettings } from '../domain/NotificationSettings';

export class GetSettingsUseCase {
  constructor(private readonly notifRepo: INotificationRepository) {}

  async execute(userId: string): Promise<NotificationSettings> {
    const settings = await this.notifRepo.getSettings(userId);
    if (settings) return settings;
    // Return defaults for users who haven't touched settings yet
    return await this.notifRepo.upsertSettings(userId, {});
  }
}
