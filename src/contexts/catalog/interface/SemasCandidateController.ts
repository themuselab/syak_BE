import { NextFunction, Request, Response } from 'express';
import { Pool } from 'pg';
import { Errors } from '../../../shared/errors/AppError';

const PUBLIC_ID = /^MA[A-Z0-9]{1,38}$/;
const HASH = /^[a-f0-9]{64}$/;
const PLACE_ID = /^[0-9]{4,20}$/;
const CATEGORIES = new Set(['네일아트,네일샵', '미용실', '남성전문미용실', '이용원', '메이크업']);
const RETRY_DAYS: Record<string, number> = { no_match: 14, ambiguous: 7, unavailable: 1 };

interface Place {
  id: string;
  url: string;
  name: string;
  sourceCategory: string;
  roadAddress: string;
  latitude: number;
  longitude: number;
}

interface CandidateRow {
  name: string;
  branch: string;
  road_address: string;
  latitude: number;
  longitude: number;
  verified_place_id: string | null;
  checked_at: Date | null;
}

function norm(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[^가-힣a-z0-9]/g, '');
}

function building(address: string): string | undefined {
  const match = address.match(/([가-힣A-Za-z0-9·.\-]+(?:로|길))\s*(\d+(?:-\d+)?)(?=$|[^\d-])/);
  return match && match[1] + ' ' + match[2] || undefined;
}

function parsePlace(raw: unknown): Place {
  if (!raw || typeof raw !== 'object') throw Errors.validation();
  const r = raw as Place;
  if (typeof r.id !== 'string' || !PLACE_ID.test(r.id) || typeof r.url !== 'string' ||
      typeof r.name !== 'string' || !r.name.trim() || r.name.length > 200 ||
      !CATEGORIES.has(r.sourceCategory) || typeof r.roadAddress !== 'string' || r.roadAddress.length > 400 ||
      !Number.isFinite(r.latitude) || !(32 < r.latitude && r.latitude < 40) ||
      !Number.isFinite(r.longitude) || !(124 < r.longitude && r.longitude < 132)) throw Errors.validation();
  const url = r.url.match(/^https:\/\/(?:m\.place|pcmap\.place)\.naver\.com\/(?:place|nailshop|hairshop)\/(\d{4,20})\/(?:home)\/?$/);
  if (!url || url[1] !== r.id) throw Errors.validation();
  return { id: r.id, url: r.url, name: r.name, roadAddress: r.roadAddress,
    sourceCategory: r.sourceCategory, latitude: r.latitude, longitude: r.longitude };
}

export function matchesSemas(candidate: CandidateRow, place: Place): boolean {
  const base = norm(candidate.name), branch = norm(candidate.branch);
  const expected = !branch || base.endsWith(branch) ? base : base + branch;
  const road = building(candidate.road_address);
  const radians = Math.PI / 180;
  const meters = Math.hypot((place.longitude - candidate.longitude) * 111195 *
    Math.cos((place.latitude + candidate.latitude) * radians / 2), (place.latitude - candidate.latitude) * 111195);
  return !!expected && norm(place.name) === expected && !!road && road === building(place.roadAddress) && meters <= 100;
}

export class SemasCandidateController {
  constructor(private readonly db: Pool) {}

  targets = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const s = String(req.query.shard ?? ''), after = String(req.query.after ?? '');
      const n = Number(req.query.limit ?? 50);
      if (!/^(?:[0-9]|[12][0-9]|3[01])$/.test(s) || (after && !PUBLIC_ID.test(after)) ||
          !Number.isInteger(n) || n < 1 || n > 50) throw Errors.validation();
      const result = await this.db.query(`SELECT public_id AS "publicId",identity_key AS "identityKey",name,branch,
          road_address AS "roadAddress",province,district,latitude,longitude,category,category_basis AS "categoryBasis",
          source_date::text AS "sourceDate", proposed_place_id AS "proposedPlaceId"
        FROM semas_shop_candidates WHERE active AND verified_place_id IS NULL AND shard=$1 AND public_id>$2
          AND next_attempt_at<=now() ORDER BY public_id LIMIT $3`, [Number(s),after,n]);
      res.set('Cache-Control','private, no-store').json({ targets: result.rows,
        next: result.rows.length === n ? result.rows[n-1].publicId : null });
    } catch (err) { next(err); }
  };

  record = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { publicId, identityKey, outcome, observedAt, place: input } = req.body ?? {};
      const observed = Date.parse(observedAt);
      if (typeof publicId !== 'string' || !PUBLIC_ID.test(publicId) || typeof identityKey !== 'string' ||
          !HASH.test(identityKey) || typeof observedAt !== 'string' || !Number.isFinite(observed) ||
          observed > Date.now()+60_000 || observed < Date.now()-86400_000 ||
          (outcome !== 'verified' && !Object.prototype.hasOwnProperty.call(RETRY_DAYS,outcome))) throw Errors.validation();
      const place = outcome === 'verified' ? parsePlace(input) : null;
      if (!place && input != null) throw Errors.validation();
      const client = await this.db.connect();
      try {
        await client.query('BEGIN');
        const locked = await client.query<CandidateRow>(`SELECT name,branch,road_address,latitude,longitude,
            verified_place_id,checked_at FROM semas_shop_candidates
          WHERE active AND public_id=$1 AND identity_key=$2 FOR UPDATE`, [publicId,identityKey]);
        const candidate = locked.rows[0];
        let applied = false;
        if (candidate && !candidate.verified_place_id && (!candidate.checked_at || candidate.checked_at.getTime() < observed)) {
          if (place && !matchesSemas(candidate,place)) throw Errors.validation({ evidence: '매장 상호·도로명주소·좌표 불일치' });
          const changed = await client.query(`UPDATE semas_shop_candidates SET outcome=$3,checked_at=$4,
              verified_place_id=$5,verified_at=CASE WHEN $5::text IS NULL THEN NULL ELSE $4::timestamptz END,
              evidence=$6::jsonb,next_attempt_at=CASE WHEN $5::text IS NOT NULL THEN 'infinity'::timestamptz
                  ELSE $4::timestamptz+($7::int*interval '1 day') END,updated_at=now()
            WHERE public_id=$1 AND identity_key=$2 AND ($5::text IS NULL OR
              NOT EXISTS (SELECT 1 FROM shop_suppressions WHERE shop_id=$5))`,
          [publicId,identityKey,outcome,new Date(observed),place?.id ?? null,place ? JSON.stringify(place) : null,
            RETRY_DAYS[outcome] ?? 0]);
          applied = !!changed.rowCount;
        }
        await client.query('COMMIT');
        res.set('Cache-Control','private, no-store').json({ applied });
      } catch (err) {
        await client.query('ROLLBACK');
        if ((err as { code?: string }).code === '23505') {
          res.status(409).json({ code: 'PLACE_ALREADY_LINKED' }); return;
        }
        throw err;
      } finally { client.release(); }
    } catch (err) { next(err); }
  };
}
