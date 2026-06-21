# 08 — 관리자 API

Syak 운영팀 전용 API입니다. **환경변수 기반 단일 계정**을 사용합니다.

---

## 인증 방식

이메일 + 비밀번호 로그인 → `syak_admin` 세션 쿠키 (8시간 유효).

| 환경변수 | 설명 |
|---|---|
| `ADMIN_EMAIL` | 관리자 이메일 |
| `ADMIN_PASSWORD` | 관리자 비밀번호 |
| `ADMIN_SESSION_TOKEN` | 세션 쿠키 값 (재시작 후에도 동일한 값 유지용) |

> 운영 환경에서는 반드시 강도 높은 비밀번호와 무작위 session token을 사용하세요.

---

## 실시간 대시보드 (SSE)

관리자 대시보드는 **Server-Sent Events**로 실시간 상태를 수신합니다.

```
GET /api/v1/admin/events
Accept: text/event-stream
Cookie: syak_admin=<token>
```

- 연결 즉시 현재 상태 1회 push
- 이후 **15초마다** 자동 갱신
- 다음 이벤트 발생 시 **즉시** push (15초 대기 없음):
  - 소비자 신규 가입
  - 사장님 신규 가입
  - 인증코드로 샵 연동 완료
  - 관리자 파트너 코드 발급
  - 관리자 샵 연동 해제

**SSE 메시지 형식**
```
data: {"users":42,"owners":7,"partnerShops":5,"views7d":1230,"openCodes":3,"ts":"2026-06-21T06:20:00.000Z"}
```

| 필드 | 설명 |
|---|---|
| `users` | 소비자 가입자 총 수 |
| `owners` | 사장님 계정 총 수 |
| `partnerShops` | 샵 연동 완료된 사장님 수 |
| `views7d` | 최근 7일 앱 샵 조회 수 |
| `openCodes` | 미사용 유효 인증코드 수 |
| `ts` | 집계 기준 시각 (ISO 8601) |

**클라이언트 예시**
```javascript
const es = new EventSource('/api/v1/admin/events', { withCredentials: true });
es.onmessage = (e) => {
  const data = JSON.parse(e.data);
  updateDashboard(data);
};
es.onerror = () => { /* 재연결은 브라우저가 자동 처리 */ };
```

---

## 엔드포인트 목록

| 메서드 | 경로 | 인증 | 설명 |
|---|---|---|---|
| POST | `/admin/auth/login` | — | 관리자 로그인 |
| POST | `/admin/auth/logout` | — | 로그아웃 |
| GET | `/admin/events` | ✅ | 실시간 SSE 스트림 |
| GET | `/admin/dashboard` | ✅ | 대시보드 요약 (SSE fallback) |
| GET | `/admin/owners` | ✅ | 사장님 계정 목록 |
| DELETE | `/admin/owners/:ownerId/shop` | ✅ | 사장님 샵 연동 해제 |
| POST | `/admin/partner-codes` | ✅ | 파트너 인증코드 발급 |
| GET | `/admin/partner-shops` | ✅ | 파트너샵 목록 (연동 완료) |
| GET | `/admin/shops` | ✅ | 전체 샵 목록 |
| GET | `/admin/users` | ✅ | 소비자 가입자 목록 |
| GET | `/admin/stats/shop-views` | ✅ | 샵별 조회 수 통계 |
| GET | `/admin/stats/cancel-requests` | ✅ | 취소석 신청 건수 통계 |
| GET | `/admin/stats/partner-conversion` | ✅ | 파트너샵 전환율 |

> ✅ = `syak_admin` 쿠키 필요

---

## POST `/admin/auth/login`

**요청 Body**
```json
{ "email": "admin@syak.kr", "password": "..." }
```

**응답 200**
```json
{ "ok": true }
```
`syak_admin` 쿠키 자동 설정 (8시간, `httpOnly`, `sameSite: strict`)

**에러**
| 코드 | 상황 |
|---|---|
| `VALIDATION_ERROR` | 이메일 또는 비밀번호 누락 |
| `ADMIN_UNAUTHORIZED` | 이메일/비밀번호 불일치 |

---

## GET `/admin/dashboard`

SSE 미지원 환경이나 초기 로드용 단발성 요약.

**응답 200**
```json
{
  "users": 42,
  "owners": 7,
  "partnerShops": 5,
  "views7d": 1230,
  "openCodes": 3
}
```

---

## GET `/admin/owners`

