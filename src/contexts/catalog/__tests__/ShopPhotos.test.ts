import { cleanShopImages, isShopPhoto, shopPhotos } from '../domain/ShopPhotos';

const business = 'https://ldb-phinf.pstatic.net/20261115/photo.jpg';
const avatar = 'https://phinf.pstatic.net/contact/20210328/profileImage.png';
const clip = 'https://clip-service-phinf.pstatic.net/example/image.jpg';
const promo = 'https://maps-service.pstatic.net/maps-cms/banner.png';

it('rejects profiles, clips, promotions and their resized proxy URLs', () => {
  for (const url of [avatar, clip, promo, 'javascript:alert(1)', 'not a url']) {
    expect(isShopPhoto(url)).toBe(false);
    expect(isShopPhoto(`https://search.pstatic.net/common/?src=${encodeURIComponent(url)}`)).toBe(false);
  }
  expect(isShopPhoto(business)).toBe(true);
  expect(isShopPhoto(`https://search.pstatic.net/common/?src=${encodeURIComponent(business)}`)).toBe(true);
  expect(isShopPhoto('https://uploads.example.com/owner-photo.jpg')).toBe(true);
});

it('cleans old galleries without changing review attachments or mutating stored data', () => {
  const review = ['https://pup-review-phinf.pstatic.net/review.jpg'];
  const detail = { representativeImage: promo, images: {
    representative: promo, gallery: [business, avatar, clip, business], menu: [promo], review,
  }, reviews: [{ images: review }] };
  expect(cleanShopImages(detail)).toEqual({ ...detail, representativeImage: business,
    images: { representative: business, gallery: [business], menu: [], review } });
  expect(detail.images.gallery).toHaveLength(4);
  expect(shopPhotos([avatar, null, promo])).toEqual([]);
});
