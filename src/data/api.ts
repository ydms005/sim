import { useCallback, useEffect, useMemo, useState } from 'react'
import { assetUrl } from '../config'
import { getPreview, previewFileUrl, subscribePreview } from './preview'
import type { TrendRow, UnivDetail, University } from './types'

const cache = new Map<string, Promise<unknown>>()
/** 이미 받아 둔 JSON (다시 방문한 화면을 로딩 없이 바로 그리기 위해) */
const resolved = new Map<string, unknown>()

// 관리 화면의 미리보기를 켜거나 끄면 받아 둔 데이터를 버리고 새로 읽습니다.
subscribePreview(() => {
  cache.clear()
  resolved.clear()
})

/** 미리보기 중이면 public/data 대신 미리보기 데이터에서 찾습니다. (없는 파일이면 null) */
function previewJson(path: string): unknown {
  const p = getPreview()
  if (!p) return undefined
  if (path === UNIVERSITIES) return p.universities
  if (path === TRENDS) return p.trends
  const m = /^data\/univ\/(\d+)\.json$/.exec(path)
  return m ? (p.details[m[1]] ?? null) : null
}

function fetchJson<T>(path: string): Promise<T> {
  let p = cache.get(path) as Promise<T> | undefined
  if (!p) {
    const fromPreview = previewJson(path)
    if (fromPreview !== undefined) {
      if (fromPreview === null) return Promise.reject(new Error(`404 ${path} (미리보기)`))
      resolved.set(path, fromPreview)
      p = Promise.resolve(fromPreview as T)
      cache.set(path, p)
      return p
    }
    p = fetch(assetUrl(path)).then(async (res) => {
      if (!res.ok) throw new Error(`${res.status} ${path}`)
      const data = (await res.json()) as T
      resolved.set(path, data)
      return data
    })
    p.catch(() => cache.delete(path))
    cache.set(path, p)
  }
  return p
}

const peek = <T>(path: string) => resolved.get(path) as T | undefined

const UNIVERSITIES = 'data/universities.json'
const TRENDS = 'data/trends.json'
const detailPath = (id: number) => `data/univ/${id}.json`

/**
 * 모집요강·자료실 PDF 주소. 미리보기 중 관리 화면에서 함께 올린 PDF 면 그 임시 주소를, 아니면 assetUrl() 을 씁니다.
 */
export function fileUrl(path: string): string {
  return previewFileUrl(path) ?? assetUrl(path)
}

export const loadUniversities = () => fetchJson<University[]>(UNIVERSITIES)
export const loadTrends = () => fetchJson<TrendRow[]>(TRENDS)

/** 대학 상세 파일(univ/{id}.json)이 있는 대학인지. 예전 데이터(hasDetail 없음)는 hasData 로 판단 */
export const hasDetailFile = (u: University) => u.hasDetail ?? u.hasData

/**
 * 대학 상세 데이터. 상세 파일이 없는 대학이거나 없는 id 면 null.
 * 목록의 hasDetail 을 먼저 확인하므로 없는 파일을 요청해 404 가 나는 일이 없습니다.
 * 파일이 있어야 하는데 받지 못하면(네트워크 오류 등) '데이터 없음'과 구분되도록 오류를 그대로 던집니다.
 */
export async function loadUnivDetail(id: number): Promise<UnivDetail | null> {
  const univ = (await loadUniversities()).find((u) => u.id === id)
  if (!univ || !hasDetailFile(univ)) return null
  return fetchJson<UnivDetail>(detailPath(id))
}

/** loadUnivDetail 결과를 이미 알고 있으면 바로 돌려줍니다. (모르면 undefined) */
export function peekUnivDetail(id: number): UnivDetail | null | undefined {
  const list = peek<University[]>(UNIVERSITIES)
  if (!list) return undefined
  const univ = list.find((u) => u.id === id)
  if (!univ || !hasDetailFile(univ)) return null
  return peek<UnivDetail>(detailPath(id))
}

export interface AsyncState<T> {
  data: T | undefined
  loading: boolean
  error: Error | undefined
  /** 실패했을 때 다시 불러오기 (페이지 새로고침 없이) */
  retry: () => void
}

type LoadState<T> = Omit<AsyncState<T>, 'retry'>

/**
 * 간단한 비동기 로더 훅. deps 가 바뀌거나 retry() 를 부르면 다시 불러옵니다.
 * peekFn 이 값을 돌려주면(이미 받아 둔 데이터) 로딩 없이 바로 그 값으로 그립니다.
 */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[], peekFn?: () => T | undefined): AsyncState<T> {
  const [state, setState] = useState<LoadState<T>>(() => {
    const v = peekFn?.()
    return v === undefined ? { data: undefined, loading: true, error: undefined } : { data: v, loading: false, error: undefined }
  })
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  useEffect(() => {
    let alive = true
    const v = peekFn?.()
    if (v !== undefined) {
      setState((s) => (s.data === v && !s.loading ? s : { data: v, loading: false, error: undefined }))
      return
    }
    setState((s) => ({ data: s.data, loading: true, error: undefined }))
    load().then(
      (data) => alive && setState({ data, loading: false, error: undefined }),
      (error: Error) => alive && setState({ data: undefined, loading: false, error }),
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt])
  return useMemo(() => ({ ...state, retry }), [state, retry])
}

export const useUniversities = () => useAsync(loadUniversities, [], () => peek<University[]>(UNIVERSITIES))
export const useTrends = () => useAsync(loadTrends, [], () => peek<TrendRow[]>(TRENDS))
