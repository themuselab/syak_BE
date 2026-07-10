# 마케팅 성과 자동 수집 (GitHub Actions)

인스타그램 · 쓰레드 · 메타광고 성과를 **매일 자동으로** 수집해 Gemini 조언을 붙이고 Supabase에 날짜별로 저장한다.
저장된 데이터는 **관리자 페이지 → 마케팅 탭**에 바로 표시된다.

> Claude/MCP 없이 도는 **순수 Node 스크립트**다. 수동 호출 불필요.

---

## 1. 구조

```
GitHub Actions (매일 08:20 KST)
   └─ node scripts/marketing/daily-snapshot.mjs
        ├─ 인스타 인사이트   (graph.instagram.com)
        ├─ 쓰레드 인사이트   (graph.threads.net)
        ├─ 메타 광고 인사이트 (graph.facebook.com)
        ├─ Gemini 조언 (근거 제시 + 후속작 추천)
        └─ Supabase upsert → marketing_snapshots (snapshot_date 기준 하루 1건)
```

| 파일 | 역할 |
|---|---|
| `scripts/marketing/daily-snapshot.mjs` | 수집 → 조언 → 저장 (**단일 소스**) |
| `.github/workflows/marketing-snapshot.yml` | 매일 cron + 수동 실행 |
| `db/migration_marketing.sql` | `marketing_snapshots`, `marketing_tokens` 테이블 |
| `scripts/marketing/image-recipes.json` | 시안 이미지 프롬프트 (**단일 소스**) |
| `src/contexts/admin/infrastructure/MarketingImageService.ts` | 관리자 "이미지 생성" 버튼의 실제 생성 로직 |
| `scripts/marketing/generate-images.mjs` | 위와 같은 일을 하는 CLI 대안 |

> ⚠️ `data` JSONB는 upsert 시 **통째로 치환**된다. `daily-snapshot.mjs`는 기존 행의 `images`를
> 읽어와 보존한 뒤 저장한다. 이 처리를 빼면 **매일 아침 시안 갤러리가 지워진다.**

### ⚠️ 지표 스코프 (중요)
Meta API는 **`since`/`until` 없이 부르면 "하루치"만 반환**한다. 총합처럼 보여 오해를 부른다.
스크립트는 **최근 30일 윈도우**로 조회한다:

| 플랫폼 | 조회 방식 |
|---|---|
| 인스타 `도달`/`조회` | `period=day` + `metric_type=total_value` + `since/until` (중복제거 30일 합) |
| 쓰레드 `조회` | 일별 `values[]` 합산 |
| 쓰레드 `좋아요`/`댓글`/`리포스트` | `total_value` |
| `팔로워`/`게시물` | 누적값 (기간 무관) |

- 쓰레드 상위 게시물은 **리포스트가 대부분 0**이라 **조회수 기준**으로 정렬한다.
- 상위 게시물에는 `permalink`(`url`)가 포함되어 관리자에서 클릭 시 원본 글로 이동한다.

### 토큰 자가치유 (중요)
인스타/쓰레드 토큰은 **60일 만료**다. 스크립트가 매 실행마다
**만료 10일 이내면 자동 갱신 → `marketing_tokens` 테이블에 다시 저장**한다.
→ 워크플로가 60일 안에 한 번이라도 돌면 **토큰이 영구히 유지**된다. (GitHub Secret 재입력 불필요)

| 토큰 | 자가갱신 | 방식 |
|---|---|---|
| 인스타 | ✅ | `ig_refresh_token` (시크릿 불필요) |
| 쓰레드 | ✅ | `th_refresh_token` (시크릿 불필요) |
| **메타 광고** | ❌ | 갱신에 앱 시크릿 필요 → **만료되면 광고 지표만 끊긴다** |

> 🔴 **광고 토큰은 반드시 시스템 사용자 토큰(만료 없음)으로 교체할 것.**
> 아니면 60일 뒤 광고 섹션이 조용히 사라진다. (다른 섹션은 정상 동작하므로 눈치채기 어렵다)

---

## 2. 토큰 발급

