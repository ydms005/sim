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
