# 프론트엔드 연동 가이드 — HTTPS 도메인 전환

> 2026-07-09 적용. **운영 API가 IP(http) → 도메인(https)로 전환되었습니다.**
> RN 앱은 **baseURL 한 줄 교체**가 필요합니다. 관리자 웹/토스 웹은 변경 없습니다.

---

## 1. Base URL

| 환경 | Base URL |
|---|---|
| **운영 (신규)** | **`https://api.themuselab.kr/api/v1`** |
| 운영 (구, 폐기 예정) | ~~`http://54.116.107.78/api/v1`~~ |
| 로컬 개발 | `http://localhost:3000/api/v1` |

관련 URL

| 용도 | URL |
|---|---|
| 헬스체크 | `https://api.themuselab.kr/health` |
| 관리자 웹 | `https://admin.themuselab.kr` |

두 서브도메인 모두 **같은 EC2·같은 백엔드**를 가리킵니다. (`api.` = 앱/외부 클라이언트용, `admin.` = 관리자 화면)

---

## 2. 클라이언트별 변경 사항

| 클라이언트 | 현재 호출 방식 | 조치 |
|---|---|---|
| **RN 소비자 앱** | `http://54.116.107.78/api/v1` (절대경로) | ✅ **baseURL을 `https://api.themuselab.kr/api/v1` 로 교체** |
| **RN 사장님 앱** | 〃 | ✅ **동일하게 교체** |
| **관리자 웹 (admin)** | `/api/v1` (상대경로) | ❌ 변경 없음 — 같은 도메인에서 nginx가 프록시 |
| **웹 (Vercel/토스 미니앱)** | Supabase 직접 호출 | ❌ 변경 없음 (백엔드 미사용) |

### 왜 반드시 바꿔야 하나
- **iOS ATS(App Transport Security)** 는 `http://` 평문 통신을 기본 차단합니다.
- 안드로이드도 `cleartextTrafficPermitted=false` 가 기본입니다.
- 즉 **앱에서 http 백엔드 호출은 실패**합니다. https 도메인으로 바꿔야 정상 동작합니다.

---

## 3. 주의사항 (중요)

### 3-1. 301 리다이렉트에 의존하지 말 것
`http://api.themuselab.kr` 로 요청하면 `301` 로 https에 리다이렉트됩니다. 하지만
- 일부 HTTP 클라이언트는 리다이렉트 시 **POST body / 헤더를 유실**합니다.
- 리다이렉트 왕복으로 **불필요한 지연**이 생깁니다.

→ **처음부터 `https://` 로 직접 호출**하세요.

### 3-2. 인증

🔴 **서버는 `Authorization: Bearer` 헤더를 읽지 않습니다.** 인증은 전부 HttpOnly 쿠키입니다.
(`src/shared/middleware/auth.middleware.ts` — `req.cookies.syak_access` 만 확인)

| 클라이언트 | 인증 수단 |
|---|---|
| RN 앱 (소비자) | `syak_access` (15분) / `syak_refresh` (1일) 쿠키 |
| RN 앱 (사장님) | `syak_owner_access` / `syak_owner_refresh` 쿠키 |
| 관리자 웹 | `syak_admin` 쿠키 (`SameSite=Strict`), 요청 시 `credentials: 'include'` |
| 내부 API (GH Actions) | `X-Internal-Key: <INTERNAL_API_KEY>` |

로그인 응답 바디에는 **토큰이 없습니다.** `{ user, isNewUser }` 만 오고 토큰은 `Set-Cookie`로 내려옵니다.

**RN 앱이 해야 할 것:** HTTP 클라이언트의 쿠키 저장소를 켜세요.

```ts
// fetch — RN은 기본적으로 쿠키를 저장/전송하지만 명시하는 편이 안전
fetch(url, { credentials: 'include' })

// axios
axios.create({ baseURL, withCredentials: true })
```

- 쿠키가 유지되지 않으면 로그인 직후 모든 인증 API가 `401`이 납니다.
- iOS/Android 모두 앱을 지웠다 깔면 쿠키도 사라집니다 (재로그인 필요).
- 갱신은 `POST /auth/token/refresh` → `204`. `syak_refresh` 쿠키는
  **`path=/api/v1/auth/token/refresh`** 로 제한돼 그 경로에서만 전송됩니다.

