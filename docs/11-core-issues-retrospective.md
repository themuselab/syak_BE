# 백엔드 핵심 문제 점검 & 해결 기록

점검일: 2026-07-25 · 대상: `syak_BE`(운영 EC2), 일부 `themuselab/syak`(스크래퍼)

각 항목은 **왜 과거에 이렇게 만들었나 → 무슨 문제 → 어디를 확인 → 무엇을 발견 → 어떻게 해결 → 결과** 순서로 정리했다.

## 요약

| # | 문제 | 심각도 | 상태 |
|---|---|---|---|
| 1 | 빈자리·주변 알림이 운영에서 한 번도 발송 안 됨 | 🔴 치명 | 해결(재설계) |
| 2 | 비로그인 유저는 앱 소식 알림 수신 불가 | 🟠 기능누락 | 해결(신규) |
| 3 | 예약 버튼이 실제 예약 수단과 다르게 연결됨 | 🟠 UX버그 | 해결(계약 노출) |
| 4 | 운영 소비자 카탈로그가 완전 무캐시 | 🔴 성능 | 해결(인메모리 캐시) |
| 5 | Supabase 1000행 한도 누락 → 오래된 데이터만 집계 | 🟠 데이터정확성 | 해결(헬퍼 통합) |
| 6 | JSONB detoast로 statement timeout(57014) | 🟠 성능/장애 | 해결(2단계 조회) |
| 7 | 인증 문서/설정 불일치 (쿠키 vs Bearer, Secure) | 🟠 보안/혼선 | 해결(정정) |
| 8 | 이미지 생성 API가 운영에서 항상 500 | 🟡 기능 | 해결(Dockerfile) |
| 9 | 관리자 통계 반복 조회가 매번 Supabase 직행 | 🟡 성능 | 해결(TTL 캐시) |
| 10 | 마케팅 스냅샷 7/10에서 멈춤 | 🟡 외부 | 진단(Meta 앱 차단) |

---

## 1. 🔴 빈자리·주변 알림이 운영에서 한 번도 발송되지 않음

**왜 이렇게 만들었나**
"슬롯이 열리면 실시간으로 알림"을 위해 Supabase DB 트리거(`slot_inserted`) → 백엔드 `SlotListener`가 `LISTEN` → FCM 발송 구조로 설계했다. 리스너는 `SUPABASE_DATABASE_URL` 로 Supabase에 직접 연결(LISTEN/NOTIFY는 PgBouncer 불가, Direct 필요)하도록 돼 있었다.

**증상**
관리자 대시보드/알림이 도는데도 실제 푸시가 나간 흔적이 없었다.

**어디를 확인**
- 운영 컨테이너 로그: `SlotListener connected — real-time slot notifications active` 는 찍혀 있었다.
- `SUPABASE_DATABASE_URL` 값을 EC2 `syak.env` 에서 확인 → **`DATABASE_URL`(RDS)과 완전히 동일한 값**.
- 컨테이너 안에서 그 DB에 접속해 `pg_trigger` 조회 → `relation "slots" does not exist`.
- 스크래퍼(`themuselab/syak` → `scraper/slot_ingest.py`)의 저장 방식 확인.

**무엇을 발견**
1. `SUPABASE_DATABASE_URL` 이 **Supabase가 아니라 RDS를 가리키고 있었다.** 리스너는 RDS에 붙어 `LISTEN` 중인데 슬롯은 Supabase에 INSERT된다. `pg_notify` 는 DB 단위라 리스너에 **영원히 도달 불가**. (LISTEN은 채널명만 듣기 때문에 테이블이 없어도 "connected"가 찍혀 정상처럼 보였다.)
2. 설령 DB가 맞았어도, 스크래퍼가 매시간 **슬롯을 삭제→재삽입**(wipe+reinsert)하므로 `AFTER INSERT` 트리거는 기존 슬롯까지 매시간 재알림 → **도배**가 된다. 트리거 방식 자체가 이 스크래퍼와 안 맞았다.

