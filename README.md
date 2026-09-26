# 대학길잡이

전국 4년제 대학의 **수시 모집요강 · 지난 경쟁률 · 입시 자료**를 한곳에서 찾아볼 수 있도록 만든 교육용 웹사이트입니다.
학생·교사가 진학 지도에 참고할 수 있게 하는 비상업적 프로젝트입니다.

- **사이트 주소**: <https://ydms005.github.io/sim/>
- **현재 단계**: 3단계 (구글 로그인 · 계정 찜 · 대학별 Q&A 커뮤니티) 코드 완료 — **Supabase 설정 필요**([`supabase/README.md`](supabase/README.md))
- **데이터 현황**: 대학 목록(201곳)·모집요강 링크(대입정보포털 어디가 제공)는 실제 자료입니다. 경쟁률·자료실·대학소식은 선생님이
  올리는 대로 채워지며, 아직 올라오지 않은 대학은 각 탭에 '아직 자료가 없습니다' 안내가 보입니다.

> **실제 입시 정보의 기준은 대학 입학처와 대입정보포털입니다**
>
> 이 사이트는 진학 지도를 돕기 위한 참고용 자료를 모아 두는 곳입니다. 최종적인 입시 정보는 반드시 **각 대학 입학처 홈페이지**와
> **대입정보포털 어디가(<https://www.adiga.kr>)** 에서 다시 확인하세요. 이 사이트의 내용만으로 학생 상담이나 지원 판단을 하면 안 됩니다.

---

## 목차

1. [사이트에서 할 수 있는 것](#1-사이트에서-할-수-있는-것)
2. [개발 단계(로드맵)](#2-개발-단계로드맵)
3. [인터넷에 올리기 — GitHub Pages 자동 배포](#3-인터넷에-올리기--github-pages-자동-배포)
4. [내 컴퓨터에서 실행해 보기](#4-내-컴퓨터에서-실행해-보기)
5. [사이트 이름·공지 문구 바꾸기](#5-사이트-이름공지-문구-바꾸기)
6. [데이터는 어디에 있나요](#6-데이터는-어디에-있나요)
7. [폴더 구조](#7-폴더-구조)
8. [자주 묻는 질문 · 문제 해결](#8-자주-묻는-질문--문제-해결)
9. [저작권 · 이용 안내](#9-저작권--이용-안내)

---

## 1. 사이트에서 할 수 있는 것

| 화면 | 주소 예시 | 내용 |
|---|---|---|
| 홈 | `/sim/` | 대학 이름 검색, 지역(서울~제주)·설립구분(국립·공립·사립)으로 전국 대학 찾기 |
| 통합 검색 | `/sim/search?q=경영` | 대학·학과 이름으로 검색 |
| 경쟁률 추세 | `/sim/trends` | 여러 대학의 연도별 수시 전체 경쟁률 비교 |
| 대학정보 | `/sim/univ/3` | 최근 학년도 수시 전형별 모집 현황(모집인원·지원자·경쟁률) |
| 모집요강 | `/sim/univ/3/guideline` | 학년도별 모집요강 PDF 보기. 대입정보포털 어디가의 공식 링크는 새 창 열기 카드로, 직접 올린 PDF는 뷰어(확대·축소·다운로드·인쇄)로 보여 줍니다 |
| 지난 경쟁률 | `/sim/univ/3/competition` | 학과·전형을 골라 연도별 지원자 수·모집 정원·경쟁률 그래프와 표 |
| 자료실 | `/sim/univ/3/content` | 대입자료·면접자료 PDF 목록과 뷰어 |
| 대학소식 | `/sim/univ/3/news` | 입시 일정·공지 소식(최신순, 월별 묶음) |
| 커뮤니티 | `/sim/univ/3/community` | 대학별 질문 게시판(Q&A). 누구나 읽기, 로그인하면 질문·답변 쓰기. 제목 검색·더보기 |
| 질문 상세 | `/sim/univ/3/community/12` | 질문 본문과 답변, 내 글 수정·삭제, 관리자 숨기기·삭제 |
| 내 정보 | `/sim/me` | 닉네임 변경, 찜한 대학, 내가 쓴 질문·답변, 회원 탈퇴 |
| 이용 규칙 · 개인정보 처리방침 | `/sim/terms` · `/sim/privacy` | 바닥글에 링크 |
| 데이터 관리 | `/sim/admin` | 선생님용. 엑셀 양식 내려받기 · 파일 검사 · 미리보기 · GitHub에 올리기 (바닥글의 '데이터 관리' 링크) |

- 대학 이름 옆 **하트(찜)** 는 로그인 전에는 지금 쓰는 브라우저에만 저장되고, 로그인(+이용 동의)하면 계정에 저장됩니다.
  이때 브라우저에 찜해 둔 대학은 계정으로 옮겨지고 브라우저 목록은 비워집니다(공용 컴퓨터 대비).
- 휴대폰(가로 390px 정도)부터 PC(1440px)까지 화면 크기에 맞춰 배치가 바뀝니다.
- 실제 대학 로고는 저작권 문제로 쓰지 않고, 대학 이름 첫 글자로 만든 아이콘을 보여 줍니다.
- 모집요강 PDF는 대입정보포털 어디가가 공개한 링크를 그대로 연결할 뿐, 파일을 이 저장소에 복사해 두지 않습니다.

## 2. 개발 단계(로드맵)

| 단계 | 내용 | 상태 |
|---|---|---|
| **1단계** | 화면 — 대학 검색, 대학별 탭(대학정보·모집요강·지난 경쟁률·자료실·대학소식), 경쟁률 추세 | 완료 |
| **2단계** | 엑셀 업로드로 데이터 입력 — `data/` 의 엑셀을 빌드에 합치기, 데이터 관리 화면(`/admin`)에서 양식 내려받기·검사·미리보기·GitHub에 올리기 | **완료** |
| **3단계** | 구글 로그인 · 찜(계정에 저장) · 대학별 커뮤니티(Q&A) · 내 정보 · 이용 규칙/개인정보 처리방침 | **코드 완료 — Supabase 설정 필요** |
| 이후 | AI 상담 (`/ai`) | 보류 (준비 중 화면) |

데이터는 `data/` 폴더의 CSV와 **엑셀(.xlsx)** 로 관리합니다. 엑셀의 시트·열 이름은 CSV와 같고 검사 규칙도 같습니다.

### 2단계: 엑셀로 자료 올리기 (요약)

```
엑셀 수정 ─▶ 검사 ─▶ 미리보기 ─▶ GitHub에 올리기 ─▶ 자동 배포(약 2분)
 (/admin 에서 양식·현재 데이터 내려받기)   (/admin, 내 브라우저 안에서만)   (토큰 또는 GitHub 웹 업로드)
```

1. 사이트 바닥글의 **데이터 관리**(<https://ydms005.github.io/sim/admin>)에서 빈 양식이나 현재 데이터를 엑셀로 내려받아 고칩니다.
2. 같은 화면에 엑셀(과 엑셀이 가리키는 PDF)을 끌어다 놓으면 배포와 **같은 규칙**으로 검사해, 오류를 `파일 › 시트 행 번호` 로 알려 주고 대학별로 무엇이 바뀌는지 보여 줍니다.
3. **이 데이터로 사이트 미리보기** 로 내 브라우저 탭에서만 결과를 봅니다(실제 사이트는 그대로, 화면 아래 '미리보기 중' 띠).
4. **GitHub에 올리기**: GitHub 토큰(fine-grained, 이 저장소의 Contents 읽기·쓰기만)을 한 번 붙여 넣으면 엑셀은 `data/`, PDF 는 `public/files/univ/{대학ID}/` 로
   커밋 하나로 올립니다. 토큰 없이 GitHub 웹의 **Add file → Upload files** 로 `data/` 에 올려도 됩니다.
5. GitHub Actions 가 다시 검사·빌드해 약 2분 뒤 반영됩니다.

**합치기 규칙** — `대학목록` 시트는 같은 대학ID 의 정보를 바꾸거나 새 대학을 추가합니다.
`경쟁률`·`모집요강`·`자료실`·`소식` 시트는 **엑셀에 행이 있는 대학의 그 종류 CSV 행을 모두 빼고** 엑셀의 행만 씁니다.
그래서 대학마다 자료가 준비되는 대로 엑셀로 올리면 됩니다. 자세한 규칙은 [`data/README.md`](data/README.md#엑셀로-관리하기-2단계).

**모집요강 링크** — `data/guidelines.csv` 는 대입정보포털 어디가가 공개하는 링크를 `npm run data:import-guidelines` 로 가져온 것입니다.
학년도가 바뀌면 원본 CSV 를 다시 받아 이 명령을 다시 실행하세요. 자세한 방법은 [`data/README.md`](data/README.md#어디가-모집요강-링크-가져오기-guidelinescsv).

**경쟁률·자료실·소식 올리기** — 해당 CSV 는 아직 머리글만 있습니다. 대학의 실제 자료가 준비되면 위 2단계 순서(엑셀 작성 → `/admin` 검사·미리보기 →
GitHub에 올리기)로 채우세요.

### 3단계: 로그인 · 커뮤니티 켜기 (요약)

로그인·찜·커뮤니티는 **Supabase**(무료 데이터베이스·로그인 서비스)를 씁니다. 사이트 코드에는 프로젝트 주소와 공개(anon) 키만 들어 있고(`src/config.ts`),
선생님이 대시보드에서 한 번 설정하면 열립니다. **자세한 순서(메뉴 이름 포함)는 [`supabase/README.md`](supabase/README.md)** 를 보세요.

1. Supabase **SQL Editor** 에 [`supabase/migrations/0001_stage3.sql`](supabase/migrations/0001_stage3.sql) 전체를 붙여 넣고 **Run**.
2. **Google Cloud Console** 에서 OAuth 동의 화면(외부) + OAuth 클라이언트 ID(웹) 만들기. 리디렉션 URI: `https://pjxvsloaujvqmbccwtjf.supabase.co/auth/v1/callback`
3. Supabase **Authentication → Sign In / Providers → Google** 켜고 클라이언트 ID·보안 비밀번호 붙여 넣기.
4. Supabase **Authentication → URL Configuration**: Site URL `https://ydms005.github.io/sim/`, Redirect URLs `https://ydms005.github.io/sim/**`, `http://localhost:5173/sim/**`.
5. 사이트에서 한 번 로그인한 뒤 SQL 로 내 계정을 관리자로 지정(`update public.profiles set role = 'admin' where id = (select id from auth.users where email = '내 이메일');`).
6. `src/config.ts` 의 `PRIVACY_OFFICER`(개인정보 보호 책임자 이름·연락처)를 실제 값으로 바꾸기.

설정 전에는 커뮤니티 탭에 '커뮤니티 준비 중' 안내가 보이고 다른 화면은 그대로 동작합니다.
Supabase 무료 프로젝트는 **1주일 동안 쓰지 않으면 일시 정지**되니, 정지되면 대시보드에서 **Restore project** 를 누르세요.

보안 설계: 모든 표에 RLS(행 수준 보안), 구글 이메일은 공개되지 않고 닉네임만 보임, 작성자·숨김 여부는 글쓴이가 못 바꿈,
관리자만 숨기기, 도배 방지(질문 10분 5개·답변 10분 20개), 글은 HTML 로 해석하지 않고 글자 그대로 표시.

## 3. 인터넷에 올리기 — GitHub Pages 자동 배포

이 저장소는 **GitHub Actions**가 사이트를 자동으로 만들어 **GitHub Pages**(무료 웹 호스팅)에 올리도록 설정되어 있습니다.

### 처음 한 번만 할 일

1. GitHub에서 이 저장소(<https://github.com/ydms005/sim>)를 엽니다.
2. 위쪽 메뉴 **Settings** → 왼쪽 메뉴 **Pages** 를 누릅니다.
3. **Build and deployment** 의 **Source** 를 **GitHub Actions** 로 바꿉니다. (저장 버튼은 따로 없습니다.)
4. **설정 전에 이미 코드를 올렸다면(push), 배포를 한 번 직접 실행합니다.**
   Pages 를 켜기 전에 돌아간 배포는 **Actions** 탭에 **빨간 X**(실패)로 남아 있고, 설정을 바꿔도 저절로 다시 돌지 않습니다.
   - **Actions** 탭 → 왼쪽 **Deploy to GitHub Pages** → 오른쪽 **Run workflow** → 초록색 **Run workflow** 버튼
   - 또는 실패한 실행을 열고 오른쪽 위 **Re-run jobs** → **Re-run all jobs**
5. 1~3분 뒤 초록색 체크가 뜨면 <https://ydms005.github.io/sim/> 에서 사이트가 열립니다.

이후에는 코드를 올릴 때마다 아래 흐름이 자동으로 돌아갑니다.

### 자동 배포 흐름

```
파일 수정 후 커밋(push)
   └─▶ GitHub Actions 실행 (.github/workflows/deploy.yml)
         1) 패키지 설치 (npm ci)
         2) data/*.csv·엑셀 검사 → 사이트용 데이터(JSON) 생성   ← 오류가 있으면 여기서 멈춤
         3) 사이트 빌드 (npm run build)
         4) GitHub Pages 에 업로드
   └─▶ 1~3분 뒤 https://ydms005.github.io/sim/ 에 반영
```

- 자동 배포가 되는 브랜치: `main`, `claude/modest-babbage-sfv411` (현재 기본 브랜치).
  다른 브랜치를 쓰려면 `.github/workflows/deploy.yml` 의 `branches:` 목록에 이름을 추가하세요.
- 저장소의 **Actions** 탭에서 진행 상황을 볼 수 있습니다. 초록색 체크 표시면 성공, 빨간색 X면 실패입니다.
- 코드 변경 없이 다시 배포하고 싶으면: **Actions** 탭 → 왼쪽 **Deploy to GitHub Pages** → 오른쪽 **Run workflow** 버튼.
- `/sim/univ/3/competition` 같은 주소에서 새로고침해도 화면이 뜨도록, 빌드할 때 `index.html` 을 `404.html` 로 복사해 둡니다
  (`vite.config.ts` 의 `spaFallback`). 그래서 주소를 복사해 학생들에게 바로 공유해도 됩니다.

## 4. 내 컴퓨터에서 실행해 보기

수정한 내용을 인터넷에 올리기 전에 내 컴퓨터에서 먼저 확인할 수 있습니다.

1. **Node.js 설치**: <https://nodejs.org> 에서 **22 LTS** 버전을 설치합니다(20 이상이면 됩니다).
2. **저장소 내려받기**: GitHub 저장소 화면의 초록색 **Code** 버튼 → **Download ZIP** 후 압축 풀기
   (또는 Git을 쓴다면 `git clone https://github.com/ydms005/sim.git`).
3. 내려받은 폴더에서 터미널(윈도우: 폴더 주소창에 `cmd` 입력 후 Enter)을 열고 아래를 차례로 실행합니다.

```bash
npm install      # 처음 한 번 (필요한 프로그램 설치, 몇 분 걸릴 수 있음)
npm run dev      # 개발용 서버 실행
```

4. 터미널에 나온 주소 **<http://localhost:5173/sim/>** 를 브라우저로 엽니다. 파일을 고쳐 저장하면 화면이 바로 바뀝니다.
   끝낼 때는 터미널에서 `Ctrl + C` 를 누릅니다.

그 밖의 명령:

| 명령 | 하는 일 |
|---|---|
| `npm run data` | `data/*.csv`·`data/**/*.xlsx` 를 검사하고 사이트용 JSON을 다시 만듭니다. 오류가 있으면 파일 이름(·시트)·줄 번호와 함께 알려 줍니다. |
| `npm run build` | 배포용 사이트를 `dist/` 폴더에 만듭니다(GitHub Actions가 하는 일과 같음). |
| `npm run preview` | `build` 로 만든 결과를 <http://localhost:4173/sim/> 에서 미리 봅니다. |
| `npm run typecheck` | 코드의 타입 오류를 검사합니다. |

## 5. 사이트 이름·공지 문구 바꾸기

모두 **`src/config.ts`** 한 파일에서 바꿉니다. GitHub 웹에서 파일을 열고 연필 모양(Edit) 아이콘을 눌러 고친 뒤
**Commit changes** 를 누르면 자동으로 다시 배포됩니다.

```ts
export const SITE_NAME = '대학길잡이'          // 왼쪽 위 로고 글자, 아래쪽 안내
export const NOTICE = '이 사이트의 경쟁률…'      // 홈 화면의 노란 공지 상자 문구
export const IS_SAMPLE_DATA = false             // 개발용 샘플 데이터를 쓸 때만 true (샘플 표시가 나타남)
export const GITHUB_REPO = 'ydms005/sim'        // 데이터 관리 화면의 'GitHub에 올리기' 대상 저장소
export const GITHUB_BRANCH = 'claude/modest-babbage-sfv411'  // … 대상 브랜치 (자동 배포되는 브랜치)
```

- 브라우저 탭에 보이는 제목과 검색엔진 설명은 **`index.html`** 의 `<title>` · `<meta name="description">` 에서 바꿉니다.
- `IS_SAMPLE_DATA` 는 지금 `false` 입니다(실제 데이터 사용 중). 개발 중에 `npm run data:sample`·`npm run data:pdf` 로 화면 확인용
  샘플을 다시 만들었을 때만 `true` 로 바꿔 각 화면의 '샘플 데이터' 표시를 켜세요.

## 6. 데이터는 어디에 있나요

| 위치 | 내용 | 직접 수정? |
|---|---|---|
| `data/universities.csv` | 대학 목록(ID·이름·지역·설립구분·캠퍼스·홈페이지) | 예 |
| `data/competition.csv` | 수시 경쟁률(대학·학년도·모집단위·전형·모집인원·지원자 수) | 예 |
| `data/guidelines.csv` | 모집요강 PDF 목록 | 예 |
| `data/resources.csv` | 자료실 파일 목록(대입자료·면접자료) | 예 |
| `data/news.csv` | 대학소식 | 예 |
| `data/**/*.xlsx` | 엑셀로 정리한 자료(시트: 대학목록·경쟁률·모집요강·자료실·소식). CSV와 합쳐짐 | 예(데이터 관리 화면 또는 GitHub 웹 업로드) |
| `public/files/univ/{대학ID}/*.pdf` | 모집요강·자료실 PDF 파일 | 예(파일 추가·교체) |
| `public/data/*.json` | CSV·엑셀에서 **자동으로 만들어지는** 사이트용 데이터 | **아니요** (Git에도 올라가지 않음) |

- 열 이름, 값 규칙, 대학·경쟁률·PDF 추가 방법, 엑셀에서 CSV로 저장하는 방법은 **[`data/README.md`](data/README.md)** 에 자세히 정리되어 있습니다.
- CSV는 엑셀로 열고 고쳐도 됩니다. 저장할 때는 반드시 **"CSV UTF-8(쉼표로 분리)"** 형식을 고르세요.
- CSV·엑셀에 잘못된 값(예: 숫자 칸에 글자, 없는 대학ID)이 있으면 배포가 멈추고 Actions 로그에 어느 파일 몇째 줄이 문제인지 표시됩니다.
  잘못된 데이터가 사이트에 올라가는 일을 막기 위한 장치입니다.

## 7. 폴더 구조

```
sim/
├─ README.md                  ← 지금 보고 있는 안내서
├─ index.html                 ← 브라우저 탭 제목·설명
├─ vite.config.ts             ← 빌드 설정(배포 경로 /sim/, 404.html 복사, PDF 한글 글꼴 파일 복사)
├─ package.json               ← 사용하는 프로그램 목록과 npm 명령
├─ .github/workflows/
│  └─ deploy.yml              ← GitHub Pages 자동 배포 설정
├─ data/                      ← ★ 데이터 원본(CSV·엑셀) + 작성 안내(data/README.md)
├─ supabase/                  ← 3단계 데이터베이스 SQL(migrations/0001_stage3.sql) + 설정 안내(supabase/README.md)
├─ scripts/                   ← 데이터 검사·변환(build-data.mjs), 샘플 데이터·PDF 생성 스크립트
│  └─ lib/dataset.mjs         ← 검사·합치기 규칙(빌드와 데이터 관리 화면이 함께 씀)
├─ public/
│  ├─ favicon.svg             ← 브라우저 탭 아이콘
│  ├─ files/univ/{대학ID}/    ← ★ 모집요강·자료실 PDF
│  └─ data/                   ← CSV·엑셀에서 자동 생성(수정 금지)
└─ src/                       ← 화면을 만드는 코드
   ├─ config.ts               ← ★ 사이트 이름·공지·샘플 여부, Supabase 주소, 개인정보 책임자
   ├─ router.tsx              ← 주소(URL)와 화면 연결
   ├─ index.css               ← 색상(초록 브랜드 색)·글꼴
   ├─ components/             ← 머리글·바닥글, 대학 카드, 그래프 등 공용 부품
   ├─ auth/                   ← 로그인 상태(구글 로그인·프로필·동의)
   ├─ community/              ← 커뮤니티(Q&A) 서버 요청
   ├─ pages/                  ← 홈·검색·경쟁률 추세·내 정보·이용 규칙·개인정보 처리방침 화면
   │  ├─ admin/               ← 데이터 관리 화면(/admin: 엑셀 양식·검사·미리보기·GitHub에 올리기)
   │  └─ univ/                ← 대학 상세 탭(대학정보·모집요강·지난 경쟁률·자료실·대학소식·커뮤니티)
   ├─ data/                   ← 데이터 형식 정의(types.ts)와 불러오기(api.ts)
   ├─ hooks/                  ← 찜 기능 등
   └─ lib/                    ← 숫자·경쟁률 표기, 한글 초성 검색, 배포 후 화면 파일 새로고침 처리
```

★ 표시가 보통 손대게 되는 곳입니다.

사용한 기술(참고): Vite · React · TypeScript · Tailwind CSS · React Router · Recharts(그래프) · react-pdf(PDF 뷰어) · read-excel-file / write-excel-file(엑셀) · Supabase(로그인·데이터베이스, supabase-js).

## 8. 자주 묻는 질문 · 문제 해결

**Q. 수정해서 커밋했는데 사이트가 그대로예요.**
Actions 탭에서 배포가 끝났는지(초록 체크) 확인하세요. 끝났다면 브라우저 캐시 때문일 수 있으니 `Ctrl + Shift + R`(맥: `Cmd + Shift + R`)로 새로고침합니다.

**Q. 사이트를 보던 중 화면이 한 번 저절로 새로고침됐어요.**
새 버전이 배포되면 화면 파일 이름이 바뀌어, 그전부터 열어 둔 사이트는 아직 안 본 화면 파일을 받지 못합니다.
이때 한 번 자동으로 새로고침해 새 버전을 받습니다. 그래도 안 되면(네트워크 불안정 등) '화면을 불러오지 못했어요' 안내와 **새로고침** 버튼이 보입니다.

**Q. Actions 에 빨간 X가 떴어요.**
실패한 실행을 누르면 아래쪽 **Annotations** 에 원인이 짧게 보입니다. 자세히 보려면 **build** → 빨간 단계를 펼쳐 보세요.
- `[data/competition.csv 12행] …` 또는 `[data/2027.xlsx › 경쟁률 12행] …` 같은 메시지 → 해당 파일의 그 행을 고쳐 다시 올리면 자동으로 다시 배포됩니다. (올리기 전에 데이터 관리 화면의 '파일 검사'로 확인하면 이런 실패를 미리 막을 수 있습니다.)
- `GitHub Pages 설정이 필요합니다` 또는 `Get Pages site failed` → [처음 한 번만 할 일](#처음-한-번만-할-일)의 Pages 설정(Source: GitHub Actions)이 안 된 경우입니다.
  설정을 바꾼 뒤 **Actions** 탭 → **Deploy to GitHub Pages** → **Run workflow** 로 다시 실행하세요.
- `Branch "…" is not allowed to deploy to github-pages due to environment protection rules` →
  **Settings → Environments → github-pages → Deployment branches and tags** 에 그 브랜치 이름을 추가한 뒤, 역시 **Run workflow** 로 다시 실행하세요.

설정(Settings)만 바꾸면 실패한 배포가 저절로 다시 돌지 않습니다. 코드를 고친 경우가 아니라면 **Run workflow** 로 직접 다시 실행해야 합니다.

**Q. 사이트 주소(`/sim/`)를 바꾸고 싶어요.**
저장소 이름이 곧 주소입니다. 저장소 이름을 바꾸면 자동 배포가 새 주소에 맞춰 빌드합니다.
직접 빌드할 때는 `BASE_PATH=/새이름/ npm run build`(맥·리눅스 기준) 처럼 경로를 지정합니다. 사용자 지정 도메인을 쓰면 `BASE_PATH=/` 입니다.

**Q. 학교망에서 글꼴이 다르게 보여요. PDF 한글은 괜찮나요?**
사이트 글꼴(Pretendard)만 외부 CDN(jsdelivr)에서 받습니다. 학교망에서 막히면 기기 기본 글꼴로 보일 뿐 기능은 그대로입니다.
글꼴은 화면 그리기를 막지 않게 따로 받으므로(`index.html`), CDN 이 느리거나 응답하지 않아도 사이트는 바로 뜹니다.
PDF 뷰어가 쓰는 한글 글꼴 정보(CMap)·표준 글꼴은 빌드할 때 사이트(`/sim/pdfjs/`)에 함께 올라가므로 CDN이 막혀도 PDF 한글이 보입니다.

**Q. 커뮤니티에 '커뮤니티 준비 중'만 보여요.**
Supabase 에서 SQL 을 아직 실행하지 않았거나 실패한 경우입니다. [`supabase/README.md`](supabase/README.md) 의 A 단계를 해 주세요.
잘 되던 커뮤니티가 갑자기 '연결하지 못했어요' 로 바뀌었다면 무료 프로젝트가 일시 정지된 것이니 대시보드에서 **Restore project** 를 누르세요.

**Q. 로그인 문제(구글 오류 화면, 로그인 뒤 엉뚱한 곳으로 이동)가 생겨요.**
[`supabase/README.md`](supabase/README.md) 맨 아래 '문제 해결' 표를 보세요.

**Q. AI 상담은 언제 되나요?**
보류 중입니다. `/ai` 화면은 '준비 중' 안내만 보여 줍니다.

## 9. 저작권 · 이용 안내

- 공교육 현장의 진학 지도를 돕기 위한 **비상업적 교육용** 프로젝트입니다.
- 대학 로고·교표는 사용하지 않습니다. 이니셜 아이콘은 자동으로 만든 것입니다.
- 모집요강 링크는 대입정보포털 어디가([github.com/KyunghwanP/ynhs](https://github.com/KyunghwanP/ynhs)가 정리한 목록)의 공식 다운로드
  주소를 그대로 연결합니다. 자료실 PDF·대학소식을 직접 올릴 때는 **해당 대학의 공개 범위와 이용 조건을 확인**하고, 출처를 밝혀 주세요.
- 실제 입시 정보의 기준은 언제나 **대학 입학처 공고**와 **대입정보포털 어디가**입니다.
