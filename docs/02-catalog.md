# 샵 카탈로그 API

샵 목록 조회 및 샵 상세 정보를 제공합니다.
인증 불필요.

> **캐싱**: 목록은 5분, 상세는 10분 Redis TTL 캐시 적용.
> 샵 데이터는 스크래퍼(GitHub Actions)가 Supabase에 직접 씁니다. 캐시 만료 전까지 최대 5분 지연이 발생할 수 있습니다.

---

## GET `/api/v1/shops` — 샵 목록

### Query Parameters

| 파라미터 | 타입 | 필수 | 설명 | 예시 |
|---|---|---|---|---|
| `categories` | string | - | 대표 업종 (콤마 구분) | `헤어,네일` |
| `districts` | string | - | 구 필터 (콤마 구분) | `강남구,서초구` |
| `price_tiers` | string | - | 가격대 (콤마 구분) | `1만원대,2만원대` |
| `sort` | string | - | 정렬 방식 | `default` \| `price_asc` \| `partner` |
| `has_event` | string | - | 이벤트 진행 중인 샵만 | `true` |
| `has_slot` | string | - | 오늘 슬롯 있는 샵만 | `true` |
| `page` | number | - | 페이지 번호 (기본값: `1`) | `2` |
| `limit` | number | - | 페이지당 결과 수 (기본값: `20`) | `10` |

### 허용 값 정리

**categories** — 샵의 대표 업종 (`category` 컬럼 기준)
```
헤어 | 네일 | 왁싱 | 반영구
```

**price_tiers** — 대표 업종 서비스의 가격대 (`price_tier` 컬럼)
```
1만원대 | 2만원대 | 3만원대 | 4만원이상
```

> `categories`와 `price_tiers`를 함께 쓰면 **대표 업종 서비스 가격** 기준으로 필터링됩니다.
> 예) `categories=헤어&price_tiers=2만원대` → 헤어컷/펌이 2만원대인 샵
> `categories` 없이 `price_tiers`만 쓰면 샵 최저가 기준으로 동작합니다.

**sort**
```
default    — 기본 (오늘 영업 → 파트너 → 이름순)
price_asc  — 가격 낮은 순
partner    — 파트너 샵 우선
```

### Request 예시

```
GET /api/v1/shops?categories=헤어&price_tiers=2만원대&has_slot=true&page=1&limit=20
```

### Response (200)

```json
{
  "items": [
    {
      "id": "1042079600",
      "name": "고담맨즈헤어",
      "region": "서울",
      "district": "관악구",
      "minPrice": 17000,
      "priceTier": "1만원대",
      "categories": ["헤어"],
      "todayOpen": true,
      "slotSummary": [
        {
          "name": "성민 수석팀장",
          "times": "11:00 11:30 12:00 13:00 14:00 15:00"
        },
        {
          "name": "다빈 실장",
          "times": "11:00 12:00 13:00 14:00 15:00 16:00"
        }
      ],
      "eventDesc": null,
      "eventPrice": null,
      "isPartner": false,
      "lat": 37.4851739,
      "lng": 126.9307218,
      "photos": ["https://ldb-phinf.pstatic.net/...jpg"]
    }
  ],
  "total": 30,
  "page": 1,
  "limit": 20
}
```

### 응답 필드 설명

| 필드 | 타입 | 설명 |
|---|---|---|
| `items` | array | 샵 목록 |
| `items[].id` | string | 샵 고유 ID (Supabase) |
| `items[].name` | string | 샵 이름 |
| `items[].region` | string | 광역 지역 (현재 항상 `"서울"`) |
| `items[].district` | string \| null | 구 (예: `"강남구"`) |
| `items[].minPrice` | number \| null | 최저 가격 (원) |
| `items[].priceTier` | string \| null | 가격대 레이블 |
| `items[].categories` | string[] | 대표 업종 목록 |
| `items[].todayOpen` | boolean | 오늘 영업 여부 |
| `items[].slotSummary` | array | 오늘 예약 가능 슬롯 요약 |
| `items[].slotSummary[].name` | string | 디자이너/메뉴 이름 |
| `items[].slotSummary[].times` | string | 가능 시각 (공백 구분, 예: `"11:00 11:30 12:00"`) |
| `items[].eventDesc` | string \| null | 이벤트 설명 |
| `items[].eventPrice` | string \| null | 이벤트 가격 |
| `items[].isPartner` | boolean | 파트너 샵 여부 |
| `items[].lat` / `lng` | number \| null | 위도/경도 |
| `items[].photos` | string[] | 사진 URL 목록 |
| `total` | number | 전체 결과 수 |
| `page` | number | 현재 페이지 |
| `limit` | number | 페이지당 결과 수 |

### 에러

| 상황 | code | HTTP |
|---|---|---|
| 서버 오류 | `INTERNAL_ERROR` | 500 |

> 잘못된 파라미터는 무시됩니다. 목록 API는 별도 검증 에러를 반환하지 않습니다.

### 프론트 체크리스트

- [ ] 응답 루트 키는 `items` (구형 `shops` 키 아님)
- [ ] `slotSummary[].times`는 공백 구분 문자열 → `.split(' ')`으로 배열 변환
- [ ] `slotSummary`가 빈 배열이면 "오늘 예약 가능한 슬롯 없음" UI 표시
- [ ] `photos`가 빈 배열이면 기본 이미지 표시
- [ ] `lat`/`lng`이 null이면 지도 핀 표시 불가 — 처리 필요
- [ ] 페이지네이션: `Math.ceil(total / limit)` 으로 총 페이지 수 계산
- [ ] `categories` 여러 개 선택 시 콤마로 조인 (URL 인코딩 필요)

---

## GET `/api/v1/shops/:shopId` — 샵 상세

### Path Parameter

| 이름 | 설명 |
|---|---|
| `shopId` | 샵 고유 ID |

### Request 예시

```
GET /api/v1/shops/1042079600
```

### Response (200)

목록 `items[*]` 객체 + 아래 추가 필드:

```json
{
  "id": "1042079600",
  "name": "고담맨즈헤어",
  "region": "서울",
  "district": "관악구",
  "minPrice": 17000,
  "priceTier": "1만원대",
  "categories": ["헤어"],
  "todayOpen": true,
  "slotSummary": [
    { "name": "성민 수석팀장", "times": "11:00 11:30 12:00" }
  ],
  "eventDesc": null,
  "eventPrice": null,
  "isPartner": false,
  "lat": 37.4851739,
  "lng": 126.9307218,
  "photos": ["https://ldb-phinf.pstatic.net/...jpg"],
  "bizId": null,
  "reviewCount": 128,
  "bookingUrl": "https://naver.me/...",
  "phone": "02-1234-5678"
}
```

**목록과 다른 추가 필드:**

| 필드 | 타입 | 설명 |
|---|---|---|
| `bizId` | string \| null | 사업자등록번호 |
| `reviewCount` | number | 리뷰 수 |
| `bookingUrl` | string \| null | 외부 예약 링크 |
| `phone` | string \| null | 전화번호 |

### 에러

| 상황 | code | HTTP |
|---|---|---|
| 존재하지 않는 shopId | `SHOP_NOT_FOUND` | 404 |

### 프론트 체크리스트

- [ ] `bookingUrl`이 있으면 인앱 브라우저로 열기 버튼 표시
- [ ] `phone`이 있으면 전화 걸기 버튼 표시
- [ ] `reviewCount`는 표시용 — 리뷰 목록 API는 별도 (현재 미구현)
- [ ] `SHOP_NOT_FOUND` 수신 시 "이미 삭제된 샵" 안내 후 목록으로 복귀
