import type { Session } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'
import { AppError, toAppError, unwrap } from '../lib/dbErrors'
import { AUTH_STORAGE_KEY, getSupabase, hasStoredSession } from '../lib/supabase'
import { showToast } from '../lib/toast'

/**
 * 로그인 상태 (구글 로그인 · Supabase).
 *
 * 처음 화면을 빨리 그리기 위해 Supabase 라이브러리는 바로 받지 않습니다.
 *  - 이 브라우저에 로그인 기록이 있거나, 구글 로그인에서 막 돌아온 경우(?code=)에만 화면을 그린 뒤 받아 확인합니다.
 *  - 그 밖에는 '로그인' 버튼을 누르거나 커뮤니티·내 정보 화면을 열 때 받습니다.
 */

export interface Profile {
  id: string
  nickname: string
  role: 'user' | 'admin'
  /** 이용 규칙·개인정보 처리방침 동의 시각. 없으면 아직 동의 전(글쓰기·찜 저장 불가) */
  agreed_at: string | null
  created_at: string
}

export type ProfileState = 'idle' | 'loading' | 'ready' | 'not_ready' | 'missing' | 'error'

export interface AuthState {
  /** checking: 저장된 로그인 정보를 확인하는 중 */
  status: 'checking' | 'signedOut' | 'signedIn'
  userId: string | null
  /** 구글 계정 이메일 (본인 화면에만 표시, 다른 사람에게는 보이지 않음) */
  email: string | null
  profile: Profile | null
  profileState: ProfileState
  profileError: string
  /** 로그인 안내 창 */
  loginOpen: boolean
  loginReason: string
  /** 동의 창을 '나중에'로 닫았는지 (새로고침하면 다시 보임) */
  agreementDismissed: boolean
}

let state: AuthState = {
  status: 'signedOut',
  userId: null,
  email: null,
  profile: null,
  profileState: 'idle',
  profileError: '',
  loginOpen: false,
  loginReason: '',
  agreementDismissed: false,
}

const listeners = new Set<() => void>()

function set(patch: Partial<AuthState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export const getAuthState = () => state

export function subscribeAuth(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribeAuth, getAuthState)
}

/** 관리자(선생님) 계정인지 */
export const isAdmin = (s: AuthState) => s.status === 'signedIn' && s.profile?.role === 'admin'
/** 글을 쓸 수 있는 상태인지 (로그인 + 이용 동의) */
export const canWrite = (s: AuthState) => s.status === 'signedIn' && !!s.profile?.agreed_at

// ---------------------------------------------------------------------------
// 시작

/** 로그인에서 돌아온 주소에 붙는 값들 */
const CALLBACK_PARAMS = ['code', 'error', 'error_code', 'error_description']

function callbackParams() {
  const search = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const error = search.get('error_description') ?? hash.get('error_description') ?? search.get('error') ?? hash.get('error')
  return { code: search.get('code'), error }
}

/** 로그인에서 돌아온 뒤 주소창에 남은 ?code=·?error= 를 지웁니다. */
function cleanCallbackUrl() {
  const url = new URL(window.location.href)
  let changed = false
  for (const k of CALLBACK_PARAMS) {
    if (url.searchParams.has(k)) {
      url.searchParams.delete(k)
      changed = true
    }
  }
  if (/error_description=|access_token=/.test(url.hash)) {
    url.hash = ''
    changed = true
  }
  if (changed) window.history.replaceState(window.history.state, '', url.toString())
  return changed
}

let onUrlCleaned: (() => void) | undefined

/**
 * 앱을 시작할 때 한 번 부릅니다. (main.tsx)
 * @param urlCleaned 주소창의 ?code= 등을 지운 뒤 라우터에 알려 주는 함수
 */
export function initAuth(urlCleaned?: () => void) {
  onUrlCleaned = urlCleaned
  const cb = callbackParams()
  if (cb.code || cb.error) {
    set({ status: 'checking' })
    void startAuth().catch(() => {})
  } else if (hasStoredSession()) {
    set({ status: 'checking' })
    // 첫 화면을 먼저 그리고 나서 로그인 정보를 확인합니다.
    const run = () => void startAuth().catch(() => {})
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 1500 })
    else setTimeout(run, 300)
  }
  // 다른 탭에서 로그인·로그아웃하면 이 탭도 따라갑니다.
  window.addEventListener('storage', (e) => {
    if (e.key === AUTH_STORAGE_KEY || e.key === null) void startAuth().catch(() => {})
  })
}

let started: Promise<void> | null = null

/** Supabase 를 받아 로그인 상태를 확인합니다. 여러 번 불러도 한 번만 실행됩니다. */
export function startAuth(): Promise<void> {
  if (started) return started
  started = (async () => {
    const hadCallback = callbackParams()
    const client = await getSupabase()
    client.auth.onAuthStateChange((_event, session) => {
      // 이 콜백 안에서 바로 Supabase 를 다시 부르면 멈출 수 있어 한 박자 늦춥니다. (supabase-js 안내)
      window.setTimeout(() => applySession(session), 0)
    })
    const { error } = await client.auth.initialize()
    const { data } = await client.auth.getSession()
    applySession(data.session)
    if (cleanCallbackUrl()) onUrlCleaned?.()
    else if (hadCallback.code) onUrlCleaned?.() // supabase-js 가 ?code= 를 지웠으면 라우터에도 알림
    if (hadCallback.error || (hadCallback.code && (error || !data.session))) {
      showToast(
        hadCallback.error && /access_denied|denied/i.test(hadCallback.error)
          ? '로그인을 취소했어요.'
          : '로그인하지 못했어요. 잠시 뒤 다시 시도해 주세요.',
        'error',
      )
    }
  })().catch((err: unknown) => {
    // 라이브러리를 받지 못했거나 서버에 연결하지 못함: 로그아웃 상태로 두고 다음에 다시 시도합니다.
    started = null
    if (state.status === 'checking') set({ status: 'signedOut' })
    throw err
  })
  return started
}

