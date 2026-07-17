# Syak Backend

네일/뷰티샵 예약 모바일 앱 **Syak**의 Express + TypeScript 백엔드.

## 기술 스택

| 분류 | 기술 |
|---|---|
| Runtime | Node.js 20, TypeScript |
| Framework | Express 4 |
| Auth | 카카오 / 네이버 / Apple 소셜 로그인, HttpOnly 쿠키 |
| DB (사용자) | AWS RDS PostgreSQL — users, favorites, notifications, refresh_tokens |
| DB (샵/슬롯) | Supabase PostgreSQL — shops, slots (읽기 전용) |
| 실시간 알림 | 스크래퍼가 새 빈자리를 `/notifications/internal/dispatch` 로 push → FCM |
| CI/CD | GitHub Actions → Docker → EC2 |
| 테스트 | Jest (unit, 80% 커버리지) + Supertest (E2E, Docker PostgreSQL) |

## 아키텍처

```
src/
├── app/
│   ├── composition-root.ts   # 의존성 조립 (DI 루트)
│   └── router.ts             # 라우터 등록
├── contexts/                 # 바운디드 컨텍스트
│   ├── auth/
│   ├── catalog/
│   ├── reservation/
│   ├── favorite/
│   ├── notification/
│   └── user/
└── shared/
    ├── errors/               # 커스텀 에러 (AppError + ErrorCode)
    ├── lib/                  # database.ts
    └── middleware/           # auth, admin-auth, error, httpLogger
```

각 컨텍스트는 `domain → application → ports → infrastructure → interface` 5계층 헥사고날 구조를 따른다.

## 주요 설계 결정

**이중 DB 구조**
- Supabase: 스크래퍼가 소유하는 샵/슬롯 데이터 (읽기 전용)
- RDS: 앱이 소유하는 사용자 데이터 (writes)
- 크로스 DB JOIN 불가 → favorites에 `shop_name`/`shop_region` 비정규화

**소셜 계정 연동**
- 한 계정에 카카오·네이버·Apple 모두 연결 가능
- `user_social_accounts` 테이블로 N:1 관계 (여러 소셜 → 한 유저)
- `POST /api/v1/auth/link/:provider` 로 추가 연동

**빈자리 알림 (push 기반)**
- 스크래퍼(`themuselab/syak`)가 매시간 슬롯 수집 시 **직전 대비 새로 생긴 오늘 빈자리**만 diff 하여
  `POST /notifications/internal/dispatch` (X-Internal-Key) 로 백엔드에 밀어준다.
- 서버는 해당 샵을 즐겨찾기했거나 주변 반경 안인 유저를 찾아 FCM + 알림 저장.
- (구 Supabase LISTEN/NOTIFY 방식은 스크래퍼의 삭제→재삽입 패턴과 맞지 않아 폐기)

**앱 소식 (비로그인 알림)**
- 전역 공지/마케팅 피드(`app_news`). 로그인 무관하게 알림 탭에 노출.
- 앱은 `POST /notifications/devices` 로 익명 디바이스(설치 단위) FCM 토큰 등록 → 관리자 발행 시 전 디바이스 푸시.

**스크래퍼 분리**
- 스크래퍼는 GitHub Actions에서만 실행 (IP 고정 없음 → rate limit 회피)
- EC2 백엔드는 Supabase에서 읽기만 수행

## API 엔드포인트

### 인증 `🔑 = 쿠키 인증 필요`

| Method | Path | 설명 |
|---|---|---|
| POST | `/api/v1/auth/:provider` | 소셜 로그인 (kakao / naver / apple) |
| POST | `/api/v1/auth/link/:provider` | 🔑 추가 소셜 계정 연동 |
| POST | `/api/v1/auth/token/refresh` | 액세스 토큰 갱신 |
| DELETE | `/api/v1/auth/signout` | 🔑 로그아웃 |