### 2-1. 인스타그램 (`IG_ACCESS_TOKEN`)
- 형식: **`IGAA...`** · 호스트: `graph.instagram.com`
- 조건: 인스타 계정이 **비즈니스/크리에이터**

developers.facebook.com → 앱 → **제품 → Instagram → API 설정**에서 토큰 생성.
(여기서 발급되는 토큰은 대개 **이미 60일 장기 토큰**이라 별도 교환 불필요)

계정 ID 확인:
```
https://graph.instagram.com/v21.0/me?fields=id,username&access_token={토큰}
```

갱신(시크릿 불필요):
```
https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token={토큰}
```

### 2-2. 메타 광고 (`META_ADS_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`)
- 형식: **`EAA...` / `EAF...`** · 호스트: `graph.facebook.com`
- ⚠️ **인스타 토큰(IGAA)으로는 광고 API가 거부(code 190)** 된다. 반드시 별도 발급.

**대시보드에서 발급하는 경로 (권장):**
1. developers.facebook.com → 내 앱 선택
2. **마케팅 API** → 이용 사례 **"광고 만들기 및 관리"** → **맞춤 설정**
3. 우측 탭의 **도구(Tools)** 로 이동
4. 원하는 권한 선택: **`ads_read`**, **`business_management`**
5. **토큰 받기(Get Token)** → 발급된 토큰 복사

광고 계정 ID 확인:
```
https://graph.facebook.com/v21.0/me/adaccounts?fields=account_id,name,currency&access_token={토큰}
```
→ `account_id` 값(숫자, `act_` 제외)이 `META_AD_ACCOUNT_ID`.

토큰 수명 확인:
```
https://graph.facebook.com/debug_token?input_token={토큰}&access_token={토큰}
```

> **운영 팁:** 60일 갱신이 번거로우면 **비즈니스 설정 → 사용자 → 시스템 사용자** 에서
> `ads_read` 권한 토큰을 만들면 **만료가 없다.** 광고 쪽은 이걸 권장.

### 2-3. 쓰레드 (`THREADS_ACCESS_TOKEN`, `THREADS_USER_ID`)
- 호스트: `graph.threads.net` · 인스타/페북과 **또 다른 별도 토큰**

1. developers.facebook.com → 앱 → **제품 추가 → Threads API** (이용 사례: Threads API 액세스)
2. 권한: **`threads_basic`**, **`threads_manage_insights`**
3. Threads 설정에서 **토큰 생성**

계정 ID 확인:
```
https://graph.threads.net/v1.0/me?fields=id,username&access_token={토큰}
```
→ `id` 가 `THREADS_USER_ID`.

장기 토큰 교환 / 갱신:
```
# 단기 → 60일
https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret={쓰레드앱시크릿}&access_token={단기토큰}
# 갱신 (시크릿 불필요)
https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token={장기토큰}
```
스크립트가 만료 임박 시 **자동 갱신**하므로, 최초 1회만 넣으면 된다.

> 💡 Meta 대시보드에서 발급되는 인스타/쓰레드 토큰은 **대개 이미 60일 장기 토큰**이다.
> 이 경우 `*_exchange_token`은 `Session key invalid` 로 거부된다 → 교환 말고 **갱신(`*_refresh_token`)** 을 쓰면 된다.

---

## 3. GitHub Secrets

레포 → Settings → Secrets and variables → Actions → **New repository secret**

| Secret | 필수 | 설명 |
|---|---|---|
| `SUPABASE_URL` | ✅ | Supabase 프로젝트 URL |
| `SUPABASE_SECRET_KEY` | ✅ | service_role 키 (RLS 우회) |
| `IG_ACCESS_TOKEN` | ✅ | 인스타 토큰 (최초 1회. 이후 DB에서 자동 관리) |
| `META_ADS_ACCESS_TOKEN` | 선택 | 광고 토큰 (없으면 광고 섹션 skip) |
| `META_AD_ACCOUNT_ID` | 선택 | 광고 계정 ID (숫자) |
| `THREADS_ACCESS_TOKEN` | 선택 | 쓰레드 토큰 |
| `THREADS_USER_ID` | 선택 | 쓰레드 계정 ID |
| `GEMINI_API_KEY` | 선택 | 없으면 AI 조언 생략 |

