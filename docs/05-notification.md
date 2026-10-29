# 알림 API

예약 슬롯 알림 목록 조회, 알림 설정 관리.
**모든 엔드포인트 인증 필요.**

> 실시간 알림은 **FCM 푸시**로 전송됩니다.
> 이 API는 이미 발송된 알림 목록 조회 및 설정 변경용입니다.
>
> 알림 발송 흐름:
> Supabase 슬롯 추가 → DB 트리거 → LISTEN/NOTIFY → 서버 → FCM → 클라이언트

---

## GET `/api/v1/notifications` — 알림 목록 🔑

### Headers

없음 (쿠키 자동 전송)

### Response (200)

```json
{
  "notifications": [
    {
      "id": "notif_uuid",
      "userId": "user-uuid",
      "shopId": "shop_abc123",
      "shopName": "민지네일",
      "type": "favorite",
      "slotTime": "14:00",
      "slotDate": "2024-03-15",
      "readAt": null,
      "createdAt": "2024-03-14T09:00:00.000Z"
    }
  ]
}
```

### 응답 필드 설명

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | string | 알림 ID |
| `shopId` | string | 샵 ID |
| `shopName` | string | 샵 이름 |
| `type` | string | 알림 종류: `favorite` (즐겨찾기 샵) \| `near` (근처 샵) \| `alert` (빈자리 알림 신청) |
| `slotTime` | string | 슬롯 시각 (`HH:mm`) |
| `slotDate` | string | 슬롯 날짜 (`YYYY-MM-DD`) |
| `readAt` | string \| null | 읽은 시각 (`null`이면 미읽음) |
| `createdAt` | string | 알림 발생 시각 |

### 에러

| 상황 | code | HTTP |
|---|---|---|
| 비로그인 상태 | `AUTH_UNAUTHORIZED` | 401 |
| 액세스 토큰 만료 | `AUTH_TOKEN_EXPIRED` | 401 |

### 프론트 체크리스트

- [ ] `readAt === null`인 항목에 미읽음 뱃지 표시
- [ ] 알림 탭 시 `shopId`로 `GET /api/v1/shops/:shopId` 호출해 상세 이동
- [ ] 알림 읽음 처리 API는 현재 미구현 — 목록 조회 시 클라이언트 로컬 처리 또는 추후 구현
- [ ] 빈 목록이면 "새로운 알림이 없습니다" 표시
- [ ] `type === 'favorite'`: "즐겨찾기 샵에 슬롯이 열렸어요"
- [ ] `type === 'near'`: "근처 샵에 슬롯이 열렸어요"

---

## GET `/api/v1/notifications/settings` — 알림 설정 조회 🔑

### Response (200)

```json
{
  "userId": "user-uuid",
  "nearEnabled": true,
  "nearLat": 37.4979,
  "nearLng": 127.0276,
  "radiusKm": 3,
  "favoriteEnabled": true,
  "shopNewsEnabled": false,
  "fcmToken": "FCM_토큰_문자열",
  "updatedAt": "2024-03-10T12:00:00.000Z"
}
```

### 응답 필드 설명

| 필드 | 타입 | 설명 |
|---|---|---|
| `nearEnabled` | boolean | 근처 샵 알림 활성화 |
| `nearLat` / `nearLng` | number \| null | 근처 알림 기준 위치 |
| `radiusKm` | number | 근처 알림 반경 (km) |
| `favoriteEnabled` | boolean | 즐겨찾기 샵 알림 활성화 |
| `shopNewsEnabled` | boolean | 샵 소식 알림 활성화 |
| `fcmToken` | string \| null | FCM 디바이스 토큰 |
| `updatedAt` | string | 마지막 업데이트 시각 |

### 에러

| 상황 | code | HTTP |
|---|---|---|
| 비로그인 상태 | `AUTH_UNAUTHORIZED` | 401 |
| 알림 설정 미초기화 | `NOTIFICATION_SETTINGS_NOT_FOUND` | 404 |