### 샵 카탈로그

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/v1/shops` | 샵 목록 (필터: region, keyword, page) |
| GET | `/api/v1/shops/:shopId` | 샵 상세 |

### 예약 슬롯

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/v1/slots/shop/:shopId` | 샵별 슬롯 목록 |
| GET | `/api/v1/slots/search` | 날짜/지역 슬롯 검색 |

### 즐겨찾기 🔑

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/v1/favorites` | 즐겨찾기 목록 |
| POST | `/api/v1/favorites/:shopId` | 즐겨찾기 추가 |
| DELETE | `/api/v1/favorites/:shopId` | 즐겨찾기 제거 |

### 알림 🔑

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/v1/notifications` | 알림 목록 |
| GET | `/api/v1/notifications/settings` | 알림 설정 조회 |
| PATCH | `/api/v1/notifications/settings` | 알림 설정 변경 |
| POST | `/api/v1/notifications/internal/dispatch` | [내부] 슬롯 알림 발송 (GitHub Actions) |

### 유저 🔑

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/v1/users/me` | 내 프로필 |
| DELETE | `/api/v1/users/me` | 회원 탈퇴 |

## 시작하기 (레포를 막 클론했다면 이 순서대로)

### 사전 요구사항

- Node.js 20+
- Docker & Docker Compose

### 1. 환경 변수

```bash
cp .env.example .env
```

`.env.example`의 값이 채워진 항목은 **로컬 개발 기본값이라 그대로 두면 된다.**
비어 있는 항목만 채우면 서버가 뜬다. 최소로 필요한 건 아래 정도다.

| 키 | 없으면 |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | 샵/마케팅 조회 전부 실패 |
| `DATABASE_URL` | 로그인·알림 등 사용자 데이터 전부 실패 (RDS) |
| `JWT_SECRET` | 로그인 불가 |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_SESSION_TOKEN` | 관리자 로그인 불가 |
| `INTERNAL_API_KEY` | 스크래퍼의 빈자리 알림 dispatch 거부(403) |
| `NVIDIA_API_KEY_FLUX` | 관리자 "이미지 생성" 버튼만 503 (나머지는 정상) |
| `REDIS_URL` | 캐시 없이 동작 (에러 아님) |

> 카카오·네이버는 클라이언트가 받은 `access_token`을 서버가 검증만 하므로 **서버 키가 필요 없다.**
> (`SUPABASE_DATABASE_URL` 은 더 이상 쓰지 않는다 — 구 SlotListener 전용이었고 알림은 push 방식으로 교체됨)

### 2. 개발 서버 — 권장 (DB/Redis만 컨테이너, 앱은 네이티브)

```bash
npm install
docker compose up -d db redis   # Postgres 5432, Redis 6379
npm run dev                     # ts-node-dev, 소스 저장 시 자동 재시작
```

→ `http://localhost:3000` · 헬스체크 `GET /health` → `ok`

### 3. Docker 전체 스택 (앱까지 컨테이너로)

```bash
docker compose up --build       # app 3000, db 5432, redis 6379
```

`app` 컨테이너는 `.env`를 읽되, `docker-compose.yml`의 `environment:`가
`DATABASE_URL`/`REDIS_URL`의 호스트를 **`localhost` → 서비스명(`db`, `redis`)으로 덮어쓴다.**
컨테이너 안에서 `localhost`는 자기 자신이라 이 덮어쓰기가 없으면 `ECONNREFUSED`가 난다.

> 코드를 고치며 개발할 땐 2번(네이티브)이 편하다. 이때 `app` 컨테이너는 꺼둘 것 —
> 3000 포트를 두고 다투고, 컨테이너 안의 코드는 빌드 시점에 고정돼 있다.

### 4. 포트 정리