> 선택 항목이 비어 있으면 해당 섹션만 **경고 후 skip**하고 나머지는 정상 저장된다.

---

## 4. 실행

- **자동:** 매일 **08:20 KST** (`cron: "20 23 * * *"`)
- **수동:** Actions 탭 → `marketing-snapshot` → **Run workflow**

### 로컬에서 돌려보기
```bash
cd backend
set -a; source .env; set +a
node scripts/marketing/daily-snapshot.mjs
```
성공 시:
```
  [ig] 토큰 갱신됨 → 2026-09-07 까지
✅ 저장 완료 · snapshot_date=2026-07-10
   수집: metaAds, instagram
```

### 확인
```bash
curl -b <admin쿠키> https://api.themuselab.kr/api/v1/admin/marketing
```
또는 **관리자 → 마케팅 탭**에서 날짜 선택. (데이터가 있으면 초록 "라이브" 배너)

---

## 5. AI 조언 형식
Gemini에게 **정확히 2줄**만 받는다.
1. **근거**: 어떤 콘텐츠가 조회/반응이 좋았는지 **구체적 수치**로
2. **추천**: 그 근거를 바탕으로 어떤 방향의 후속 콘텐츠를 만들지

실제 출력 예시:
> **근거** — "서울에 2만원 대 네일을 찾았습니다!" 게시물은 61회 저장으로 압도적인 반응을, "여름 샌들 신기 전에 페디 해야지~!" 콘텐츠는 10.8K 도달로 가장 높은 조회수를 기록했습니다.
> **추천** — 가격 경쟁력과 시의성을 결합하여 '가성비' 테마의 네일/페디 콘텐츠를 지속적으로 제작하고, 사용자 저장 유도 요소를 강화해야 합니다.

관리자 화면에서 `aiAdvice`(섹션 상단 상시) / `aiFollowUp`(플랫폼 hover 팝오버)로 표시된다.

---

## 6. 트러블슈팅

| 증상 | 원인 / 조치 |
|---|---|
| `Invalid OAuth access token` (code 190) | 인스타 토큰(IGAA)을 광고 API에 사용. 페북 토큰(EAA) 필요 |
| `(#10) requires ads_read` | 권한 누락 → 토큰 재발급 |
| ads `데이터 없음` | 어제 광고 집행이 없었음 (정상) |
| `Session key invalid` (ig_exchange_token) | 이미 장기 토큰임. 교환 대신 `ig_refresh_token` 사용 |
| 토큰 갱신 실패 | 60일 초과 만료. 새 토큰 발급 후 Secret 갱신 |
| 관리자 탭이 "샘플" | 해당 날짜 스냅샷 없음. 워크플로 수동 실행해볼 것 |

---

## 7. 발행 시안 이미지

관리자 → 마케팅 → **발행 이미지 → "이미지 생성"** 버튼 (5장, 15초 내외).

- 모델: NVIDIA `flux.1-dev` (steps 45). 프롬프트는 `scripts/marketing/image-recipes.json`.
- 저장: Supabase Storage `marketing-images` 버킷(공개) → 스냅샷 `data.images`에 **누적**.
- 텍스트는 넣지 않는다. 다운로드 후 **수동으로 문구를 얹어 발행**한다.
- 필요 없는 시안은 휴지통 버튼 → 확인 모달 → **Storage에서도 영구 삭제**.
- 서버에 `NVIDIA_API_KEY`(또는 `NVIDIA_API_KEY_FLUX`)가 있어야 버튼이 동작한다.

> 손 디테일은 FLUX의 한계라 매번 완벽하지 않다. **여러 번 눌러 쌓고 좋은 것만 남기는** 방식이 전제다.
> 프롬프트 원칙(저채도·언더노출·손 포즈 문구)은 `.claude/skills/marketing-report/image_prompt_guide.md` 참고.

---

## 8. 참고: 수동 스킬
`.claude/skills/marketing-report/` 에 Claude용 스킬이 있으나, **일일 축적은 이 워크플로가 담당**한다.
스킬은 **임시 분석·정성 리포트가 필요할 때만** 쓰면 된다.
