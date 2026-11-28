import { Pool } from 'pg';

export const PRIMARY = ['네일','헤어','메이크업'];
export const GENERAL_BOOKING_OWNER = `(s.category = ANY($1::text[]) OR s.categories ?| $1::text[])
  AND s.id ~ '^[0-9]+$' AND s.biz_id IS NOT NULL AND g.metadata_outcome IS DISTINCT FROM 'category-review'
  AND (g.metadata_at IS NOT NULL OR s.detail->>'sourceCategory' = ANY(
      ARRAY['네일아트,네일샵','메이크업','미용실','남성전문미용실','이용원'])
      OR EXISTS(SELECT 1 FROM semas_shop_candidates c WHERE c.active AND c.verified_place_id=s.id))`;
const VERIFIED: Record<string,string> = {
  '네일아트,네일샵':'네일', '메이크업':'메이크업','미용실':'헤어','남성전문미용실':'헤어','이용원':'헤어',
};
const ELIGIBLE = `s.is_partner IS NOT TRUE AND (s.category = ANY($1::text[]) OR s.categories ?| $1::text[])
  AND s.id ~ '^[0-9]+$' AND NOT EXISTS (SELECT 1 FROM shop_suppressions x WHERE x.shop_id=s.id)`;
type Entry = Record<string, any>;

function safeUrl(value: unknown, hosts?: string[]): string | undefined {
  if (typeof value !== 'string' || value.length > 2048) return undefined;
  try {
    const u = new URL(value);
    if (!['https:','http:'].includes(u.protocol) || u.username || u.password || u.port) return undefined;
    if (hosts && (u.protocol !== 'https:' || !hosts.includes(u.hostname))) return undefined;
    return value;
  } catch { return undefined; }
}

function union(old: unknown, fresh: Entry[], key: (v: Entry) => string): Entry[] {
  const result = new Map<string,Entry>();
  for (const v of [...fresh,...(Array.isArray(old) ? old : [])]) {
    if (v && typeof v === 'object' && !result.has(key(v))) result.set(key(v),v);
  }
  return [...result.values()];
}

export class GeneralShopRefreshService {
  constructor(private readonly db: Pool) {}

  async targets(kind: 'slots'|'metadata', part: number, limit: number) {
    const seed = await this.db.query("SELECT to_regclass('public.semas_candidate_sync_state') AS name");
    if (!seed.rows[0]?.name) return {ready:false,targets:[]};
    const ready = await this.db.query('SELECT 1 FROM semas_candidate_sync_state WHERE singleton AND candidate_count>0');
    if (!ready.rowCount) return {ready:false,targets:[]};
    const slots = kind === 'slots';
    const last = slots ? 'g.slot_attempt_at' : 'g.metadata_attempt_at';
    const wanted = '(s.today_open IS TRUE OR EXISTS(SELECT 1 FROM favorites f WHERE f.shop_id=s.id))';
    const due = slots ? "interval '15 minutes'" : `CASE WHEN ${wanted} THEN interval '6 hours' ELSE interval '7 days' END`;
    const params = [PRIMARY,part,limit];
    const result = await this.db.query(`
      WITH due AS (
        SELECT s.id,s.category,s.categories,s.biz_id,s.item_id,s.biz_type,s.item_ids,s.items,
          ${last} AS attempted,g.availability_notice,s.detail->'_dailySlotRefresh'->>'noticeStatus' AS notice_status,
          ${wanted} AS wanted
        FROM shops s LEFT JOIN catalog_general_refresh g ON g.shop_id=s.id
        WHERE ${ELIGIBLE} AND ((hashtext(s.id)::bigint & 2147483647) % 8)=$2
          AND (${last} IS NULL OR ${last}<now()-${due})
          ${slots ? 'AND '+GENERAL_BOOKING_OWNER : ''}
      ), fast AS (
        SELECT * FROM due WHERE wanted ORDER BY attempted ASC NULLS FIRST,id LIMIT ($3::int / 2)
      ), fair AS (
        SELECT d.* FROM due d WHERE NOT EXISTS(SELECT 1 FROM fast f WHERE f.id=d.id)
        ORDER BY attempted ASC NULLS FIRST,id LIMIT ($3::int-(SELECT count(*) FROM fast))
      )
      SELECT * FROM (
        SELECT *,row_number() OVER (ORDER BY attempted NULLS FIRST,id) AS position,0 AS lane FROM fast
        UNION ALL SELECT *,row_number() OVER (ORDER BY attempted NULLS FIRST,id),1 FROM fair
      ) combined ORDER BY position,lane`,params);
    return {ready:true,targets:result.rows};
  }