| 환경 | 컴포넌트 | 포트 |
|---|---|---|
| 로컬 | 백엔드 (`npm run dev` 또는 compose `app`) | **3000** |
| 로컬 | Postgres / Redis (compose) | 5432 / 6379 |
| 로컬 | 관리자 SPA (`syak_admin` 레포, `npm run dev`) | **3100** → `/api`를 3000으로 프록시 |
| 운영 | 컨테이너 `syak-green` | 호스트 **3001** → 컨테이너 3000 |
| 운영 | nginx | 80/443 → `/api/`를 3001로 프록시 |

### 5. DB 초기화

로컬 DB는 `docker compose up db` 시 `db/init.sql`이 자동 실행된다.

Supabase에는 SQL Editor에서 직접 실행해야 하는 것들이 있다.

| 파일 | 용도 |
|---|---|
| `db/supabase-migration.sql` | 슬롯 알림 트리거 |
| `db/migration_marketing.sql` | `marketing_snapshots`, `marketing_tokens` |

이미지 갤러리를 쓰려면 Storage에 **공개 버킷 `marketing-images`** 를 만들어야 한다.

### 6. 빌드 / 실행

```bash
npm run build   # tsc → dist/
npm start       # node dist/server.js
```

## 인증 흐름

```
1. 클라이언트 → POST /auth/kakao { access_token }
   (소셜 SDK로 받은 토큰. 서버는 카카오 REST 키를 갖지 않는다)
2. 서버 → 카카오 API로 프로필 검증
3. DB 조회 → 신규면 users + user_social_accounts 생성
4. 응답 쿠키: syak_access (15분), syak_refresh (1일, path=/api/v1/auth/token/refresh)
5. 응답 바디: { user, isNewUser }   ← 토큰은 바디에 없다

토큰 갱신:
   클라이언트 → POST /auth/token/refresh (syak_refresh 쿠키 자동 전송)
   → 새 syak_access 발급 (204, 바디 없음)

소셜 계정 연동:
   로그인 상태에서 → POST /auth/link/naver { access_token }
   → 같은 users.id에 user_social_accounts 추가
```

**인증은 전부 쿠키다. `Authorization: Bearer` 는 어디에서도 받지 않는다.**

| 클라이언트 | 쿠키 |
|---|---|
| 소비자 앱 | `syak_access` / `syak_refresh` |
| 사장님 앱 | `syak_owner_access` / `syak_owner_refresh` |
| 관리자 웹 | `syak_admin` (8시간) |
| GitHub Actions | 쿠키 대신 `X-Internal-Key` 헤더 |

→ 네이티브 앱은 HTTP 클라이언트에 쿠키 저장소를 켜야 한다 (RN: `@react-native-cookies/cookies`
또는 `credentials: 'include'`). 자세한 연동 가이드는 [docs/09-frontend-integration.md](docs/09-frontend-integration.md).

### CSRF

**의도적으로 미적용이다.** 이 API는 네이티브 앱 전용이라 브라우저의 자동 쿠키 첨부가 없고,
따라서 CSRF가 성립하지 않는다 (`src/server.ts` 주석 참고).
관리자 웹은 브라우저지만 `SameSite=Strict` 쿠키로 방어한다.
**일반 웹 클라이언트가 이 API를 직접 쓰게 되면 CSRF 미들웨어를 다시 넣어야 한다.**

## 테스트

```bash
# 단위 테스트 (커버리지 80% 기준)
npm test

# E2E 테스트 (Docker PostgreSQL 자동 기동)
npm run test:e2e

# 커버리지 리포트
npm run test -- --coverage
```

HTTP 파일로 수동 테스트: `http/` 폴더의 `.http` 파일을 VS Code REST Client 또는 IntelliJ HTTP Client로 실행.

## DB 스키마 (RDS)

```
users
  id, nickname, profile_image, created_at

user_social_accounts
  id, user_id → users, social_provider, social_id
  UNIQUE(social_provider, social_id)

refresh_tokens
  id, user_id → users, token, expires_at

favorites
  id, user_id → users, shop_id (TEXT), shop_name, shop_region
  shop_name / shop_region 비정규화 — Supabase JOIN 불가

notification_settings
  user_id → users, near_enabled, near_lat/lng, radius_km,
  favorite_enabled, shop_news_enabled, fcm_token

notifications
  id, user_id → users, shop_id, shop_name, type, slot_time, slot_date, read_at
```

