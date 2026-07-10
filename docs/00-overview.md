# Syak API — 개요 및 공통 규칙

세 가지 클라이언트가 같은 서버를 공유합니다:

| 클라이언트 | 대상 | 인증 수단 |
|---|---|---|
| **소비자 앱** (React Native) | 일반 사용자 | `syak_access` 쿠키 |
| **사장님 웹** (Partner Dashboard) | 파트너 샵 사장님 | `syak_owner_access` 쿠키 |
| **관리자 웹** (Admin Dashboard) | Syak 운영팀 | `syak_admin` 쿠키 |

---

## Base URL

| 환경 | URL |
|---|---|
| 개발 | `http://localhost:3000/api/v1` |
| 운영 | `https://api.themuselab.kr/api/v1` |

> 관리자 웹: `https://admin.themuselab.kr` · 헬스체크: `https://api.themuselab.kr/health`
> 앱 연동/마이그레이션 가이드: [09-frontend-integration.md](09-frontend-integration.md)

---

## 인증 방식

토큰을 **HTTP-only 쿠키**로 주고받습니다. `Authorization` 헤더는 사용하지 않습니다.

### 소비자 앱

| 쿠키명 | 용도 | 유효시간 |
|---|---|---|
| `syak_access` | 액세스 토큰 | 15분 |
| `syak_refresh` | 갱신 토큰 | 1일 (`path=/api/v1/auth/token/refresh`) |

### 사장님 웹

| 쿠키명 | 용도 | 유효시간 |
|---|---|---|
| `syak_owner_access` | 사장님 액세스 토큰 | 15분 |
| `syak_owner_refresh` | 사장님 갱신 토큰 | 1일 (`path=/api/v1/owner/auth/token/refresh`) |

### 관리자 웹

| 쿠키명 | 용도 | 유효시간 |
|---|---|---|
| `syak_admin` | 관리자 세션 | 8시간 |

모든 쿠키는 `httpOnly: true` — JS에서 직접 읽기 불가능합니다.

---

## CSRF에 대하여

**소비자 앱** 엔드포인트(`/auth`, `/shops`, `/slots`, `/favorites`, `/notifications`, `/users`)는 CSRF 보호를 적용하지 않습니다.
네이티브 앱은 HTTP 클라이언트가 쿠키를 명시적으로 관리하므로 CSRF 위협이 성립하지 않습니다.

**사장님 웹 / 관리자 웹** 쿠키는 `sameSite: strict`로 발급되어 크로스 사이트 요청에서 자동 전송이 차단됩니다.

---

## 공통 에러 형식

모든 에러는 다음 JSON 구조로 반환됩니다:

```json
{
  "code": "에러_코드",
  "message": "한국어 설명",
  "details": { ... }
}
```

`details`는 필드 검증 오류일 때만 포함됩니다:
```json
{
  "code": "VALIDATION_ERROR",
  "message": "요청 데이터가 올바르지 않습니다",
  "details": {
    "access_token": "access_token이 필요합니다"
  }
}
```

---

## 에러 코드 전체 목록

### 소비자 앱

| 코드 | HTTP | 상황 |
|---|---|---|
| `AUTH_UNAUTHORIZED` | 401 | 쿠키 없음 / 비로그인 접근 |
| `AUTH_INVALID_TOKEN` | 401 | 토큰 변조 |
| `AUTH_TOKEN_EXPIRED` | 401 | 액세스 토큰 만료 → `/auth/token/refresh` 호출 |
| `AUTH_REFRESH_INVALID` | 401 | 리프레시 토큰 무효 → 재로그인 필요 |
| `AUTH_SOCIAL_FAILED` | 400 | 소셜 access_token 검증 실패 |
| `FORBIDDEN` | 403 | 권한 없음 |
| `VALIDATION_ERROR` | 400 | 필수 파라미터 누락 / 잘못된 값 |
| `SHOP_NOT_FOUND` | 404 | 존재하지 않는 shopId |
| `SLOT_NOT_FOUND` | 404 | 슬롯 없음 |
| `FAVORITE_ALREADY_EXISTS` | 409 | 이미 즐겨찾기 추가된 샵 |
| `FAVORITE_NOT_FOUND` | 404 | 즐겨찾기에 없는 샵 |
| `NOTIFICATION_SETTINGS_NOT_FOUND` | 404 | 알림 설정 미초기화 |
| `NOT_FOUND` | 404 | 존재하지 않는 경로 |
| `INTERNAL_ERROR` | 500 | 서버 내부 오류 |

