/** Exact upstream categories verified during the 2026-11-25 catalog audit.
 * Do not infer a business type from words in its name or menu.
 * Missing/unknown categories remain eligible for individual review.
 */
const NON_SALON_CATEGORIES = new Set([
  '화장품,향수', '기능성화장품', '미용기기,재료', '건강,의료용품', '미용교육',
  '미용학원', '평생,사회교육원', '교육원,교육센터', '전문건설업', '방수공사', '배관,냉난방공사', '기업',
  '한의원', '피부과', '성형외과', '치과', '산부인과', '가정의학과',
  '비뇨의학과', '병원부속시설', '병원,의원', '외과', '안과',
  '협회,단체', '종합도소매', '척추,자세교정',
]);

export function isNonSalonSourceCategory(value: unknown): boolean {
  return typeof value === 'string' && NON_SALON_CATEGORIES.has(value);
}
