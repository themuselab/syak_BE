/** Confirmed catalog errors. Preserve source/customer records; hide from discovery.
 * 2026-11-17: 47 listings named 반영구시트옥상방수누수공사 mislabeled PMU,
 * plus 2 plumbing/leak-repair listings mislabeled massage. 49 source IDs
 * reviewed together; do not infer exclusion from ambiguous beauty-shop names.
 */
export const EXCLUDED_SHOP_IDS = [
  '1001548336', '1019367765', '1024440462', '1028904859', '1046432055',
  '1091728572', '1099006142', '1154994939', '1168736335', '1169488868',
  '1197307613', '1225759020', '1229791418', '1232065263', '1256174774',
  '1292917979', '1308735685', '1311980256', '1343904461', '1387864538',
  '1422904568', '1445508458', '1450491829', '1463147051', '1483635064',
  '1494581058', '1502270672', '1561251960', '1623831518', '1668192706',
  '1672049338', '1692498899', '1698183497', '1709854339', '1727505989',
  '1739177378', '1761476613', '1801190811', '1822140859', '1822767385',
  '1825336478', '1834992322', '1839069423', '1924842087', '1932601885',
  '1934592802', '1959140967', '1967903757', '1995598528',
] as const;
const NON_BEAUTY_NAMES = [
  '반영구시트옥상방수누수공사',
  '누수탐지업체수도배관누수보일러배관하수구막힘싱크대수전교체',
  '누수탐지,아파트누수,보험처리,도배,곰팡이,석고보드교체',
];
export const isExcludedShop = (id: string, name?: string): boolean =>
  (EXCLUDED_SHOP_IDS as readonly string[]).includes(id) || NON_BEAUTY_NAMES.includes(name ?? '');
// Static reviewed IDs only; no request values may be interpolated here.
export const PUBLIC_SHOP_SQL = `id NOT IN (${EXCLUDED_SHOP_IDS.map(id => `'${id}'`).join(',')})
  AND COALESCE(name,'') NOT IN (${NON_BEAUTY_NAMES.map(name => `'${name}'`).join(',')})`;
