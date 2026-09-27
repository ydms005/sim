import { AppError, unwrap } from '../../lib/dbErrors'
import { getSupabase } from '../../lib/supabase'

/** 활동 카드: 계정(Supabase)에 저장되는, 학생이 직접 쓰는 활동 기록. 테이블: supabase/migrations/0002_activities.sql */

export const CATEGORIES = ['동아리', '봉사', '진로', '교과세특', '독서', '수상', '자율', '기타'] as const
export type ActivityCategory = (typeof CATEGORIES)[number]

export const TITLE_MIN = 2
export const TITLE_MAX = 100
export const CONTENT_MAX = 5000
export const REFLECTION_MAX = 3000
export const MAJOR_MAX = 100

export interface ActivityCard {
  id: number
  user_id: string
  category: ActivityCategory
  title: string
  occurred_on: string | null
  content: string
  reflection: string
  related_major: string
  created_at: string
  updated_at: string
}

/** AI 요청에 실어 보내는 모양(계정 식별 정보는 뺌) */
export type ActivityCardInput = Pick<ActivityCard, 'category' | 'title' | 'occurred_on' | 'content' | 'reflection' | 'related_major'>

const COLS = 'id,user_id,category,title,occurred_on,content,reflection,related_major,created_at,updated_at'

export function toCardInput(c: ActivityCard): ActivityCardInput {
  return { category: c.category, title: c.title, occurred_on: c.occurred_on, content: c.content, reflection: c.reflection, related_major: c.related_major }
}

export async function listActivityCards(): Promise<ActivityCard[]> {
  const sb = await getSupabase()
  const res = await sb
    .from('activities')
    .select(COLS)
    .order('occurred_on', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
  return unwrap(res) as ActivityCard[]
}

export async function createActivityCard(input: ActivityCardInput): Promise<ActivityCard> {
  const sb = await getSupabase()
  return unwrap(await sb.from('activities').insert(input).select(COLS).single<ActivityCard>()) as ActivityCard
}

/** 1행이 실제로 바뀌었는지 확인 (권한이 없으면 서버는 오류 없이 0행을 돌려줍니다) */
function one<T>(rows: T[] | null): T {
  if (!rows?.length) throw new AppError('forbidden', '이 활동 카드를 찾을 수 없거나 권한이 없어요. 새로고침해 주세요.')
  return rows[0]
}

export async function updateActivityCard(id: number, patch: Partial<ActivityCardInput>): Promise<ActivityCard> {
  const sb = await getSupabase()
  return one(unwrap(await sb.from('activities').update(patch).eq('id', id).select(COLS)) as ActivityCard[])
}

export async function deleteActivityCard(id: number): Promise<void> {
  const sb = await getSupabase()
  one(unwrap(await sb.from('activities').delete().eq('id', id).select('id')))
}
