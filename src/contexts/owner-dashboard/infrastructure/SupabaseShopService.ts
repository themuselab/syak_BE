import type { SupabaseClient } from '@supabase/supabase-js';
import { IShopInfoProvider } from '../../owner-slots/ports/IOwnerSlotRepository';

export interface ShopInfo {
  shopId: string;
  name: string;
  address: string;
  category: string | null;
  serviceItems: string[]; // detail.owner_service_items (세부 시술 항목)
}

/**
 * 샵 정보(Supabase). 알림용 기본정보(IShopInfoProvider) + 매장정보 조회/수정.
 * Supabase 정지(402) 시 예외를 던지므로 호출측에서 graceful 처리한다.
 */
export class SupabaseShopService implements IShopInfoProvider {
  constructor(private readonly sb: SupabaseClient) {}

  async getBasic(shopId: string): Promise<{ name: string; lat: number | null; lng: number | null } | null> {
    const { data, error } = await this.sb.from('shops').select('name, lat, lng').eq('id', shopId).single();
    if (error || !data) return null;
    return { name: String(data.name ?? '내 매장'), lat: data.lat ?? null, lng: data.lng ?? null };
  }

  async getInfo(shopId: string): Promise<ShopInfo> {
    const { data, error } = await this.sb
      .from('shops').select('id, name, road_address, category, detail').eq('id', shopId).single();
    if (error || !data) throw new Error(error?.message ?? 'shop not found');
    const detail = (data.detail ?? {}) as Record<string, unknown>;
    return {
      shopId: data.id as string,
      name: String(data.name ?? ''),
      address: String((data.road_address as string) ?? ''),
      category: (data.category as string) ?? null,
      serviceItems: Array.isArray(detail.owner_service_items) ? (detail.owner_service_items as string[]) : [],
    };
  }

  async updateInfo(
    shopId: string,
    patch: { name?: string; address?: string; serviceItems?: string[] },
  ): Promise<ShopInfo> {
    // detail JSONB 병합을 위해 현재 detail을 읽어온다
    const { data: cur, error: readErr } = await this.sb.from('shops').select('detail').eq('id', shopId).single();
    if (readErr) throw new Error(readErr.message);
    const detail = { ...(cur?.detail ?? {}) } as Record<string, unknown>;
    if (patch.serviceItems !== undefined) {
      detail.owner_service_items = patch.serviceItems.map(s => s.trim()).filter(Boolean).slice(0, 20);
    }

    const upd: Record<string, unknown> = { detail };
    if (patch.name !== undefined) upd.name = patch.name.trim();
    if (patch.address !== undefined) upd.road_address = patch.address.trim();

    const { error } = await this.sb.from('shops').update(upd).eq('id', shopId);
    if (error) throw new Error(error.message);
    return this.getInfo(shopId);
  }
}