### 사장님 웹

| 코드 | HTTP | 상황 |
|---|---|---|
| `OWNER_UNAUTHORIZED` | 401 | `syak_owner_access` 없음 또는 무효 |
| `OWNER_NOT_FOUND` | 404 | 사장님 계정 없음 |
| `PARTNER_CODE_INVALID` | 400 | 존재하지 않는 인증코드 |
| `PARTNER_CODE_EXPIRED` | 400 | 인증코드 유효기간 만료 |
| `PARTNER_CODE_USED` | 409 | 이미 사용된 인증코드 |
| `SHOP_ALREADY_LINKED` | 409 | 이미 다른 샵이 연결된 계정 |
| `SLOT_FORBIDDEN` | 403 | 내 샵이 아닌 슬롯 접근 |

### 관리자 웹

| 코드 | HTTP | 상황 |
|---|---|---|
| `ADMIN_UNAUTHORIZED` | 401 | 관리자 쿠키 없음 또는 비밀번호 불일치 |
| `INTERNAL_KEY_INVALID` | 403 | `X-Internal-Key` 헤더 불일치 |

---

## 캐싱

샵 목록/상세 응답은 Redis에 캐시됩니다.

| 엔드포인트 | TTL | 비고 |
|---|---|---|
| `GET /api/v1/shops` | 5분 | 필터 파라미터 조합별 개별 캐시 |
| `GET /api/v1/shops/:shopId` | 10분 | shopId별 개별 캐시 |

- Cache-Aside 패턴: 요청 → Redis 조회 → 미스 시 DB → Redis 저장
- Redis 장애 시 자동으로 DB 직접 조회로 fallback (서버는 느려질 뿐 멈추지 않음)
- 슬롯 API(`/slots/*`)는 캐시 없음 — 실시간 예약 가용성에 영향을 주기 때문

---

## 실시간 (SSE)

일부 API는 Server-Sent Events로 실시간 데이터를 push합니다.

| 엔드포인트 | 대상 | 갱신 주기 |
|---|---|---|
| `GET /admin/events` | 관리자 대시보드 | 즉시 + 15초마다 |

> SSE 연결은 `EventSource` API로 하며, 브라우저가 재연결을 자동으로 처리합니다.

---

## 토큰 만료 처리 흐름

```
API 호출
  → 401 AUTH_TOKEN_EXPIRED 수신
  → POST /api/v1/auth/token/refresh 호출
      → 성공: 새 syak_access 쿠키 자동 설정, 원래 API 재시도
      → 401 AUTH_REFRESH_INVALID: 재로그인 화면으로 이동
```

---

## 소셜 계정 연동

한 계정에 카카오·네이버·Apple을 모두 연결할 수 있습니다.
어떤 소셜로 로그인해도 **같은 유저 ID**가 반환됩니다.

```
카카오 로그인 → userId: "abc"
네이버 연동   → userId: "abc" (동일)
이후 네이버 로그인 → userId: "abc" (동일)
```

자세한 내용은 [01-auth.md](./01-auth.md) 참조.

---

## 문서 목록

### 소비자 앱

| 파일 | 내용 |
|---|---|
| [01-auth.md](./01-auth.md) | 소셜 로그인, 계정 연동, 토큰 갱신, 로그아웃 |
| [02-catalog.md](./02-catalog.md) | 샵 목록, 샵 상세 |
| [03-reservation.md](./03-reservation.md) | 예약 슬롯 조회, 검색 |
| [04-favorite.md](./04-favorite.md) | 즐겨찾기 추가/삭제/목록 |
| [05-notification.md](./05-notification.md) | 알림 목록, 설정 조회/변경 |
| [06-user.md](./06-user.md) | 내 프로필, 회원 탈퇴 |

### 파트너 & 관리자

| 파일 | 내용 |
|---|---|
| [07-owner.md](./07-owner.md) | 사장님 소셜 로그인, 인증코드 샵 연결, 슬롯 CRUD, 대시보드 통계 |
| [08-admin.md](./08-admin.md) | 관리자 로그인, 실시간 대시보드(SSE), 사장님·샵·유저 관리, 통계 |
