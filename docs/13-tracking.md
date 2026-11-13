# 13 — 추적 데이터: DB(서버 사실) vs GA4

> 2026-11 관리자 리뉴얼: 신규 `analytics_events`에는 비회원 포함 클라이언트 세션 행동이 저장됩니다. 아래 서버 사실 테이블과 달리 차단·전송 실패에 영향을 받습니다. 신규 세션 퍼널·보관기간·Clarity 연결은 [15-admin-insights.md](15-admin-insights.md)를 참고하세요.

2026-11-01 정리. "무엇이 일어났는가"를 어디서 세는지에 대한 기준 문서.

- **DB(RDS)** = 서버가 직접 처리한 **사실**. 로그인 사용자 단위로 정확하고, 광고 차단·앱 버전·동의 여부에 영향받지 않는다.
  디코 일일 앱 지표(`GET /internal/app-metrics`, [08-admin.md](08-admin.md))는 전부 DB에서 센다.
- **GA4** = 클라이언트(웹/앱)가 보내는 **행동 이벤트**. 비로그인 포함 전체 트래픽·유입 경로·퍼널(랜딩→CTA→상세→예약)용.
  차단·누락이 있을 수 있어 "정확한 건수"보다 추세·출처 분석에 쓴다.

같은 행동(샵 조회, 예약 클릭)이 양쪽에 있을 수 있다. 숫자가 다르면: **로그인 사용자·서버 처리 기준은 DB, 유입·비로그인·퍼널은 GA4**.

---

## DB에 있는 사실

모든 마이그레이션은 기동 시 멱등 실행(운영 DB 직접 접근 경로 없음). 이번 보강분: `src/shared/lib/trackingMigration.ts` = `db/migration_tracking.sql`.

| 테이블.컬럼 | 기록 시점 | 측정하는 것 | 비고 |
|---|---|---|---|
| `users.created_at` | 첫 소셜 로그인(가입) | 가입 | 탈퇴 시 행 삭제 → 과거 가입 수가 줄어들 수 있음 |
| `shop_view_events(shop_id, user_id, viewed_at)` | `GET /api/v1/shops/:shopId` (앱 샵 상세) | 샵 상세 조회 | `optionalAuth` 적용(2026-11-01)으로 로그인 사용자는 `user_id` 채움. 비로그인은 NULL. 웹(`/web/shops/:id/detail`)은 기록 안 함 → 웹 조회는 GA4 |
| `reservation_click_events(shop_id, user_id, clicked_at)` | `POST /api/v1/shops/:shopId/reservation-click` | 예약 버튼 클릭(외부 예약 수단으로 이동) | 위와 동일하게 `optionalAuth`. 실제 예약 성사가 아님 |
| `favorites(user_id, shop_id, created_at)` | 즐겨찾기 추가 | **현재** 즐겨찾기 상태 | 해제하면 행이 삭제됨 → 이력 아님 |
| `favorite_events(user_id, shop_id, action, created_at)` **신규** | 즐겨찾기 추가/해제 API 성공 직후 | 추가(`add`)·해제(`remove`) 이력 | fire-and-forget. 기록 실패는 로그만(API 응답 영향 없음). 탈퇴 시 CASCADE 삭제 |
| `notification_settings.region_code / region_name` | 알림 설정 저장 | 현재 관심 동네 | |
| `notification_settings.region_set_at` **신규** | `region_code`가 바뀔 때(첫 설정 포함) | 관심 동네 설정/변경 시각 | 같은 값 재저장은 갱신 안 함. 2026-11-01 이전에 설정한 사용자는 NULL. `updated_at`은 다른 설정 변경에도 갱신돼 이 용도로 못 씀 |
| `slot_alerts.created_at` / `notified_at` | 빈자리 알림 신청 / 매칭 발송 | 신청·발송 완료 | 발송 완료 = 알림 row 처리 시점(푸시 성공 여부와 무관) |
| `notifications.created_at` | 빈자리 알림 row 저장 | 알림 생성 | |
| `notifications.pushed_at` **신규** | Expo Push API가 메시지를 접수(ticket `ok`)한 직후 | 푸시 발송 성공 | 토큰 없음·구 FCM 토큰·Expo 오류면 NULL |
| `notifications.opened_at` **신규** | 앱이 `PATCH /notifications/:id/opened` 호출 | 푸시 탭으로 앱 열림 | 멱등(첫 시각 유지), `read_at`도 함께 채움. 앱이 푸시 `data.notificationId`로 호출해야 쌓임(앱 업데이트 필요) |
| `notifications.read_at` | 읽음 API / 샵 일괄 읽음 / opened | 읽음 | |
| `slots(source='owner').created_at` | 사장님이 빈자리 등록 | 파트너 활동 | |
| `slots(source='owner').reserved_at` | 사장님이 "예약 완료" 표시 | **실제 예약 완료(사장님 표시 기준)** | 사장님이 표시하지 않으면 안 잡힘 |
| `owner_accounts.shop_id` | 파트너 코드로 샵 연결 | 연결된 파트너 | |

### 측정할 수 없는 것

- **푸시 `delivered`(기기 도달)**: Expo는 APNs/FCM에 넘긴 것까지만 확인해 준다(receipt도 동일). 기기 꺼짐·알림 권한 off·OS 정리는 서버가 알 수 없다.
  그래서 오픈율 = `opened / pushed`(도달 대비가 아니라 접수 대비).
- **소비자 앱 경유 실제 예약 성사**: 예약은 외부(네이버 등)에서 끝나므로 서버는 "예약 클릭"까지만 안다. 파트너 샵만 `reserved_at`(사장님 표시)으로 근사.
- **비로그인 사용자 식별**: 비로그인 조회/클릭은 `user_id` NULL — 사람 수는 GA4로.

### app-metrics 지표 ↔ 출처

| 지표 | 쿼리 출처 |
|---|---|
| `signups` | `users.created_at` |
| `regionSet` | `notification_settings.region_set_at` |
| `favorites.added` / `removed` | `favorite_events.action` |
| `views.total` / `views.users` | `shop_view_events` (users = DISTINCT 로그인 user_id) |
| `slotAlerts.created` / `notified` | `slot_alerts.created_at` / `notified_at` |
| `push.sent` / `opened` / `openRate` | `notifications.pushed_at` / `opened_at` |
| `reserveClicks.total` / `users` | `reservation_click_events` |
| `conversion.viewToReserve` | `reserveClicks.total / views.total` (둘 다 앱 상세 경유라 같은 모집단) |
| `partner.activePartners` | `owner_accounts.shop_id` + 최근 30일 `slots(source='owner')` |
| `partner.ownerSlots.reserved` | `slots(source='owner').reserved_at` |

---

## GA4에 있는 것 (클라이언트 이벤트)

| 이벤트 | 어디서 | 용도 |
|---|---|---|
| `shop_view` (`shop_id`) | 웹/앱 샵 상세 | 전체(비로그인 포함) 조회, 관리자 통계·일일 리포트 조회수, 파트너 조회 |
| `reserve_click` (`shop_id`) | 웹/앱 예약 버튼 | 전체 예약 클릭, 파트너 전환 |
| `seo_landing`, `seo_cta_click` | SEO 지역 랜딩(`/nail/...`) | 검색 유입 퍼널 |
| `app_install_click` | SEO 페이지 앱 설치 버튼 | 앱 설치 유도 |

GA4 숫자는 `src/contexts/admin/infrastructure/GA4Service.ts`로 읽는다(관리자 통계, `daily-report`, `partner-engagement`).
