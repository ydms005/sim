// 관리자 페이지(/admin, '회원' 탭) 전용 — 회원 탈퇴(계정 삭제) Edge Function.
//
// 왜 Edge Function 이 필요한가: 다른 사람의 계정을 완전히 지우려면(auth.users 삭제) Supabase Auth 의
// 관리자 API(auth.admin.deleteUser)가 필요한데, 이 API 는 service_role 키로만 부를 수 있어 브라우저에서
// 바로 부를 수 없습니다. 그래서 이 함수가 로그인한 사람이 '관리자'인지 다시 한번 서버에서 확인한 뒤에만
// service_role 로 삭제를 대신 해 줍니다.
//
// 배포할 때 "Verify JWT"(JWT 검증)를 켜 두어야 합니다(로그인한 사람만 호출할 수 있어야 하므로).
// 필요한 환경 변수: SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 는 Supabase Edge
// Functions 에 자동으로 들어 있어 따로 설정하지 않아도 됩니다(다른 함수와 동일).
//
// 요청: POST JSON { action: 'delete', userId: string }
// 응답: JSON { ok: true } 또는 { error: string } (+ 4xx/5xx 상태 코드)

import { createClient } from 'npm:@supabase/supabase-js@2'

// ── CORS (activity-ai 와 동일한 허용 목록) ──────────────────────────────────
const ALLOWED_ORIGINS = ['https://ydms005.github.io', 'http://localhost:5173', 'http://localhost:4173']

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
    Vary: 'Origin',
  }
}

function jsonResponse(cors: Record<string, string>, status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json; charset=utf-8' } })
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  const cors = corsHeaders(req)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return jsonResponse(cors, 405, { error: 'method_not_allowed' })

  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization')
  if (!authHeader) return jsonResponse(cors, 401, { error: 'unauthorized' })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('admin-users: 서버 설정 누락 (환경 변수 확인 필요)')
    return jsonResponse(cors, 500, { error: 'server_error' })
  }

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return jsonResponse(cors, 400, { error: 'invalid_json' })
  }
  if (!isRecord(rawBody) || rawBody.action !== 'delete' || typeof rawBody.userId !== 'string' || !UUID_RE.test(rawBody.userId)) {
    return jsonResponse(cors, 400, { error: 'invalid_body' })
  }
  const targetId = rawBody.userId

  // 1) 호출한 사람이 실제로 로그인한 사용자인지 확인
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } })
  const { data: userData, error: userErr } = await authClient.auth.getUser()
  if (userErr || !userData?.user) return jsonResponse(cors, 401, { error: 'unauthorized' })
  const caller = userData.user

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // 2) 호출한 사람이 관리자(role = 'admin')인지 확인 (RLS 를 우회하는 service_role 클라이언트로 직접 조회)
  const { data: callerProfile, error: callerErr } = await admin.from('profiles').select('role').eq('id', caller.id).maybeSingle()
  if (callerErr) {
    console.error('admin-users: 호출자 프로필 조회 실패', callerErr.message)
    return jsonResponse(cors, 500, { error: 'server_error' })
  }
  if (callerProfile?.role !== 'admin') return jsonResponse(cors, 403, { error: 'forbidden' })

  if (targetId === caller.id) return jsonResponse(cors, 400, { error: 'cannot_delete_self' })

  // 3) 대상이 관리자면 거절 (관리자끼리는 SQL Editor 에서 역할을 바꾼 뒤 탈퇴하도록)
  const { data: targetProfile, error: targetErr } = await admin.from('profiles').select('role').eq('id', targetId).maybeSingle()
  if (targetErr) {
    console.error('admin-users: 대상 프로필 조회 실패', targetErr.message)
    return jsonResponse(cors, 500, { error: 'server_error' })
  }
  if (!targetProfile) return jsonResponse(cors, 404, { error: 'not_found' })
  if (targetProfile.role === 'admin') return jsonResponse(cors, 400, { error: 'cannot_delete_admin' })

  // 4) 계정 삭제 (auth.users 를 지우면 profiles·questions·answers·activities·favorites 가 on delete cascade 로 함께 지워짐)
  const { error: deleteErr } = await admin.auth.admin.deleteUser(targetId)
  if (deleteErr) {
    console.error('admin-users: 계정 삭제 실패', deleteErr.message)
    return jsonResponse(cors, 500, { error: 'delete_failed' })
  }

  return jsonResponse(cors, 200, { ok: true })
})
