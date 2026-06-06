# Supabase 연동 설정 가이드

로그인 / 랭킹보드 / 코인 / 코스튬을 쓰려면 Supabase 백엔드 한 번만 설정하면 됩니다.
순서대로 따라 하세요. (10~15분)

---

## 1. Supabase 프로젝트 만들기

1. https://supabase.com → 로그인 → **New project**
2. 프로젝트 이름(예: `battleroyale`), DB 비밀번호 설정, 리전은 `Northeast Asia (Seoul)` 권장 → **Create**.
3. 생성되면 좌측 **Settings ▸ API** 로 이동해서 두 값을 복사해 둡니다.
   - **Project URL** (예: `https://abcdxyz.supabase.co`)
   - **Project API keys ▸ anon public** (긴 토큰)

> anon key는 공개되어도 안전합니다(브라우저에 노출됨). 데이터는 RLS 정책이 보호합니다.
> ⚠️ **service_role** 키는 절대 프론트엔드/깃에 넣지 마세요.

---

## 2. DB 스키마 생성

1. 좌측 **SQL Editor ▸ New query**
2. 이 레포의 [`supabase/schema.sql`](supabase/schema.sql) 내용을 **전부 복사**해서 붙여넣기
3. **RUN** 클릭 → 테이블(`profiles`, `costumes`, `user_costumes`), RLS, 트리거, RPC, 코스튬 6종이 생성됩니다.

확인: 좌측 **Table Editor** 에 `costumes` 테이블에 6개 행이 보이면 성공.

---

## 3. Google 로그인(OAuth) 설정

### 3-1. Supabase 콜백 URL 확인
- Supabase ▸ **Authentication ▸ Providers ▸ Google** 를 열면 상단에 표시되는
  **Callback URL (for OAuth)** 를 복사합니다.
  형식: `https://<프로젝트ref>.supabase.co/auth/v1/callback`

### 3-2. Google Cloud 에서 OAuth 클라이언트 만들기
1. https://console.cloud.google.com → 프로젝트 생성(또는 선택)
2. **APIs & Services ▸ OAuth consent screen**
   - User Type: **External** → 앱 이름/이메일 입력 → 저장
   - (테스트 단계면 **Test users** 에 본인 구글 계정 추가)
3. **APIs & Services ▸ Credentials ▸ Create Credentials ▸ OAuth client ID**
   - Application type: **Web application**
   - **Authorized redirect URIs** 에 3-1 에서 복사한 Supabase Callback URL 붙여넣기
   - 만들면 **Client ID** 와 **Client Secret** 이 나옵니다 → 복사

### 3-3. Supabase 에 입력
- Supabase ▸ **Authentication ▸ Providers ▸ Google** →
  Client ID / Client Secret 붙여넣고 **Enable** 토글 ON → Save.

### 3-4. 리디렉션 URL 등록 (중요)
- Supabase ▸ **Authentication ▸ URL Configuration**
  - **Site URL**: 배포 주소 (예: `https://battleroyal.vercel.app`)
  - **Redirect URLs** 에 아래 둘 다 추가:
    - `http://localhost:3000`  (로컬 개발)
    - `https://<당신의-vercel-도메인>`  (배포)

> 이 URL이 누락되면 로그인 후 "redirect 차단" 에러가 납니다.

---

## 4. 키를 앱에 넣기

### 로컬 개발용 — `.env.local`
레포 루트에 `.env.local` 파일을 만들고(`.gitignore`에 의해 커밋 안 됨):

```
VITE_SUPABASE_URL=https://<프로젝트ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public 키>
```

### 배포용 — Vercel 환경변수
Vercel ▸ 프로젝트 ▸ **Settings ▸ Environment Variables** 에 동일하게 추가:

| Name | Value |
|------|-------|
| `VITE_SUPABASE_URL` | `https://<프로젝트ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `<anon public 키>` |

추가 후 **재배포(Redeploy)** 해야 반영됩니다.

---

## 5. 실행 & 확인

```bash
npm install
npm run dev      # http://localhost:3000
```

- "Google로 로그인" → 로그인되면 로비 상단에 닉네임·코인(기본 100)이 보입니다.
- 한 판 플레이 후 로비로 나오면 킬 × 10 만큼 코인이 늘어납니다.
- **랭킹** 버튼: 누적 킬 순위, **상점** 버튼: 코스튬 구매/착용.

문제가 생기면 브라우저 콘솔(F12)과 Supabase ▸ **Logs** 를 확인하세요.
