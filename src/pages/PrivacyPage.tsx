import { Link } from 'react-router-dom'
import { PolicyPage, PolicySection } from '../components/PolicyPage'
import { PRIVACY_OFFICER, SITE_NAME } from '../config'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export default function PrivacyPage() {
  useDocumentTitle('개인정보 처리방침')
  return (
    <PolicyPage
      title="개인정보 처리방침"
      intro={
        <p>
          {SITE_NAME}(이하 &lsquo;사이트&rsquo;)는 진학 지도를 돕기 위한 비상업적 교육용 사이트입니다. 로그인해야 쓸 수 있는 기능(커뮤니티 글쓰기, 찜 목록 계정 저장)에 꼭
          필요한 최소한의 정보만 모으며, 광고나 다른 목적에는 쓰지 않습니다. 로그인하지 않고 대학 정보를 보는 데에는 개인정보를 모으지 않습니다.
        </p>
      }
    >
      <PolicySection n={1} title="모으는 개인정보">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-left text-[15px]">
            <thead>
              <tr className="border-b border-gray-200 text-gray-900">
                <th className="py-2 pr-3 font-semibold">항목</th>
                <th className="py-2 pr-3 font-semibold">언제</th>
                <th className="py-2 font-semibold">공개 여부</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="py-2 pr-3">구글 계정 이메일 · 고유 ID</td>
                <td className="py-2 pr-3">구글로 로그인할 때</td>
                <td className="py-2">비공개 (로그인 확인용)</td>
              </tr>
              <tr>
                <td className="py-2 pr-3">닉네임</td>
                <td className="py-2 pr-3">처음 로그인할 때 임의로 만들어짐, 직접 변경 가능</td>
                <td className="py-2">공개 (글쓴이 표시)</td>
              </tr>
              <tr>
                <td className="py-2 pr-3">작성한 질문·답변</td>
                <td className="py-2 pr-3">커뮤니티에 글을 쓸 때</td>
                <td className="py-2">공개 (관리자가 숨긴 글 제외)</td>
              </tr>
              <tr>
                <td className="py-2 pr-3">찜한 대학 목록</td>
                <td className="py-2 pr-3">대학을 찜할 때</td>
                <td className="py-2">비공개 (본인만)</td>
              </tr>
              <tr>
                <td className="py-2 pr-3">이용 동의 시각</td>
                <td className="py-2 pr-3">이용 규칙·이 방침에 동의할 때</td>
                <td className="py-2">비공개</td>
              </tr>
              <tr>
                <td className="py-2 pr-3">활동 카드(활동 내용·느낀 점·관련 학과 등)</td>
                <td className="py-2 pr-3">활동정리에서 활동 카드를 쓸 때</td>
                <td className="py-2">비공개 (본인만, 관리자도 못 봄)</td>
              </tr>
              <tr>
                <td className="py-2 pr-3">AI 국외 이전 동의 시각</td>
                <td className="py-2 pr-3">활동정리의 AI 요약·채팅을 처음 쓸 때</td>
                <td className="py-2">비공개</td>
              </tr>
              <tr>
                <td className="py-2 pr-3">이용자 구분(학생 · 교사)</td>
                <td className="py-2 pr-3">이용 동의할 때 선택, 내 정보에서 변경 가능</td>
                <td className="py-2">비공개 (관리자만 열람)</td>
              </tr>
              <tr>
                <td className="py-2 pr-3">AI 사용량(요청 수 · 토큰 수)</td>
                <td className="py-2 pr-3">활동정리의 AI 요약·채팅을 쓸 때 자동 기록</td>
                <td className="py-2">비공개 (관리자만 열람, 비용·오남용 관리 목적)</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>구글 계정의 이름·프로필 사진은 사이트 데이터베이스에 따로 저장하지 않고, 다른 사람에게 보여 주지 않습니다.</p>
        <p>
          활동정리에 올리는 <strong>PDF 원본(생기부 등)은 저희 서버로 올라오지 않고, 학생이 쓰는 기기(브라우저)에만 저장</strong>됩니다.
          자세한 내용은 5장을 확인해 주세요.
        </p>
      </PolicySection>

      <PolicySection n={2} title="쓰는 목적">
        <ul>
          <li>로그인(본인 확인)과 부정 이용 방지</li>
          <li>대학별 질문 게시판(커뮤니티) 운영: 글쓴이 닉네임 표시, 규칙 위반 글 관리</li>
          <li>찜한 대학 목록을 여러 기기에서 볼 수 있게 저장</li>
          <li>활동정리: 학생이 쓴 활동 카드를 여러 기기에서 볼 수 있게 저장, AI 활동 요약·진학 상담 답변 생성</li>
          <li>서비스 운영: 이용자 구분(학생/교사)에 맞춘 안내, AI 사용량 기록을 통한 비용·오남용 관리</li>
        </ul>
      </PolicySection>

      <PolicySection n={3} title="보관 기간과 삭제">
        <ul>
          <li>회원 탈퇴할 때까지 보관합니다.</li>
          <li>
            <Link to="/me" className="font-semibold text-brand-600 underline underline-offset-2">
              내 정보
            </Link>{' '}
            화면의 &lsquo;회원 탈퇴&rsquo;를 누르면 계정, 닉네임, 작성한 질문·답변(내 질문에 달린 답변 포함), 찜 목록, 활동 카드가 즉시
            삭제되어 되살릴 수 없습니다.
          </li>
          <li>작성한 글·활동 카드는 탈퇴 전에도 언제든 직접 수정·삭제할 수 있습니다.</li>
          <li>기기에만 저장되는 PDF 원본·요약·채팅·메모는 학생이 활동정리 화면에서 직접 지우거나, 로그아웃할 때 자동으로 지우도록 설정할 수 있습니다.</li>
        </ul>
      </PolicySection>

      <PolicySection n={4} title="처리를 맡기는 곳 (위탁)">
        <ul>
          <li>
            <strong>Supabase Inc.</strong> — 로그인·데이터베이스 서비스. 데이터는 Supabase 의 <strong>서울 리전</strong>(대한민국) 서버에 저장됩니다.
          </li>
          <li>
            <strong>Google LLC</strong> — 구글 계정 로그인(본인 인증).
          </li>
          <li>
            <strong>GitHub Inc.</strong> — 사이트 화면 파일 제공(호스팅). 로그인 정보나 글은 GitHub 에 저장되지 않습니다.
          </li>
        </ul>
        <p>모은 개인정보를 다른 사람이나 회사에 팔거나 제공하지 않습니다. 법령에 따른 요청이 있는 경우는 예외입니다.</p>
      </PolicySection>

      <PolicySection n={5} title="개인정보의 국외 이전 (활동정리 AI)">
        <p>
          활동정리의 <strong>AI 요약·채팅</strong> 기능은 미국 회사인 <strong>Anthropic PBC</strong>가 만든 Claude 라는 AI 모델을 씁니다.
          이 기능을 쓰면 학생이 올린 자료 중 <strong>개인정보를 가린(마스킹한) 글만</strong> Anthropic 서버로 보내지므로, 아래 내용을 확인하고{' '}
          <strong>별도로 동의</strong>해야 이용할 수 있습니다. 동의는 활동정리 화면에서 처음 AI 기능을 누를 때 받고, 동의하지 않아도 사이트의 다른
          기능(문서 올리기·활동 카드 쓰기 등)은 그대로 쓸 수 있습니다.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-left text-[15px]">
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="py-2 pr-3 font-semibold text-gray-900">이전되는 개인정보 항목</td>
                <td className="py-2">가림 처리(마스킹)된 활동 기록 글, 채팅으로 입력한 질문</td>
              </tr>
              <tr>
                <td className="py-2 pr-3 font-semibold text-gray-900">이전되는 국가</td>
                <td className="py-2">미국</td>
              </tr>
              <tr>
                <td className="py-2 pr-3 font-semibold text-gray-900">이전받는 자(수령자)</td>
                <td className="py-2">Anthropic PBC</td>
              </tr>
              <tr>
                <td className="py-2 pr-3 font-semibold text-gray-900">이전받는 자의 이용 목적</td>
                <td className="py-2">활동 요약 생성, 진학 상담 답변 생성 (AI 모델 응답 계산)</td>
              </tr>
              <tr>
                <td className="py-2 pr-3 font-semibold text-gray-900">보유·이용 기간</td>
                <td className="py-2">Anthropic API 기본 보관 기간(요청일로부터 30일 이내) 동안만 보관 후 삭제하며, AI 모델 학습에는 쓰이지 않습니다.</td>
              </tr>
              <tr>
                <td className="py-2 pr-3 font-semibold text-gray-900">거부 방법과 불이익</td>
                <td className="py-2">동의하지 않을 수 있으며, 이 경우 AI 요약·채팅 기능만 이용할 수 없고 그 밖의 기능은 그대로 이용할 수 있습니다.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          이름·학번·생년월일·주민등록번호·전화번호·이메일·주소·학교명은 보내기 전 자동으로 가려지며(교육부 수행평가 AI 활용 지침 기준), 실제로
          보낼 내용을 학생이 화면에서 다시 확인·수정할 수 있습니다.{' '}
          <Link to="/me" className="font-semibold text-brand-600 underline underline-offset-2">
            내 정보
          </Link>{' '}
          또는 활동정리 화면에서 언제든 동의를 철회할 수 있습니다.
        </p>
      </PolicySection>

      <PolicySection n={6} title="브라우저(기기)에 저장하는 정보">
        <p>
          로그인 상태를 유지하기 위한 정보와 로그인 전 찜 목록을 브라우저 저장소(localStorage)에 저장합니다. 로그아웃하면 로그인 정보는 지워지고, 로그인하면 브라우저의 찜 목록은
          계정으로 옮긴 뒤 지웁니다. 학교·도서관의 공용 컴퓨터에서는 사용 후 꼭 로그아웃해 주세요.
        </p>
        <p>
          활동정리에 올리는 <strong>PDF 원본(생기부 등)은 저희 서버(데이터베이스)로 전혀 올라오지 않고, 이 기기의 브라우저 저장 공간(IndexedDB)에만</strong>{' '}
          저장됩니다. 다른 기기에서는 보이지 않으며, 활동정리 화면에서 직접 지우거나 &lsquo;이 기기에서 내 자료 모두 지우기&rsquo;로 언제든 지울 수 있습니다.
          공용 컴퓨터 대비를 위해 로그아웃할 때 자동으로 지우는 설정(기본 켜짐)도 제공합니다.
        </p>
      </PolicySection>

      <PolicySection n={7} title="만 14세 미만">
        <p>만 14세 미만은 법정대리인 동의 절차를 갖추지 못해 가입할 수 없습니다. 만 14세 미만이 가입한 사실을 알게 되면 계정을 삭제합니다.</p>
      </PolicySection>

      <PolicySection n={8} title="이용자의 권리">
        <p>
          언제든 내 정보 화면에서 닉네임을 바꾸고, 내가 쓴 글·활동 카드를 보고 고치거나 지우고, 탈퇴할 수 있습니다. AI 국외 이전 동의도 내 정보 또는
          활동정리 화면에서 언제든 다시 확인하거나 철회할 수 있습니다. 그 밖에 개인정보 열람·정정·삭제·처리 정지를 원하면 아래 연락처로 요청해 주세요.
        </p>
      </PolicySection>

      <PolicySection n={9} title="안전하게 지키는 방법">
        <ul>
          <li>모든 통신은 암호화(HTTPS)됩니다. 비밀번호는 사이트가 받지 않습니다(구글 로그인만 사용).</li>
          <li>데이터베이스의 행 수준 보안(RLS) 규칙으로 본인 정보는 본인만, 숨긴 글은 관리자와 글쓴이만 볼 수 있게 제한합니다.</li>
          <li>활동 카드는 본인만 읽고 쓸 수 있으며, 관리자(선생님)도 다른 학생의 활동 카드를 볼 수 없습니다.</li>
          <li>관리자 권한은 운영 교사 계정에만 줍니다.</li>
          <li>
            관리자는 회원 관리(가입 정지·탈퇴 처리 등) 운영 목적으로 회원 목록(이메일·닉네임·가입일·이용자 구분·최근 로그인 시각)을 관리자
            페이지에서 볼 수 있습니다. 작성한 글의 내용이나 활동 카드처럼 그 목적에 필요하지 않은 정보는 보지 않습니다.
          </li>
        </ul>
      </PolicySection>

      <PolicySection n={10} title="개인정보 보호 책임자 · 문의">
        <ul>
          <li>책임자: {PRIVACY_OFFICER.name}</li>
          <li>연락처: {PRIVACY_OFFICER.contact}</li>
        </ul>
        <p>개인정보 침해 신고·상담은 개인정보침해신고센터(국번 없이 118, privacy.kisa.or.kr)에도 할 수 있습니다.</p>
      </PolicySection>

      <PolicySection n={11} title="방침의 변경">
        <p>이 방침을 바꾸면 사이트에 시행일과 함께 알립니다.</p>
      </PolicySection>
    </PolicyPage>
  )
}