**어떻게 해결**
LISTEN/NOTIFY 경로를 폐기하고 **push 기반**으로 재설계:
- 스크래퍼가 삭제 직전 오늘 슬롯을 읽어두고, 재삽입 후 **직전 대비 새로 생긴 오늘 빈자리만 diff** 하여 `POST /notifications/internal/dispatch`(X-Internal-Key)로 백엔드에 밀어준다. 도배 방지(샵당 8개 초과 생략), 조회 실패 청크 제외, best-effort.
- 백엔드: `SlotListener`/`getSupabasePool`/`SUPABASE_DATABASE_URL` 의존 제거. dispatch 엔진·엔드포인트는 그대로 재사용.
- 관련 파일: `scraper/slot_ingest.py`, `.github/workflows/slots.yml`(시크릿 주입), `src/app/composition-root.ts`, `src/server.ts`.

**결과**
- dispatch 엔드포인트를 대상 0명 이벤트로 안전 검증 → `{dispatched:0}`(푸시 없음), 잘못된 키는 403.
- 재배포 후 운영 로그에서 `SlotListener` 완전히 사라짐(0건).
- 다음 정각/30분 스크래퍼 실행부터 실제 새 빈자리에 대해 알림 발송.

---

## 2. 🟠 비로그인 유저는 앱 소식(마케팅) 알림을 받을 수 없었다

**왜 이렇게 만들었나**
알림은 "로그인 유저의 매장 알림(즐겨찾기/주변)"만 상정하고, 푸시 토큰을 `notification_settings.user_id`(PK, users FK)에 묶었다. 알림 타입도 DB CHECK로 `('favorite','near')` 2종뿐.

