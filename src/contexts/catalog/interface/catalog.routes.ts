import { Router } from 'express';
import { CatalogController } from './CatalogController';

export function catalogRouter(controller: CatalogController): Router {
  const router = Router();

  router.get('/', controller.list);
  router.get('/:shopId', controller.detail);

  return router;
}
