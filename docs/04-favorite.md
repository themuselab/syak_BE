# 즐겨찾기 API

유저의 즐겨찾기 샵 관리. **모든 엔드포인트 인증 필요.**

> 즐겨찾기는 RDS에 저장되며, 샵 이름과 지역이 비정규화되어 함께 저장됩니다.
> Supabase(샵 DB)와 RDS(유저 DB)가 분리되어 있어 JOIN이 불가하기 때문입니다.
> 따라서 즐겨찾기 추가 시 서버가 Supabase에서 샵 정보를 조회한 후 RDS에 저장합니다.

---

## GET `/api/v1/favorites` — 즐겨찾기 목록 🔑

### Headers

없음 (쿠키 자동 전송)

### Response (200)

```json
{
  "favorites": [
    {
      "id": "fav_uuid",
      "userId": "user-uuid",
      "shopId": "shop_abc123",
      "shopName": "민지네일",
      "shopRegion": "서울",
      "createdAt": "2024-03-10T12:00:00.000Z"
    }
  ]
}
```

### 응답 필드 설명

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | string | 즐겨찾기 레코드 ID |
| `userId` | string | 유저 ID |
| `shopId` | string | 샵 ID |
| `shopName` | string | 샵 이름 (저장 시점 스냅샷) |
| `shopRegion` | string \| null | 샵 지역 (저장 시점 스냅샷) |
| `createdAt` | string | 추가한 시각 (ISO 8601) |

> `shopName`은 즐겨찾기 추가 시점의 스냅샷입니다.
> 샵 이름이 변경되어도 즐겨찾기의 값은 변경되지 않습니다.

### 에러

| 상황 | code | HTTP |
|---|---|---|
| 비로그인 상태 | `AUTH_UNAUTHORIZED` | 401 |
| 액세스 토큰 만료 | `AUTH_TOKEN_EXPIRED` | 401 |

### 프론트 체크리스트

- [ ] 빈 배열이면 "즐겨찾기한 샵이 없습니다" 빈 화면 표시
- [ ] 목록에서 샵 이름 탭 시 `shopId`로 `GET /api/v1/shops/:shopId` 호출
- [ ] 새로고침 없이 추가/삭제 시 낙관적 업데이트(optimistic update) 적용 권장

---

## POST `/api/v1/favorites/:shopId` — 즐겨찾기 추가 🔑

### Path Parameter

| 이름 | 설명 |
|---|---|
| `shopId` | 즐겨찾기할 샵 ID |

### Response (201)

```json
{
  "id": "fav_uuid",
  "userId": "user-uuid",
  "shopId": "shop_abc123",
  "shopName": "민지네일",
  "shopRegion": "서울",
  "createdAt": "2024-03-10T12:00:00.000Z"
}
```

### 에러

| 상황 | code | HTTP |
|---|---|---|
| 비로그인 상태 | `AUTH_UNAUTHORIZED` | 401 |
| 액세스 토큰 만료 | `AUTH_TOKEN_EXPIRED` | 401 |
| 존재하지 않는 샵 | `SHOP_NOT_FOUND` | 404 |
| 이미 즐겨찾기 추가된 샵 | `FAVORITE_ALREADY_EXISTS` | 409 |

### 프론트 체크리스트

- [ ] `FAVORITE_ALREADY_EXISTS(409)` 수신 시 "이미 즐겨찾기한 샵" 토스트 (에러 아님, 무시 처리)
- [ ] `SHOP_NOT_FOUND(404)` 수신 시 "더 이상 존재하지 않는 샵" 안내
- [ ] 추가 성공 후 즐겨찾기 버튼 상태를 즉시 업데이트 (목록 재조회 없이)

---

## DELETE `/api/v1/favorites/:shopId` — 즐겨찾기 삭제 🔑

### Path Parameter

| 이름 | 설명 |
|---|---|
| `shopId` | 삭제할 즐겨찾기 샵 ID |

### Response (204)

body 없음.

### 에러

| 상황 | code | HTTP |
|---|---|---|
| 비로그인 상태 | `AUTH_UNAUTHORIZED` | 401 |
| 액세스 토큰 만료 | `AUTH_TOKEN_EXPIRED` | 401 |
| 즐겨찾기에 없는 샵 | `FAVORITE_NOT_FOUND` | 404 |

### 프론트 체크리스트

- [ ] `FAVORITE_NOT_FOUND(404)` 수신 시 조용히 처리 — 이미 삭제된 상태이므로 UI에서 제거
- [ ] 삭제 성공 후 목록에서 즉시 제거 (낙관적 업데이트)
- [ ] 실패 시 낙관적 업데이트 롤백
