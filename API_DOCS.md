# Syak Backend API 문서

**Base URL (Production):** `https://api.themuselab.kr/api/v1`  
**Base URL (Local):** `http://localhost:3000/api/v1`

> 2026-07-09부터 운영 API는 HTTPS 도메인으로 전환되었습니다.
> 구 주소 `http://54.116.107.78/api/v1` 는 폐기 예정입니다. 앱 연동 가이드: [09-frontend-integration.md](docs/09-frontend-integration.md)

---

## 인증 방식

**모든 인증은 HttpOnly 쿠키로 한다. `Authorization: Bearer` 는 서버가 읽지 않는다.**

| 전달 | 값 | 대상 |
|---|---|---|
| `Cookie: syak_access=<jwt>` | 소비자 액세스 토큰 (15분) | 소비자 인증 필요 API |
| `Cookie: syak_refresh=<jwt>` | 소비자 갱신 토큰 (1일, path=`/api/v1/auth/token/refresh`) | 토큰 갱신 전용 |
| `Cookie: syak_owner_access=<jwt>` | 사장님 액세스 토큰 | 사장님 인증 필요 API |
| `Cookie: syak_admin=<token>` | 어드민 세션 (SameSite=Strict, 8시간) | 관리자 API |
| `X-Internal-Key: <INTERNAL_API_KEY>` | 서버간 비밀키 | 내부 API (GitHub Actions 전용) |

쿠키 속성은 `COOKIE_SECURE` / `COOKIE_SAME_SITE` 환경변수로 제어한다 (운영: `true` / `none`).
네이티브 앱은 HTTP 클라이언트의 쿠키 저장소를 켜야 한다 → [09-frontend-integration.md](docs/09-frontend-integration.md)

---

## 헬스체크

| Method | Path | 설명 |
|---|---|---|
| `GET` | `/health` | 서버 상태 확인 |

**Response:** `200 ok`

---

## 소비자 인증 `/auth`

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| `POST` | `/auth/kakao` | - | 카카오 로그인 |
| `POST` | `/auth/naver` | - | 네이버 로그인 |
| `POST` | `/auth/apple` | - | 애플 로그인 |
| `POST` | `/auth/link/:provider` | Cookie | 소셜 계정 추가 연동 |
| `POST` | `/auth/token/refresh` | - | 액세스 토큰 갱신 |
| `DELETE` | `/auth/signout` | Cookie | 로그아웃 |

**POST `/auth/:provider` Request:**
```json
{ "access_token": "소셜_SDK로_받은_토큰" }
```
`code`가 아니라 **소셜 SDK가 발급한 access_token**을 보낸다. 서버는 이를 카카오/네이버/애플에
직접 검증하며, 서버에 소셜 앱 키를 두지 않는다. (Apple만 `APPLE_TEAM_ID`로 audience를 검증)

**Response `200`(기존 유저) / `201`(신규 유저):**
```json
{ "user": { "id": "uuid", "nickname": "홍길동", "profileImage": null }, "isNewUser": false }
```
**토큰은 응답 바디에 없다.** `Set-Cookie`로 `syak_access`(15분), `syak_refresh`(1일)가 내려온다.

**POST `/auth/token/refresh`** → `204 No Content`. `syak_refresh` 쿠키를 읽어 새 `syak_access`를 심는다.

---

## 샵 목록/상세 `/shops`

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| `GET` | `/shops` | - | 샵 목록 |
| `GET` | `/shops/:shopId` | - | 샵 상세 |
| `POST` | `/shops/:shopId/reservation-click` | - | 예약 클릭 이벤트 기록 |

### GET `/shops` 쿼리 파라미터

| 파라미터 | 타입 | 예시 | 설명 |
|---|---|---|---|
| `q` | string | `뷰티` | 샵 이름 검색 |
| `categories` | string | `네일,헤어` | 카테고리 필터 (콤마 구분, 복수 OR) |
| `districts` | string | `강남구,서초구` | 구 필터 (콤마 구분) |
| `price_tiers` | string | `1만원대,2만원대` | 가격대 필터 |
| `sort` | string | `price_asc` | 정렬: `default` `price_asc` `price_desc` `partner` |
| `has_event` | boolean | `true` | 이벤트 있는 샵만 |
| `has_slot` | boolean | `true` | 오늘 오픈 샵만 |
| `slot_date` | string | `2026-07-03` | 특정 날짜 슬롯 있는 샵만 (YYYY-MM-DD) |
| `slot_time` | string | `14:00` | `slot_date`와 함께 사용, 특정 시간 필터 |
| `page` | number | `1` | 페이지 번호 (기본값: 1) |
| `limit` | number | `20` | 페이지당 결과 수 (기본값: 20, 최대: 100) |

