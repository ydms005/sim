import { useState } from 'react'
import { giveAiConsent } from '../../lib/activityApi'
import { toAppError } from '../../lib/dbErrors'
import { BTN_PRIMARY, BTN_SECONDARY, Dialog } from '../Dialog'

/** AI(요약·채팅) 첫 사용 전 국외 이전(미국·Anthropic PBC) 동의 창. 개인정보 처리방침 5장과 같은 내용입니다. */
export default function ConsentDialog({ open, onClose, onAgreed }: { open: boolean; onClose: () => void; onAgreed: () => void }) {
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!checked || busy) return
    setBusy(true)
    setError('')
    try {
      await giveAiConsent()
      onAgreed()
    } catch (err) {
      setError(toAppError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="AI 기능을 쓰려면 동의가 필요해요" size="lg">
      <p className="text-[15px] leading-7 text-gray-600">
        AI 요약·채팅은 개인정보를 가린(마스킹한) 활동 내용을 미국에 있는 <strong className="text-gray-900">Anthropic PBC</strong>(Claude
        개발사) 서버로 보내 답을 받아요. 이는 <strong className="text-gray-900">개인정보의 국외 이전</strong>에 해당해 별도 동의가
        필요해요.
      </p>
      <dl className="mt-4 space-y-2 rounded-xl bg-gray-50 px-4 py-3 text-[14px] leading-6 text-gray-700">
        <div>
          <dt className="inline font-semibold text-gray-900">이전되는 항목: </dt>
          <dd className="inline">가림 처리된 활동 기록 글, 채팅으로 입력한 질문</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-gray-900">이전되는 국가: </dt>
          <dd className="inline">미국</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-gray-900">이전받는 곳: </dt>
          <dd className="inline">Anthropic PBC</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-gray-900">이용 목적: </dt>
          <dd className="inline">활동 요약, 진학 상담 답변 생성</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-gray-900">보유 기간: </dt>
          <dd className="inline">Anthropic API 기본 보관 기간(30일 이내) 후 삭제, 모델 학습에는 쓰이지 않음</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-gray-900">거부 방법: </dt>
          <dd className="inline">동의하지 않아도 되며, 이 경우 AI 요약·채팅 기능만 이용할 수 없고 나머지 기능은 그대로 써요.</dd>
        </div>
      </dl>
      <p className="mt-3 text-[13px] leading-6 text-gray-500">
        이름·학번·생년월일·주민등록번호·전화번호·이메일·주소·학교명은 보내기 전 자동으로 가려지고, 보내기 전 화면에서 한 번 더
        확인·수정할 수 있어요.
      </p>
      <label className="mt-4 flex cursor-pointer items-start gap-3 text-[15px] font-medium text-gray-800">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-1 size-5 shrink-0 accent-brand-500" />
        <span>위 내용을 확인했고, 국외 이전에 동의합니다.</span>
      </label>
      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-[14px] text-red-800">
          {error}
        </p>
      )}
      <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
        <button type="button" onClick={submit} disabled={!checked || busy} className={BTN_PRIMARY}>
          {busy ? '저장하는 중…' : '동의하고 계속하기'}
        </button>
        <button type="button" onClick={onClose} disabled={busy} className={BTN_SECONDARY}>
          나중에
        </button>
      </div>
    </Dialog>
  )
}
