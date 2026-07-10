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
data: {"users":42,"owners":7,"partnerShops":5,"views7d":1230,"openCodes":3,"pendingInquiries":2,"ts":"2026-06-21T06:20:00.000Z"}
```

| 필드 | 설명 |
|---|---|
| `users` | 소비자 가입자 총 수 |
| `owners` | 사장님 계정 총 수 |
| `partnerShops` | 샵 연동 완료된 사장님 수 |
| `views7d` | 최근 7일 앱 샵 조회 수 |
| `openCodes` | 미사용 유효 인증코드 수 |
| `pendingInquiries` | 검토 대기 중인 도입 문의 수 (관리자 종 알림 뱃지에 사용) |
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
| GET | `/admin/daily-report` | ✅ | 첫 진입 일일 리포트 (전날 요약 + 마케팅 AI 조언) |
| GET | `/admin/owners` | ✅ | 사장님 계정 목록 |
| DELETE | `/admin/owners/:ownerId/shop` | ✅ | 사장님 샵 연동 해제 |
| POST | `/admin/partner-codes` | ✅ | 파트너 인증코드 발급 |
| POST | `/admin/partner-codes/from-naver` | ✅ | 네이버 플레이스 기반 코드 발급 |
| GET | `/admin/naver-place/:placeId` | ✅ | 네이버 플레이스 조회 (프록시) |
| GET | `/admin/partner-shops` | ✅ | 파트너샵 목록 (연동 완료) |
| GET | `/admin/shops/filters` | ✅ | 필터 선택지 (카테고리 · 시/도→시군구 트리) |
| GET | `/admin/shops` | ✅ | 전체 샵 목록 (검색·필터·정렬) |
| POST | `/admin/shops` | ✅ | 샵 등록 |
| PATCH | `/admin/shops/:shopId` | ✅ | 샵 수정 |
| DELETE | `/admin/shops/:shopId` | ✅ | 샵 삭제 |
| GET | `/admin/users` | ✅ | 소비자 가입자 목록 |
| PATCH | `/admin/users/:userId/status` | ✅ | 소비자 계정 정지/해제 |
| GET | `/admin/inquiries` | ✅ | 도입 문의 목록 |
| PATCH | `/admin/inquiries/:inquiryId` | ✅ | 도입 문의 승인/거절 |
| GET | `/admin/marketing/dates` | ✅ | 마케팅 스냅샷 보유 날짜 목록 |
| GET | `/admin/marketing/trend` | ✅ | 마케팅 지표 추세 (카드 클릭 그래프용) |
| GET | `/admin/marketing` | ✅ | 마케팅 스냅샷 (특정 날짜 / 없으면 최신) |
| POST | `/admin/marketing/images/generate` | ✅ | 시안 이미지 생성 (NVIDIA FLUX → Storage, 기본 5장) |
| DELETE | `/admin/marketing/images/:imageId` | ✅ | 시안 이미지 삭제 (Storage 객체 + 스냅샷 동시) |
| GET | `/admin/stats/shop-views` | ✅ | 샵별 조회 수 통계 |
| GET | `/admin/stats/reservation-clicks` | ✅ | 예약 버튼 클릭 통계 |
| GET | `/admin/stats/cancel-requests` | ✅ | 취소석 신청 건수 통계 |
| GET | `/admin/stats/partner-conversion` | ✅ | 파트너샵 전환율 |
| GET | `/admin/stats/visitors` | ✅ | 방문자 추이 (web/toss) |
| GET | `/admin/trends` | ✅ | 30일 일별 추세 (가입·코드·조회) |

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

SSE 미지원 환경이나 초기 로드용 단발성 요약. (필드는 SSE 페이로드와 동일)

**응답 200**
```json
{
  "users": 42,
  "owners": 7,
  "partnerShops": 5,
  "views7d": 1230,
  "openCodes": 3,
  "pendingInquiries": 2
}
```

---

## GET `/admin/daily-report`

관리자 **첫 진입 시 1회** 뜨는 일일 리포트 모달용. 집계 기준은 **KST 어제 00:00 ~ 오늘 00:00**.

**응답 200**
```json
{
  "date": "2026-07-09",
  "views": 110,
  "newUsers": 0,
  "newInquiries": 0,
  "pendingInquiries": 2,
  "marketing": {
    "date": "2026-07-10",
    "instagram": "\"서울에 2만원 대 네일…\" 콘텐츠가 61회 저장으로 …",
    "threads": "\"뷰티샵 원장님 인터뷰…\" 게시물이 86.1K 조회로 …",
    "followUp": "가성비 테마의 네일/페디 콘텐츠를 지속 제작하고 …"
  }
}
```

| 필드 | 설명 |
|---|---|
| `views` | 전날 웹 샵 상세 조회수 |
| `newUsers` | 전날 신규 소비자 회원 |
| `newInquiries` | 전날 신규 도입 문의 |
| `pendingInquiries` | 현재 검토 대기 문의 |
| `marketing` | 최신 마케팅 스냅샷의 AI 조언 (없으면 `null`) |

> 프론트는 `sessionStorage`로 세션당 1회, `localStorage`로 "오늘 하루 보지 않기"를 처리한다.

---

## GET `/admin/marketing/dates`

마케팅 스냅샷이 저장된 날짜 목록 (최신순, 최대 180일).

```json
{ "dates": ["2026-07-10", "2026-07-09"] }
```

---

## GET `/admin/marketing`

특정 날짜 스냅샷. `date` 생략 시 **최신** 스냅샷.

**Query:** `date=YYYY-MM-DD` (선택)

```json
{
  "date": "2026-07-10",
  "data": {
    "metaAds": [{ "label": "광고 지출", "value": "$4.15" }],
    "instagram": {
      "totals": [{ "label": "도달", "value": "32.8K" }],
      "topPosts": [{ "caption": "…", "metric": "저장 61", "sub": "도달 4.6K · 좋아요 20", "url": "https://www.instagram.com/p/…" }],
      "aiAdvice": "…", "aiFollowUp": "…"
    },
    "threads": { "totals": [], "topPosts": [], "aiAdvice": "…", "aiFollowUp": "…" },
    "images": [
      { "id": "2026-07-10-1", "url": "https://…/marketing-images/2026-07-10/1.jpg", "caption": "차 안 · 누드 젤네일", "date": "2026-07-10" }
    ]
  }
}
```

- 데이터가 없으면 `{ "date": null, "data": null }` (관리자는 샘플 표시)
- 지표는 **최근 30일 기준**. `팔로워`/`게시물`만 누적값.
- 수집·저장은 GitHub Actions가 담당 → [10-marketing-automation.md](10-marketing-automation.md)
- `images`는 발행 대기 시안 갤러리 (아래 생성/삭제 API로 관리)

---

## GET `/admin/marketing/trend`

광고 카드 클릭 시 보여줄 **날짜별 추세**. 오래된 → 최신 순.

**Query:** `days` (기본 `30`, 최대 `180`)

```json
{ "snapshots": [{ "date": "2026-07-10", "data": { "metaAds": [] } }] }
```

---

## POST `/admin/marketing/images/generate`

관리자 → 마케팅 → **"이미지 생성"** 버튼. NVIDIA FLUX로 시안을 만들어
Supabase Storage(`marketing-images` 버킷)에 올리고 **오늘 스냅샷의 `data.images` 뒤에 누적**한다.

**Body:** `{ "count": 5 }` (기본 5, 최대 10)

```json
{ "images": [{ "id": "2026-07-10-6", "url": "https://…/6.jpg", "caption": "야경 거리 · 로우키", "date": "2026-07-10" }],
  "added": 5, "failed": 0, "date": "2026-07-10" }
