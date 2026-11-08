---
paths:
  - "src/**/*.ts"
  - "backend/src/**/*.ts"
  - "db/**/*"
  - "backend/db/**/*"
  - "e2e/**/*"
  - "backend/e2e/**/*"
---
# API와 데이터베이스

- 소비자·사장님·관리자 권한과 쿠키를 분리한다. HttpOnly/Secure/SameSite 설정은 실제 배포 환경과 계약에 맞춰 유지한다.
- 입력 검증과 에러 형식 `{ code, message, details }`를 기존 미들웨어·AppError 체계에 맞춘다.
- domain/application이 구체 DB·HTTP 구현을 직접 알지 않도록 기존 ports를 사용한다.
- SQL은 파라미터 바인딩하고 사용자·샵 소유권을 서버에서 검사한다. 내부 API 키를 응답과 로그에 노출하지 않는다.
- DB 스키마 변경은 기존 마이그레이션 방식과 롤백·호환성을 확인한다. 테스트 연결 대상과 운영 연결 대상을 혼동하지 않는다.
- 계약을 바꾸면 backend/docs와 해당 클라이언트 영향을 함께 검토한다.