### 프론트 체크리스트

- [ ] `NOTIFICATION_SETTINGS_NOT_FOUND(404)` 수신 시 → `PATCH /settings` 로 초기 설정 생성 후 재조회
- [ ] `fcmToken`이 null이면 FCM 토큰 등록 필요 → 설정 화면에서 안내

---

## PATCH `/api/v1/notifications/settings` — 알림 설정 변경 🔑

변경하려는 필드만 포함해서 전송합니다 (Partial update).

### Request Body (모든 필드 선택적)

```json
{
  "nearEnabled": true,
  "nearLat": 37.4979,
  "nearLng": 127.0276,
  "radiusKm": 3,
  "favoriteEnabled": true,
  "shopNewsEnabled": false,
  "fcmToken": "FCM_디바이스_토큰"
}
```

### 필드 유효성 검사

| 필드 | 규칙 |
|---|---|
| `radiusKm` | 1 이상 10 이하 (정수) |
| 그 외 | 별도 검증 없음 |

### Response (200)

변경된 전체 설정 객체 반환 (조회 응답과 동일한 형식).

```json
{
  "userId": "user-uuid",
  "nearEnabled": true,
  "nearLat": 37.4979,
  "nearLng": 127.0276,
  "radiusKm": 3,
  "favoriteEnabled": true,
  "shopNewsEnabled": false,
  "fcmToken": "새_FCM_토큰",
  "updatedAt": "2024-03-15T10:00:00.000Z"
}
```

### 에러

| 상황 | code | HTTP |
|---|---|---|
| 비로그인 상태 | `AUTH_UNAUTHORIZED` | 401 |
| 액세스 토큰 만료 | `AUTH_TOKEN_EXPIRED` | 401 |
| `radiusKm`가 범위 벗어남 | `VALIDATION_ERROR` | 400 |

### 프론트 체크리스트

- [ ] 앱 최초 실행 또는 알림 권한 허용 시 FCM 토큰을 이 API로 등록
  ```json
  { "fcmToken": "디바이스_FCM_토큰" }
  ```
- [ ] 앱 포그라운드 복귀 시 FCM 토큰이 갱신되면 재등록
- [ ] 근처 알림 활성화 시 위치 좌표 함께 전송
  ```json
  {
    "nearEnabled": true,
    "nearLat": 37.4979,
    "nearLng": 127.0276,
    "radiusKm": 3
  }
  ```
- [ ] `radiusKm` 범위는 1~10 — UI 슬라이더 범위를 이에 맞게 설정
- [ ] 설정 화면 진입 시 GET으로 현재 값 조회 후 UI에 반영, 변경 시 PATCH

---

## 빈자리 알림 신청 (slot alerts) 🔑

로그인 유저가 **샵 + 날짜(오늘/내일/모레, KST) + 30분 단위 시간**을 골라 "이 시간이 비면 알려줘"를 신청한다.
비로그인은 신청 불가(앱에서 로그인 유도) — 세 엔드포인트 모두 `requireAuth`.

- 알림을 **한 번 받으면 그 (샵, 날짜, 시간) 신청은 종료**된다(`notified_at` 기록).
- 시간이 지나면(슬롯 시작 시각 ≥ 현재 KST) 종료 — 크론 없이 **조회 시점에 계산**.
- 즐겨찾기/관심동네 알림은 그대로 유지. 같은 새 빈자리로 둘 다 해당하면 **푸시 1번**(신청 문구 우선).
- 테이블: `slot_alerts` (`db/migration_slot_alerts.sql`, 서버 기동 시 멱등 실행).

### POST `/api/v1/notifications/slot-alerts` — 신청

```json
{ "shopId": "shop_abc123", "date": "2026-10-30", "times": ["10:00", "10:30"] }
```

| 필드 | 규칙 |
|---|---|
| `shopId` | 필수, 존재하는 샵 |
| `date` | `YYYY-MM-DD`, KST 오늘 ~ 오늘+2 |
| `times` | `HH:MM` 문자열 1~48개 (중복은 무시) |