**카테고리 목록:** `네일` `헤어` `왁싱` `반영구` `속눈썹` `마사지` `피부` `태닝`

**GET `/shops` Response:**
```json
{
  "items": [
    {
      "id": "1683892292",
      "name": "1022뷰티살롱",
      "region": "서울",
      "district": "하남시",
      "minPrice": 29000,
      "priceTier": "2만원대",
      "categories": ["속눈썹"],
      "todayOpen": true,
      "slotSummary": [{ "name": "스타일리스트명", "times": ["10:00", "10:30"] }],
      "eventDesc": "이벤트 설명",
      "eventPrice": "이벤트 가격",
      "isPartner": false,
      "lat": 37.5665,
      "lng": 126.978,
      "reviewCount": 127,
      "photos": ["https://..."]
    }
  ],
  "total": 1500,
  "page": 1,
  "limit": 20
}
```

**GET `/shops/:shopId` Response:** (목록 필드 + 아래 추가)
```json
{
  "...목록 필드 전부...",
  "bizId": "네이버_플레이스_ID",
  "bookingUrl": "https://예약URL",
  "phone": "02-1234-5678",
  "roadAddress": "경기 하남시 미사강변대로 80",
  "menus": [
    { "name": "젤네일", "price": 35000, "recommend": true }
  ],
  "reviews": [
    {
      "body": "리뷰 내용",
      "images": ["https://..."],
      "keywords": ["친절해요", "깔끔해요"],
      "ownerReply": "감사합니다"
    }
  ]
}
```

---

## 슬롯 `/slots`

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| `GET` | `/slots/shop/:shopId` | - | 특정 샵의 슬롯 목록 |
| `GET` | `/slots/search` | - | 슬롯 검색 |

---

## 즐겨찾기 `/favorites` (소비자 인증 필요)

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| `GET` | `/favorites` | Cookie | 즐겨찾기 목록 |
| `POST` | `/favorites/:shopId` | Cookie | 즐겨찾기 추가 |
| `DELETE` | `/favorites/:shopId` | Cookie | 즐겨찾기 삭제 |

---

## 알림 `/notifications` (소비자 인증 필요)

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| `GET` | `/notifications` | Cookie | 알림 목록 |
| `GET` | `/notifications/settings` | Cookie | 알림 설정 조회 |
| `PATCH` | `/notifications/settings` | Cookie | 알림 설정 변경 |
| `POST` | `/notifications/internal/dispatch` | X-Internal-Key | 슬롯 오픈 FCM 발송 (GitHub Actions 전용) |

---

## 유저 `/users` (소비자 인증 필요)

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| `GET` | `/users/me` | Cookie | 내 프로필 조회 |
| `DELETE` | `/users/me` | Cookie | 회원 탈퇴 |

---

## 문의 `/inquiries`

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| `POST` | `/inquiries` | - | 도입 문의 제출 (샵 사장님용) |

---

## 사장님 `/owner`

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| `POST` | `/owner/auth/kakao` | - | 사장님 카카오 로그인 |
| `POST` | `/owner/auth/naver` | - | 사장님 네이버 로그인 |
| `POST` | `/owner/auth/apple` | - | 사장님 애플 로그인 |
| `POST` | `/owner/auth/token/refresh` | - | 사장님 토큰 갱신 |
| `POST` | `/owner/auth/sign-out` | Cookie(owner) | 사장님 로그아웃 |
| `POST` | `/owner/auth/code` | Cookie(owner) | 파트너 코드로 샵 연결 |
| `GET` | `/owner/auth/me` | Cookie(owner) | 사장님 내 정보 |
| `GET` | `/owner/slots` | Cookie(owner) + 샵연결 | 내 슬롯 목록 |
| `POST` | `/owner/slots` | Cookie(owner) + 샵연결 | 슬롯 등록 |
| `PATCH` | `/owner/slots/:slotId` | Cookie(owner) + 샵연결 | 슬롯 수정 |
| `DELETE` | `/owner/slots/:slotId` | Cookie(owner) + 샵연결 | 슬롯 삭제 |
| `GET` | `/owner/analytics` | Cookie(owner) + 샵연결 | 내 샵 분석 데이터 |