## CI/CD

```
[ci.yml]              push/PR → main, develop
  ├── TypeScript 타입 체크
  ├── Jest 단위 테스트 (커버리지 80%)
  └── E2E 테스트 (Docker PostgreSQL)

[deploy.yml]          push → master  (= master 푸시는 곧 운영 배포)
  ├── Dockerfile 빌드 → ghcr.io/themuselab/syak-backend:{sha}
  └── EC2 SSH → ~/deploy.sh {이미지}
        ├── docker pull
        ├── syak-green 재생성 (-p 3001:3000, --env-file ~/syak.env)
        └── /health 헬스체크 30초

[marketing-snapshot.yml]  매일 08:20 KST + 수동
  └── node scripts/marketing/daily-snapshot.mjs

[report-app.yml]      매일 08:05 KST — 디스코드 리포트
```

> ⚠️ `ci.yml`은 `main`/`develop` 트리거라 **`master` 푸시에서는 돌지 않는다.**
> 즉 CI 통과가 배포의 전제가 아니다. 푸시 전에 로컬에서 `npx tsc --noEmit`과 `npm test`를 돌릴 것.

### 배포 관련 사실들

- 운영 `.env`는 레포가 아니라 **EC2의 `/home/ec2-user/syak.env`** 에 있다. 새 환경변수를 추가하면
  이 파일에 직접 넣고 컨테이너를 재생성해야 한다 (`--env-file`은 시작 시점에만 읽힌다).
- `Dockerfile`은 `dist/`와 `scripts/marketing/image-recipes.json`만 런타임 이미지에 넣는다.
  **런타임에 읽는 파일을 추가하면 `COPY`도 같이 추가**해야 한다. 안 그러면 로컬만 되고 운영은 500.
- SSH로 `~/deploy.sh`를 직접 돌리면 `docker pull`이 GHCR 인증 만료로 `denied` 날 수 있다.
  워크플로는 매번 `docker login`을 하므로 문제없다. 수동 재기동은 pull 없이:

```bash
ssh -i syak-ec2.pem ec2-user@<EC2_IP>
IMG=$(docker inspect --format '{{.Config.Image}}' syak-green)
docker rm -f syak-green
docker run -d --name syak-green --restart unless-stopped \
  -p 3001:3000 --env-file /home/ec2-user/syak.env "$IMG"
curl -sf http://127.0.0.1:3001/health
```

## 관리자 · 마케팅

관리자 SPA는 별도 레포(`themuselab/syak_admin`)이며 `/api/v1/admin/*`을 호출한다.
쿠키 세션(`syak_admin`)으로 인증한다. → [docs/08-admin.md](docs/08-admin.md)

마케팅 지표는 GitHub Actions가 매일 수집해 Supabase에 쌓고, 관리자 마케팅 탭이 읽는다.
필요한 토큰은 **EC2가 아니라 레포 Secrets**에 넣는다 (서버 코드는 그 토큰을 읽지 않는다).
→ [docs/10-marketing-automation.md](docs/10-marketing-automation.md)

```bash
# 로컬에서 수동 실행 (.env에 토큰을 채운 경우)
set -a; source .env; set +a
node scripts/marketing/daily-snapshot.mjs    # 지표 수집 + AI 조언
node scripts/marketing/generate-images.mjs 5 # 시안 이미지 5장 (관리자 버튼과 동일 로직)
```

## 에러 형식

모든 에러는 일관된 JSON + 한국어 메시지로 반환된다.

```json
{
  "code": "AUTH_TOKEN_EXPIRED",
  "message": "토큰이 만료되었습니다. 다시 로그인해 주세요",
  "details": {}
}
```
