# Syak Backend

네일/뷰티샵 예약 모바일 앱 **Syak**의 Express + TypeScript 백엔드.

## 기술 스택

| 분류 | 기술 |
|---|---|
| Runtime | Node.js 20, TypeScript |
| Framework | Express 4 |
| Auth | 카카오 / 네이버 / Apple 소셜 로그인, HTTP-only 쿠키 (CSRF 보호) |
| DB (사용자) | AWS RDS PostgreSQL — users, favorites, notifications, refresh_tokens |
| DB (샵/슬롯) | Supabase PostgreSQL — shops, slots (읽기 전용) |
| 실시간 | Supabase LISTEN/NOTIFY → FCM 푸시 |
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
    ├── lib/                  # database.ts, slotListener.ts
    └── middleware/           # auth, csrf, error, httpLogger
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

**실시간 알림**
- Supabase DB 트리거 → `pg_notify('slot_inserted', ...)` → `SlotListener` (Direct connection 필수, PgBouncer 불가) → FCM 푸시

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

## 시작하기

### 사전 요구사항

- Node.js 20+
- Docker & Docker Compose

### 1. 환경 변수 설정

```bash
cp .env.example .env
```

`.env` 필수 항목:

```
DATABASE_URL=postgresql://...          # AWS RDS (사용자 데이터)
SUPABASE_DATABASE_URL=postgresql://... # Supabase Direct (port 5432 필수)
JWT_SECRET=<32자 이상 랜덤 문자열>
KAKAO_REST_API_KEY=
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=
APPLE_TEAM_ID=
APPLE_KEY_ID=
APPLE_PRIVATE_KEY=
FCM_SERVER_KEY=
INTERNAL_API_KEY=
```

> Supabase URL은 **반드시 port 5432 Direct connection** 사용. PgBouncer(6543)는 LISTEN/NOTIFY 미지원.

### 2. 개발 서버 (로컬 PostgreSQL 포함)

```bash
npm install
docker compose up -d db    # 로컬 DB만 기동
npm run dev                # ts-node-dev hot reload
```

### 3. Docker 전체 스택

```bash
docker compose up --build
```

서버: `http://localhost:3000`

### 4. DB 초기화

개발용 로컬 DB는 `docker compose up db` 시 `db/init.sql`이 자동 실행된다.

Supabase에는 별도로 `db/supabase-migration.sql`을 SQL Editor에서 실행해야 한다 (슬롯 알림 트리거).

## 인증 흐름

```
1. 클라이언트 → POST /auth/kakao { access_token }
2. 서버 → 카카오 API로 프로필 검증
3. DB 조회 → 신규면 users + user_social_accounts 생성
4. 응답 쿠키: syak_access (15분), syak_refresh (1일, path 제한)
5. 응답 바디: { user, isNewUser }

토큰 갱신:
   클라이언트 → POST /auth/token/refresh (syak_refresh 쿠키 자동 전송)
   → 새 syak_access 발급 (204)

소셜 계정 연동:
   로그인 상태에서 → POST /auth/link/naver { access_token }
   → 같은 users.id에 user_social_accounts 추가
   → 이후 네이버로 로그인해도 동일 계정
```

### CSRF 보호

- GET 요청 시 `_csrf` 쿠키 자동 발급 (httpOnly: false, HMAC 서명)
- POST/PUT/PATCH/DELETE 요청 시 `X-CSRF-Token` 헤더 검증
- 소셜 로그인 초기 요청과 `/internal/` 경로는 CSRF 검증 제외

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
push → GitHub Actions

  [ci.yml]
    ├── TypeScript 타입 체크
    ├── Jest 단위 테스트 (커버리지 80%)
    └── E2E 테스트 (Docker PostgreSQL)

  [deploy.yml] (main 브랜치)
    ├── Docker 이미지 빌드 → GHCR 푸시
    └── EC2 SSH → docker pull & restart
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
