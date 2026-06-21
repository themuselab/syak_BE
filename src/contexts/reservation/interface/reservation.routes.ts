import { Router } from 'express';
import { ReservationController } from './ReservationController';

export function reservationRouter(controller: ReservationController): Router {
  const router = Router();

  router.get('/search',        controller.search);     // CA-018 CA-019
  router.get('/shop/:shopId',  controller.shopSlots);  // CA-013 (샵 상세 내 슬롯 목록)

  return router;
}
