/** Confirmed catalog errors. Preserve source/customer records; hide from discovery.
 * 2026-11-17: 1561251960 is a plumbing/leak-repair business, mislabeled massage.
 */
export const EXCLUDED_SHOP_IDS = ['1561251960'] as const;
export const isExcludedShop = (id: string): boolean => (EXCLUDED_SHOP_IDS as readonly string[]).includes(id);
// Static reviewed IDs only; no request values may be interpolated here.
export const PUBLIC_SHOP_SQL = `id NOT IN (${EXCLUDED_SHOP_IDS.map(id => `'${id}'`).join(',')})`;
