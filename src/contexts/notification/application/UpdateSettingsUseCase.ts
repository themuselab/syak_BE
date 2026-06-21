import { INotificationRepository } from '../ports/INotificationRepository';
import { NotificationSettings, UpdateNotificationSettingsInput } from '../domain/NotificationSettings';
import { Errors } from '../../../shared/errors/AppError';

export class UpdateSettingsUseCase {
  constructor(private readonly notifRepo: INotificationRepository) {}

  async execute(userId: string, input: UpdateNotificationSettingsInput): Promise<NotificationSettings> {
    if (input.radiusKm !== undefined && (input.radiusKm < 1 || input.radiusKm > 10)) {
      throw Errors.validation({ radiusKm: '알림 반경은 1km ~ 10km 사이여야 합니다' });
    }
    return this.notifRepo.upsertSettings(userId, input);
  }
}
