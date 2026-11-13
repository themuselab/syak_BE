# 관리자 운영·분석·데이터 조회

## 현재 데이터 기준 (2026-11-14)

사용자 지시에 따라 **행동 지표는 기존 GA4 데이터만 사용한다.** 별도 내부 세션·이벤트를 생성하거나 GA 장애 시 내부 데이터/원본 재집계로 대체하지 않는다.

- `/dashboard`: GA 공식 Funnel API 결과, GA 보고서의 이벤트 발생 수, Clarity 링크, 별도 서비스 등록 현황.
- `/insights`: `/dashboard`로 이동. 별도 분석 메뉴 없음.
- `/partner-shops`: 네이버 링크/ID로 신규 등록 또는 기존 샵 파트너 전환. 조회 실패 시 이름·주소 보완 가능.
- `/explorer`: 승인된 서비스 DB 컬럼, 읽기 전용 SQL, 금액 필터, CSV. 중단된 `analytics_events` 및 해당 질문 템플릿은 제외했다.

## GA 공식 퍼널

- GET `/admin/insights/ga4-funnel?days=7&shopType=all` (관리자 쿠키 필수).
- days=0/1/7/28/30/90, shopType=all/partner/general. 한국 날짜로 **어제까지**. 0은 최초 확인된 GA 데이터 날짜 2026-08-19부터.
- GA 속성 `544178953`, v1alpha `runFunnelReport`. `session_start` → `shop_view` → `reserve_click`의 닫힌 퍼널이며, 마지막 단계는 기존 `reservation_method=naver` 조건을 적용한다.
- 파트너/일반 조회에서는 두 번째·세 번째 단계에 기존 `shop_type` 이벤트 파라미터 조건을 적용한다. 새 이벤트나 맞춤 측정기준을 생성하지 않는다.
- GA의 `activeUsers`, `funnelStepCompletionRate`, `funnelStepAbandonments`를 그대로 표시한다. 자체 익명 세션 수가 아니며, 기간 중 순서를 만족한 사용자다. 동일 샵/동일 세션을 강제하지 않는다. 파트너/일반은 독립 퍼널이라 합산하지 않는다. 네이버 클릭은 예약 완료가 아니다.
- 같은 기간·유형 요청을 병합하고 PostgreSQL `ga4_funnel_cache`에 GA 응답을 10분 캐시한다. 실패하면 **동일 조건의 이전 GA 응답만** 표시하며 조회 시간을 표시한다. 이전 응답도 없으면 오류를 표시한다. 누락된 GA 응답을 0으로 바꾸지 않는다.
- 서버측 캐시는 30일 이전 항목을 정리한다. GA 탐색의 보관 기간·표본·임계값은 GA 정책대로 적용된다.
- 기존 `/admin/insights/funnel`은 410 및 새로고침 안내. 예전 내부 퍼널 결과를 반환하지 않는다.

## GA 이벤트 보고서 저장본

- GET `/admin/insights/ga4?days=0|1|7|28|30|90`: `syak-c2ee0.syak_reporting.ga4_event_daily` 중 **GA 보고서 출처만** 조회. 퍼널과 동일한 날짜 경계. 일별 사용자 합계를 사용자 수로 표시하지 않는다. 이벤트 발생 횟수만 합산한다.
- 초기 GA 웹 보고서 내보내기: 요청 2020-01-01~2026-11-13, 실제 2026-08-19~2026-11-13, 1,641행 / 78종 / 이벤트 129,530건. 원본 보고서 총합과 대조했다.
- `BIGQUERY_REPORTS_ENABLED=true`: 기동 30초 후 및 6시간마다 최신 적재일의 3일 전부터 GA 보고서를 재조회한다. advisory lock, BigQuery 배치 `WRITE_TRUNCATE`, `ga4_report_archive` 백업으로 중복·이력 손실을 방지한다. 실패 시 이전 저장본을 보존한다.
- **GA 원본 내보내기 재집계 fallback은 제거했다.** GA 보고서와 원본의 사용자 식별·모델링 차이를 섞지 않는다. 보고서 API가 지연되면 갱신 시각으로 지연을 알린다.
- BigQuery 쿼리 최대 스캔 100 MB, 날짜별 메모리 캐시 5분. 샌드박스 원본 테이블 60일 만료·스트리밍 없음. 집계 스냅샷은 성공 적재 시 59일로 만료 갱신하고 PostgreSQL에도 보관한다.
- GA 자체의 5개 스트림 일일 원본 내보내기는 계속 유지하지만 관리자 보고서에 합산하지 않는다.

## 중복 수집 중단

- 소비자 웹·앱에서 `/analytics/events` 전송과 `syak:behavior-session` 생성, 가상 `service_enter` 삽입을 제거했다. 기존 GA/GTM/Hackle 전송은 그대로 유지한다.
- 과거 캐시 클라이언트 호환용 POST `/analytics/events`는 204만 반환하고 DB에 쓰지 않는다. 과거 데이터는 삭제하지 않았으며 기존 90일 만료 작업이 정리한다.
- 서비스 등록 수(회원·사장님·파트너샵)는 DB 기준으로 명시해 별도 표시한다. 이전 혼합 행동 차트와 자동 일일 리포트 팝업은 대시보드에서 제거했다.

## SQL 실행 경계

승인된 7개 테이블의 명시적 컬럼만 노출한다. 회원 ID·상태·가입 시각 외 연락처/인증정보는 제외한다. 단일 SELECT, 단일 테이블, 비교/집계/정렬/제한만 허용하며 JOIN/CTE/서브쿼리/스키마/임의 함수/쓰기는 금지한다. READ ONLY, 3초 제한, 최대 500행, 실패 시 rollback/release.

## Clarity

프로젝트 `SYAK Consumer Web & App`, ID `zd1l2cqi0i`. `VITE_CLARITY_PROJECT_ID` / `EXPO_PUBLIC_CLARITY_PROJECT_ID` / `CLARITY_PROJECT_ID`로 재정의한다. 소비자 웹/앱 웹뷰의 운영 도메인만 로드한다. 관리자 녹화 없음. Strict 마스킹, 기본 쿠키 없는 수집, platform/shop_type/shop_id만 태그로 전송하며 개인정보 입력은 보내지 않는다. GA 수치에 합산하지 않는다.
