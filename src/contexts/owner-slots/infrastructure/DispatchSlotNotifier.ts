import { ISlotNotifier } from '../ports/IOwnerSlotRepository';
import { DispatchSlotNotificationsUseCase } from '../../notification/application/DispatchSlotNotificationsUseCase';

/** owner-slots의 ISlotNotifier ↔ notification 컨텍스트의 dispatch 유스케이스 연결 */
export class DispatchSlotNotifier implements ISlotNotifier {
  constructor(private readonly dispatchUC: DispatchSlotNotificationsUseCase) {}

  async dispatch(event: {
    shopId: string; shopName: string; shopLat: number | null; shopLng: number | null;
    slotDate: string; slotTime: string;
  }): Promise<{ dispatched: number }> {
    // 오늘/내일/모레 모두 발송 (todayOnly=false)
    return this.dispatchUC.execute([event], false);
  }
}
