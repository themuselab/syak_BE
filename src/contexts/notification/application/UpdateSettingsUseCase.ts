import { INotificationRepository } from '../ports/INotificationRepository';
import { NotificationSettings, UpdateNotificationSettingsInput } from '../domain/NotificationSettings';
import { Errors } from '../../../shared/errors/AppError';

export class UpdateSettingsUseCase {
  constructor(private readonly notifRepo: INotificationRepository) {}

  async execute(userId: string, input: UpdateNotificationSettingsInput): Promise<NotificationSettings> {
    if (input.radiusKm !== undefined && (input.radiusKm < 1 || input.radiusKm > 10)) {
      throw Errors.validation({ radiusKm: '알림 반경은 1km ~ 10km 사이여야 합니다' });
    }
    if (input.regionName !== undefined && input.regionName !== null
        && (typeof input.regionName !== 'string' || input.regionName.length > 40)) {
      throw Errors.validation({ regionName: '관심 동네 이름이 올바르지 않습니다' });
    }
    if (input.regionCode !== undefined && input.regionCode !== null
        && (typeof input.regionCode !== 'string' || input.regionCode.length > 40)) {
      throw Errors.validation({ regionCode: '관심 동네 코드가 올바르지 않습니다' });
    }
    return this.notifRepo.upsertSettings(userId, input);
  }
}