**응답 200**
```json
{
  "owners": [
    {
      "id": "uuid",
      "nickname": "홍길동",
      "profileImage": "https://...",
      "shopId": "1004494913",
      "shopName": "젤리네일",
      "shopGu": "강남구",
      "createdAt": "2026-06-01T00:00:00Z"
    }
  ]
}
```

> 최대 200건 반환. `shopId`가 null이면 아직 샵 미연결 계정.

---

## DELETE `/admin/owners/:ownerId/shop`

사장님과 샵의 연동을 해제합니다. (사장님 계정 삭제가 아님)

**응답 200** `{ "ok": true }`

> 해제 직후 SSE 연결된 관리자에게 즉시 push됩니다.

---

## POST `/admin/partner-codes`

파트너 인증코드를 발급합니다. 발급한 코드를 사장님에게 전달하면 사장님이 웹에서 입력해 샵을 연결합니다.

**요청 Body**
```json
{ "shopId": "1004494913" }
```

**응답 201**
```json
{
  "code": "AB3K7P2Q",
  "expiresAt": "2026-06-28T06:00:00.000Z"
}
```

> 코드는 8자 (대문자+숫자, 혼동 문자 제외), 7일 유효, 1회용.

---

## GET `/admin/partner-shops`

샵 연동이 완료된 파트너 샵 목록.

**응답 200**
```json
{
  "shops": [
    {
      "id": "1004494913",
      "name": "젤리네일",
      "gu": "강남구",
      "category": "네일",
      "todayOpen": true,
      "ownerId": "uuid",
      "ownerNickname": "홍길동"
    }
  ]
}
```

---

## GET `/admin/shops`

Supabase에 등록된 전체 샵 목록 (페이지네이션).

**Query Parameters**

| 파라미터 | 기본값 | 설명 |
|---|---|---|
| `page` | `1` | 페이지 번호 |

**응답 200** (50건 단위)
```json
{
  "shops": [
    { "id": "...", "name": "...", "gu": "강남구", "category": "네일", "todayOpen": true }
  ],
  "total": 1250,
  "page": 1,
  "limit": 50
}
```

---

## GET `/admin/users`

소비자 앱 가입자 목록 (페이지네이션).

**Query Parameters** `page` (기본 1)

**응답 200** (50건 단위)
```json
{
  "users": [
    {
      "id": "uuid",
      "nickname": "김시야",
      "profileImage": null,
      "createdAt": "2026-06-01T00:00:00Z",
      "favoriteCount": "3"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 50
}
```

---

## GET `/admin/stats/shop-views`

앱에서 발생한 샵 상세 조회 수 통계.

**Query Parameters**

| 파라미터 | 기본값 | 값 |
|---|---|---|
| `period` | `7d` | `7d` \| `30d` |

**응답 200**
```json
{
  "period": "7d",
  "stats": [
    { "shopId": "1004494913", "shopName": "젤리네일", "gu": "강남구", "views": "128" }
  ]
}
```

> 최대 100개 샵, 조회 수 내림차순.

---

## GET `/admin/stats/cancel-requests`

취소석 알림 발송 건수 (일별).

**Query Parameters** `period` — `7d` | `30d`

**응답 200**
```json
{
  "period": "7d",
  "daily": [
    { "date": "2026-06-15", "count": "12" },
    { "date": "2026-06-16", "count": "9" }
  ],
  "total": 87
}
```

---

## GET `/admin/stats/partner-conversion`

파트너 샵별 앱 조회수 대비 사장님 슬롯 등록 현황.

**응답 200**
```json
{
  "stats": [
    {
      "shopId": "1004494913",
      "shopName": "젤리네일",
      "views7d": "128",
      "ownerSlotsTotal": "15"
    }
  ]
}
```

---

## 에러 코드 (관리자 전용)

| 코드 | HTTP | 상황 |
|---|---|---|
| `ADMIN_UNAUTHORIZED` | 401 | 관리자 쿠키 없음 또는 비밀번호 불일치 |

---

## 내부 API (서버간 통신용)

`X-Internal-Key` 헤더를 사용하는 기계간 API입니다. 관리자 쿠키 불필요.

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/internal/partner-codes` | 파트너 코드 발급 (백엔드 서버에서 직접 호출) |

```
POST /api/v1/internal/partner-codes
X-Internal-Key: <INTERNAL_API_KEY 환경변수>
Content-Type: application/json

{ "shopId": "1004494913" }
```

> 환경변수 `INTERNAL_API_KEY`와 헤더 값이 일치하지 않으면 `INTERNAL_KEY_INVALID` (403) 반환.
