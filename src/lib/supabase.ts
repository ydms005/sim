import type { SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config'

/**
 * Supabase(로그인·찜·커뮤니티 서버) 연결.
 * 라이브러리가 꽤 커서(수십 KB) 처음 화면에는 넣지 않고, 로그인했거나 커뮤니티를 열 때처럼 필요할 때 받습니다.
 */
let clientPromise: Promise<SupabaseClient> | null = null

export function getSupabase(): Promise<SupabaseClient> {
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          // 구글 로그인 뒤 돌아온 주소의 ?code= 를 로그인 정보로 바꾸고 주소에서 지웁니다(PKCE 방식).
          flowType: 'pkce',
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true,
        },
      }),
    )
    clientPromise.catch(() => {
      clientPromise = null
    })
  }
  return clientPromise
}

/** supabase-js 가 로그인 정보를 저장하는 localStorage 키 (sb-<프로젝트ID>-auth-token) */
export const AUTH_STORAGE_KEY = (() => {
  try {
    return `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`
  } catch {
    return 'sb-auth-token'
  }
})()

/** 이 브라우저에 로그인 기록이 남아 있는지 (라이브러리를 받지 않고 확인) */
export function hasStoredSession(): boolean {
  try {
    return !!localStorage.getItem(AUTH_STORAGE_KEY)
  } catch {
    return false
  }
}
