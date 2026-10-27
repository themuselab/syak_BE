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
    // 기준점 좌표는 관심 동네와 함께 올 때만 저장한다. 구버전 앱의 "내 주변 알림"은 기기 GPS를 보내는데,
    // 서버에 GPS를 남기지 않기로 했다(위치기반서비스 신고 검토, 2026-10-27) → 좌표·켜기만 무시.
    if (!input.regionCode && (input.nearLat !== undefined || input.nearLng !== undefined)) {
      const { nearLat: _lat, nearLng: _lng, nearEnabled: _on, ...rest } = input;
      input = rest;
    }
    return this.notifRepo.upsertSettings(userId, input);
  }
}
