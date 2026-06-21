import { Router } from 'express';
import { ReservationController } from './ReservationController';

export function reservationRouter(controller: ReservationController): Router {
  const router = Router();

  router.get('/search', controller.search);
  router.get('/shop/:shopId', controller.shopSlots);

  return router;
}