```

- `images`는 **누적 전체 목록**, `added`는 이번에 추가된 장수.
- 병렬 생성이라 5장 기준 **15초 내외**. 프롬프트는 `scripts/marketing/image-recipes.json` 단일 소스.
- 일부가 안전필터(`CONTENT_FILTERED`)에 걸리면 성공분만 저장하고 `failed`로 알린다. 전부 실패하면 500.
- `NVIDIA_API_KEY`(또는 `NVIDIA_API_KEY_FLUX`) 필요.

---

## DELETE `/admin/marketing/images/:imageId`

**Storage 객체와 스냅샷 `data.images` 항목을 함께 삭제**한다. 되돌릴 수 없다.

**Query:** `date=YYYY-MM-DD` (선택. 생략 시 `imageId` 앞 10자에서 유추)

```json
{ "ok": true, "id": "2026-07-10-7", "remaining": 6 }
```

- 없는 이미지는 `404`.
- Storage에서 이미 사라진 경우에도 목록에서는 제거하고 `200`.
- 공개 URL은 CDN에 캐시되어 삭제 직후에도 잠시 `200`으로 응답할 수 있다 (버킷에는 없음).

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

## GET `/admin/shops/filters`

필터 선택지. **지역 목록은 하드코딩하지 않고 DB에서 파생**한다.
- 시군구: `shops.gu` 의 distinct 값
- 시/도: 각 `gu`의 샘플 `detail.roadAddress` 앞부분을 광역자치단체 17개 어휘로 해석해 도출
- 서버 메모리 **30분 캐시**

**응답 200**
```json
{
  "categories": ["네일", "마사지", "반영구", "속눈썹", "왁싱", "태닝", "피부", "헤어"],
  "gus": ["강남구", "부산 금정구", "창원시", "..."],
  "regions": {
    "서울": ["강남구", "강동구", "..."],
    "경남": ["진주시", "창원시"]
  }
}
```

---

## GET `/admin/shops`

Supabase에 등록된 전체 샵 목록 (검색 · 필터 · 정렬 · 페이지네이션).

**Query Parameters**

| 파라미터 | 기본값 | 설명 |
|---|---|---|
| `page` | `1` | 페이지 번호 (50건 단위) |
| `q` | — | 샵명 부분 검색 (ilike) |
| `category` | — | 카테고리 정확 일치 |
| `sido` | — | 시/도. `gu` 없이 주면 해당 시/도의 시군구 전체가 대상 |
| `gu` | — | 시군구 정확 일치 (`sido`보다 우선) |
| `sort` | `name` | 정렬 컬럼 (`name`만 지원) |
| `dir` | `asc` | `asc` \| `desc` |

**응답 200**
```json
{
  "shops": [
    {
      "shopId": "1234567890",
      "name": "달빛네일",
      "gu": "강남구",
      "category": "네일",
      "todayOpen": true,
      "thumbnailUrl": "https://...",
      "isPartner": false,
      "phone": "02-1234-5678",
      "address": "서울 강남구 테헤란로 123",
      "naverReservationUrl": null
    }
  ],
  "total": 41542,
  "page": 1,
  "limit": 50
}
```

> ⚠️ `phone`·`address`는 `shops.detail`(JSONB) 안에 있다. `detail`은 menus/reviews/images를 품은
> 대용량 컬럼이라, 목록 정렬과 함께 `detail->>phone`을 뽑으면 **statement timeout(57014)** 이 난다.
> 그래서 **2단계 조회**(가벼운 목록 → 해당 페이지 id에 대해서만 detail 조회)로 구현되어 있다.

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
