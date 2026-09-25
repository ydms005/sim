import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  agreeToTerms,
  closeLogin,
  dismissAgreement,
  signInWithGoogle,
  signOut,
  useAuth,
} from '../../auth/store'
import { errorMessage } from '../../lib/dbErrors'
import { BTN_PRIMARY, BTN_SECONDARY, Dialog } from '../Dialog'

/** 화면 전체에 한 번만 두는 로그인 안내 창과 첫 로그인 동의 창 (Layout) */
export default function AuthDialogs() {
  const auth = useAuth()
  const needsAgreement =
    auth.status === 'signedIn' && auth.profileState === 'ready' && !!auth.profile && !auth.profile.agreed_at && !auth.agreementDismissed
  return (
    <>
      <LoginDialog open={auth.loginOpen && auth.status !== 'signedIn'} reason={auth.loginReason} />
      <AgreementDialog open={needsAgreement} />
    </>
  )
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

function LoginDialog({ open, reason }: { open: boolean; reason: string }) {
  const [busy, setBusy] = useState(false)
  const start = async () => {
    setBusy(true)
    await signInWithGoogle()
    // 성공하면 구글 화면으로 넘어가므로, 여기까지 오면 실패한 경우입니다.
    setBusy(false)
  }
  return (
    <Dialog open={open} onClose={closeLogin} title="로그인">
      {reason && <p className="mb-3 rounded-xl bg-brand-50 px-4 py-3 text-[15px] font-medium text-brand-800">{reason}</p>}
      <p className="text-[15px] leading-7 text-gray-600">
        구글 계정으로 로그인하면 <strong className="text-gray-900">커뮤니티에 질문·답변</strong>을 쓰고,{' '}
        <strong className="text-gray-900">찜한 대학</strong>을 다른 기기에서도 볼 수 있어요.
      </p>
      <ul className="mt-4 space-y-2 rounded-xl bg-gray-50 px-4 py-3 text-[14px] leading-6 text-gray-600">
        <li className="flex gap-2">
          <span aria-hidden className="text-brand-600">✓</span>
          <span>구글 이메일은 로그인 확인에만 쓰고, 다른 사람에게 보이지 않아요.</span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden className="text-brand-600">✓</span>
          <span>처음 로그인하면 &lsquo;열정적인 수험생1234&rsquo; 같은 임의 닉네임이 만들어져요. 내 정보에서 바꿀 수 있어요.</span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden className="text-brand-600">✓</span>
          <span>만 14세 이상만 가입할 수 있어요.</span>
        </li>
      </ul>
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="mt-5 flex h-12 w-full items-center justify-center gap-3 rounded-full border border-gray-300 bg-white text-[16px] font-semibold text-gray-800 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-60"
      >
        <GoogleMark />
        {busy ? '구글로 이동하는 중…' : 'Google 계정으로 계속하기'}
      </button>
      <p className="mt-4 text-center text-[13px] leading-5 text-gray-500">
        계속하면{' '}
        <Link to="/terms" onClick={closeLogin} className="font-medium text-gray-700 underline underline-offset-2">
          이용 규칙
        </Link>
        과{' '}
        <Link to="/privacy" onClick={closeLogin} className="font-medium text-gray-700 underline underline-offset-2">
          개인정보 처리방침
        </Link>
        을 확인한 것으로 봐요.
      </p>
    </Dialog>
  )
}

function AgreementDialog({ open }: { open: boolean }) {
  const [age, setAge] = useState(false)
  const [terms, setTerms] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      await agreeToTerms()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onClose={dismissAgreement} title="시작하기 전에 확인해 주세요" dismissible={false} size="lg">
      <p className="text-[15px] leading-7 text-gray-600">
        처음 로그인하셨네요. 커뮤니티에 글을 쓰고 찜 목록을 계정에 저장하려면 아래 내용에 동의해 주세요.
      </p>
      <div className="mt-4 space-y-3 text-[14px] leading-6 text-gray-600">
        <section className="rounded-xl bg-gray-50 px-4 py-3">
          <h3 className="font-bold text-gray-900">이용 규칙 요약</h3>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>다른 사람을 비방하거나 욕설·광고 글을 쓰지 않아요.</li>
            <li>이름·연락처·학교·주소 같은 개인정보를 올리지 않아요. (내 것도, 남의 것도)</li>
            <li>규칙에 어긋난 글은 관리자(선생님)가 숨기거나 지울 수 있어요.</li>
          </ul>
        </section>
        <section className="rounded-xl bg-gray-50 px-4 py-3">
          <h3 className="font-bold text-gray-900">개인정보 처리 요약</h3>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>수집: 구글 계정 이메일·고유 ID(로그인용, 비공개), 닉네임, 작성한 글, 찜 목록</li>
            <li>목적: 로그인, 커뮤니티 운영, 찜 목록 저장</li>
            <li>보관: 회원 탈퇴할 때까지 (탈퇴하면 바로 모두 삭제)</li>
          </ul>
        </section>
        <p>
          자세한 내용:{' '}
          <Link to="/terms" target="_blank" className="font-semibold text-brand-600 underline underline-offset-2">
            이용 규칙
          </Link>{' '}
          ·{' '}
          <Link to="/privacy" target="_blank" className="font-semibold text-brand-600 underline underline-offset-2">
            개인정보 처리방침
          </Link>{' '}
          (새 탭)
        </p>
      </div>
      <fieldset className="mt-5 space-y-3">
        <legend className="sr-only">동의 항목</legend>
        <label className="flex cursor-pointer items-start gap-3 text-[15px] font-medium text-gray-800">
          <input type="checkbox" checked={age} onChange={(e) => setAge(e.target.checked)} className="mt-1 size-5 shrink-0 accent-brand-500" />
          <span>만 14세 이상입니다. (필수)</span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 text-[15px] font-medium text-gray-800">
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-1 size-5 shrink-0 accent-brand-500" />
          <span>이용 규칙과 개인정보 처리방침에 동의합니다. (필수)</span>
        </label>
      </fieldset>
      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-[14px] text-red-800">
          {error}
        </p>
      )}
      <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
        <button type="button" onClick={submit} disabled={!age || !terms || busy} className={BTN_PRIMARY}>
          {busy ? '저장하는 중…' : '동의하고 시작하기'}
        </button>
        <button type="button" onClick={dismissAgreement} className={BTN_SECONDARY}>
          나중에 하기
        </button>
      </div>
      <p className="mt-4 text-[13px] leading-5 text-gray-500">
        동의하기 전에는 글을 읽을 수만 있어요. 만 14세 미만이거나 동의하지 않으려면{' '}
        <button type="button" onClick={() => void signOut()} className="font-semibold text-gray-700 underline underline-offset-2">
          로그아웃
        </button>
        해 주세요. 계정을 지우려면 내 정보 화면의 &lsquo;회원 탈퇴&rsquo;를 이용하세요.
      </p>
    </Dialog>
  )
}
