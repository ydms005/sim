import { useCallback, useSyncExternalStore } from 'react'
import { getAuthState, subscribeAuth, type AuthState } from '../auth/store'
import { toAppError, unwrap } from '../lib/dbErrors'
import { getSupabase } from '../lib/supabase'
import { showToast } from '../lib/toast'

/**
 * 찜한 대학 목록.
 *  - 로그인 전: 이 브라우저(localStorage)에만 저장합니다.
 *  - 로그인 + 이용 동의 후: 내 계정(Supabase favorites 테이블)에 저장해 다른 기기에서도 보입니다.
 *    이때 이 브라우저에 찜해 둔 대학이 있으면 계정으로 옮기고(합치고) 브라우저 목록은 비웁니다.
 *    (학교 공용 컴퓨터에서 로그아웃한 뒤 다음 사람에게 내 찜 목록이 보이지 않도록)
 *  - 서버를 쓸 수 없으면(데이터베이스 설정 전 등) 로그인해도 브라우저 저장 방식을 그대로 씁니다.
 */

const KEY = 'favorite-univs'
const listeners = new Set<() => void>()
let local: number[] = read() ?? []
/** 저장이 실패한 적이 있으면(사생활 보호 모드 등) 이후로는 메모리 값만 믿습니다. */
let persisted = true

/** 계정에 저장된 목록을 쓰는 중이면 그 사용자 ID */
let serverUser: string | null = null
let server: number[] = []
/** 화면에 보여 줄 목록 */
let snapshot: number[] = local

/** 저장된 목록. 저장소를 쓸 수 없는 환경이면 null */
function read(): number[] | null {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : []
  } catch {
    return null
  }
}

function emit() {
  snapshot = serverUser ? server : local
  listeners.forEach((l) => l())
}

function writeLocal(ids: number[]) {
  local = ids
  try {
    if (ids.length) localStorage.setItem(KEY, JSON.stringify(ids))
    else localStorage.removeItem(KEY)
  } catch {
    /* 저장 불가 환경에서는 메모리에만 유지 */
    persisted = false
  }
  emit()
}

/** 다른 탭·창에서 찜 목록을 바꾸면 이 탭에도 반영합니다. (storage 이벤트는 바꾼 탭 자신에는 오지 않음) */
function onStorage(e: StorageEvent) {
  if (e.key !== KEY && e.key !== null) return
  local = read() ?? local
  emit()
}

function subscribe(l: () => void) {
  if (listeners.size === 0) {
    // 구독이 없던 사이 다른 탭에서 바뀌었을 수 있으니 새로 읽습니다.
    const fresh = read()
    if (fresh && fresh.join() !== local.join()) {
      local = fresh
      snapshot = serverUser ? server : local
    }
    window.addEventListener('storage', onStorage)
  }
  listeners.add(l)
  return () => {
    listeners.delete(l)
    if (listeners.size === 0) window.removeEventListener('storage', onStorage)
  }
}

// ---------------------------------------------------------------------------
// 계정 저장 (로그인 상태를 따라 전환)

/** 계정 저장을 쓸 사용자 (로그인 + 이용 동의). 아니면 null */
const eligibleUser = (s: AuthState) => (s.status === 'signedIn' && s.profile?.agreed_at ? s.userId : null)

let syncingFor: string | null = null

async function connectServer(uid: string) {
  syncingFor = uid
  try {
    const client = await getSupabase()
    const rows = unwrap(await client.from('favorites').select('univ_id').order('created_at'))
    let ids = (rows as { univ_id: number }[]).map((r) => r.univ_id)
    // 이 브라우저에 찜해 둔 대학을 계정으로 옮깁니다.
    const localNow = (persisted && read()) || local
    const missing = localNow.filter((id) => !ids.includes(id))
    if (missing.length) {
      const res = await client.from('favorites').insert(missing.map((univ_id) => ({ univ_id })))
      // 다른 탭에서 동시에 옮겨 겹친 경우(23505)는 괜찮습니다.
      if (res.error && res.error.code !== '23505') throw res.error
      ids = [...ids, ...missing]
      showToast(`이 브라우저에 찜해 둔 대학 ${missing.length}곳을 내 계정으로 옮겼어요.`)
    }
    if (syncingFor !== uid || eligibleUser(getAuthState()) !== uid) return
    server = ids
    serverUser = uid
    writeLocal([]) // 옮긴 뒤에는 브라우저 목록을 비웁니다(emit 포함)
  } catch (err) {
    // 테이블이 아직 없거나 연결 실패: 브라우저 저장 방식을 계속 씁니다.
    const e = toAppError(err)
    if (e.kind !== 'not_ready') console.warn('[찜] 계정 목록을 불러오지 못해 브라우저 저장을 씁니다:', e.message)
  } finally {
    if (syncingFor === uid) syncingFor = null
  }
}

subscribeAuth(() => {
  const uid = eligibleUser(getAuthState())
  if (uid === serverUser || (uid && uid === syncingFor)) return
  if (!uid) {
    // 로그아웃: 브라우저 목록(옮긴 뒤라 보통 비어 있음)으로 돌아갑니다.
    serverUser = null
    server = []
    syncingFor = null
    local = read() ?? local
    emit()
    return
  }
  void connectServer(uid)
})

async function toggleServer(id: number) {
  const uid = serverUser
  const had = server.includes(id)
  server = had ? server.filter((x) => x !== id) : [...server, id]
  emit()
  try {
    const client = await getSupabase()
    const res = had
      ? await client.from('favorites').delete().eq('univ_id', id)
      : await client.from('favorites').insert({ univ_id: id })
    if (res.error && !(res.error.code === '23505' && !had)) throw toAppError(res.error, res.status)
  } catch (err) {
    if (serverUser !== uid) return
    // 실패하면 되돌립니다.
    server = had ? [...server, id] : server.filter((x) => x !== id)
    emit()
    showToast(`찜을 저장하지 못했어요. ${toAppError(err).message}`, 'error')
  }
}

/** 찜 추가/해제. 다른 탭의 변경을 덮어쓰지 않도록 저장소를 다시 읽은 뒤 씁니다. */
function toggleFavorite(id: number) {
  if (serverUser) return void toggleServer(id)
  const base = (persisted && read()) || local // 저장소를 못 쓰는 환경이면 메모리 값 기준
  writeLocal(base.includes(id) ? base.filter((x) => x !== id) : [...base, id])
}

/** 찜한 대학 목록 */
export function useFavorites() {
  const ids = useSyncExternalStore(subscribe, () => snapshot)
  const has = useCallback((id: number) => ids.includes(id), [ids])
  return { ids, toggle: toggleFavorite, has }
}

/** 대학 하나의 찜 여부. 다른 대학의 찜이 바뀌어도 다시 그리지 않습니다. (카드 목록용) */
export function useFavorite(id: number) {
  const liked = useSyncExternalStore(subscribe, () => snapshot.includes(id))
  const toggle = useCallback(() => toggleFavorite(id), [id])
  return { liked, toggle }
}

/** 찜 목록이 계정에 저장되는 중인지 (내 정보 화면 안내용) */
export function useFavoritesSynced() {
  return useSyncExternalStore(subscribe, () => serverUser !== null)
}
