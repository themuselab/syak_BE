import { Pool } from 'pg';
import { IShopInfoProvider } from '../../owner-slots/ports/IOwnerSlotRepository';

export interface ShopInfo {
  shopId: string;
  name: string;
  address: string;
  category: string | null;
  serviceItems: string[]; // detail.owner_service_items (세부 시술 항목)
}

/**
 * 샵 정보(RDS). 알림용 기본정보(IShopInfoProvider) + 매장정보 조회/수정.
 * (Supabase 이전 — 이름은 유지하되 내부는 RDS. 주소는 detail.roadAddress, 시술항목은 detail.owner_service_items)
 */
export class SupabaseShopService implements IShopInfoProvider {
  constructor(private readonly rds: Pool) {}

  async getBasic(shopId: string): Promise<{ name: string; lat: number | null; lng: number | null } | null> {
    const { rows } = await this.rds.query('SELECT name, lat, lng FROM shops WHERE id = $1', [shopId]);
    if (!rows[0]) return null;
    return { name: String(rows[0].name ?? '내 매장'), lat: rows[0].lat ?? null, lng: rows[0].lng ?? null };
  }

  async getInfo(shopId: string): Promise<ShopInfo> {
    const { rows } = await this.rds.query('SELECT id, name, category, detail FROM shops WHERE id = $1', [shopId]);
    if (!rows[0]) throw new Error('shop not found');
    const detail = (rows[0].detail ?? {}) as Record<string, unknown>;
    return {
      shopId: rows[0].id as string,
      name: String(rows[0].name ?? ''),
      address: String((detail.roadAddress as string) ?? ''),
      category: (rows[0].category as string) ?? null,
      serviceItems: Array.isArray(detail.owner_service_items) ? (detail.owner_service_items as string[]) : [],
    };
  }

  async updateInfo(
    shopId: string,
    patch: { name?: string; address?: string; serviceItems?: string[] },
  ): Promise<ShopInfo> {
    const { rows: cur } = await this.rds.query('SELECT detail FROM shops WHERE id = $1', [shopId]);
    if (!cur[0]) throw new Error('shop not found');
    const detail = { ...((cur[0].detail ?? {}) as Record<string, unknown>) };
    if (patch.address !== undefined) detail.roadAddress = patch.address.trim();
    if (patch.serviceItems !== undefined) {
      detail.owner_service_items = patch.serviceItems.map(s => s.trim()).filter(Boolean).slice(0, 20);
    }
    const sets: string[] = ['detail = $2::jsonb'];
    const params: unknown[] = [shopId, JSON.stringify(detail)];
    if (patch.name !== undefined) { params.push(patch.name.trim()); sets.push(`name = $${params.length}`); }
    await this.rds.query(`UPDATE shops SET ${sets.join(', ')} WHERE id = $1`, params);
    return this.getInfo(shopId);
  }
}