- 운영 쿠키는 `Secure` 가 붙으므로 **HTTPS로만 오갑니다.** 평문 `http://` 로 호출하면 쿠키가
  저장·전송되지 않아 로그인 직후 모든 인증 API가 `401` 이 됩니다.

```
Set-Cookie: syak_admin=...; HttpOnly; Secure; SameSite=Strict     # 관리자 웹
Set-Cookie: syak_access=...; HttpOnly; Secure; SameSite=None      # 앱 (COOKIE_SAME_SITE=none)
```

> **2026-07-10 수정 이력** — 그전까지 운영은 `COOKIE_SECURE=false` 인데 `COOKIE_SAME_SITE=none`
> 이었습니다. `Secure` 없는 `SameSite=None` 은 스펙상 거부 대상이라, 쿠키 저장소 구현에 따라
> 조용히 버려질 수 있는 상태였습니다. `COOKIE_SECURE=true` 로 정정했습니다.
> `http://api.themuselab.kr` 는 301로 https에 리다이렉트되고 구 주소 `http://54.116.107.78` 은
> 이미 404라, 평문 경로는 존재하지 않습니다.

### 3-3. CORS
- 관리자 웹은 API와 **동일 출처**(`admin.themuselab.kr` 에서 `/api/*` 프록시)라 CORS 없음.
- RN 앱은 네이티브라 CORS 적용 대상이 아님.
→ 별도 CORS 설정 불필요.

---

## 3-4. 샵 예약 수단 — 서버가 type을 정확히 준다 (2026-07 개편)

