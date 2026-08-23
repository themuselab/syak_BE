import { Router } from 'express';
import { WebCatalogController } from './WebCatalogController';

/** 소비자 웹 전용 raw 카탈로그/슬롯 API (RDS). 공개(비로그인). */
export function webRouter(c: WebCatalogController): Router {
  const router = Router();

  router.get('/shops/in-bounds',      c.inBounds);
  router.get('/shops/pins',           c.pins);
  router.get('/shops/by-gu',          c.byGus);
  router.get('/shops/partners',       c.partners);
  router.get('/shops/search',         c.search);
  router.get('/shops/:shopId/detail', c.detail);

  router.get('/slots/shop',           c.shopSlots);
  router.get('/slots/open-at',        c.shopsOpenAt);

  router.post('/leads',               c.registerLead);

  return router;
}
