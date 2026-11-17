/** Old galleries mixed Naver profile/clip/promo images with business photos.
 * Keep custom uploaded photos, but only business-image hosts within pstatic.
 * Unwrap Naver's resize proxy before checking the actual source host.
 */
export function isShopPhoto(value: unknown, depth = 0): value is string {
  if (typeof value !== 'string' || !value || depth > 3) return false;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) return false;
    const host = url.hostname.toLowerCase();
    if (host === 'search.pstatic.net') return isShopPhoto(url.searchParams.get('src'), depth + 1);
    if (host === 'pstatic.net' || host.endsWith('.pstatic.net')) {
      return ['ldb-phinf.pstatic.net', 'naverbooking-phinf.pstatic.net', 'searchad-phinf.pstatic.net'].includes(host);
    }
    return true;
  } catch { return false; }
}

export function shopPhotos(value: unknown): string[] {
  return [...new Set((Array.isArray(value) ? value : []).filter(u => isShopPhoto(u)))];
}

/** Do not filter review attachments: they have separate review provenance. */
export function cleanShopImages(detail: Record<string, unknown>): Record<string, unknown> {
  const images = detail.images;
  if (!images || typeof images !== 'object' || Array.isArray(images)) return detail;
  const raw = images as Record<string, unknown>;
  const gallery = shopPhotos(raw.gallery);
  return { ...detail,
    ...('representativeImage' in detail && !isShopPhoto(detail.representativeImage)
      ? { representativeImage: gallery[0] ?? null } : {}),
    images: { ...raw, gallery,
    representative: isShopPhoto(raw.representative) ? raw.representative : gallery[0] ?? null,
    menu: shopPhotos(raw.menu),
  } };
}
