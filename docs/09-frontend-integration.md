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
| 클라이언트 | 인증 수단 |
|---|---|
| RN 앱 (소비자/사장님) | `Authorization: Bearer <accessToken>` — **쿠키 불필요** |
| 관리자 웹 | `syak_admin` HttpOnly 쿠키 (`SameSite=Strict`), 요청 시 `credentials: 'include'` |
| 내부 API (GH Actions) | `X-Internal-Key: <INTERNAL_API_KEY>` |

앱은 Bearer 토큰만 쓰므로 쿠키 관련 설정은 신경 쓸 필요 없습니다.

### 3-3. CORS
- 관리자 웹은 API와 **동일 출처**(`admin.themuselab.kr` 에서 `/api/*` 프록시)라 CORS 없음.
- RN 앱은 네이티브라 CORS 적용 대상이 아님.
→ 별도 CORS 설정 불필요.

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

## 6. 참고 — 문서 간 불일치 (정리 필요)

- `docs/00-overview.md` 는 "모든 클라이언트가 쿠키 인증, Authorization 헤더 미사용" 이라고 되어 있으나,
  실제 RN 앱은 **Bearer 토큰**을 사용합니다 (`API_DOCS.md` 기준).
- 추후 두 문서의 인증 방식 서술을 실제 구현 기준으로 통일할 것.
