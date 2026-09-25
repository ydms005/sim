import { Link } from 'react-router-dom'
import { PolicyPage, PolicySection } from '../components/PolicyPage'
import { SITE_NAME } from '../config'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export default function TermsPage() {
  useDocumentTitle('이용 규칙')
  return (
    <PolicyPage
      title="이용 규칙"
      intro={
        <p>
          {SITE_NAME}는 학생·선생님이 대학 입시 정보를 함께 나누는 교육용 공간입니다. 모두가 편하게 묻고 답할 수 있도록 아래 규칙을 지켜 주세요.
        </p>
      }
    >
      <PolicySection n={1} title="가입">
        <ul>
          <li>구글 계정으로 로그인하면 누구나 가입할 수 있습니다. 만 14세 이상만 가입할 수 있습니다.</li>
          <li>처음 로그인하면 임의 닉네임이 만들어지며, 내 정보에서 바꿀 수 있습니다. 실명이나 다른 사람을 흉내 내는 닉네임, &lsquo;관리자&rsquo;·&lsquo;선생님&rsquo; 같은 닉네임은 쓸 수 없습니다.</li>
        </ul>
      </PolicySection>

      <PolicySection n={2} title="이런 글은 쓰지 마세요">
        <ul>
          <li>다른 사람·학교·대학을 비방하거나 욕설, 차별, 괴롭힘이 담긴 글</li>
          <li>
            <strong>개인정보</strong>가 담긴 글: 이름, 전화번호, 주소, 학교·반, SNS 계정, 사진 등 (내 것이든 다른 사람 것이든)
          </li>
          <li>광고·홍보, 같은 내용 반복(도배), 질문과 관계없는 글</li>
          <li>사실이 아닌 입시 정보를 일부러 퍼뜨리는 글, 저작권이 있는 자료를 허락 없이 옮긴 글</li>
        </ul>
      </PolicySection>

      <PolicySection n={3} title="관리자의 권한">
        <ul>
          <li>관리자(운영 교사)는 규칙에 어긋난 글을 알림 없이 숨기거나 삭제할 수 있습니다. 숨긴 글은 관리자와 글쓴이에게만 보입니다.</li>
          <li>규칙을 여러 번 어기면 이용이 제한될 수 있습니다.</li>
          <li>관리자가 쓴 글에는 &lsquo;선생님&rsquo; 표시가 붙습니다.</li>
          <li>글이 너무 빨리 올라오는 것을 막기 위해 질문은 10분에 5개, 답변은 10분에 20개까지 쓸 수 있습니다.</li>
        </ul>
      </PolicySection>

      <PolicySection n={4} title="정보의 정확성">
        <p>
          커뮤니티의 글은 이용자 개인의 의견이며 사이트가 정확성을 보증하지 않습니다. 사이트의 경쟁률·모집요강 등도 참고용입니다. 실제 입시 정보는 반드시 각 대학 입학처 공고와
          대입정보포털 어디가(adiga.kr)에서 확인하세요.
        </p>
      </PolicySection>

      <PolicySection n={5} title="글의 권리와 삭제">
        <ul>
          <li>글의 권리는 쓴 사람에게 있습니다. 다만 사이트에 올린 글은 다른 이용자가 볼 수 있도록 사이트에 게시됩니다.</li>
          <li>내가 쓴 글은 언제든 수정·삭제할 수 있고, 탈퇴하면 모두 삭제됩니다.</li>
        </ul>
      </PolicySection>

      <PolicySection n={6} title="서비스의 변경·중단">
        <p>비상업적 교육용 사이트라 사전 안내 없이 기능이 바뀌거나 잠시 멈출 수 있습니다(예: 무료 서버 사용량 제한, 점검).</p>
      </PolicySection>

      <p className="text-[15px] text-gray-600">
        개인정보를 어떻게 다루는지는{' '}
        <Link to="/privacy" className="font-semibold text-brand-600 underline underline-offset-2">
          개인정보 처리방침
        </Link>
        을 보세요.
      </p>
    </PolicyPage>
  )
}
