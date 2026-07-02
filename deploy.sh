#!/bin/bash
# Blue-Green 무중단 배포 스크립트 (EC2에서 실행)
# 사용: ./deploy.sh ghcr.io/owner/repo:sha

set -e

IMAGE="${1:?이미지 태그가 필요합니다}"
HEALTH_URL="http://127.0.0.1"
MAX_WAIT=30

# ── 현재 active 컨테이너 확인 ─────────────────────────────────
if docker ps --format '{{.Names}}' | grep -q "syak-blue"; then
  ACTIVE="blue"  ; ACTIVE_PORT=3000
  NEXT="green"   ; NEXT_PORT=3001
else
  ACTIVE="green" ; ACTIVE_PORT=3001
  NEXT="blue"    ; NEXT_PORT=3000
fi

echo "▶ 배포 시작: $ACTIVE(포트 $ACTIVE_PORT) → $NEXT(포트 $NEXT_PORT)"
echo "  이미지: $IMAGE"

# ── GHCR 로그인 & 이미지 pull ────────────────────────────────
echo "▶ 이미지 pull..."
docker pull "$IMAGE"

# ── 다음 컨테이너 기동 ────────────────────────────────────────
echo "▶ syak-$NEXT 컨테이너 시작 (포트 $NEXT_PORT)..."
docker rm -f "syak-$NEXT" 2>/dev/null || true

docker run -d \
  --name "syak-$NEXT" \
  --restart unless-stopped \
  -p "$NEXT_PORT:3000" \
  --env-file /home/ec2-user/syak.env \
  "$IMAGE"

# ── 헬스체크 ─────────────────────────────────────────────────
echo "▶ 헬스체크 (최대 ${MAX_WAIT}s)..."
for i in $(seq 1 $MAX_WAIT); do
  if curl -sf "http://127.0.0.1:$NEXT_PORT/health" > /dev/null 2>&1; then
    echo "  ✅ 헬스체크 통과 (${i}s)"
    break
  fi
  if [ "$i" -eq "$MAX_WAIT" ]; then
    echo "  ❌ 헬스체크 실패 — 롤백"
    docker rm -f "syak-$NEXT" || true
    exit 1
  fi
  sleep 1
done

# ── Nginx upstream 전환 ───────────────────────────────────────
echo "▶ Nginx upstream → 포트 $NEXT_PORT..."
sudo sed -i "s/server 127.0.0.1:[0-9]*/server 127.0.0.1:$NEXT_PORT/" /etc/nginx/conf.d/syak.conf
sudo nginx -t && sudo nginx -s reload

# ── 이전 컨테이너 제거 ────────────────────────────────────────
echo "▶ syak-$ACTIVE 종료..."
docker rm -f "syak-$ACTIVE" 2>/dev/null || true

# ── 정리 ─────────────────────────────────────────────────────
docker image prune -f > /dev/null

echo "✅ 배포 완료: syak-$NEXT 활성 (포트 $NEXT_PORT)"
