# 3단계 설정 안내 — 로그인 · 찜 · 커뮤니티 (Supabase)

3단계 기능(구글 로그인, 계정에 저장되는 찜, 대학별 질문 게시판)은 **Supabase**(무료 데이터베이스·로그인 서비스)를 씁니다.
사이트 코드는 이미 준비되어 있고, 선생님이 대시보드에서 **아래 순서대로 한 번만** 설정하면 기능이 열립니다.
설정 전에는 커뮤니티 탭에 '커뮤니티 준비 중' 안내가 보이고, 나머지 화면은 그대로 동작합니다.

- Supabase 프로젝트 주소: `https://pjxvsloaujvqmbccwtjf.supabase.co`
- 사이트 주소: `https://ydms005.github.io/sim/`
- 사이트에 들어 있는 값은 프로젝트 주소와 **공개(anon) 키**뿐입니다(`src/config.ts`). 공개해도 되는 값입니다.
  **service_role 키와 데이터베이스 비밀번호는 절대 저장소·채팅·메일에 붙여 넣지 마세요.**

> 메뉴 이름은 2026년 기준입니다. Supabase·Google 화면은 자주 바뀌니, 이름이 조금 달라도 비슷한 메뉴를 찾으면 됩니다.

---

## 순서 한눈에 보기

| 단계 | 어디서 | 할 일 | 걸리는 시간 |
|---|---|---|---|
| A | Supabase → SQL Editor | SQL 파일 한 개 붙여 넣고 실행 | 2분 |
| B | Google Cloud Console | 로그인 동의 화면 + OAuth 클라이언트 만들기 | 10분 |
| C | Supabase → Authentication → Sign In / Providers | Google 켜고 ID·비밀번호 붙여 넣기 | 2분 |
| D | Supabase → Authentication → URL Configuration | 사이트 주소 등록 | 1분 |
| E | 사이트 + SQL Editor | 내 계정으로 로그인 → 관리자로 지정 | 2분 |
| F | `src/config.ts` | 개인정보 책임자 이름·연락처 적기 | 2분 |

---

## A. 데이터베이스 만들기 (SQL 실행)

1. <https://supabase.com/dashboard> 에 로그인하고 프로젝트(`pjxvsloaujvqmbccwtjf`)를 엽니다.
2. 왼쪽 메뉴 **SQL Editor** 를 누릅니다.
3. 위쪽 **+ (New query)** 또는 **New SQL snippet** 을 누릅니다.
4. 저장소의 [`supabase/migrations/0001_stage3.sql`](migrations/0001_stage3.sql) 파일을 열어 **전체 내용**을 복사해 붙여 넣습니다.
   (GitHub 에서 파일을 열고 오른쪽 위 **Copy raw file** 아이콘을 누르면 한 번에 복사됩니다.)
5. 오른쪽 아래 초록색 **Run** 을 누릅니다. (단축키 `Ctrl + Enter`)
6. 아래에 **Success. No rows returned** 가 나오면 끝입니다.
   - "destructive operation" / "RLS" 같은 확인 창이 뜨면 내용을 확인하고 **Run this query** 를 누르세요. 이 SQL 은 기존 데이터를 지우지 않습니다.
   - 여러 번 실행해도 안전합니다. 나중에 SQL 이 바뀌면 같은 방법으로 다시 실행하면 됩니다.
7. 확인: 왼쪽 **Table Editor** 에 `profiles`, `favorites`, `questions`, `answers` 네 개 표가 보이면 성공입니다.

이 SQL 이 만드는 것:

| 표·함수 | 내용 |
|---|---|
| `profiles` | 닉네임(2~12자, 중복 불가), 역할(user/admin), 이용 동의 시각. 처음 로그인하면 '열정적인 수험생1234' 같은 임의 닉네임이 자동으로 만들어짐. 구글 이름·이메일은 복사하지 않음 |
| `favorites` | 찜한 대학 (본인만 보고 고칠 수 있음) |
| `questions`, `answers` | 대학별 질문·답변. 누구나 읽기, 로그인+이용 동의한 사람만 쓰기, 본인 글만 수정·삭제, 관리자는 숨기기·삭제 |
| `get_authors()` | 글쓴이의 닉네임과 '선생님(관리자)' 여부만 알려 주는 함수 (이메일은 절대 안 나감) |
| `delete_my_account()` | 회원 탈퇴 (계정·글·찜 모두 삭제) |
| 보안 규칙 | 모든 표에 RLS(행 수준 보안). 작성자·대학·숨김 여부는 글쓴이가 못 바꿈, 역할(관리자)은 SQL 로만 바꿀 수 있음. 질문은 10분에 5개, 답변은 10분에 20개까지 |

