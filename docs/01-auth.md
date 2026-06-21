# 인증 API

소셜 로그인, 계정 연동, 토큰 갱신, 로그아웃을 처리합니다.

---

## POST `/api/v1/auth/:provider` — 소셜 로그인

소셜 SDK에서 받은 `access_token`(카카오·네이버) 또는 `identity_token`(Apple)을 서버로 전달합니다.
서버가 소셜 API로 프로필을 검증한 뒤 쿠키를 발급합니다.

### Path Parameter

| 이름 | 값 |
|---|---|
| `provider` | `kakao` \| `naver` \| `apple` |

### Request Body

```json
{
  "access_token": "소셜_SDK에서_받은_토큰"
}
```

- Apple의 경우 `access_token` 자리에 `identityToken` 값을 넣습니다.

### Response

**신규 가입 (201)**
```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "nickname": "카카오닉네임",
    "profileImage": "https://..."
  },
  "isNewUser": true
}
```

**기존 로그인 (200)**
```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "nickname": "카카오닉네임",
    "profileImage": "https://..."
  },
  "isNewUser": false
}
```

### Set-Cookie (응답 시 자동 설정)

```
Set-Cookie: syak_access=<JWT>; HttpOnly; Max-Age=900
Set-Cookie: syak_refresh=<token>; HttpOnly; Path=/api/v1/auth/token/refresh; Max-Age=86400
```

### 에러

| 상황 | code | HTTP |
|---|---|---|
| 지원하지 않는 provider (google 등) | `VALIDATION_ERROR` | 400 |
| `access_token` 필드 누락 | `VALIDATION_ERROR` | 400 |
| 소셜 토큰 만료 / 위조 | `AUTH_SOCIAL_FAILED` | 400 |

### 프론트 체크리스트

- [ ] `isNewUser === true` 이면 닉네임 입력 화면(온보딩)으로 이동
- [ ] `isNewUser === false` 이면 홈으로 이동
- [ ] 응답 body에 토큰 없음 — 쿠키가 자동으로 설정되므로 별도 저장 불필요
- [ ] `AUTH_SOCIAL_FAILED` 수신 시 "소셜 로그인 실패" 토스트 + 재시도 안내

---

## POST `/api/v1/auth/link/:provider` — 소셜 계정 추가 연동 🔑

이미 로그인된 상태에서 다른 소셜 계정을 현재 계정에 연결합니다.

### Path Parameter

| 이름 | 값 |
|---|---|
| `provider` | `kakao` \| `naver` \| `apple` |

### Request Body

```json
{
  "access_token": "연결할_소셜_SDK_토큰"
}
```

### Response (200)

```json
{
  "linkedProvider": "naver"
}
```

### 에러

| 상황 | code | HTTP |
|---|---|---|
| 비로그인 상태 | `AUTH_UNAUTHORIZED` | 401 |
| 액세스 토큰 만료 | `AUTH_TOKEN_EXPIRED` | 401 |
| 소셜 토큰 검증 실패 | `AUTH_SOCIAL_FAILED` | 400 |
| 해당 소셜 계정이 **다른** 유저에 이미 연결됨 | `FORBIDDEN` | 403 |

### 동작 규칙

- 이미 **자신의 계정**에 연결된 소셜 계정 재연동 시도 → **200 성공** (멱등)
- **다른 계정**에 연결된 소셜 계정 연동 시도 → **403 FORBIDDEN**
- 아직 누구에도 연결 안 된 소셜 계정 → 연동 성공

### 프론트 체크리스트

- [ ] 연동 성공 후 프로필 화면에서 `GET /api/v1/users/me` 재호출해 `linkedProviders` 업데이트
- [ ] `FORBIDDEN` 수신 시 "이미 다른 계정에 연결된 소셜 계정입니다" 안내
- [ ] 이미 연결된 provider 재연동 시도 시 200 — UI에서 중복 요청 방지 처리 권장

---

## POST `/api/v1/auth/token/refresh` — 토큰 갱신

`syak_access` 쿠키가 만료됐을 때 호출합니다.
`syak_refresh` 쿠키가 자동으로 전송되므로 별도 body 불필요.

> `syak_refresh` 쿠키는 `path=/api/v1/auth/token/refresh` 로 제한돼 있습니다.
> 다른 API 호출 시 자동으로 첨부되지 않습니다.

### Headers

없음 (쿠키가 자동으로 전송됨)

### Response (204)

body 없음. 응답 헤더에 새 쿠키가 설정됩니다.

```
Set-Cookie: syak_access=<새_JWT>; HttpOnly; Max-Age=900
Set-Cookie: syak_refresh=<새_토큰>; HttpOnly; Path=/api/v1/auth/token/refresh; Max-Age=86400
```

### 에러

| 상황 | code | HTTP |
|---|---|---|
| `syak_refresh` 쿠키 없음 | `AUTH_REFRESH_INVALID` | 401 |
| 리프레시 토큰 만료 | `AUTH_REFRESH_INVALID` | 401 |
| 리프레시 토큰 변조 | `AUTH_REFRESH_INVALID` | 401 |

### 프론트 체크리스트

- [ ] 임의의 API 호출에서 `AUTH_TOKEN_EXPIRED` 수신 → 이 엔드포인트 호출 → 성공하면 원래 요청 재시도
- [ ] `AUTH_REFRESH_INVALID` 수신 → 로그인 화면으로 이동 (재로그인 필요)
- [ ] 토큰 갱신 중복 호출 방지 (동시에 여러 API가 만료 에러를 받을 경우 한 번만 갱신)

---

## DELETE `/api/v1/auth/signout` — 로그아웃 🔑

서버의 리프레시 토큰을 전부 삭제하고 쿠키를 만료시킵니다.

### Response (204)

body 없음.

```
Set-Cookie: syak_access=; HttpOnly; Max-Age=0
Set-Cookie: syak_refresh=; HttpOnly; Path=/api/v1/auth/token/refresh; Max-Age=0
```

### 에러

| 상황 | code | HTTP |
|---|---|---|
| 비로그인 상태 | `AUTH_UNAUTHORIZED` | 401 |

### 프론트 체크리스트

- [ ] 로그아웃 후 로컬 상태 초기화 (유저 정보, 즐겨찾기 캐시 등)
- [ ] 204 수신 후 로그인 화면으로 이동
- [ ] `AUTH_UNAUTHORIZED`는 이미 로그아웃된 상태 → 동일하게 로그인 화면으로 이동
