# 파트너 데이터 갱신 내부 API

모든 요청은 기존 `X-Internal-Key` 인증을 사용한다. 스키마 추가 없이 `shops.detail._partnerRefresh`에 소스별 마지막 관측 시각을 저장한다.

- `GET /internal/shops/partner-targets?kind=slots|events|details&after=<cursor>`: 현재 파트너를 해당 소스의 마지막 성공 시각·ID 오름차순으로 최대 50곳 반환. `targets[].due`는 슬롯 3분·이벤트 30분·상세 6시간 경과 여부, `next`는 다음 페이지의 불투명 커서다. 미동기화 파트너는 즉시 due다. 오래된 매장 우선으로 처리해 예산 종료 시 다음 실행에서 미처리 매장을 우선한다.
- `POST /internal/shops/partner-refresh`: `{id, kind, observedAt, data}`. 응답 `{applied, newSlots}`. 등록 해제 또는 이미 더 최신 시각이 저장된 경우 `applied=false`다.
- `slots.data`: `{startDate,endDate,slots:[{date,startTime}],summary}`. 날짜창 최대 3일, 슬롯 최대 5천 개. 동일 샵 행 잠금 아래 scraper 슬롯의 차이만 갱신한다. 동일 슬롯은 유지하고 없어진 슬롯·과거분 삭제 및 신규 슬롯 추가만 수행한다. owner 슬롯 및 예약 기록은 보존한다. 모든 담당자 조회 성공 이후에만 호출해야 한다.
- `events.data`: `{event_desc,event_price}`. 정상적으로 확인된 null은 만료 이벤트 제거로 처리한다.
- `details.data`: `{detail,name?,representative_image?,review_count?,min_price?,price_tier?,biz_id?,item_id?,biz_type?,item_ids?,items?}`. 검증된 상세 필드만 전달한다. 배열은 누적하지 않고 제한된 최신 샘플로 교체하며 생략된 사진 섹션은 보존한다.

관측 시각은 최근 1시간 내 값만 허용한다. 각 소스의 커밋은 트랜잭션으로 처리하며 실패 시 이전 데이터가 유지된다. 커밋 후 목록·상세·슬롯 캐시를 무효화한다. 첫 슬롯 동기화에서는 신규 알림을 반환하지 않는다.

전용 소스가 성공한 파트너는 전국 수집의 해당 소스 갱신에서 제외한다. 전국 슬롯 작업도 샵 행을 잠근 후 소유권을 확인하여 이전 실행이 전용 데이터 위에 쓰지 못하게 한다. 파트너 해제는 전용 작업에서 다시 켜지지 않는다.

검증: `PartnerRefreshService.test.ts`의 해제·역순 관측·빈 배열·잘못된 날짜창·배열 상한·롤백 회귀 테스트. 수집기는 web 레포 `scraper/partner_refresh.py`, 운영 주기는 `docs/partner-refresh.md` 참고.
