import { useMemo, useState } from 'react'
import { countMaskMatches, maskText, redactKnownNames, MASK_TYPE_NAME } from '../../lib/mask'
import { showToast } from '../../lib/toast'
import { cx } from '../common'
import { BTN_PRIMARY, BTN_SECONDARY, Dialog } from '../Dialog'

/**
 * AI로 처음 보내기 전에 보여 주는 '가리기 확인' 창. 자동으로 가린 결과를 보여 주고, 학생이 직접 고칠 수 있게 합니다.
 * text 가 바뀌면(다른 문서를 열면) 다시 계산합니다.
 */
export default function MaskReviewDialog({
  open,
  text,
  onCancel,
  onConfirm,
}: {
  open: boolean
  text: string
  onCancel: () => void
  onConfirm: (maskedText: string) => void
}) {
  const result = useMemo(() => maskText(text), [text])
  const [value, setValue] = useState(result.masked)
  const [seenFor, setSeenFor] = useState(text)
  // 자동 인식이 놓친 이름 대비 마지막 안전장치: 학생이 실명을 직접 입력하면, 라벨이 있든 없든
  // 글자 그대로 일치하는 곳을 모두 가립니다(줄바꿈 없이 이어진 표처럼 자동 인식이 못 찾는 경우 대비).
  const [nameInput, setNameInput] = useState('')
  if (text !== seenFor) {
    setSeenFor(text)
    setValue(result.masked)
    setNameInput('')
  }
  const counts = useMemo(() => countMaskMatches(result.matches), [result])

  const applyKnownNames = () => {
    const names = nameInput.split(/[,\s]+/).filter(Boolean)
    if (names.length === 0) return
    const { text: redacted, count } = redactKnownNames(value, names)
    setValue(redacted)
    setNameInput('')
    if (count === 0) showToast('입력한 이름이 위 내용에서 보이지 않아요. 이미 가려졌거나, 철자가 다를 수 있어요.', 'error')
    else showToast(`'${names.join(', ')}'을(를) ${count}곳 가렸어요.`)
  }

  return (
    <Dialog open={open} onClose={onCancel} title="보내기 전 가림 처리 확인" size="lg">
      <p className="text-[15px] leading-7 text-gray-600">
        이름·학번·생년월일·주민등록번호·전화번호·이메일·주소·학교명으로 보이는 부분을 자동으로 가렸어요. 실제로 Anthropic 서버로
        보낼 내용을 아래에서 확인하고, 필요하면 직접 고칠 수 있어요.
      </p>
      {counts.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {counts.map(({ type, count }) => (
            <li key={type} className="rounded-full bg-brand-50 px-3 py-1 text-[13px] font-medium text-brand-700">
              {MASK_TYPE_NAME[type]} {count}건
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] text-amber-700">자동으로 찾아 가린 개인정보가 없어요. 그래도 한 번 내용을 확인해 주세요.</p>
      )}
      <div className="mt-3 rounded-xl bg-amber-50 px-4 py-3">
        <label htmlFor="mask-review-name-backstop" className="block text-[13px] font-semibold text-amber-900">
          아래에 이름이 그대로 남아 있나요? 실명을 입력하면 문서 전체에서 한 번에 더 찾아 가려요
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="mask-review-name-backstop"
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                applyKnownNames()
              }
            }}
            placeholder="예: 홍길동 (여러 명이면 쉼표나 띄어쓰기로 구분)"
            className="min-w-0 flex-1 rounded-lg border border-amber-200 bg-white px-3 py-2 text-[13.5px] focus:border-brand-400 focus:ring-2 focus:ring-brand-200 focus:outline-none"
          />
          <button type="button" onClick={applyKnownNames} disabled={!nameInput.trim()} className={cx(BTN_SECONDARY, 'shrink-0 px-3 text-[13px]')}>
            찾아 가리기
          </button>
        </div>
      </div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={12}
        aria-label="보낼 내용 (가려진 글, 수정 가능)"
        className="mt-4 block max-h-[45vh] min-h-40 w-full resize-y rounded-xl border border-gray-200 bg-white px-4 py-3 text-[14px] leading-6 whitespace-pre-wrap text-gray-900 focus:border-brand-400 focus:ring-2 focus:ring-brand-200 focus:outline-none"
      />
      <p className="mt-2 text-[13px] text-gray-500">
        <code className="rounded bg-gray-100 px-1 py-0.5">[이름]</code>, <code className="rounded bg-gray-100 px-1 py-0.5">[학교]</code>처럼
        대괄호로 된 부분이 가려진 곳이에요. 가려지지 않은 개인정보가 보이면 직접 지우거나 같은 방식으로 바꿔 주세요.
      </p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
        <button type="button" onClick={() => onConfirm(value)} disabled={!value.trim()} className={BTN_PRIMARY}>
          이대로 보내기
        </button>
        <button type="button" onClick={onCancel} className={BTN_SECONDARY}>
          취소
        </button>
      </div>
    </Dialog>
  )
}
