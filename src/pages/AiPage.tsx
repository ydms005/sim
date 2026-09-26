import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { MCP_URL, SITE_NAME } from '../config'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

/** 서버 주소를 보여 주고 복사 버튼을 붙인 카드 */
function ServerUrlCard() {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(MCP_URL)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // 클립보드 접근이 막힌 브라우저(권한 거부 등)에서는 직접 선택해 복사하도록 안내만 합니다.
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 md:p-5">
      <p className="text-[13px] font-semibold text-gray-500">MCP 서버 주소</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-3 py-2.5 text-[13px] text-gray-800 ring-1 ring-gray-200 md:text-[14px]">
          {MCP_URL}
        </code>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-lg bg-brand-400 px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          {copied ? '복사됨!' : '주소 복사'}
        </button>
      </div>
    </div>
  )
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[13px] font-bold text-brand-700">
        {n}
      </span>
      <div className="min-w-0 flex-1 text-[15px] leading-7 text-gray-700 [&_code]:break-all [&_code]:rounded [&_code]:bg-gray-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[13px] [&_code]:text-gray-800">
        {children}
      </div>
    </li>
  )
}

function Section({ title, badge, children }: { title: string; badge?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[18px] font-bold text-gray-900 md:text-[19px]">{title}</h2>
        {badge && <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[12px] font-medium text-gray-600">{badge}</span>}
      </div>
      <ol className="mt-4 space-y-3">{children}</ol>
    </section>
  )
}

const EXAMPLE_QUESTIONS = [
  '건국대학교 서울캠퍼스 기본 정보랑 최근 학과별 경쟁률 top 10 알려줘',
  '연세대학교랑 고려대학교 최근 3년 경쟁률 비교해줘',
  '전국에서 국어국문학과 경쟁률이 높은 순으로 5곳만 보여줘',
  '경기도에 있는 사립대학 목록 알려줘',
  '건국대학교 서울캠퍼스 국어국문학과 연도별 모집인원·지원자 수 알려줘',
  '가천대학교 2027학년도 모집요강 링크 줘',
]

export default function AiPage() {
  useDocumentTitle('AI 연동')

  return (
    <div className="mx-auto max-w-[820px] px-4 pt-8 pb-16 md:px-10 md:pt-12">
      <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.02em] text-gray-900 md:text-[34px]">AI 연동 (MCP)</h1>
      <p className="mt-3 text-[16px] leading-8 text-gray-700">
        {SITE_NAME}의 대학 정보를 Claude(클로드)나 ChatGPT 같은 AI 채팅에 연결해서, 채팅창에서 바로 물어볼 수 있게 하는 기능이에요. 로그인이나
        회원가입 없이 누구나 쓸 수 있고, 사이트의 <strong>공개 데이터를 읽기만</strong> 합니다(글을 쓰거나 수정하지 않아요).
      </p>

      <div className="mt-6 rounded-2xl bg-brand-50 p-4 text-[14px] leading-6 text-brand-800 md:p-5">
        <p className="font-semibold">MCP(Model Context Protocol)가 뭔가요?</p>
        <p className="mt-1">
          AI가 외부 서비스의 최신 정보를 찾아볼 수 있게 해 주는 표준 방식이에요. &lsquo;커넥터&rsquo; 또는 &lsquo;앱&rsquo;이라고도 불러요. 아래
          주소를 AI 프로그램에 한 번 등록해 두면, 이후에는 채팅으로 질문하기만 하면 AI가 알아서 이 사이트의 자료를 찾아 답해 줍니다.
        </p>
      </div>

      <div className="mt-6">
        <ServerUrlCard />
      </div>

      <div className="mt-8 space-y-5">
        <Section title="claude.ai (웹)" badge="무료 요금제는 커넥터 1개">
          <Step n={1}>오른쪽 아래(또는 사이드바) 프로필 메뉴에서 <strong>설정</strong>을 열어요.</Step>
          <Step n={2}>
            <strong>커넥터</strong>(Connectors) 메뉴로 들어가 <strong>커스텀 커넥터 추가</strong>(Add custom connector)를 눌러요.
          </Step>
          <Step n={3}>
            이름은 자유롭게(예: &lsquo;대학길잡이&rsquo;) 적고, 주소 칸에 위의 <strong>MCP 서버 주소</strong>를 붙여 넣은 뒤 저장해요.
          </Step>
          <Step n={4}>새 대화를 열고 커넥터를 켠 다음, 아래 예시처럼 질문해 보세요.</Step>
        </Section>

        <Section title="Claude Desktop (설치형 앱)">
          <Step n={1}><strong>설정 → 커넥터</strong>에서 <strong>커스텀 커넥터 추가</strong>를 눌러요.</Step>
          <Step n={2}>이름과 주소(위의 MCP 서버 주소)를 넣고 저장해요. claude.ai 웹과 등록 방법이 거의 같습니다.</Step>
        </Section>

        <Section title="Claude Code (터미널)">
          <Step n={1}>터미널에서 아래 명령을 실행해요.</Step>
          <li className="ml-9">
            <pre className="overflow-x-auto rounded-lg bg-gray-900 px-3.5 py-3 text-[13px] leading-6 text-gray-100">
              <code>claude mcp add --transport http daehak {MCP_URL}</code>
            </pre>
          </li>
          <Step n={2}><code>daehak</code>은 원하는 이름으로 바꿔도 됩니다. 등록 후 바로 대화에서 사용할 수 있어요.</Step>
        </Section>

        <Section title="ChatGPT" badge="유료 요금제 · 개발자 모드">
          <Step n={1}>ChatGPT <strong>설정</strong>으로 들어가 <strong>보안</strong>(또는 앱) 메뉴에서 <strong>개발자 모드</strong>를 켜요.</Step>
          <Step n={2}>
            <strong>새 앱 만들기</strong>(또는 커넥터 추가)를 누르고, 이름을 적은 뒤 위의 <strong>MCP 서버 주소</strong>를 넣어요.
          </Step>
          <Step n={3}>인증 방식은 <strong>인증 없음</strong>(No authentication)을 선택해요.</Step>
          <Step n={4}>대화창에서 이 앱(커넥터)을 켜고 질문해 보세요. 개발자 모드는 일부 유료 요금제에서만 제공돼요.</Step>
        </Section>
      </div>

      <p className="mt-5 text-[13px] text-gray-500">
        ※ 메뉴 이름은 조금 다를 수 있어요. AI 서비스 화면은 자주 바뀌니, 이름이 비슷한 메뉴를 찾아 보세요.
      </p>

      <section className="mt-10">
        <h2 className="text-[19px] font-bold text-gray-900 md:text-[20px]">이렇게 물어보세요</h2>
        <ul className="mt-3 space-y-2">
          {EXAMPLE_QUESTIONS.map((q) => (
            <li key={q} className="rounded-xl bg-gray-50 px-4 py-3 text-[14.5px] text-gray-700">
              &ldquo;{q}&rdquo;
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10 space-y-2 rounded-2xl border border-gray-200 p-4 text-[14px] leading-7 text-gray-600 md:p-5">
        <h2 className="text-[16px] font-bold text-gray-900">데이터에 대해 알아 두세요</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>대학 목록·주소·연락처는 대학알리미 표준데이터, 지표(경쟁률·충원율 등)는 대학알리미(공공데이터포털) 공시자료입니다.</li>
          <li>학과별 모집 현황은 한국교육개발원 교육통계(KESS) 기준으로, 2024~2026학년도 수시+정시 합산 수치입니다. 전형별 수치가 아닙니다.</li>
          <li>모집요강 링크는 대입정보포털 어디가(adiga.kr)가 공개한 공식 링크입니다.</li>
          <li>
            AI의 답변은 참고용입니다. 실제 입시 정보는 반드시 각 대학 입학처 공고와 대입정보포털 어디가에서 다시 확인하세요. 자세한 이용 안내는{' '}
            <Link to="/terms" className="font-semibold text-brand-600 underline underline-offset-2">
              이용 규칙
            </Link>
            을 참고하세요.
          </li>
        </ul>
      </section>
    </div>
  )
}
