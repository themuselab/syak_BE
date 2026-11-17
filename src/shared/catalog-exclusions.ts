/** Confirmed catalog errors. Preserve source/customer records; hide from discovery.
 * 2026-11-17: plumbing/leak-repair businesses mislabeled massage:
 * 1561251960 (광주시), 1225759020 (부산 서구).
 */
export const EXCLUDED_SHOP_IDS = ['1561251960', '1225759020'] as const;
export const isExcludedShop = (id: string): boolean => (EXCLUDED_SHOP_IDS as readonly string[]).includes(id);
// Static reviewed IDs only; no request values may be interpolated here.
export const PUBLIC_SHOP_SQL = `id NOT IN (${EXCLUDED_SHOP_IDS.map(id => `'${id}'`).join(',')})`;
