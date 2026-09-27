import { ADMIN_USERS_URL, SUPABASE_ANON_KEY } from '../../config'
import { AppError, toAppError, unwrap } from '../../lib/dbErrors'
import { getSupabase } from '../../lib/supabase'

/** 관리자 페이지(/admin) 전용 API. RPC 는 supabase/migrations/0003_admin.sql, 탈퇴는 supabase/functions/admin-users. */

export interface AdminUserRow {
  id: string
  email: string | null
  provider: string
  created_at: string
  last_sign_in_at: string | null
  nickname: string
  role: 'user' | 'admin'
  user_type: 'student' | 'teacher' | null
  question_count: number
  answer_count: number
  activity_count: number
  ai_requests_month: number
}

export async function fetchAdminUsers(): Promise<AdminUserRow[]> {
  const sb = await getSupabase()
  return unwrap(await sb.rpc('admin_list_users')) as AdminUserRow[]
}

export async function setAdminUserType(userId: string, userType: 'student' | 'teacher'): Promise<void> {
  const sb = await getSupabase()
  unwrap(await sb.rpc('admin_set_user_type', { p_user: userId, p_type: userType }))
}

export interface TableStat {
  table_name: string
  total_bytes: number
  row_estimate: number
}

export interface StorageBucketStat {
  bucket_id: string
  cnt: number
  bytes: number
}

export interface StorageStats {
  db_bytes: number
  tables: TableStat[]
  storage: { buckets: StorageBucketStat[]; total_bytes: number; total_count: number }
}

export async function fetchStorageStats(): Promise<StorageStats> {
  const sb = await getSupabase()
  return unwrap(await sb.rpc('admin_storage_stats')) as StorageStats
}

export interface DailyModelUsage {
  day: string
  model: string
  requests: number
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
}

export interface TopUserUsage {
  nickname: string
  email: string | null
  requests: number
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
}

export interface AiUsageStats {
  since: string
  daily: DailyModelUsage[]
  top_users: TopUserUsage[]
}

export async function fetchAiUsage(days = 30): Promise<AiUsageStats> {
  const sb = await getSupabase()
  return unwrap(await sb.rpc('admin_ai_usage', { p_days: days })) as AiUsageStats
}

/** 회원 탈퇴(계정 삭제). 다른 사람의 계정을 지우는 것이라 Edge Function(auth.admin API)을 거칩니다. */
export async function adminDeleteUser(userId: string): Promise<void> {
  const sb = await getSupabase()
  const { data } = await sb.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new AppError('auth', '로그인이 만료됐어요. 다시 로그인해 주세요.')

  let res: Response
  try {
    res = await fetch(ADMIN_USERS_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'delete', userId }),
    })
  } catch {
    throw new AppError('network', '서버에 연결하지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.')
  }
  if (res.ok) return

  const body = (await res.json().catch(() => null)) as { error?: string } | null
  const code = body?.error ?? ''
  const MESSAGES: Record<string, string> = {
    forbidden: '관리자만 할 수 있어요.',
    cannot_delete_self: '내 계정은 여기서 탈퇴할 수 없어요. 내 정보 화면을 이용해 주세요.',
    cannot_delete_admin: '다른 관리자 계정은 지울 수 없어요. 먼저 역할을 바꾼 뒤 다시 시도해 주세요.',
    not_found: '이미 지워진 계정이에요.',
  }
  if (res.status === 401) throw toAppError({ code: 'PGRST301' }, 401)
  throw new AppError('app', MESSAGES[code] ?? '탈퇴 처리에 실패했어요. 잠시 뒤 다시 시도해 주세요.')
}