function applySession(session: Session | null) {
  if (!session) {
    if (state.status !== 'signedOut' || state.userId)
      set({ status: 'signedOut', userId: null, email: null, profile: null, profileState: 'idle', profileError: '', agreementDismissed: false })
    return
  }
  const user = session.user
  if (state.status === 'signedIn' && state.userId === user.id) return // 토큰 갱신 등
  set({ status: 'signedIn', userId: user.id, email: user.email ?? null, profile: null, profileState: 'loading', profileError: '', loginOpen: false })
  void loadProfile()
}

const PROFILE_COLS = 'id,nickname,role,agreed_at,created_at'

/** 내 프로필(닉네임·역할·동의 시각)을 다시 읽습니다. */
export async function loadProfile() {
  const uid = state.userId
  if (!uid) return
  set({ profileState: 'loading', profileError: '' })
  try {
    const client = await getSupabase()
    let profile: Profile | null = null
    for (let i = 0; i < 2 && !profile; i++) {
      if (i) await new Promise((r) => window.setTimeout(r, 1200))
      profile = unwrap(await client.from('profiles').select(PROFILE_COLS).eq('id', uid).maybeSingle<Profile>())
    }
    if (state.userId !== uid) return
    if (!profile) {
      set({
        profileState: 'missing',
        profileError: '계정 정보(닉네임)를 찾지 못했어요. 로그아웃한 뒤 다시 로그인하거나 관리자에게 알려 주세요.',
      })
      return
    }
    set({ profile, profileState: 'ready' })
  } catch (err) {
    if (state.userId !== uid) return
    const e = toAppError(err)
    set({ profileState: e.kind === 'not_ready' ? 'not_ready' : 'error', profileError: e.message })
  }
}

// ---------------------------------------------------------------------------
// 동작

export function openLogin(reason = '') {
  set({ loginOpen: true, loginReason: reason })
  // 버튼을 누르는 동안 라이브러리를 미리 받아 둡니다.
  void startAuth().catch(() => {})
}

export const closeLogin = () => set({ loginOpen: false })

/** 로그인한 뒤 돌아올 주소: 지금 보고 있는 화면 (?code= 등은 뺌) */
function currentUrl() {
  const url = new URL(window.location.href)
  for (const k of CALLBACK_PARAMS) url.searchParams.delete(k)
  url.hash = ''
  return url.toString()
}

export async function signInWithGoogle() {
  try {
    const client = await getSupabase()
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: currentUrl() },
    })
    if (error) throw error
    // 성공하면 구글 로그인 화면으로 이동합니다.
  } catch (err) {
    const e = toAppError(err)
    showToast(
      e.kind === 'network' ? e.message : '구글 로그인을 시작하지 못했어요. 관리자가 로그인 설정을 마쳤는지 확인해 주세요.',
      'error',
    )
  }
}

export async function signOut() {
  try {
    const client = await getSupabase()
    // 이 브라우저에서만 로그아웃합니다. (학교 공용 컴퓨터에서도 기록이 남지 않도록 저장된 로그인 정보를 지움)
    await client.auth.signOut({ scope: 'local' })
  } catch {
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY)
    } catch {
      /* 무시 */
    }
  }
  applySession(null)
  showToast('로그아웃했어요.')
}

/** 이용 규칙·개인정보 처리방침 동의 (동의 시각은 서버 시각으로 기록됩니다) */
export async function agreeToTerms() {
  const uid = state.userId
  if (!uid) throw new AppError('auth', '로그인이 필요해요.')
  const client = await getSupabase()
  const profile = unwrap(
    await client.from('profiles').update({ agreed_at: new Date().toISOString() }).eq('id', uid).select(PROFILE_COLS).single<Profile>(),
  )
  set({ profile, profileState: 'ready' })
}

export const dismissAgreement = () => set({ agreementDismissed: true })
export const openAgreement = () => set({ agreementDismissed: false })

export async function updateNickname(nickname: string) {
  const uid = state.userId
  if (!uid) throw new AppError('auth', '로그인이 필요해요.')
  const client = await getSupabase()
  const profile = unwrap(
    await client.from('profiles').update({ nickname }).eq('id', uid).select(PROFILE_COLS).single<Profile>(),
    { duplicate: '이미 다른 사람이 쓰고 있는 닉네임이에요. 다른 닉네임을 골라 주세요.' },
  )
  set({ profile })
  return profile
}

/** 회원 탈퇴: 계정과 작성한 글·찜을 모두 지웁니다. */
export async function deleteAccount() {
  const client = await getSupabase()
  unwrap(await client.rpc('delete_my_account'))
  try {
    await client.auth.signOut({ scope: 'local' })
  } catch {
    /* 서버의 계정은 이미 지워졌으므로 무시 */
  }
  applySession(null)
}