  async reserve(source: 'place'|'booking', n: number) {
    const gap = source==='place' ? 6 : 1;
    const quota = source==='place' ? 2400 : 43200;
    const day = "(now() AT TIME ZONE 'Asia/Seoul')::date";
    const midnight = `((${day}+1)::timestamp AT TIME ZONE 'Asia/Seoul')`;
    const result = await this.db.query(`INSERT INTO catalog_source_request_budget AS old(source,day,used,granted,next_grant_at)
      VALUES ($1,${day},$2,$2,least(${midnight},now()+make_interval(secs=>$2::int*$3::int)))
      ON CONFLICT(source,day) DO UPDATE SET
        granted=least($2::int,$4::int-old.used), used=least($4::int,old.used+$2::int),
        next_grant_at=least(${midnight},now()+make_interval(secs=>least($2::int,$4::int-old.used)*$3::int))
      WHERE old.used<$4::int AND old.next_grant_at<=now()
      RETURNING granted,next_grant_at AS until`,[source,n,gap,quota]);
    if (result.rowCount) return result.rows[0];
    const retry = await this.db.query(`SELECT CASE WHEN used >= $2::int THEN ((day + 1)::timestamp AT TIME ZONE 'Asia/Seoul')
      ELSE next_grant_at END AS until FROM catalog_source_request_budget WHERE source=$1 AND day=${day}`,[source,quota]);
    return {granted:0,until:retry.rows[0]?.until ?? new Date()};
  }

