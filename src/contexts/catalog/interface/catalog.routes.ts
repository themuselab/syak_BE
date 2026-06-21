import { Router } from 'express';
import { CatalogController } from './CatalogController';

export function catalogRouter(controller: CatalogController): Router {
  const router = Router();

  router.get('/',                            controller.list);            // CA-009 CA-010 CA-011 CA-012
  router.get('/:shopId',                     controller.detail);          // CA-013
  router.post('/:shopId/reservation-click',  controller.reservationClick); // CA-014 AD-003

  return router;
}