`GET /shops/:shopId` 응답에 **`reservationRoutes` 배열과 `bookingType`** 이 추가됐다.
**더 이상 URL을 추측하지 말고 `type`으로 판별**하라. (QA #32)

```jsonc
{
  "bookingUrl":  "https://m.booking.naver.com/...",  // 대표 링크(하위호환)
  "bookingType": "naver",                            // 대표 링크의 수단
  "reservationRoutes": [
    { "type": "naver",     "label": "네이버로 예약", "value": "https://m.booking.naver.com/..." },
    { "type": "talktalk",  "label": "톡톡으로 문의", "value": "http://talk.naver.com/..." },
    { "type": "instagram", "label": "인스타로 문의", "value": "https://www.instagram.com/..." }
  ]
}
```

| type | 의미 | 앱 처리 |
|---|---|---|
| `naver` | **네이버 온라인 예약** (`m.booking.naver.com`) — 유일한 진짜 "예약" | "네이버 예약" 버튼 |
| `talktalk` | 네이버 톡톡 **문의** (`talk.naver.com`) | "톡톡 문의" |
| `instagram` | 인스타 문의 | "인스타 문의" |
| `kakao` | 카카오 채널 (`*.kakao.com`) | "카카오 문의/예약" |
| `phone` | 전화번호 (URL 아님) | `tel:` |

- **`bookingType`** = 대표 링크의 종류다. `naver`가 있으면 그걸 최우선으로 잡는다(=온라인 예약 가능).
  `naver`가 없으면 문의 전용 샵 → `bookingType`이 `talktalk`/`instagram`/`phone` 등이 된다.
- **"네이버로 예약" 라벨은 `bookingType === "naver"` 또는 배열에 `naver`가 있을 때만** 붙여라.
- 여러 수단을 모두 버튼으로 노출하려면 `reservationRoutes` 를 그대로 렌더링하면 된다(각 항목에 `label` 포함).
- Supabase 데이터 감사 결과 **type↔URL이 100% 정확**하고 재분류 불필요함을 확인했다(883곳 표본).

---

## 3-5. 알림 — 매장 알림 vs 앱 소식 (2026-07 개편)

알림은 **두 갈래**다. 앱의 알림 탭은 이 둘을 합쳐 보여준다.

| 종류 | 로그인 | 소스 | 설명 |
|---|---|---|---|
| 매장 알림 (빈자리·주변) | 필요 | `GET /notifications` | 즐겨찾기/주변 샵에 빈자리가 새로 생기면 FCM + 목록 |
| 앱 소식 (공지·마케팅) | **불필요** | `GET /notifications/app-news` | 전역 피드. 로그아웃 상태에서도 노출 |

**FE가 해야 할 것:**

1. **앱 실행 시 디바이스 등록** (로그인 여부 무관):
   ```
   POST /notifications/devices
   { deviceId, fcmToken, platform, appNewsEnabled }
   ```
   - `deviceId`: 설치마다 고유한 ID(예: `react-native-device-info` 의 `getUniqueId`, 또는 최초 실행 시 생성해 저장한 UUID). FCM 토큰이 갱신되면 다시 호출.
   - 이게 있어야 **비로그인 유저도 앱 소식 푸시**를 받는다. (QA 비로그인 #4)

2. **알림 탭 구성**: 로그인 상태면 `GET /notifications`(매장) + `GET /notifications/app-news`(앱소식)를
   병합해 시간순 정렬. **로그아웃 상태면 앱 소식만** 노출. (QA 비로그인 #5)
   - 앱 소식 읽음 상태는 서버가 관리하지 않는다 → **로컬(기기)에서 관리**.

3. **매장 알림 수신 설정**은 기존대로 로그인 유저의 `PATCH /notifications/settings`
   (`favoriteEnabled`/`nearEnabled` + `fcmToken`). 앱 소식 on/off 는 `POST /devices` 의 `appNewsEnabled`.

> **빈자리 알림 발송 방식이 바뀌었다.** 예전엔 Supabase 트리거+상시 LISTEN 이었으나,
> 스크래퍼가 **직전 대비 새로 생긴 오늘 빈자리만** 백엔드로 밀어주는 방식으로 교체됐다.
> FE 변경사항은 없다(여전히 FCM 수신 + `GET /notifications`). 참고만.

---

## 4. 마이그레이션 체크리스트 (RN 앱)

- [ ] 앱 설정/환경변수의 `API_BASE_URL` 을 `https://api.themuselab.kr/api/v1` 로 교체
- [ ] 하드코딩된 `54.116.107.78` 전수 검색 후 제거
- [ ] iOS: ATS 예외(`NSAllowsArbitraryLoads`)를 넣어뒀다면 **제거** (이제 불필요)
- [ ] Android: `usesCleartextTraffic` 예외를 넣어뒀다면 **제거**
- [ ] 로그인 → 토큰 갱신 → 인증 필요 API 호출까지 **E2E 확인**
- [ ] 이미지/외부 리소스도 https인지 확인 (혼합 콘텐츠 방지)

빠른 확인:
```bash
curl -i https://api.themuselab.kr/health              # 200
curl -s "https://api.themuselab.kr/api/v1/shops?limit=1"   # 200 JSON
```

---

## 5. 인프라 정보 (운영 참고)

| 항목 | 값 |
|---|---|
| 서버 | AWS EC2 `syak-backend` (ap-northeast-2), Elastic IP `54.116.107.78` |
| 웹서버 | nginx 1.30.2 (`/etc/nginx/conf.d/syak.conf`) |
| 백엔드 | Docker 컨테이너, 내부 `127.0.0.1:3001` 로 프록시 |
| TLS | **Let's Encrypt** (api·admin 공용 인증서) |
| 만료 | 2026-10-07 |
| 자동갱신 | `certbot-renew.timer` (systemd) **활성**, 갱신 리허설 통과 |
| DNS | Cloudflare (네임서버 `dana`/`houston`), `api`·`admin` → EC2, **DNS only(회색)** |

인증서는 **자동 갱신**되므로 별도 조치가 필요 없습니다.

---

## 6. 참고 — 문서 정정 이력

`API_DOCS.md` 가 오랫동안 "RN 앱은 `Authorization: Bearer`" 라고 안내해 왔으나 **사실이 아니었습니다.**
구현은 처음부터 쿠키 전용이며(`auth.middleware.ts`), 로그인 응답 바디에 토큰이 담긴 적도 없습니다.
`docs/00-overview.md` 의 "모든 클라이언트가 쿠키 인증" 서술이 맞았습니다.

2026-07-10에 `API_DOCS.md` 와 이 문서를 **구현 기준으로 정정**했습니다.
로그인 요청 바디도 `{ code }` 가 아니라 `{ access_token }` 입니다.
