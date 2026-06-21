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
| `type` | string | 알림 종류: `favorite` (즐겨찾기 샵) \| `near` (근처 샵) |
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