---

## B. Google Cloud Console — 구글 로그인 준비

### B-1. 프로젝트 만들기
1. <https://console.cloud.google.com> 에 학교(또는 본인) 구글 계정으로 로그인합니다.
2. 맨 위 프로젝트 선택 상자 → **새 프로젝트(New project)** → 이름 예: `daehak-gilljabi` → **만들기**.
3. 만든 프로젝트가 위쪽에 선택되어 있는지 확인합니다.

### B-2. OAuth 동의 화면 (Google Auth Platform)
1. 왼쪽 메뉴(☰) → **API 및 서비스(APIs & Services)** → **OAuth 동의 화면(OAuth consent screen)**.
   요즘 화면에서는 **Google 인증 플랫폼(Google Auth Platform)** 으로 이동하며 **시작하기(Get started)** 버튼이 보입니다.
2. **앱 정보(App Information)**
   - 앱 이름: `대학길잡이`
   - 사용자 지원 이메일: 선생님 이메일
3. **대상(Audience)**: **외부(External)** 선택 (학생들의 개인 구글 계정으로 로그인해야 하므로).
   - 학교 Google Workspace 계정만 쓰게 하려면 '내부(Internal)'도 가능하지만, 그러면 학교 도메인 계정만 로그인할 수 있습니다.
4. **연락처 정보**: 선생님 이메일 → 정책 동의 체크 → **만들기(Create)**.
5. **브랜딩(Branding)** 메뉴에서(선택) 앱 홈페이지 `https://ydms005.github.io/sim/`,
   개인정보처리방침 `https://ydms005.github.io/sim/privacy`, 서비스 약관 `https://ydms005.github.io/sim/terms` 를 적고,
   **승인된 도메인(Authorized domains)** 에 `ydms005.github.io` 와 `supabase.co` 를 추가합니다.
6. **데이터 액세스(Data Access)/범위(Scopes)**: 따로 추가하지 않아도 됩니다(기본 `email`, `profile`, `openid` 만 사용).
7. **게시 상태(Publishing status)** — **대상(Audience)** 메뉴:
   - 처음엔 **테스트(Testing)** 상태라 **테스트 사용자(Test users)** 에 추가한 계정만 로그인할 수 있습니다(최대 100명).
     먼저 선생님 계정을 테스트 사용자로 넣고 확인해 보세요.
   - 학생 누구나 로그인하게 하려면 **앱 게시(Publish app)** → **확인** 을 누릅니다. 기본 범위(email·profile)만 쓰므로 보통 구글 심사 없이 바로 게시됩니다.

### B-3. OAuth 클라이언트 ID 만들기
1. **클라이언트(Clients)** 메뉴(또는 API 및 서비스 → **사용자 인증 정보(Credentials)** → **+ 사용자 인증 정보 만들기** → **OAuth 클라이언트 ID**).
2. 애플리케이션 유형: **웹 애플리케이션(Web application)**, 이름: `대학길잡이 웹`.
3. **승인된 JavaScript 원본(Authorized JavaScript origins)**: `https://ydms005.github.io` (없어도 동작하지만 넣어 두면 좋습니다)
4. **승인된 리디렉션 URI(Authorized redirect URIs)** 에 **정확히** 아래를 넣습니다:
   ```
   https://pjxvsloaujvqmbccwtjf.supabase.co/auth/v1/callback
   ```
5. **만들기** → 나오는 **클라이언트 ID** 와 **클라이언트 보안 비밀번호(Client secret)** 를 복사해 둡니다.
   (보안 비밀번호는 다음 단계의 Supabase 화면에만 붙여 넣고 다른 곳에는 저장하지 마세요.)

---

## C. Supabase — Google 로그인 켜기

