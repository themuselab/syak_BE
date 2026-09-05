# 유저 API

내 프로필 조회 및 회원 탈퇴. **모든 엔드포인트 인증 필요.**

---

## GET `/api/v1/users/me` — 내 프로필 🔑

### Headers

없음 (쿠키 자동 전송)

### Response (200)

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "linkedProviders": ["kakao", "naver"],
  "nickname": "민지",
  "profileImage": "https://k.kakaocdn.net/...",
  "createdAt": "2024-01-15T08:00:00.000Z"
}
```

### 응답 필드 설명

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | string | 유저 고유 ID (UUID) |
| `linkedProviders` | string[] | 연결된 소셜 계정 목록 (`kakao` \| `naver` \| `apple`) |
| `nickname` | string \| null | 닉네임 (소셜 프로필에서 가져옴) |
| `profileImage` | string \| null | 프로필 사진 URL |
| `createdAt` | string | 가입 시각 (ISO 8601) |

### 에러

| 상황 | code | HTTP |
|---|---|---|
| 비로그인 상태 | `AUTH_UNAUTHORIZED` | 401 |
| 액세스 토큰 만료 | `AUTH_TOKEN_EXPIRED` | 401 |
| 유저 정보 없음 (비정상) | `AUTH_UNAUTHORIZED` | 401 |

### 프론트 체크리스트

- [ ] `linkedProviders` 배열로 연결된 소셜 계정 현황 표시
  - 연결: `["kakao"]` → 카카오 O, 네이버 X, Apple X
  - 연결: `["kakao", "naver"]` → 카카오 O, 네이버 O, Apple X
- [ ] 미연결 소셜 계정 옆에 "연동하기" 버튼 → `POST /api/v1/auth/link/:provider`
- [ ] `nickname`이 null이면 "닉네임 미설정" 표시 (온보딩 유도)
- [ ] `profileImage`가 null이면 기본 아바타 이미지 표시

---

## PATCH `/api/v1/users/me` — 닉네임 수정 🔑

애플 로그인은 이름을 최초 동의 시 1회만 주므로(재로그인·이름 미제공 시 없음), 사용자가 직접
닉네임을 설정/변경할 수 있다. 카카오/네이버 닉네임도 이 API로 덮어쓸 수 있다.

### Request body

```json
{ "nickname": "새닉네임" }
```

- `nickname` (string, 필수): 트림 후 1~20자. 빈 값·20자 초과 시 `VALIDATION_ERROR`(400).

### Response (200)

`GET /users/me`와 동일한 프로필 객체(갱신된 `nickname` 포함).

### 에러

| 상황 | code | HTTP |
|---|---|---|
| 비로그인 | `AUTH_UNAUTHORIZED` | 401 |
| 닉네임 누락/빈값/길이초과 | `VALIDATION_ERROR` | 400 |

---

## DELETE `/api/v1/users/me` — 회원 탈퇴 🔑

유저 계정, 즐겨찾기, 알림 설정, 리프레시 토큰 전부 삭제됩니다. **복구 불가.**

### Response (204)

body 없음. 동시에 쿠키가 만료됩니다.

### 에러

| 상황 | code | HTTP |
|---|---|---|
| 비로그인 상태 | `AUTH_UNAUTHORIZED` | 401 |
| 액세스 토큰 만료 | `AUTH_TOKEN_EXPIRED` | 401 |

### 프론트 체크리스트

- [ ] 탈퇴 전 **재확인 모달** 필수 ("계정 정보, 즐겨찾기, 알림 기록이 모두 삭제됩니다")
- [ ] 204 수신 후 모든 로컬 상태 초기화 + 로그인 화면으로 이동
- [ ] 탈퇴는 **되돌릴 수 없음** — UI에 명확히 표기
- [ ] 소셜 계정이 여러 개 연결된 경우에도 계정 자체가 삭제됨 (소셜 연결 해제와 다름)
