# 관리자 운영·분석·데이터 조회

## 화면
- `/partner-shops`: 네이버 링크/ID로 신규 등록 또는 기존 샵 파트너 전환. 코드 발급 없이 등록 가능. 이름/주소는 네이버 조회 실패 시 보완 입력. 등록 이후 파트너 상세 갱신에서 좌표도 최신화한다.
- `/insights`: 내부 세션 퍼널 생키 차트, 파트너/일반 비교, 전체 이벤트 목록, 별도 GA4 이벤트 집계, Clarity 링크.
- `/explorer`: 한국어 컬럼 선택/단일 일치 조건, 질문 템플릿, 읽기 전용 SQL, CSV 다운로드.

## API (관리자 쿠키 필요)
- POST `/admin/partner-shops/register`: `{place,name?,address?,category?}`. 내부 등록 로직 재사용.
- GET `/admin/insights/funnel?days=7&platform=all`: 기간 1/7/30/90일, 플랫폼 all/web/ios/android/toss.
- GET `/admin/insights/ga4?days=7`: GA4 이벤트별 발생·고유 사용자 수. 순서 기반 퍼널이 아니며 내부 통계와 합산 금지.
- GET `/admin/insights/integrations`: 공개 Clarity 프로젝트 ID와 GA 연결 설정 여부.
- GET `/admin/explorer/schema`: 허용된 테이블·컬럼 목록.
- POST `/admin/explorer/query`: `{sql}` → columns/rows/truncated/durationMs/sql.

## 세션 정의 / 한계
소비자 웹 및 앱 웹뷰의 기존 GA/GTM/Hackle 단일 전송 지점에서 내부 수집도 호출한다. GTM 전송 주체 선택은 그대로 유지한다.
신규 endpoint POST `/analytics/events`에는 20개 이하 이벤트 배열을 전송한다. 서버는 승인 필드만 저장하며 event_id UUID 중복은 무시한다. 클라이언트 시각 ±24시간을 검증한다.
`sessionStorage` 탭 단위 익명 세션, 마지막 이벤트 이후 30분 비활동 시 새 세션. 새 세션의 첫 이벤트 앞에 service_enter를 삽입한다.
기간 내 service_enter → 이후 첫 shop_view → 그 샵의 reserve_click(reservation_method=naver) 순서. 첫 샵 유형으로 세션을 상호 배타 분류한다. 다른 샵 클릭은 전체 이벤트 표에만 반영된다. 미래 클릭 미관측은 이탈 확정이 아니다.
기존 DB 조회·클릭 테이블에는 익명 세션이 없으므로 과거 퍼널을 추정해서 채우지 않는다. 배포 이후부터 수집된다. 네이버 클릭은 예약 완료가 아니다.
90일 이전 내부 행동 데이터는 기동 직후 및 6시간마다 정리한다. GA 집계는 속성 시간대의 달력 날짜, 내부 퍼널은 현재로부터 N일 구간이므로 경계가 다르다.

## SQL 실행 경계
실제 DB 스키마 중 운영 분석용 8개 테이블의 승인 컬럼만 노출한다. 회원은 ID·상태·가입 시각만 허용하며 연락처·소셜 계정·토큰은 제외한다.
pgsql-ast-parser로 단일 SELECT만 파싱해 허용 AST를 재직렬화한다. 단일 테이블, 비교/집계/정렬/제한만 허용. JOIN/CTE/서브쿼리/스키마/캐스트/임의 함수/쓰기/다중 문장 금지.
BEGIN READ ONLY, search_path pg_catalog/public, statement_timeout 3초, lock_timeout 500ms, 최대 500행. 조회 실패에도 rollback/release. 같은 관리자 연결 기준 분당 30회 제한. 새 테이블·컬럼 추가는 QueryExplorer.ts 승인 목록을 수정한다.

## Clarity
- Muse Lab 계정 프로젝트: `SYAK Consumer Web & App`, 공개 프로젝트 ID `zd1l2cqi0i`. 기본값으로 코드에 설정되며 아래 환경변수로 재정의 가능. 빈 문자열로 비활성화 가능.
- 개발/미리보기 도메인의 신규 내부 이벤트·Clarity 수집은 제외한다. 허용 호스트: themuselab.kr / www.themuselab.kr / app.themuselab.kr.
- 소비자 웹 `VITE_CLARITY_PROJECT_ID`, 앱 웹뷰 `EXPO_PUBLIC_CLARITY_PROJECT_ID`, 관리자 API `CLARITY_PROJECT_ID`에 동일 프로젝트 ID.
- SDK는 웹 DOM 환경에서만 로드. 네이티브 RN SDK를 새로 설치하지 않는다(현재 앱의 웹뷰에서 수집).
- 이름/전화/이메일/검색 입력은 커스텀 태그로 보내지 않는다. 태그: platform, shop_type, shop_id. 행동 이벤트: service_enter/shop_view/reserve_click/search_submit/filter_apply/slot_alert_created.
- 기본 consentv2는 analytics_Storage/ad_Storage denied(쿠키 없는 수집). 마케팅 수신 동의로 간주하지 않는다. 별도 CMP 도입 시 실제 동의 상태를 전달해야 한다.
- Clarity 프로젝트 설정에서 Strict 마스킹 적용. 관리자 페이지에는 녹화 SDK를 설치하지 않는다. GTM에도 동일 Clarity 태그를 중복 설치하지 않는다.
- 세션 녹화/히트맵은 Clarity 프로젝트에서 확인하며 관리자에 임의 iframe으로 삽입하지 않는다.

## 배포 순서
1. 백엔드: tracking migration 및 수집/관리자 API 배포.
2. 소비자 웹·앱 웹 빌드: Clarity ID와 기존 API URL 반영 후 배포.
3. 관리자 빌드 배포. 신규 페이지에서 실제 수집 상태 확인.
4. 새 익명 세션으로 샵 조회→네이버 이동 검증. Clarity 수집 처리는 지연될 수 있다.