1. Supabase 대시보드 → 왼쪽 **Authentication** → **Sign In / Providers** (예전 이름: Providers).
2. **Auth Providers** 목록에서 **Google** 을 누릅니다.
3. **Enable Sign in with Google** 스위치를 켭니다.
4. **Client IDs** 에 B-3 의 클라이언트 ID, **Client Secret (for OAuth)** 에 보안 비밀번호를 붙여 넣습니다.
5. 화면에 보이는 **Callback URL (for OAuth)** 이 `https://pjxvsloaujvqmbccwtjf.supabase.co/auth/v1/callback` 과 같은지 확인합니다.
6. **Save**.

같은 **Sign In / Providers** 화면 위쪽의 **User Signups** 에서 **Allow new users to sign up** 이 켜져 있어야 학생이 가입할 수 있습니다(기본값 켜짐).
이메일·전화 로그인은 쓰지 않으므로 **Email** 제공자는 꺼 두어도 됩니다.

## D. Supabase — 사이트 주소 등록 (URL Configuration)

1. **Authentication** → **URL Configuration**.
2. **Site URL**: `https://ydms005.github.io/sim/` → **Save changes**.
3. **Redirect URLs** → **Add URL** 로 두 개를 추가합니다:
   ```
   https://ydms005.github.io/sim/**
   http://localhost:5173/sim/**
   ```
   (두 번째는 선생님 컴퓨터에서 `npm run dev` 로 시험할 때용입니다.)
   사이트는 로그인한 뒤 **보고 있던 화면으로 돌아오도록** 이 주소들을 씁니다. 여기에 없으면 로그인 뒤 홈으로만 돌아갑니다.

## E. 선생님 계정을 관리자로 지정

