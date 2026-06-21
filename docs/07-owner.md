# 07 — 사장님(파트너) API

파트너십을 맺은 샵 사장님이 **웹 대시보드**에서 사용하는 API입니다.
소비자 앱 API(`/auth`, `/shops` 등)와 완전히 분리된 별도 계정 체계를 사용합니다.

---

## 인증 흐름

```
1. 소셜 로그인 (POST /owner/auth/:provider)
   → syak_owner_access 쿠키 발급
   → 응답에 shopLinked: false면 2단계 필요

2. 인증코드 입력 (POST /owner/auth/code)  ← 최초 1회
   → 관리자가 발급한 8자리 코드 입력
   → JWT에 shopId가 추가된 새 쿠키 재발급

3. 이후 요청은 syak_owner_access 쿠키 자동 첨부
```

> 인증코드는 8자 대문자+숫자 조합 (혼동 문자 0·O·1·I 제외), 7일 유효, 1회용입니다.

---

## 쿠키

| 쿠키명 | 용도 | 유효시간 | path 제한 |
|---|---|---|---|
| `syak_owner_access` | 사장님 액세스 토큰 | 15분 | 전체 |
| `syak_owner_refresh` | 사장님 갱신 토큰 | 1일 | `/api/v1/owner/auth/token/refresh` |

---

## 엔드포인트 목록

| 메서드 | 경로 | 인증 | 설명 |
|---|---|---|---|
| POST | `/owner/auth/:provider` | — | 소셜 로그인 |
| POST | `/owner/auth/code` | ✅ | 인증코드로 샵 연결 |
| GET | `/owner/auth/me` | ✅ | 내 정보 |
| POST | `/owner/auth/token/refresh` | 쿠키 | 토큰 갱신 |
| POST | `/owner/auth/sign-out` | ✅ | 로그아웃 |
| GET | `/owner/slots` | ✅🏠 | 내 샵 슬롯 목록 |
| POST | `/owner/slots` | ✅🏠 | 슬롯 등록 |
| PATCH | `/owner/slots/:slotId` | ✅🏠 | 슬롯 수정 |
| DELETE | `/owner/slots/:slotId` | ✅🏠 | 슬롯 삭제 |
| GET | `/owner/analytics` | ✅🏠 | 대시보드 통계 |

> ✅ = `syak_owner_access` 쿠키 필요  
> 🏠 = 추가로 샵 연결 완료(`shopId` 있음) 필요

---

## POST `/owner/auth/:provider`

소셜 로그인. `:provider` = `kakao` | `naver` | `apple`

**요청 Body**
```json
{ "access_token": "소셜에서_받은_액세스_토큰" }
```

**응답 200 (기존 계정)**
```json
{
  "owner": {
    "id": "uuid",
    "nickname": "홍길동",
    "shopId": "1004494913"
  },
  "shopLinked": true,
  "isNewOwner": false
}
```

**응답 201 (신규 가입)**
```json
{
  "owner": { "id": "uuid", "nickname": "홍길동", "shopId": null },
  "shopLinked": false,
  "isNewOwner": true
}
```

> `shopLinked: false`이면 2단계(인증코드 입력)를 안내해야 합니다.

**에러**
| 코드 | 상황 |
|---|---|
| `VALIDATION_ERROR` | `access_token` 누락 |
| `AUTH_SOCIAL_FAILED` | 소셜 토큰 검증 실패 |

---

## POST `/owner/auth/code`

관리자가 발급한 인증코드로 샵을 연결합니다. 성공 시 JWT에 `shopId`가 추가된 새 쿠키가 재발급됩니다.

**요청 Body**
```json
{ "code": "AB3K7P2Q" }
```

**응답 200**
```json
{ "shopId": "1004494913" }
```

**에러**
| 코드 | 상황 |
|---|---|
| `PARTNER_CODE_INVALID` | 존재하지 않는 코드 |
| `PARTNER_CODE_EXPIRED` | 만료된 코드 (7일 경과) |
| `PARTNER_CODE_USED` | 이미 사용된 코드 |
| `SHOP_ALREADY_LINKED` | 이미 다른 샵이 연결된 계정 |

---

## GET `/owner/auth/me`

**응답 200**
```json
{ "id": "uuid", "shopId": "1004494913" }
```

---

## POST `/owner/auth/token/refresh`

`syak_owner_refresh` 쿠키를 사용해 액세스 토큰을 갱신합니다.

**응답 204** — 새 쿠키 자동 설정, 바디 없음

**에러** `AUTH_REFRESH_INVALID` → 재로그인 필요

---

## GET `/owner/slots`

사장님이 직접 등록한 슬롯 목록 (`source = 'owner'`).

**응답 200**
```json
{
  "slots": [
    {
      "id": 42,
      "shopId": "1004494913",
      "date": "2026-06-25",
      "startTime": "14:00",
      "source": "owner",
      "ownerId": "uuid"
    }
  ]
}
```

---

## POST `/owner/slots`

**요청 Body**
```json
{ "date": "2026-06-25", "startTime": "14:00" }
```

| 필드 | 형식 | 필수 |
|---|---|---|
| `date` | `YYYY-MM-DD` | ✅ |
| `startTime` | `HH:mm` | ✅ |

**응답 201** — 생성된 슬롯 객체

**에러**
| 코드 | 상황 |
|---|---|
| `VALIDATION_ERROR` | 날짜/시간 형식 오류 |

---

## PATCH `/owner/slots/:slotId`

**요청 Body** — 변경할 필드만 포함
```json
{ "date": "2026-06-26", "startTime": "15:00" }
```

**응답 200** — 수정된 슬롯 객체

**에러**
| 코드 | 상황 |
|---|---|
| `SLOT_NOT_FOUND` | 존재하지 않는 슬롯 |
| `SLOT_FORBIDDEN` | 내 샵 소속 슬롯이 아님 |

---

## DELETE `/owner/slots/:slotId`

**응답 204** — 바디 없음

**에러** `SLOT_NOT_FOUND` | `SLOT_FORBIDDEN`

---

## GET `/owner/analytics`

사장님 대시보드용 통계.

**Query Parameters**

| 파라미터 | 기본값 | 설명 |
|---|---|---|
| `period` | `7d` | `7d` 또는 `30d` |

**응답 200**
```json
{
  "period": "7d",
  "shopId": "1004494913",
  "views": [
    { "date": "2026-06-15", "count": 42 },
    { "date": "2026-06-16", "count": 38 }
  ],
  "slots": [
    { "date": "2026-06-15", "count": 3 },
    { "date": "2026-06-16", "count": 5 }
  ]
}
```

| 필드 | 설명 |
|---|---|
| `views[].count` | 해당 날짜 샵 상세 조회 수 (소비자 앱 포함) |
| `slots[].count` | 해당 날짜 등록된 슬롯 수 (전체 source) |

---

## 에러 코드 (사장님 전용)

| 코드 | HTTP | 상황 |
|---|---|---|
| `OWNER_UNAUTHORIZED` | 401 | `syak_owner_access` 쿠키 없음 또는 유효하지 않음 |
| `OWNER_NOT_FOUND` | 404 | 사장님 계정 없음 |
| `PARTNER_CODE_INVALID` | 400 | 코드가 존재하지 않음 |
| `PARTNER_CODE_EXPIRED` | 400 | 코드 유효기간 만료 |
| `PARTNER_CODE_USED` | 409 | 코드 이미 사용됨 |
| `SHOP_ALREADY_LINKED` | 409 | 계정에 이미 샵이 연결되어 있음 |
| `SLOT_FORBIDDEN` | 403 | 내 샵이 아닌 슬롯에 접근 |
