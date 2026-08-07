# CLAUDE.md

Claude(및 개발자)가 이 레포를 다룰 때 먼저 읽는 파일.

## 작업 기록 / 대화 참조

이 프로젝트에 대한 **Claude 세션의 요청·진행·결정 기록**이 아래에 정리돼 있다. 새 작업 전에 참고할 것.

- **[docs/12-작업-기록.md](docs/12-작업-기록.md)** — 사용자 요청과 진행 내역(시간 순), 남은 조치.

관련 상세 문서:
- [docs/00-overview.md](docs/00-overview.md) — 전체 구조·환경
- [docs/08-admin.md](docs/08-admin.md) — 관리자 API
- [docs/09-frontend-integration.md](docs/09-frontend-integration.md) — 앱 연동(인증=쿠키, 예약수단, 알림)
- [docs/10-marketing-automation.md](docs/10-marketing-automation.md) — 마케팅 자동 수집·이미지·쓰레드
- [docs/11-core-issues-retrospective.md](docs/11-core-issues-retrospective.md) — 핵심 문제 점검·해결 기록
- [API_DOCS.md](API_DOCS.md) — 전체 API 요약
- [README.md](README.md) — 셋업·실행·배포

## 관련 레포

- `themuselab/syak_BE` — 이 레포(백엔드, Express+TS, EC2)
- `themuselab/syak_admin` — 관리자 SPA(React, nginx `/var/www/admin`)
- `themuselab/syak` — 스크래퍼(Python, GitHub Actions)

## 현재 주의사항 (2026-08-05)

- 🔴 **Supabase 프로젝트가 egress 초과로 정지(402)** 됐다. 복구하려면 소유자가 Pro 업그레이드 또는 spend cap 해제 필요. 데이터 삭제로는 해결 안 됨(egress ≠ 저장용량). 자세히는 docs/12 §8.
- 인증은 전부 **HttpOnly 쿠키**(Bearer 아님). 운영 쿠키는 `Secure`.
- 운영 `.env`는 레포가 아니라 **EC2 `/home/ec2-user/syak.env`**.
</content>