1. 사이트(<https://ydms005.github.io/sim/>)에서 오른쪽 위 **로그인** → **Google 계정으로 계속하기** 로 한 번 로그인하고,
   동의 창에서 **동의하고 시작하기** 를 누릅니다.
2. Supabase → **SQL Editor** → New query 에 아래를 붙여 넣고, 이메일을 선생님 구글 이메일로 바꾼 뒤 **Run**:
   ```sql
   update public.profiles
   set role = 'admin'
   where id = (select id from auth.users where email = 'teacher@example.com');
   ```
   `Success. 1 row affected`(또는 결과 1행)가 나오면 됩니다. 0행이면 이메일 오타이거나 아직 로그인하지 않은 것입니다.
3. 사이트를 새로고침하면 커뮤니티 글마다 **숨기기 / 다시 보이기 / 삭제** 버튼이 보이고, 선생님 글에는 **선생님** 배지가 붙습니다.
   원하면 **내 정보** 에서 닉네임을 '진학부 선생님' 처럼 바꾸세요(관리자만 '선생님'이 들어간 닉네임을 쓸 수 있습니다).

관리자 해제: 위 SQL 에서 `'admin'` 을 `'user'` 로 바꿔 실행합니다.
관리자 목록 보기: `select p.nickname, u.email from public.profiles p join auth.users u on u.id = p.id where p.role = 'admin';`

## F. 개인정보 처리방침의 책임자 적기

`src/config.ts` 의 `PRIVACY_OFFICER` 를 실제 담당 선생님 이름과 연락용 이메일로 바꿔 커밋하세요.
(GitHub 에서 파일 열기 → 연필 아이콘 → 수정 → **Commit changes**) 학생들에게 사이트를 알리기 **전에** 해 주세요.

---

## 운영하면서 알아 둘 것

### 무료 요금제는 1주일 동안 아무도 안 쓰면 일시 정지됩니다
- Supabase 무료 프로젝트는 약 **7일 동안 요청이 없으면 자동으로 일시 정지(Paused)** 됩니다. 정지되면 사이트의 커뮤니티·로그인이
  '연결하지 못했어요' 로 보입니다(대학 정보·경쟁률 등 나머지 화면은 정상).
- **되살리기**: Supabase 대시보드에서 프로젝트를 열고 **Restore project**(또는 Resume) 버튼 → 몇 분 기다리면 됩니다. 데이터는 그대로입니다.
- 방학처럼 오래 쉬는 기간 뒤에는 개학 전에 한 번 대시보드에 들어가 상태를 확인하세요.
  오랫동안(약 90일 이상) 정지된 채 두면 복구할 수 없게 될 수 있으니 주의하세요.

### 글 관리
- 사이트에서: 관리자 계정으로 로그인 → 대학 → 커뮤니티 → 글 열기 → **숨기기**(관리자와 글쓴이만 보임) 또는 **삭제**.
- 대시보드에서: **Table Editor** → `questions` / `answers` 에서 `is_hidden` 을 `true` 로 바꾸거나 행을 지울 수 있습니다.
- 특정 사용자를 막으려면: **Authentication** → **Users** → 해당 사용자 → **Ban user**(기간 선택) 또는 **Delete user**(글·찜 모두 삭제).
  사용자의 이메일은 여기(관리자 대시보드)에서만 보입니다.

### 탈퇴가 안 된다는 문의가 오면
사이트의 **내 정보 → 회원 탈퇴** 는 `delete_my_account()` 함수로 계정을 지웁니다. Supabase 정책 변경 등으로 실패하면
**Authentication → Users** 에서 해당 사용자를 찾아 **Delete user** 로 지워 주세요(글·찜도 함께 지워집니다).

### 보안 점검(Advisors)
대시보드 **Advisors → Security Advisor** 에 `security definer` 함수 관련 안내가 보일 수 있습니다. `is_admin`, `get_authors`, `delete_my_account` 등은
일부러 그렇게 만든 것(검색 경로 고정, 필요한 정보만 반환)이라 괜찮습니다. **RLS disabled** 경고가 보이면 SQL 이 제대로 실행되지 않은 것이니 A 단계를 다시 실행하세요.

### 다른 Supabase 프로젝트로 옮길 때
새 프로젝트에서 A~E 를 다시 하고, `src/config.ts` 의 `SUPABASE_URL`·`SUPABASE_ANON_KEY` 를 새 값(대시보드 **Project Settings → API Keys** 의 `anon`/publishable 키)으로 바꿉니다.
빌드할 때 환경 변수 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 로 넘겨도 됩니다.

### 문제 해결
| 증상 | 원인·해결 |
|---|---|
| 커뮤니티에 '커뮤니티 준비 중' | A 단계(SQL)를 아직 안 했거나 실패. SQL Editor 에서 다시 실행 |
| 로그인 버튼 → '구글 로그인을 시작하지 못했어요' | C 단계에서 Google 이 꺼져 있음 |
| 구글 화면에 `redirect_uri_mismatch` | B-3 의 리디렉션 URI 가 `https://pjxvsloaujvqmbccwtjf.supabase.co/auth/v1/callback` 과 정확히 같은지 확인 |
| 구글 화면에 '액세스 차단됨: 앱이 테스트 중' | B-2 의 7번: 테스트 사용자에 추가하거나 앱 게시 |
| 로그인 뒤 사이트 홈(또는 엉뚱한 주소)으로 돌아옴 | D 단계 Redirect URLs 확인 |
| '연결하지 못했어요'가 계속 | 프로젝트 일시 정지 → Restore project |
| '계정 정보(닉네임)를 찾지 못했어요' | A 단계 SQL 을 한 번 더 실행하면 빠진 프로필을 만들어 줍니다 |

## 대학알리미 중계 함수 (academyinfo-proxy)

공공데이터포털은 해외 서버(GitHub Actions)의 접속을 막습니다. 그래서 수파베이스 **서울 리전**에서 도는 작은 함수가
대신 요청하고, GitHub Actions 의 "대학알리미 지표 업데이트" 가 이 함수를 부릅니다.

1. 수파베이스 → **Edge Functions → Deploy a new function → Via Editor**
2. 함수 이름: `academyinfo-proxy`
3. 편집기 내용을 모두 지우고 `supabase/functions/academyinfo-proxy/index.ts` 내용을 붙여넣은 뒤 **Deploy function**
4. **Edge Functions → Secrets** 에 두 개 추가
   - `DATA_GO_KR_KEY` : 공공데이터포털 인증키
   - `PROXY_TOKEN` : 영문·숫자로 20자 이상 아무렇게나 만든 문자열
5. GitHub 저장소 **Settings → Secrets and variables → Actions** 에 `PROXY_TOKEN` 을 **같은 값**으로 추가
6. GitHub **Actions → 대학알리미 지표 업데이트 → Run workflow**

## AI 연동 MCP 서버 (mcp)

Claude(claude.ai 커스텀 커넥터, Claude Desktop, Claude Code)와 ChatGPT(개발자 모드) 같은 AI 채팅이 이 사이트의 공개 데이터(대학 목록·경쟁률·모집요강 등)를
읽기 전용으로 조회할 수 있게 하는 함수입니다. 로그인·인증이 필요 없습니다.

1. 수파베이스 → **Edge Functions → Deploy a new function → Via Editor**
2. 함수 이름: `mcp`
3. 편집기 내용을 모두 지우고 `supabase/functions/mcp/index.ts` 내용을 통째로 붙여넣은 뒤 **Deploy function**
4. 배포된 함수 → **Details(설정)** 에서 **Verify JWT(JWT 검증)** 을 **끄고** 저장
   (누구나 인증 없이 바로 부르기 때문입니다. 이 함수는 공개 데이터만 읽으므로 안전합니다.)
5. 별도 Secret 설정은 필요 없습니다. (데이터는 사이트가 GitHub Pages 로 배포한 정적 JSON(`https://ydms005.github.io/sim/data/`)에서 그대로 가져옵니다.
   다른 주소를 쓰려면 Edge Functions → Secrets 에 `MCP_DATA_BASE` 를 추가하세요.)

**주소**: `https://pjxvsloaujvqmbccwtjf.supabase.co/functions/v1/mcp`

**확인해 보기(claude.ai)**:
1. claude.ai 오른쪽 위 프로필 → **설정** → **커넥터**(Connectors) → **커스텀 커넥터 추가**(Add custom connector)
2. 이름은 자유롭게, 주소 칸에 위 URL을 붙여 넣고 저장
3. 새 대화에서 커넥터를 켜고 "건국대학교 서울캠퍼스 정보 알려줘" 처럼 물어보면 대학 정보를 찾아 답합니다.

사이트의 **AI 연동**(`/ai`) 화면에도 학생·선생님이 볼 수 있게 같은 안내(claude.ai·Claude Desktop·Claude Code·ChatGPT 등록 방법, 예시 질문)가 있습니다.

## 모집요강 PDF 중계 함수 (adiga-pdf)

어디가 모집요강 PDF 를 사이트 안 뷰어로 바로 보여 주기 위한 함수입니다.

1. 수파베이스 → **Edge Functions → Deploy a new function → Via Editor**
2. 함수 이름: `adiga-pdf`
3. `supabase/functions/adiga-pdf/index.ts` 내용을 붙여넣고 **Deploy function**
4. 배포된 함수 → **Details(설정)** 에서 **Verify JWT(JWT 검증)** 을 **끄고** 저장
   (브라우저가 인증 없이 바로 부르기 때문. 어디가 파일 주소만 중계하도록 막혀 있습니다.)

무료 요금제의 Edge Function 호출·전송량 한도 안에서 동작합니다. 사용량은 수파베이스 **Usage** 에서 확인하세요.

## 활동정리 AI 요약·상담 함수 (activity-ai)

**활동정리**(`/activities`) 화면에서 학생이 활동 카드를 AI 로 요약하거나 AI 와 채팅으로 상담할 때 쓰는 함수입니다.
학생의 생기부 등 PDF 원본은 **학생 브라우저 안에만** 저장되고 이 서버·함수에는 전혀 올라오지 않습니다.
함수로 전달되는 것은 학생이 미리 이름·학번·생년월일·전화번호 등을 가려 낸("마스킹 처리한") 텍스트와,
학생이 직접 쓴 활동 카드(수파베이스에 저장됨)뿐입니다. AI 응답은 [Anthropic](https://www.anthropic.com)(Claude) API 를 씁니다.

### A. SQL 실행

1. Supabase **SQL Editor** 에 [`supabase/migrations/0002_activities.sql`](migrations/0002_activities.sql) 전체를 붙여 넣고 **Run**
   (`0001_stage3.sql` 을 먼저 실행해 두어야 합니다). 여러 번 실행해도 안전합니다.
2. 확인: **Table Editor** 에 `activities`, `ai_usage` 두 표가 보이고, `profiles` 표에 `ai_consent_at` 열이 추가되어 있으면 성공입니다.

이 SQL 이 만드는 것:

| 표·함수 | 내용 |
|---|---|
| `activities` | 학생이 쓰는 활동 카드(동아리·봉사·진로·교과세특·독서·수상·자율·기타). **본인만** 읽고 쓸 수 있고, **관리자(선생님)도 볼 수 없습니다** — 학생 개인 기록이라 일부러 예외를 두지 않았습니다 |
| `profiles.ai_consent_at` | '개인정보 국외 이전(미국 Anthropic 서버로 전송)' 에 학생이 동의한 시각. `give_ai_consent()`/`revoke_ai_consent()` 함수로만 바뀌고, 학생이 표를 직접 고쳐서 만들 수 없습니다 |
| `ai_usage` | 학생별 하루 AI 요청 수·글자 수 기록(도배·비용 폭주 방지용). 읽기는 본인 것만, 쓰기는 `activity-ai` 함수만(service_role) 합니다 |

### B. Anthropic API 키 만들기

1. <https://console.anthropic.com> 에 가입/로그인하고 결제 수단을 등록합니다(사용한 만큼만 청구되는 종량제입니다).
2. 왼쪽 메뉴 **API Keys** → **Create Key** 로 키를 만들고 복사해 둡니다(다시 볼 수 없으니 안전한 곳에 잠깐 저장).
   **이 키는 GitHub·채팅 등 어디에도 붙여 넣지 말고, 아래 C 단계의 Supabase Secret 에만 넣으세요.**

### C. Edge Function Secrets 설정

Supabase 대시보드 → **Edge Functions → Secrets** 에서 추가합니다.

| Secret 이름 | 값 | 필수 |
|---|---|---|
| `ANTHROPIC_API_KEY` | B 단계에서 만든 키(`sk-ant-...`) | 예 |
| `ACTIVITY_AI_MODEL` | (선택) Claude 모델 이름. 비워 두면 `claude-opus-5` | 아니요 |

`SUPABASE_URL`·`SUPABASE_ANON_KEY`·`SUPABASE_SERVICE_ROLE_KEY` 는 모든 Edge Function 에 수파베이스가 자동으로 넣어 주므로 따로 설정하지 않아도 됩니다.

### D. 함수 배포

1. 수파베이스 → **Edge Functions → Deploy a new function → Via Editor**
2. 함수 이름: `activity-ai`
3. 편집기 내용을 모두 지우고 `supabase/functions/activity-ai/index.ts` 내용을 통째로 붙여넣은 뒤 **Deploy function**
4. 배포된 함수 → **Details(설정)** 에서 **Verify JWT(JWT 검증)** 이 **켜져** 있는지 확인합니다(기본값이 켜짐입니다. adiga-pdf·mcp 와 반대로 **꺼면 안 됩니다** —
   로그인한 학생만 써야 하는 개인 기능이기 때문입니다).

### 비용 안내

- Anthropic API 는 **쓴 만큼만** 청구되는 종량제입니다(월 구독료 없음). 기본 모델(`claude-opus-5`) 기준 100만 토큰(대략 원고지 수백 장 분량)당
  입력 5달러·출력 25달러 수준입니다. 활동 카드 요약 한 번은 보통 수백~수천 토큰이라 실제 비용은 요청당 몇 원~수십 원 수준입니다.
- 비용을 더 낮추고 싶으면 `ACTIVITY_AI_MODEL` Secret 을 `claude-sonnet-5`(균형) 또는 `claude-haiku-4-5`(가장 저렴·빠름)로 바꾸세요.
  값을 바꾼 뒤 함수를 다시 배포할 필요는 없고, 다음 요청부터 바로 적용됩니다.
- 남용·요금 폭주를 막기 위해 학생 1명당 **하루 최대 30회 요청, 최대 40만 자**로 제한되어 있습니다(함수 코드 위쪽 상수로 조절 가능).
  학생 약 30명이 한꺼번에 써도 감당할 수 있는 수준입니다. 실제 사용량은 Anthropic 콘솔의 **Usage** 와 수파베이스 **Table Editor → ai_usage** 에서 확인할 수 있습니다.
- Anthropic 콘솔의 **Usage limits(사용 한도)** 에서 한 달 최대 사용 금액을 미리 정해 두면 예상치 못한 과금을 막을 수 있습니다.

### E. 관리자 페이지에 토큰(비용) 기록하기

관리자 페이지(`/admin` → 'AI 사용량' 탭)에서 요청 수·토큰 수·예상 비용을 보려면, 아래 '관리자 페이지' 항목의 **0003_admin.sql** 을 먼저
실행하고 이 함수(`activity-ai`)를 **다시 배포**해야 합니다(토큰을 기록하는 코드가 이 SQL 이 만드는 `record_ai_tokens()` 함수를 부르기
때문입니다). 순서: 0003_admin.sql 실행 → `activity-ai` 함수 다시 배포(같은 이름으로 Deploy function). 기록은 다시 배포한 뒤 요청부터
쌓이고, 그전 사용량은 소급되지 않습니다.

### 개인정보(국외 이전) 동의

AI 기능은 학생 텍스트(마스킹 처리됨)를 미국의 Anthropic 서버로 보내므로, 이용 규칙과는 별도로 **AI 기능을 처음 쓸 때 한 번 더 동의**를 받습니다
(사이트 화면에서 이전 항목·국가·수령자·목적·보유 기간·거부 방법을 안내하고 체크박스로 동의를 받은 뒤 `give_ai_consent()` 를 호출합니다).
동의하지 않아도 활동 카드 작성·PDF 보기 등 AI 가 아닌 기능은 그대로 쓸 수 있고, AI 요약·채팅만 막힙니다.
Anthropic 은 API 로 받은 내용을 모델 학습에 쓰지 않으며, 기본적으로 30일 이내(남용 감지 목적)에 삭제합니다(Anthropic 정책은 바뀔 수 있으니
최신 내용은 <https://www.anthropic.com/legal/commercial-terms> 에서 확인하세요).

## 관리자 페이지 (/admin) — 회원 · 저장 공간 · AI 사용량

로그인 메뉴에 '관리자' 항목이 보이고 `/admin` 화면에 '회원 · 저장 공간 · AI 사용량 · 데이터 관리' 탭이 생깁니다(관리자 계정으로 로그인해야
보입니다. 관리자 지정 방법은 맨 위 "E. 선생님 계정을 관리자로 지정" 항목 참고). '데이터 관리' 탭은 기존 엑셀 업로드 화면과 같습니다.

### A. SQL 실행

1. Supabase **SQL Editor** 에 [`supabase/migrations/0003_admin.sql`](migrations/0003_admin.sql) 전체를 붙여 넣고 **Run**
   (`0001_stage3.sql`, `0002_activities.sql` 을 먼저 실행해 두어야 합니다). 여러 번 실행해도 안전합니다.
2. 확인: **Table Editor** 의 `profiles` 표에 `user_type` 열이, `ai_usage` 표에 `input_tokens`·`output_tokens`·`cache_read_tokens`
   열이 추가되어 있고, `ai_usage_model` 표가 새로 보이면 성공입니다.

이 SQL 이 만드는 것:

| 표·함수 | 내용 |
|---|---|
| `profiles.user_type` | 학생/교사 구분. 이용 동의할 때 고르고, 내 정보 화면에서 바꿀 수 있음 |
| `admin_list_users()` | 회원 목록(이메일·닉네임·역할·구분·가입일·최근 로그인·글/활동 수)을 돌려줌. **관리자만** 실행 가능 |
| `admin_set_user_type()` | 관리자가 대신 학생/교사 구분을 바꿈 |
| `admin_storage_stats()` | 데이터베이스·표별 크기, 파일 저장소(Storage) 사용량을 돌려줌. **관리자만** |
| `ai_usage_model`, `record_ai_tokens()` | 모델별 하루 토큰 사용량 기록(activity-ai 함수가 service_role 로만 기록) |
| `admin_ai_usage()` | 최근 며칠간 모델별 사용량과 사용량 상위 회원을 돌려줌. **관리자만** |

토큰 기록을 실제로 쌓으려면 위 '활동정리 AI 요약·상담 함수' 항목의 **E. 관리자 페이지에 토큰(비용) 기록하기**대로 `activity-ai` 함수를
**다시 배포**해야 합니다.

### B. 회원 탈퇴(계정 삭제) 함수 배포 — admin-users

관리자 페이지에서 다른 사람의 계정을 탈퇴시키려면(글·활동 카드까지 완전히 삭제) Supabase Auth 관리자 API 가 필요해, 별도의 Edge
Function 을 하나 더 배포해야 합니다.

1. 수파베이스 → **Edge Functions → Deploy a new function → Via Editor**
2. 함수 이름: `admin-users`
3. 편집기 내용을 모두 지우고 `supabase/functions/admin-users/index.ts` 내용을 통째로 붙여넣은 뒤 **Deploy function**
4. 배포된 함수 → **Details(설정)** 에서 **Verify JWT(JWT 검증)** 이 **켜져** 있는지 확인합니다(기본값 켜짐 — 로그인한 사람만 호출해야
   하고, 함수 안에서 다시 한번 그 사람이 관리자인지 확인합니다).
5. 별도 Secret 설정은 필요 없습니다. `SUPABASE_URL`·`SUPABASE_ANON_KEY`·`SUPABASE_SERVICE_ROLE_KEY` 는 모든 Edge Function 에
   Supabase 가 자동으로 넣어 줍니다(Edge Functions → Secrets 목록에서 이 셋이 이미 있는지 확인만 하면 됩니다. 안 보이면 Supabase
   버전에 따라 이름이 다를 수 있으니 공식 문서의 "Default Secrets"를 확인하세요).

### C. 회원 정보 확장 — 학생 · 학부모 · 교사, 교사 승인

1. Supabase **SQL Editor** 에 [`supabase/migrations/0005_member_profile.sql`](migrations/0005_member_profile.sql) 전체를 붙여 넣고 **Run**
   (`0001_stage3.sql`, `0003_admin.sql`, `0004_role_badges.sql` 을 먼저 실행해 두어야 합니다). 여러 번 실행해도 안전합니다.
2. 확인: **Table Editor** 의 `profiles` 표에 `real_name`·`school`·`grade`·`class_no`·`student_no`·`teacher_role`·`teacher_grade`·
   `teacher_class`·`teacher_status` 열이 추가되어 있으면 성공입니다.

이 SQL 이 만드는 것:

| 표·함수 | 내용 |
|---|---|
| `profiles.user_type` | '학부모(parent)'가 추가되어 학생/학부모/교사 세 가지가 됨 |
| `profiles.real_name`·`school`·`grade`·`class_no`·`student_no` | 이름·학교·학년·반·번호(학생 필수, 학부모는 자녀 학교만 선택 입력). **본인과 관리자만** 볼 수 있음 |
| `profiles.teacher_role`·`teacher_grade`·`teacher_class` | 교사의 담당(담임/교과/담임·교과)과 담임 학년·반(담임을 맡았으면 필수) |
| `profiles.teacher_status` | 교사 승인 상태(승인 대기/승인됨/반려됨). 비회원가입 시 교사를 고르면 자동으로 '승인 대기'가 되고, **관리자가 확인해야** '선생님' 배지가 보임(관리자 계정 본인이 교사를 고르면 바로 승인됨). 사용자가 직접 바꿀 수 없음 |
| `admin_set_teacher_status()` | 관리자가 교사 승인/반려/대기로 되돌리는 함수 |
| `admin_set_user_type()` | '학부모' 선택을 지원하도록 확장 |
| `admin_list_users()` | 이름·학교·학년·반·번호·담당·승인 상태도 함께 돌려주도록 확장(관리자만) |
| `get_authors()` | 커뮤니티 글쓴이 배지 — 학생/학부모는 그대로, 교사는 **승인된 경우에만** '선생님' 배지가 보이도록 함(이름·학교 등은 여전히 절대 공개하지 않음) |

관리자 페이지 '회원' 탭에서 학부모 수, '승인 대기 교사' 알림 칩, 회원별 승인/반려 버튼을 볼 수 있습니다.
아직 '클래스'(담임·교과 교사가 학생 활동정리에 자료를 넣어 주는) 기능은 없습니다 — 계획은
[`docs/class-plan.md`](../docs/class-plan.md) 를 참고하세요.

### 주의할 점

- 관리자 페이지의 '탈퇴' 버튼은 되돌릴 수 없습니다. 계정과 그 사람이 쓴 질문·답변·활동 카드·찜 목록이 모두 함께 지워집니다.
- 관리자 계정끼리는 이 화면에서 서로 탈퇴시킬 수 없습니다(실수 방지). 관리자 권한을 먼저 `update public.profiles set role = 'user' ...`
  로 내린 뒤 탈퇴시키세요.
- '저장 공간' 탭의 트래픽(월 5GB 무료)·함수 호출 수는 Supabase 가 이 화면에 값을 내려주지 않아, 대시보드의 **Settings → Billing →
  Usage** 화면 링크로 안내합니다.
- 'AI 사용량' 탭의 비용은 요금표(코드 안 `src/pages/admin/pricing.ts`)를 기준으로 한 **추정치**입니다. 정확한 청구 금액은 Anthropic
  콘솔에서 확인하세요. 모델을 추가하거나 요금이 바뀌면 그 파일의 `MODEL_PRICING` 을 고치면 됩니다.