---

## 관리자 `/admin` (어드민 세션 필요)

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| `POST` | `/admin/auth/login` | - | 관리자 로그인 |
| `POST` | `/admin/auth/logout` | - | 관리자 로그아웃 |
| `GET` | `/admin/events` | Cookie | SSE 실시간 대시보드 스트림 |
| `GET` | `/admin/dashboard` | Cookie | 대시보드 요약 (SSE fallback) |
| `GET` | `/admin/owners` | Cookie | 사장님 계정 목록 |
| `DELETE` | `/admin/owners/:ownerId/shop` | Cookie | 사장님-샵 연결 해제 |
| `POST` | `/admin/partner-codes` | Cookie | 파트너 코드 발급 (shopId 기반) |
| `POST` | `/admin/partner-codes/from-naver` | Cookie | 파트너 코드 발급 (네이버 플레이스) |
| `GET` | `/admin/naver-place/:placeId` | Cookie | 네이버 플레이스 정보 조회 |
| `GET` | `/admin/partner-shops` | Cookie | 파트너샵 연동 현황 |
| `GET` | `/admin/shops` | Cookie | 전체 샵 목록 |
| `POST` | `/admin/shops` | Cookie | 샵 등록 |
| `PATCH` | `/admin/shops/:shopId` | Cookie | 샵 수정 |
| `DELETE` | `/admin/shops/:shopId` | Cookie | 샵 삭제 |
| `GET` | `/admin/users` | Cookie | 소비자 회원 목록 |
| `PATCH` | `/admin/users/:userId/status` | Cookie | 회원 상태 변경 |
| `GET` | `/admin/inquiries` | Cookie | 도입 문의 목록 |
| `PATCH` | `/admin/inquiries/:inquiryId` | Cookie | 도입 문의 상태 변경 |
| `GET` | `/admin/marketing/dates` | Cookie | 마케팅 스냅샷 보유 날짜 |
| `GET` | `/admin/marketing/trend` | Cookie | 마케팅 지표 추세 |
| `GET` | `/admin/marketing` | Cookie | 마케팅 스냅샷 (날짜 지정/최신) |
| `POST` | `/admin/marketing/images/generate` | Cookie | 시안 이미지 생성 (NVIDIA FLUX) |
| `DELETE` | `/admin/marketing/images/:imageId` | Cookie | 시안 이미지 삭제 (Storage 포함) |
| `GET` | `/admin/daily-report` | Cookie | 전날 요약 리포트 (첫 진입 모달) |
| `GET` | `/admin/shops/filters` | Cookie | 샵 필터 옵션 (카테고리 · 시도/시군구) |
| `GET` | `/admin/stats/shop-views` | Cookie | 샵 조회수 통계 |
| `GET` | `/admin/stats/reservation-clicks` | Cookie | 예약 클릭 통계 |
| `GET` | `/admin/stats/cancel-requests` | Cookie | 취소 요청 통계 |
| `GET` | `/admin/stats/partner-conversion` | Cookie | 파트너 전환 통계 |
| `GET` | `/admin/stats/visitors` | Cookie | 방문자 추이 |
| `GET` | `/admin/trends` | Cookie | 트렌드 (30일) |

---

## 내부 API (서버간 통신 전용)

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| `POST` | `/internal/partner-codes` | X-Internal-Key | 파트너 코드 생성 (내부용) |

---

## 공통 에러 응답

```json
{ "code": "ERROR_CODE", "message": "에러 메시지" }
```

| HTTP 코드 | 의미 |
|---|---|
| `400` | 잘못된 요청 파라미터 |
| `401` | 인증 필요 / 토큰 만료 |
| `403` | 권한 없음 |
| `404` | 리소스 없음 |
| `500` | 서버 내부 오류 |