  async record(id: string, kind: 'slots'|'metadata', observedAt: string, outcome: string, data: Entry) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query(`SELECT s.category,s.categories,s.detail,s.biz_id,s.biz_type,s.item_ids,s.items FROM shops s
        WHERE ${ELIGIBLE} AND s.id=$2 FOR UPDATE`,[PRIMARY,id]);
      if (!res.rowCount) { await client.query('ROLLBACK'); return {applied:false}; }
      const current = res.rows[0];
      const column = kind==='slots' ? 'slot' : 'metadata';
      const mark = await client.query(`INSERT INTO catalog_general_refresh AS old(shop_id,${column}_attempt_at,${column}_outcome)
        VALUES ($1,$2,$3) ON CONFLICT(shop_id) DO UPDATE SET ${column}_attempt_at=EXCLUDED.${column}_attempt_at,
        ${column}_outcome=EXCLUDED.${column}_outcome WHERE old.${column}_attempt_at IS NULL OR old.${column}_attempt_at < EXCLUDED.${column}_attempt_at
        RETURNING shop_id`,[id,observedAt,outcome]);
      if (!mark.rowCount) { await client.query('ROLLBACK'); return {applied:false}; }
      if (kind==='metadata' && outcome==='observed') {
        const canonical=VERIFIED[data.sourceCategory];
        if (!canonical || ![current.category,...(current.categories ?? [])].includes(canonical)) throw Error('Unmatched Place category');
        const old = current.detail ?? {};
        const patch: Entry = {sourceCategory:data.sourceCategory,sourceCategoryCheckedAt:observedAt};
        const contacts: Entry[] = [];
        const routes: Entry[] = [];
        for (const [field,label] of [['phone','매장 전화'],['virtualPhone','네이버 전화']]) {
          const value = data[field];
          if (typeof value === 'string' && /^[+0-9][0-9 ()-]{5,29}$/.test(value)) {
            patch[field]=value; routes.push({type:'phone',label,value}); contacts.push({type:field,label,value});
          }
        }
        for (const contact of (Array.isArray(data.contacts) ? data.contacts : []).slice(0,40)) {
          const url=safeUrl(contact?.url);
          if (!url) continue;
          const host=new URL(url).hostname;
          let type='website';
          if (['www.instagram.com','instagram.com','m.instagram.com'].includes(host)) {
            type='instagram';
            if (/^\/[A-Za-z0-9._]+\/?$/.test(new URL(url).pathname)
                && !/^\/(p|reel|reels|stories|explore|accounts)\/?$/.test(new URL(url).pathname)) patch.instagram ??= url;
          } else if (host==='pf.kakao.com') type='kakao';
          else if (host==='talk.naver.com') type='talktalk';
          else if (host==='blog.naver.com' || host==='m.blog.naver.com') type='blog';
          const label=typeof contact.label==='string' ? contact.label.slice(0,80) : type;
          contacts.push({type,value:url,label});
          if (['kakao','talktalk','instagram'].includes(type)) routes.push({type,value:url,label});
        }
        const products: Entry[] = [];
        for (const item of (Array.isArray(data.bookingItems) ? data.bookingItems : []).slice(0,100)) {
          const url=safeUrl(item?.bookingUrl,['booking.naver.com','m.booking.naver.com']);
          if (!url) continue;
          const m=new URL(url).pathname.match(/^\/booking\/(\d+)\/bizes\/(\d+)(?:\/items\/(\d+))?\/?$/);
          if (!m) continue;
          const name=typeof item.name==='string' ? item.name.slice(0,140) : '네이버 예약';
          products.push({bizType:Number(m[1]),bizId:m[2],itemId:m[3],name,bookingUrl:url});
          routes.push({type:'naver',value:url,label:name});
        }
        if (contacts.length) patch.businessContacts=union(old.businessContacts,contacts,v=>v.type+'|'+v.value);
        if (routes.length) patch.reservationRoutes=union(old.reservationRoutes,routes,v=>v.type+'|'+v.value);
        if (products.length) patch.bookingItems=union(old.bookingItems,products,v=>v.bookingUrl);
        const reviews: Entry[] = [];
        for (const review of (Array.isArray(data.reviews) ? data.reviews : []).slice(0,10)) {
          if (typeof review?.body !== 'string' || !review.body.trim() || review.body.length>4000) continue;
          const r: Entry = {body:review.body};
          if (typeof review.visited==='string' && review.visited.length<160) r.visited=review.visited;
          reviews.push(r);
        }
        if (reviews.length) { patch.reviews=union(old.reviews,reviews,v=>v.body+'|'+(v.visited??'')).slice(0,20); patch.reviewsSyncedAt=observedAt; }
        const count=Number.isSafeInteger(data.visitorReviewCount) && data.visitorReviewCount>=0 ? data.visitorReviewCount : null;
        if (count!==null) patch.reviewTotal=count;
        const photos=[...new Set<string>(((Array.isArray(data.photos)?data.photos:[]) as unknown[])
          .map((url: unknown)=>safeUrl(url,['ldb-phinf.pstatic.net','naverbooking-phinf.pstatic.net'])).filter((url):url is string=>Boolean(url)))].slice(0,100);
        if (photos.length) {
          await client.query(`INSERT INTO catalog_business_photo_intake(shop_id,source_url,observed_at)
            SELECT $1,url,$3 FROM unnest($2::text[]) url ON CONFLICT(shop_id,source_url)
            DO UPDATE SET observed_at=greatest(catalog_business_photo_intake.observed_at,EXCLUDED.observed_at)`,[id,photos,observedAt]);
        }
        const first=products[0];
        const coherent=first && products.every(p=>p.bizId===first.bizId && p.bizType===first.bizType)
          && (!current.biz_id || String(current.biz_id)===first.bizId)
          && (current.biz_type==null || Number(current.biz_type)===first.bizType);
        const items=coherent ? products.filter(p=>p.itemId).map(p=>({id:p.itemId,name:p.name})) : [];
        const mergedItems=items.length ? union(current.items,items,v=>String(v.id)):null;
        const ids=items.length ? [...new Set([...(current.item_ids??[]),...items.map(p=>p.id)])] : null;
        await client.query(`UPDATE shops SET detail=COALESCE(detail,'{}')||$2::jsonb, review_count=coalesce($3,review_count),
          biz_id=coalesce(biz_id,$4),biz_type=coalesce(biz_type,$5),item_id=coalesce(item_id,$6),
          item_ids=coalesce($7::jsonb,item_ids),items=coalesce($8::jsonb,items),reservable=CASE WHEN $4::text IS NOT NULL THEN true ELSE reservable END
          WHERE id=$1`,[id,JSON.stringify(patch),count,coherent?first.bizId:null,coherent?first.bizType:null,items[0]?.id??null,
          ids?JSON.stringify(ids):null,mergedItems?JSON.stringify(mergedItems):null]);
        await client.query(`UPDATE catalog_general_refresh SET metadata_at=$2,availability_notice=coalesce($4,availability_notice),instagram_seen_at=CASE WHEN $3 OR ($5 AND instagram_seen_at IS NULL) THEN
          now() ELSE instagram_seen_at END WHERE shop_id=$1`,[id,observedAt,Boolean(patch.instagram && patch.instagram!==old.instagram),
          typeof data.availabilityNotice==='boolean' ? data.availabilityNotice : null,Boolean(patch.instagram)]);
      }
      await client.query('COMMIT');
      return {applied:true};
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
}
