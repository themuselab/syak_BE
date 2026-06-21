"""샥 앱 지표 → Discord 웹훅.

최근 N시간(기본 24h) 앱 백엔드(RDS) 기반 집계:
 - 신규 가입자, 앱 조회, 취소석 신청, 파트너 현황, 슬롯 현황

env: APP_DATABASE_URL (RDS PostgreSQL DSN)
     SUPABASE_URL + SUPABASE_SECRET_KEY (Supabase REST: 샵/슬롯 통계)
     DISCORD_WEBHOOK_APP
"""
import json, os, sys, urllib.request, urllib.error
from datetime import datetime, timedelta, timezone
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

HOURS = int(os.environ.get("REPORT_HOURS", "24"))

# ── env 로딩 (.env fallback) ───────────────────────────────────────────────
ENV = dict(os.environ)
_local = Path(__file__).parent / ".env"
if _local.exists():
    for line in _local.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            ENV.setdefault(k.strip(), v.strip())

APP_DSN  = ENV["APP_DATABASE_URL"]
WEBHOOK  = ENV["DISCORD_WEBHOOK_APP"]
SB_URL   = ENV.get("SUPABASE_URL", "").rstrip("/")
SB_SEC   = ENV.get("SUPABASE_SECRET_KEY", "")

# ── PostgreSQL (RDS) ──────────────────────────────────────────────────────
try:
    import psycopg2, psycopg2.extras
except ImportError:
    sys.exit("psycopg2 필요: pip install psycopg2-binary")

def rds_q(sql, params=()):
    conn = psycopg2.connect(APP_DSN)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()

def rds_val(sql, params=()):
    rows = rds_q(sql, params)
    return list(rows[0].values())[0] if rows else 0

