# 예약 슬롯 API

샵의 예약 가능한 슬롯을 조회합니다.
인증 불필요.

> 슬롯 데이터는 Supabase(읽기 전용)에서 가져옵니다.
> 실제 예약 확정은 외부 예약 링크(`bookingUrl`)를 통해 이루어지며,
> 이 API는 슬롯 **조회**만 제공합니다.

---

## GET `/api/v1/slots/shop/:shopId` — 샵별 슬롯 목록

특정 샵의 예약 가능한 슬롯을 날짜별로 조회합니다.

### Path Parameter

| 이름 | 설명 |
|---|---|
| `shopId` | 샵 고유 ID |

### Query Parameters

| 파라미터 | 타입 | 필수 | 설명 | 예시 |
|---|---|---|---|---|
| `dates` | string | - | 조회할 날짜 (콤마 구분, YYYY-MM-DD) | `2024-03-15,2024-03-16` |

`dates` 미전달 시 오늘 이후 가까운 슬롯 전체 반환.

### Request 예시

```
GET /api/v1/slots/shop/shop_abc123?dates=2024-03-15,2024-03-16
```

### Response (200)

```json
{
  "slots": [
    {
      "shopId": "shop_abc123",
      "date": "2024-03-15",
      "startTime": "14:00"
    },
    {
      "shopId": "shop_abc123",
      "date": "2024-03-15",
      "startTime": "15:30"
    },
    {
      "shopId": "shop_abc123",
      "date": "2024-03-16",
      "startTime": "10:00"
    }
  ]
}
```

### 응답 필드 설명

| 필드 | 타입 | 설명 |
|---|---|---|
| `shopId` | string | 샵 ID |
| `date` | string | 날짜 (`YYYY-MM-DD`) |
| `startTime` | string | 시작 시각 (`HH:mm`) |

### 에러

| 상황 | code | HTTP |
|---|---|---|
| 서버 오류 | `INTERNAL_ERROR` | 500 |

> 슬롯이 없어도 에러가 아닌 빈 배열로 응답합니다: `{ "slots": [] }`

### 프론트 체크리스트

- [ ] `slots`가 빈 배열이면 "이 날짜에 예약 가능한 슬롯이 없습니다" 표시
- [ ] 날짜별로 그룹핑해서 달력 UI에 표시할 때: `date` 기준으로 클라이언트에서 groupBy 처리
- [ ] `dates` 미전달 시 전체 슬롯이 오므로, 특정 날짜 선택 후 재조회 권장
- [ ] 슬롯 선택 후 실제 예약은 `GET /api/v1/shops/:shopId` 의 `bookingUrl`로 이동

---

## GET `/api/v1/slots/search` — 슬롯 검색

날짜와 시간대를 조건으로 예약 가능한 샵 목록을 검색합니다.
홈 화면의 "이 날, 이 시간에 예약 가능한 샵 찾기" 기능에 사용합니다.

### Query Parameters

| 파라미터 | 타입 | 필수 | 설명 | 예시 |
|---|---|---|---|---|
| `dates` | string | **필수** | 날짜 목록 (콤마 구분, YYYY-MM-DD) | `2026-06-21,2026-06-22` |
| `times` | string | **필수** | 시간대 목록 (콤마 구분, HH:mm) | `14:00,15:00` |
| `districts` | string | - | 구 필터 (콤마 구분) | `강남구,서초구` |

`dates` 또는 `times` 미전달 시 `400 VALIDATION_ERROR` 반환.

### Request 예시

```
GET /api/v1/slots/search?dates=2026-06-21&times=14:00,15:00&districts=강남구
```

### Response (200)

```json
{
  "shops": [
    {
      "shopId": "1004494913",
      "shopName": "준오헤어 강남점",
      "district": "강남구",
      "availableSlots": [
        { "date": "2026-06-21", "time": "14:00" },
        { "date": "2026-06-21", "time": "15:00" }
      ]
    },
    {
      "shopId": "1025990104",
      "shopName": "차홍룸",
      "district": "강남구",
      "availableSlots": [
        { "date": "2026-06-21", "time": "14:00" }
      ]
    }
  ],
  "count": 2
}
```

### 응답 필드 설명

| 필드 | 타입 | 설명 |
|---|---|---|
| `shops` | array | 해당 조건에 슬롯이 있는 샵 목록 |
| `shops[].shopId` | string | 샵 ID |
| `shops[].shopName` | string | 샵 이름 |
| `shops[].district` | string \| null | 구 (예: `"강남구"`) |
| `shops[].availableSlots` | array | 조건 일치 슬롯 목록 |
| `shops[].availableSlots[].date` | string | 날짜 (`YYYY-MM-DD`) |
| `shops[].availableSlots[].time` | string | 시각 (`HH:mm`) |
| `count` | number | 결과 샵 수 |

### 에러

| 상황 | code | HTTP |
|---|---|---|
| `dates` 또는 `times` 미전달 | `VALIDATION_ERROR` | 400 |
| 서버 오류 | `INTERNAL_ERROR` | 500 |

### 프론트 체크리스트

- [ ] `count === 0` 이면 "조건에 맞는 샵이 없습니다" 빈 화면 표시
- [ ] 검색 결과의 `shopId`로 `GET /api/v1/shops/:shopId` 를 호출해 상세 진입
- [ ] `times` 파라미터는 정확한 시각 (`14:00`) 매칭 — 범위 검색 아님
- [ ] `dates`와 `times` 둘 다 필수, 하나라도 빠지면 에러
