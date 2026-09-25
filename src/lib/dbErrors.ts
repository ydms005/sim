/**
 * Supabase(PostgREST·Postgres) 오류를 학생이 이해할 수 있는 한국어 안내로 바꿉니다.
 * 서버가 보내는 오류 코드: https://postgrest.org/en/stable/references/errors.html
 */
export type AppErrorKind =
  | 'not_ready' // 테이블·함수가 아직 없음 (선생님이 SQL 을 아직 실행하지 않음)
  | 'network' // 서버에 연결하지 못함
  | 'auth' // 로그인 만료·로그인 필요
  | 'forbidden' // 권한 없음
  | 'rate_limit' // 도배 방지 제한
  | 'duplicate' // 이미 있음 (닉네임 중복 등)
  | 'invalid' // 길이·형식 오류
  | 'not_found'
  | 'app' // 서버가 보낸 한국어 안내 그대로
  | 'unknown'

export class AppError extends Error {
  readonly kind: AppErrorKind
  readonly code: string
  constructor(kind: AppErrorKind, message: string, code = '') {
    super(message)
    this.name = 'AppError'
    this.kind = kind
    this.code = code
  }
}

export const NOT_READY_MESSAGE = '커뮤니티 준비 중: 관리자가 데이터베이스 설정을 마치면 열립니다.'
const NETWORK_MESSAGE = '서버에 연결하지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.'

interface ErrorLike {
  code?: string
  message?: string
  hint?: string | null
  details?: string | null
}

/** 닉네임 등 상황에 맞춘 문구를 덧씌울 때 */
export interface ErrorContext {
  duplicate?: string
}

const CONSTRAINT_MESSAGES: Record<string, string> = {
  profiles_nickname_key: '이미 다른 사람이 쓰고 있는 닉네임이에요. 다른 닉네임을 골라 주세요.',
  profiles_nickname_length: '닉네임은 2~12자로 정해 주세요.',
  profiles_nickname_format: '닉네임에는 한글·영문·숫자·밑줄(_)만 쓸 수 있고, 띄어쓰기는 단어 사이에 한 칸만 넣을 수 있어요.',
  questions_title_check: '제목은 2~100자로 써 주세요.',
  questions_body_check: '내용은 2~5,000자로 써 주세요.',
  answers_body_check: '답변은 1~5,000자로 써 주세요.',
}

export function toAppError(err: unknown, status?: number, ctx: ErrorContext = {}): AppError {
  if (err instanceof AppError) return err
  const e: ErrorLike = typeof err === 'object' && err !== null ? (err as ErrorLike) : { message: String(err) }
  const code = e.code ?? ''
  const message = e.message ?? ''
  const hint = e.hint ?? ''
  const text = `${message} ${e.details ?? ''}`

  // 선생님이 SQL 을 실행하기 전: 테이블·함수를 찾을 수 없음
  if (['PGRST205', 'PGRST202', 'PGRST200', '42P01', '42883'].includes(code) || /schema cache|does not exist/i.test(message))
    return new AppError('not_ready', NOT_READY_MESSAGE, code)

  if (hint.startsWith('APP_')) return new AppError(hint === 'APP_RATE_LIMIT' ? 'rate_limit' : 'app', message, code)

  for (const [name, msg] of Object.entries(CONSTRAINT_MESSAGES)) if (text.includes(name)) return new AppError(code === '23505' ? 'duplicate' : 'invalid', msg, code)

  if (code === '23505') return new AppError('duplicate', ctx.duplicate ?? '이미 등록된 내용이에요.', code)
  if (code === '23514' || code === '22001') return new AppError('invalid', '입력한 내용의 길이나 형식을 확인해 주세요.', code)
  if (code === '23503') return new AppError('not_found', '글이 삭제되어 처리할 수 없어요. 새로고침해 주세요.', code)
  if (code === 'PGRST116') return new AppError('not_found', '글을 찾을 수 없어요. 삭제되었거나 숨겨진 글일 수 있어요.', code)
  if (code === '42501' || /row-level security|permission denied/i.test(message))
    return new AppError('forbidden', '이 작업을 할 권한이 없어요. 로그인 상태와 이용 동의 여부를 확인해 주세요.', code)
  if (/^PGRST3/.test(code) || /jwt/i.test(message) || status === 401)
    return new AppError('auth', '로그인이 만료됐어요. 로그아웃한 뒤 다시 로그인해 주세요.', code)
  if (status === 0 || /fetch|network|load failed/i.test(message)) return new AppError('network', NETWORK_MESSAGE, code)
  if (status !== undefined && status >= 500) return new AppError('network', '서버가 잠시 응답하지 않아요. 잠시 뒤 다시 시도해 주세요.', code)
  return new AppError('unknown', `요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.${code ? ` (오류 코드 ${code})` : ''}`, code)
}

/** supabase-js 응답에서 오류가 있으면 AppError 로 던지고, 아니면 data 를 돌려줍니다. */
export function unwrap<T>(res: { data: T; error: unknown; status?: number }, ctx?: ErrorContext): T {
  if (res.error) throw toAppError(res.error, res.status, ctx)
  return res.data
}

export const errorMessage = (err: unknown) => toAppError(err).message