**증상 (QA 비로그인 #4·#5)**
비로그인 상태에서 앱 소식 알림 설정 불가, 알림 탭에 앱 소식 노출 안 됨.

**어디를 확인**
`notification_settings`/`notifications` 스키마(`db/rds-init.sql`), 도메인/유스케이스.

**무엇을 발견**
- 푸시 토큰이 유저에 묶여 있어 **로그인 없이는 토큰 저장 자체가 불가**.
- `shop_news_enabled` 설정 칼럼은 이미 있는데 그걸 쓰는 발송 경로도, `app_news` 타입도 없었다(반쪽 구현).

**어떻게 해결**
앱 소식을 로그인과 무관한 **전역 피드**로 분리하고, 디바이스 토큰을 **익명(설치 단위)** 으로 등록:
- 신규 테이블 `push_devices`(device_id PK, fcm_token, app_news_enabled, user_id는 선택 연결), `app_news`(전역 공지) — `db/migration_notifications_v2.sql`.
- `POST /notifications/devices`(비로그인 등록), `GET /notifications/app-news`(비로그인 목록), `POST/DELETE /notifications/app-news`(관리자 발행/삭제 + 전 디바이스 FCM).
- 관련 파일: `PgAppNewsRepository`, `RegisterDeviceUseCase`, `ListAppNewsUseCase`, `PublishAppNewsUseCase`, `notification.routes.ts`.

**결과**
- 로컬·운영 RDS 마이그레이션 적용. 스모크 테스트 전부 통과(익명 등록 204, 목록 200, 관리자 가드 401, 발행 201).
- 앱은 알림 탭에서 매장 알림(로그인 시)과 앱 소식(항상)을 병합해 노출하면 됨. → `docs/09-frontend-integration.md`

---

## 3. 🟠 '네이버 예약' 버튼이 인스타로 연결됨

**왜 이렇게 만들었나**
`GET /shops/:id` 의 `bookingUrl` 을 `detail.reservationRoutes[0].value`(첫 항목)로 매핑했다. 서버는 예약 수단 종류를 안 보내고 바 문자열 하나만 줬다.

**증상 (QA #32)**
"네이버로 예약"을 눌렀는데 인스타로 연결되는 샵이 있었다.

**어디를 확인**
Supabase `shops.detail.reservationRoutes` 표본 883곳을 떠서 `type ↔ URL 도메인` 교차 검증.

**무엇을 발견**
- **데이터의 type은 100% 정확했다.** `naver`=`m.booking.naver.com`(진짜 예약), `talktalk`=`talk.naver.com`(문의), `instagram`/`kakao`/`phone`. 재분류 불필요.
- `naver` 예약이 있으면 **항상 배열 첫 항목**(98/98)이라 순서도 이미 옳았다.
- 진짜 문제: **API가 그 type을 앱에 안 줬다.** 그래서 앱이 URL을 추측하다가 네이버가 없는 샵에도 "네이버 예약" 라벨을 붙였다.

**어떻게 해결**
분류를 응답에 그대로 노출:
- `Shop` 응답에 `reservationRoutes`(`{type,label,value}[]`)와 `bookingType` 추가. `bookingUrl` 은 naver 우선으로 선택(하위호환).
- 관련 파일: `catalog/domain/Shop.ts`, `PgShopRepository.mapFull`.

**결과**
운영에서 naver 샵 → `bookingType:"naver"` + 실제 예약 링크, 문의 전용 샵 → `bookingType:"talktalk"` 등 확인. 앱은 `bookingType === "naver"` 일 때만 "네이버 예약" 라벨을 붙이면 된다.

---

## 4. 🔴 운영 소비자 카탈로그가 완전 무캐시 (지도/목록 조회)

**왜 이렇게 만들었나**
`PgShopRepository` 는 목록(300s)·상세(600s) 캐시를 `ICacheService` 로 구현해 뒀고, `REDIS_URL` 이 있으면 Redis, 없으면 `NullCacheService`(no-op)로 fallback하게 했다.

**증상**
소비자 `/shops`(지도·목록) 응답이 300ms~1s로 튀었다. 트래픽 많은 경로라 체감 속도 직결.

**어디를 확인**
`composition-root.ts` 의 캐시 선택 로직, 운영 `syak.env` 의 `REDIS_URL` 유무, 운영 `/shops` 지연 측정.

**무엇을 발견**
- 운영에 **`REDIS_URL` 이 설정돼 있지 않다** → `NullCacheService`(항상 미스, set은 no-op).
- 즉 **설계된 캐시가 운영에서 전부 무력화**, 모든 소비자 요청이 매번 Supabase 직행. 무료티어 왕복 지연을 그대로 맞고 있었다.
- 지도 목록은 캐시 키에 정밀 lat/lng가 통째로 들어가, 캐시가 있었어도 지도를 조금만 움직이면 매번 미스였다.

**어떻게 해결**
- `NullCacheService` → **`InMemoryCacheService`(LRU+TTL)** 로 fallback 교체. Redis 없이도 기존 캐시가 동작.
- **지도 좌표를 소수 2자리(≈1.1km 격자)로 스냅** → 근처 팬/줌이 같은 캐시 공유. 5km 박스 기준 중심 이동 ≤0.5km라 결과 차이 사실상 없음.
- 운영 EC2가 **912MB 소형**이라 캐시 상한을 **300개**로 보수적으로 잡음.
- 관련 파일: `shared/cache/InMemoryCacheService.ts`(+단위 테스트), `PgShopRepository.findMany`, `composition-root.ts`.

**결과 (운영 실측, 캐시 히트)**

| | 전 | 후(히트) |
|---|---|---|
| /shops 목록(100) | 800ms | 57ms |
| /shops 상세 | ~100ms | 40ms |
| 지도 쿼리(lat/lng) | 300~800ms | ~52ms(5연속 안정) |

**남은 한계**: 첫 뷰포트/첫 조회는 여전히 미스(Supabase 비용). 지도 100핀 초과는 `limit=100` 제한 — 지도 전용 경량 엔드포인트가 다음 후보.

---

## 5. 🟠 Supabase 1000행 한도 누락 → 오래된 데이터만 집계 (반복 발생)

**왜 이렇게 만들었나**
Supabase PostgREST는 **기본 1000행**만 반환한다. 통계 핸들러들이 이벤트를 조회할 때 이 한도를 각자 `while+range` 로 페이지네이션했는데, **핸들러마다 복붙**했다.

**증상**
"30일 누적이 딱 1000건에서 안 늘고, 특정 날짜 이후가 안 보인다."

**어디를 확인**
`getTrends`, `cancelRequestStats`, `shopViewStats` 등 통계 핸들러.

**무엇을 발견**
페이지네이션이 **빠진/틀린 핸들러가 섞여 있었다.** 복붙 구조라 한 곳을 고쳐도 다른 곳을 놓쳤다(실제로 두 번 재발). 오래된 1000건만 집계되고 최신이 누락됐다.

**어떻게 해결**
공용 헬퍼 `fetchAllRows(buildPage)` 하나로 **6곳을 통합**. 페이지네이션 로직이 한 군데만 존재 → 같은 버그 원천 차단. (`AdminController.ts` 1008→약 950줄)

**결과**
전 통계 핸들러가 전량을 정확히 집계. 이후 이 클래스의 버그 재발 여지 제거.

---

## 6. 🟠 JSONB detoast로 statement timeout(57014)

**왜 이렇게 만들었나**
전화번호가 `shops.detail`(JSONB) 안에 있어, 목록 조회 시 `select('... detail->>phone')` 로 뽑았다.

**증상**
`/admin/shops`(전체 4.5만 행) 조회가 500(`statement timeout`, 57014).

**어디를 확인**
`listAllShops`, `listPartnerShops` 의 select + order.

**무엇을 발견**
4.5만 행을 정렬하면서 `detail->>phone` 을 뽑으면 **JSONB detoast 비용**으로 statement timeout. (`detail` 전체를 디스크에서 풀어야 함)

**어떻게 해결**
**2단계 조회**: 먼저 목록을 `detail` 없이 가볍게 뽑고(id 포함), 그 다음 `id` 로 `detail->>phone` 만 재조회해 detoast를 **소수 집합으로 한정**. `listAllShops` 에 적용.

**결과**
`/admin/shops` 500 → 200(약 1.0s). **단, `listPartnerShops`(4곳 소규모)에는 2단계가 오히려 왕복만 늘려(151ms→250ms) 단일 쿼리로 되돌림 — 측정 없이 최적화하면 역효과날 수 있다는 사례.**

---

## 7. 🟠 인증: 문서/설정이 구현과 불일치

**왜 이렇게 만들었나**
초기 문서에 "RN 앱은 `Authorization: Bearer`" 로 적혀 있었다.

**어디를 확인**
`auth.middleware.ts`, `AuthController` 로그인 응답, 운영 `Set-Cookie` 헤더, `syak.env` 쿠키 설정.

**무엇을 발견**
- 구현은 **처음부터 쿠키 전용**(`req.cookies.syak_access`). 로그인 응답 바디에 토큰이 담긴 적도 없다. `Authorization: Bearer` 는 서버가 읽지 않는다. → `API_DOCS`/`09-frontend` 가 **틀렸었다**(`00-overview` 가 맞았음).
- 로그인 요청 바디도 `{code}` 가 아니라 `{access_token}`.
- 운영이 `COOKIE_SECURE=false` 인데 `COOKIE_SAME_SITE=none` → **브라우저는 `Secure` 없는 `SameSite=None` 쿠키를 거부**(스펙상 무효). 웹 클라이언트면 로그인 직후 전부 401.

**어떻게 해결**
- 문서를 구현 기준으로 정정(쿠키 인증, 요청/응답 형태, 정정 이력 명기).
- 운영 `COOKIE_SECURE=true` 로 변경 후 컨테이너 재생성. `Set-Cookie: ...; Secure; SameSite` 확인. 평문 경로(`http://…`)는 이미 301/404라 잃을 트래픽 없음.

**결과**
`Set-Cookie` 에 `Secure` 정상 부여, 관리자/앱 인증 정상.

---

## 8. 🟡 이미지 생성 API가 운영에서 항상 500

**왜 이렇게 만들었나**
`MarketingImageService` 가 프롬프트를 런타임에 `scripts/marketing/image-recipes.json` 에서 읽도록 했다.

**어디를 확인**
운영에서 생성 호출(500) → `Dockerfile`.

**무엇을 발견**
`Dockerfile` 이 `dist` 만 런타임 이미지에 넣어 **레시피 JSON이 컨테이너에 없었다.** NVIDIA 키 유무와 무관하게 실패. 게다가 그 에러가 `Promise.allSettled` 에 섞여 "한 장도 생성 못함"으로 묻혔다.

**어떻게 해결**
- `Dockerfile` 에 레시피 JSON `COPY` 추가.
- 키·레시피 누락을 `ImageGenConfigError` 로 구분해 **503 + 원인 메시지** 반환. 응답 형태를 전역 핸들러와 같은 `{code,message}` 로 통일.

**결과**
운영에서 `NVIDIA_API_KEY_FLUX` 추가 후 생성 성공(added:1, failed:0).

---

## 9. 🟡 관리자 통계 반복 조회가 매번 Supabase 직행

**왜 이렇게 만들었나**
통계는 이벤트를 1000행씩 여러 번 왕복해 전량 로드 후 JS로 집계했다. 캐시 없음.

**어디를 확인**
운영 통계 엔드포인트 지연 측정(대부분 <500ms, `cancel-requests` 콜드 1.1s), events 21.8k행.

**무엇을 발견**
집계를 DB로 밀 수 있으면(GROUP BY) 왕복 1회로 끝나지만, **PostgREST 집계가 이 프로젝트에서 비활성(PGRST123)** 이고 RPC/aggregate는 Supabase DDL이 필요하다. 반복 조회가 매번 왕복을 낸다.

**어떻게 해결**
- 통계 5개에 **인메모리 2분 TTL 캐시**(키=핸들러+기간). 히트 시 왕복 0.
- 조회 인덱스 추가: RDS(`users`/`owner_accounts`/`partner_codes`.created_at, `shop_inquiries`.status)는 **적용 완료**. Supabase 인덱스(`events(event,created_at) INCLUDE(shop_id)` 등)는 `db/migration_perf_indexes.sql` [A] 섹션 — **SQL Editor에서 사용자 적용 필요**.

**결과 (운영 실측)**

| | miss | hit |
|---|---|---|
| trends | 1643ms | 27ms |
| shop-views 30d | 337ms | 27ms |
| visitors 30d | 236ms | 28ms |

**남은 것**: 미스 경로를 근본적으로 줄이려면 집계 DB 푸시(aggregate 허용 or RPC). 마이그레이션 파일 하단에 정리.

---

## 10. 🟡 마케팅 스냅샷이 7/10에서 멈춤 (외부 원인)

**어디를 확인**
`marketing-snapshot` 워크플로 실행 이력·로그, Meta Graph API 직접 호출.

**무엇을 발견**
코드 문제가 아니었다. 토큰은 유효한데 IG/쓰레드/광고 API가 전부 `200: API access blocked`(code 200, OAuthException) → **Meta 앱이 차단/개발모드 전환된 상태.** 워크플로가 7/11부터 매일 실패해 새 스냅샷이 안 쌓였다.

**어떻게 해결**
Meta 대시보드에서 앱 상태 복구(사용자 조치). 복구 확인 후 워크플로 수동 실행 → `snapshot_date=2026-07-25` 저장, IG·쓰레드·광고 실데이터 + AI 조언 정상.

**결과**
관리자 마케팅 탭이 오늘 실데이터 표시. 이후 매일 08:20 자동 갱신. (7/11~7/24는 그 시점에 막혀 있어 소급 수집 불가)

---

## 지금도 사람이 해야 할 것 (미완)

- **Supabase 인덱스 적용**: `db/migration_perf_indexes.sql` [A] 섹션을 Supabase SQL Editor에서 실행(DB 비번이 없어 자동 적용 불가).
- **집계 DB 푸시(후속)**: events가 커지면 미스 경로가 느려짐 → aggregate 허용 or RPC 함수.
- **인프라 상한**: EC2 912MB(가용 460MB) + Supabase 무료티어가 근본 상한. 트래픽 증가 시 Redis 도입 / 인스턴스 업그레이드 / Supabase 유료.
- **메타 광고 토큰**: 60일 후 만료. 시스템 사용자 토큰(만료 없음)으로 교체 권장.

## 배운 것 (재발 방지)

1. **복붙된 인프라 로직은 버그를 복제한다.** 1000행 페이지네이션이 핸들러마다 복붙돼 같은 버그가 반복됐다 → 헬퍼로 단일화.
2. **"connected" 로그가 정상 동작을 뜻하지 않는다.** LISTEN은 잘못된 DB에 붙어도 성공한다. 끝단(실제 발송/데이터 도달)까지 검증해야 한다.
3. **환경변수 이름이 비슷하면 잘못 채워진다.** `SUPABASE_DATABASE_URL` 에 RDS 주소가 들어가 있었다. 배포 시 실제 대상 DB를 검증할 것.
4. **최적화는 측정 후에.** `listPartnerShops` 2단계는 소규모에선 역효과였다. 데이터 규모에 맞는 선택이 필요.
5. **설계된 기능이 운영 설정 때문에 무력화될 수 있다.** 캐시 코드는 있었지만 `REDIS_URL` 미설정으로 no-op이었다. 코드뿐 아니라 운영 환경까지 확인해야 한다.
</content>
