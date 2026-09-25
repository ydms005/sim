import { AppError, unwrap } from '../lib/dbErrors'
import { getSupabase } from '../lib/supabase'

/** 커뮤니티(대학별 Q&A) 서버 요청. 테이블 구조는 supabase/migrations/0001_stage3.sql 참고 */

export interface Question {
  id: number
  univ_id: number
  user_id: string
  title: string
  body: string
  created_at: string
  updated_at: string
  is_hidden: boolean
  answer_count: number
}

export interface Answer {
  id: number
  question_id: number
  user_id: string
  body: string
  created_at: string
  updated_at: string
  is_hidden: boolean
}

export interface Author {
  id: string
  nickname: string
  /** 관리자(선생님) 계정이면 '선생님' 배지를 붙입니다. */
  is_admin: boolean
}

export const TITLE_MIN = 2
export const TITLE_MAX = 100
export const BODY_MIN = 2
export const BODY_MAX = 5000
export const ANSWER_MAX = 5000
export const PAGE_SIZE = 15

const Q_COLS = 'id,univ_id,user_id,title,body,created_at,updated_at,is_hidden,answer_count'
const A_COLS = 'id,question_id,user_id,body,created_at,updated_at,is_hidden'

/** ilike 검색어의 %, _ 를 글자 그대로 찾도록 */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

export async function listQuestions(univId: number, opts: { offset: number; search?: string }) {
  const sb = await getSupabase()
  let q = sb.from('questions').select(Q_COLS, { count: 'exact' }).eq('univ_id', univId)
  const search = opts.search?.trim()
  if (search) q = q.ilike('title', `%${escapeLike(search)}%`)
  const res = await q
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(opts.offset, opts.offset + PAGE_SIZE - 1)
  const items = unwrap(res) as Question[]
  return { items, total: res.count ?? items.length }
}

export async function getQuestion(id: number): Promise<Question | null> {
  const sb = await getSupabase()
  return unwrap(await sb.from('questions').select(Q_COLS).eq('id', id).maybeSingle<Question>())
}

export async function listAnswers(questionId: number): Promise<Answer[]> {
  const sb = await getSupabase()
  const res = await sb.from('answers').select(A_COLS).eq('question_id', questionId).order('created_at').order('id')
  return unwrap(res) as Answer[]
}

// 작성자 닉네임: 같은 사람을 여러 번 묻지 않도록 기억해 둡니다.
const authorCache = new Map<string, Author>()

export async function loadAuthors(ids: string[]): Promise<Map<string, Author>> {
  const need = [...new Set(ids)].filter((id) => !authorCache.has(id))
  if (need.length) {
    const sb = await getSupabase()
    const rows = unwrap(await sb.rpc('get_authors', { ids: need })) as Author[] | null
    for (const a of rows ?? []) authorCache.set(a.id, a)
  }
  return new Map(ids.filter((id) => authorCache.has(id)).map((id) => [id, authorCache.get(id)!]))
}

/** 내 닉네임을 바꾸면 기억해 둔 작성자 정보도 고칩니다. */
export function forgetAuthor(id: string) {
  authorCache.delete(id)
}

export async function createQuestion(univId: number, title: string, body: string): Promise<Question> {
  const sb = await getSupabase()
  return unwrap(await sb.from('questions').insert({ univ_id: univId, title, body }).select(Q_COLS).single<Question>()) as Question
}

/** 1행이 바뀌었는지 확인 (권한이 없으면 서버는 오류 없이 0행을 돌려줍니다) */
function one<T>(rows: T[] | null): T {
  if (!rows?.length) throw new AppError('forbidden', '이 글을 바꿀 권한이 없거나 이미 삭제된 글이에요. 새로고침해 주세요.')
  return rows[0]
}

export async function updateQuestion(id: number, patch: Partial<Pick<Question, 'title' | 'body' | 'is_hidden'>>) {
  const sb = await getSupabase()
  return one(unwrap(await sb.from('questions').update(patch).eq('id', id).select(Q_COLS)) as Question[])
}

export async function deleteQuestion(id: number) {
  const sb = await getSupabase()
  one(unwrap(await sb.from('questions').delete().eq('id', id).select('id')))
}

export async function createAnswer(questionId: number, body: string): Promise<Answer> {
  const sb = await getSupabase()
  return unwrap(await sb.from('answers').insert({ question_id: questionId, body }).select(A_COLS).single<Answer>()) as Answer
}

export async function updateAnswer(id: number, patch: Partial<Pick<Answer, 'body' | 'is_hidden'>>) {
  const sb = await getSupabase()
  return one(unwrap(await sb.from('answers').update(patch).eq('id', id).select(A_COLS)) as Answer[])
}

export async function deleteAnswer(id: number) {
  const sb = await getSupabase()
  one(unwrap(await sb.from('answers').delete().eq('id', id).select('id')))
}

export interface MyAnswer extends Answer {
  question: Pick<Question, 'id' | 'title' | 'univ_id'> | null
}

/** 내가 쓴 질문 (최근 100개) */
export async function myQuestions(userId: string): Promise<Question[]> {
  const sb = await getSupabase()
  const res = await sb.from('questions').select(Q_COLS).eq('user_id', userId).order('created_at', { ascending: false }).limit(100)
  return unwrap(res) as Question[]
}

/** 내가 쓴 답변 (최근 100개, 질문 제목 포함) */
export async function myAnswers(userId: string): Promise<MyAnswer[]> {
  const sb = await getSupabase()
  const res = await sb
    .from('answers')
    .select(`${A_COLS},question:questions(id,title,univ_id)`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100)
  return unwrap(res) as unknown as MyAnswer[]
}