# ── Supabase REST (샵/슬롯 집계) ──────────────────────────────────────────
def sb_count(path):
    if not SB_URL or not SB_SEC:
        return 0
    req = urllib.request.Request(f"{SB_URL}/rest/v1/{path}", headers={
        "apikey": SB_SEC, "Authorization": f"Bearer {SB_SEC}",
        "Prefer": "count=exact", "Range": "0-0"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            cr = r.headers.get("content-range") or "/0"
            return int(cr.split("/")[1] or 0)
    except Exception:
        return 0


def main():
    kst     = timezone(timedelta(hours=9))
    since   = datetime.now(timezone.utc) - timedelta(hours=HOURS)
    since_s = since.strftime("%Y-%m-%dT%H:%M:%SZ")

    # ── 신규 사용자 ──────────────────────────────────────────────────
    new_users  = rds_val("SELECT COUNT(*) FROM users WHERE created_at >= %s", (since,))
    total_users = rds_val("SELECT COUNT(*) FROM users")

    # ── 앱 조회 (shop_view_events) ───────────────────────────────────
    total_views  = rds_val("SELECT COUNT(*) FROM shop_view_events WHERE viewed_at >= %s", (since,))
    uniq_viewers = rds_val(
        "SELECT COUNT(DISTINCT COALESCE(user_id::text, '')) FROM shop_view_events WHERE viewed_at >= %s", (since,))

    # 샵별 조회 TOP 10
    top_shops = rds_q("""
        SELECT e.shop_id, COUNT(*) AS views
        FROM shop_view_events e
        WHERE e.viewed_at >= %s
        GROUP BY e.shop_id ORDER BY views DESC LIMIT 10
    """, (since,))

    # 샵 이름 조회 (Supabase REST)
    shop_ids  = [r["shop_id"] for r in top_shops]
    name_map  = {}
    if shop_ids and SB_URL and SB_SEC:
        ids_param = ",".join(str(i) for i in shop_ids)
        try:
            req = urllib.request.Request(
                f"{SB_URL}/rest/v1/shops?id=in.({ids_param})&select=id,name",
                headers={"apikey": SB_SEC, "Authorization": f"Bearer {SB_SEC}"})
            with urllib.request.urlopen(req, timeout=15) as r:
                for row in json.loads(r.read()):
                    name_map[row["id"]] = row.get("name", "?")
        except Exception:
            pass
    view_lines = [
        f"· {(name_map.get(r['shop_id']) or r['shop_id'])[:14]}: {r['views']}회"
        for r in top_shops
    ]
    view_text  = "\n".join(view_lines) or "—"

    # ── 취소석 신청 (알림 디스패치) ──────────────────────────────────
    cancel_req = rds_val(
        "SELECT COUNT(*) FROM notifications WHERE created_at >= %s", (since,))
    cancel_sent = rds_val(
        "SELECT COUNT(*) FROM notifications WHERE is_read = FALSE AND created_at >= %s", (since,))

    # ── 파트너 현황 ─────────────────────────────────────────────────
    total_owners    = rds_val("SELECT COUNT(*) FROM owner_accounts")
    linked_owners   = rds_val("SELECT COUNT(*) FROM owner_accounts WHERE shop_id IS NOT NULL")
    new_owners      = rds_val("SELECT COUNT(*) FROM owner_accounts WHERE created_at >= %s", (since,))
    codes_issued    = rds_val("SELECT COUNT(*) FROM partner_codes WHERE created_at >= %s", (since,))
    codes_used      = rds_val("SELECT COUNT(*) FROM partner_codes WHERE used = TRUE AND used_at >= %s", (since,))
    codes_open      = rds_val(
        "SELECT COUNT(*) FROM partner_codes WHERE used = FALSE AND expires_at > NOW()")

    # 파트너 코드 사용률 (전체 기준)
    total_codes     = rds_val("SELECT COUNT(*) FROM partner_codes")
    total_used      = rds_val("SELECT COUNT(*) FROM partner_codes WHERE used = TRUE")

    # ── 슬롯 현황 (사장님 등록) ──────────────────────────────────────
    owner_slots_new = rds_val(
        "SELECT COUNT(*) FROM slots WHERE source='owner' AND created_at >= %s", (since,)) if True else 0
    owner_slots_total = rds_val("SELECT COUNT(*) FROM slots WHERE source='owner'")

    # Supabase 슬롯 전체 (스크래퍼 포함)
    supabase_slots  = sb_count("slots?select=id")
    supabase_shops  = sb_count("shops?select=id")

    # ── 즐겨찾기 ────────────────────────────────────────────────────
    new_favorites  = rds_val(
        "SELECT COUNT(*) FROM favorites WHERE created_at >= %s", (since,))
    total_favorites = rds_val("SELECT COUNT(*) FROM favorites")

    # ── 타임스탬프 ──────────────────────────────────────────────────
    now_kst = datetime.now(kst)
    stamp   = f"기준: {now_kst.strftime('%Y-%m-%d %H:%M')} KST · 최근 {HOURS}h"

    # ── Embed 1: 앱 사용자 & 조회 ────────────────────────────────────
    embed_users = {
        "title": f"📱 샥 앱 지표 (최근 {HOURS}시간)",
        "color": 0x6366F1,
        "fields": [
            {"name": "👤 신규 가입",
             "value": f"신규 {new_users}명 (누적 {total_users}명)", "inline": True},
            {"name": "⭐ 즐겨찾기",
             "value": f"신규 {new_favorites}개 (누적 {total_favorites}개)", "inline": True},
            {"name": "👁️ 샵 상세 조회",
             "value": f"{total_views}회 · 유저 {uniq_viewers}명", "inline": True},
            {"name": "🏠 조회 TOP 샵", "value": view_text, "inline": False},
        ],
        "footer": {"text": stamp},
    }

    # ── Embed 2: 취소석 & 알림 ────────────────────────────────────────
    embed_notifications = {
        "title": "🔔 취소석 신청 & 알림",
        "color": 0xF59E0B,
        "fields": [
            {"name": "취소석 알림 발송",
             "value": f"{cancel_req}건", "inline": True},
            {"name": "미열람 알림",
             "value": f"{cancel_sent}건", "inline": True},
        ],
        "footer": {"text": stamp},
    }

    # ── Embed 3: 파트너 현황 ─────────────────────────────────────────
    conv_rate = f"{round(total_used / total_codes * 100)}%" if total_codes else "—"
    embed_partner = {
        "title": "🤝 파트너 현황",
        "color": 0x10B981,
        "fields": [
            {"name": "사장님 계정",
             "value": f"총 {total_owners}명 · 샵 연결 {linked_owners}명", "inline": True},
            {"name": "신규 사장님",
             "value": f"{new_owners}명", "inline": True},
            {"name": "인증코드 발급",
             "value": f"{codes_issued}개 발급 · {codes_used}개 사용 · {codes_open}개 대기", "inline": False},
            {"name": "코드 전체 사용률",
             "value": f"{total_used}/{total_codes} ({conv_rate})", "inline": True},
            {"name": "사장님 등록 슬롯",
             "value": f"신규 {owner_slots_new}개 · 총 {owner_slots_total}개", "inline": True},
            {"name": "전체 슬롯/샵 (Supabase)",
             "value": f"슬롯 {supabase_slots:,}개 · 샵 {supabase_shops:,}개", "inline": False},
        ],
        "footer": {"text": stamp},
    }

    payload = {
        "username": "샥 앱봇",
        "embeds": [embed_users, embed_notifications, embed_partner],
    }
    req = urllib.request.Request(
        WEBHOOK,
        data=json.dumps(payload).encode(),
        method="POST",
        headers={"Content-Type": "application/json", "User-Agent": "syak-app-report/1.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            print(
                f"✅ Discord 앱 리포트 전송 ({r.status}) "
                f"| 신규가입 {new_users} 조회 {total_views}회 취소석 {cancel_req}건"
            )
    except urllib.error.HTTPError as e:
        print("Discord 전송 실패", e.code, e.read().decode(errors="ignore")[:400])
        raise


if __name__ == "__main__":
    main()
