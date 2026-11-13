import { Pool } from "pg";

export async function internalFunnel(
  pool: Pool,
  days: number,
  platform: string,
) {
  const { rows } = await pool.query(
    `
    WITH events AS MATERIALIZED (
      SELECT * FROM analytics_events
      WHERE occurred_at >= now() - ($1::int * interval '1 day') AND ($2 = 'all' OR platform = $2)
        AND event_name IN ('service_enter','shop_view','reserve_click')
    ), entries AS (
      SELECT session_id, min(occurred_at) AS entered FROM events WHERE event_name = 'service_enter' GROUP BY session_id
    ), journeys AS (
      SELECT en.session_id, d.shop_type, d.shop_id, c.clicked FROM entries en
      LEFT JOIN LATERAL (
        SELECT shop_type, shop_id, occurred_at FROM events e WHERE e.session_id=en.session_id
          AND e.event_name='shop_view' AND e.occurred_at >= en.entered
        ORDER BY e.occurred_at,e.event_id LIMIT 1
      ) d ON true
      LEFT JOIN LATERAL (
        SELECT true AS clicked FROM events e WHERE e.session_id=en.session_id AND e.shop_id=d.shop_id
          AND e.event_name='reserve_click' AND e.reservation_method='naver' AND e.occurred_at >= d.occurred_at LIMIT 1
      ) c ON true
    ) SELECT count(*)::int AS entered,
      count(*) FILTER (WHERE shop_id IS NULL)::int AS no_detail,
      count(*) FILTER (WHERE shop_type='partner')::int AS partner,
      count(*) FILTER (WHERE shop_type='general')::int AS general,
      count(*) FILTER (WHERE shop_id IS NOT NULL AND shop_type IS NULL)::int AS unknown,
      count(*) FILTER (WHERE shop_type='partner' AND clicked)::int AS partner_click,
      count(*) FILTER (WHERE shop_type='general' AND clicked)::int AS general_click,
      count(*) FILTER (WHERE shop_id IS NOT NULL AND shop_type IS NULL AND clicked)::int AS unknown_click
    FROM journeys`,
    [days, platform],
  );
  const counts = rows[0];
  const events = await pool.query(
    `SELECT event_name, count(*)::int AS events, count(DISTINCT session_id)::int AS sessions,
    max(occurred_at) AS latest FROM analytics_events WHERE occurred_at >= now()-($1::int*interval '1 day')
    AND ($2='all' OR platform=$2) GROUP BY event_name ORDER BY events DESC LIMIT 100`,
    [days, platform],
  );
  const coverage = await pool.query(
    "SELECT min(occurred_at) AS since, max(occurred_at) AS latest FROM analytics_events",
  );
  return {
    counts,
    events: events.rows,
    coverage: coverage.rows[0],
    days,
    platform,
    unit: "sessions",
    definition:
      "기간 내 방문 세션 → 처음 본 샵 → 같은 샵의 네이버 버튼 클릭. 다른 샵으로 이동한 세션도 첫 샵 기준으로 분류합니다. 클릭은 실제 예약 완료가 아닙니다.",
  };
}
