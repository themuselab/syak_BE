# Syak 공통 API

독립 레포 `themuselab/syak_BE`. Node.js / Express 4 / TypeScript / PostgreSQL / Redis / Jest·Supertest. 전체 제품과 형제 레포는 `../CLAUDE.md`를 참고한다.

- 개발: `npm run dev`. 빌드·운영 시작: `npm run build`, `npm start`.
- 검증: `npm test -- --runInBand`, `npm run test:coverage`. E2E는 테스트 DB를 준비하고 `npm run test:e2e`.
- `src/contexts/`의 domain/application/ports/infrastructure/interface 경계를 유지하고 `src/app/`에서 조립한다.
- API 계약은 `docs/00-overview.md`, 기능별 `docs/01-*`~`09-*`, `API_DOCS.md`를 확인한다. 인증은 역할별 HttpOnly 쿠키다.
- 현재 DB와 배포 경로는 소스·`.github/workflows/`·`deploy/`로 확인한다. README의 과거 Supabase/RDS·EC2/ECS 설명과 현재 구현을 구분한다.
- 세션 기록: `docs/12-작업-기록.md`. 추적 데이터: `docs/13-tracking.md`. 마케팅: `docs/10-marketing-automation.md`. 회고: `docs/11-core-issues-retrospective.md`.
- 2026-08-05의 Supabase 402 장애는 과거 기록이다. 현재 장애 상태로 단정하지 않는다.
- 운영 환경변수·내부 API 키를 공용 설정과 로그에 복사하지 않는다.

세부 규칙은 `.claude/rules/api-database.md`. 공통 MCP·훅·명령은 상위 `syak/`에서 Claude Code를 실행해 사용한다.