Response **201** `{ "created": 2 }` — 실제 새로 만든 개수.
**멱등**: 같은 (유저, 샵, 날짜, 시간)의 활성 신청이 이미 있으면 새로 만들지 않는다(그만큼 `created`가 작아짐). 오늘 이미 지난 시간은 만들지 않는다.

| 상황 | code | HTTP |
|---|---|---|
| 비로그인 | `AUTH_UNAUTHORIZED` | 401 |
| 형식/범위 오류 (`details`에 필드별 사유) | `VALIDATION_ERROR` | 400 |
| 샵 없음 | `SHOP_NOT_FOUND` | 404 |

### GET `/api/v1/notifications/slot-alerts` — 내 신청 목록

활성 신청 + 최근 7일 내 종료된 신청, `createdAt` 최신순.

```json
{
  "alerts": [
    {
      "id": "uuid",
      "shopId": "shop_abc123",
      "shopName": "모아래쉬",
      "shopRegion": "강남구",
      "shopPhoto": "https://.../1.jpg",
      "date": "2026-10-30",
      "time": "10:00",
      "status": "active",
      "endedReason": null,
      "notifiedAt": null,
      "createdAt": "2026-10-29T01:00:00.000Z"
    }
  ]
}
```

| 필드 | 설명 |
|---|---|
| `shopRegion` | `shops.gu` (구 이름). 없으면 `null` |
| `shopPhoto` | 갤러리 첫 장, 없으면 대표 이미지, 없으면 `null` |
| `status` | `active` \| `ended` |
| `endedReason` | `notified`(알림 받음) \| `expired`(시간 지남) \| `null`(활성) |
| `notifiedAt` | 알림 발송 시각 (ISO) \| `null` |

### DELETE `/api/v1/notifications/slot-alerts` — 신청 삭제(일괄)

```json
{ "ids": ["uuid-1", "uuid-2"] }
```

Response **204**. **호출자 본인의 row만** 삭제(남의 id는 조용히 무시). `ids`는 uuid 배열(최대 500, 빈 배열은 no-op). 형식 오류 시 `VALIDATION_ERROR`(400).

### 발송 동작 (`POST /notifications/internal/dispatch` · 사장님 빈자리 등록 공통)

`DispatchSlotNotificationsUseCase`가 새 빈자리 이벤트를 **샵 단위로 묶은 뒤**:

1. 즐겨찾기/관심동네 대상자 조회 — 스크래퍼 호출(`todayOnly`)이면 **오늘(KST) 슬롯만** 대상(기존 동작).
2. `slot_alerts`에서 이 샵의 이벤트 (날짜, 시간)과 맞는 **활성 신청**을 조회 — 날짜 제한 없이(오늘~모레) 매칭.
   신청자는 알림 설정 토글(`favoriteEnabled` 등)과 무관하게 대상.
3. 유저 단위로 합쳐 **샵당 1번** 발송. 신청이 매칭된 유저는 신청 문구:
   - 제목 `{샵}에 빈자리가 생겼어요!`
   - 본문 `신청하신 오늘 10:00 · 10:30 자리가 났어요` (날짜 라벨: 오늘/내일/M월 D일, 3개 초과 시 `외 N개`)
   - 그 외 대상자는 기존 문구 `오늘 10:00 · 11:00 예약 가능`.
4. 알림 목록 row 저장(신청 매칭은 `type: "alert"`), 푸시 시도 후 매칭된 신청을 `notified_at = now()`로 종료.
   푸시 실패·FCM 토큰 없음이어도 종료 처리(알림 목록에는 남음).

> 주의: 스크래퍼는 현재 **오늘 새 빈자리만** dispatch 한다. 내일/모레 신청은 사장님 빈자리 등록(전 날짜 dispatch)으로만 매칭되며,
> 스크래퍼가 내일/모레 diff도 보내면 자동으로 매칭된다(즐겨찾기/관심동네는 계속 오늘만).
