import { useEffect, useState } from 'react'
import { assetUrl } from '../config'
import type { TrendRow, UnivDetail, University } from './types'

const cache = new Map<string, Promise<unknown>>()

function fetchJson<T>(path: string): Promise<T> {
  let p = cache.get(path) as Promise<T> | undefined
  if (!p) {
    p = fetch(assetUrl(path)).then((res) => {
      if (!res.ok) throw new Error(`${res.status} ${path}`)
      return res.json() as Promise<T>
    })
    p.catch(() => cache.delete(path))
    cache.set(path, p)
  }
  return p
}

export const loadUniversities = () => fetchJson<University[]>('data/universities.json')
/** 데이터가 없는 대학이면 null */
export const loadUnivDetail = (id: number) =>
  fetchJson<UnivDetail>(`data/univ/${id}.json`).catch(() => null)
export const loadTrends = () => fetchJson<TrendRow[]>('data/trends.json')

export interface AsyncState<T> {
  data: T | undefined
  loading: boolean
  error: Error | undefined
}

/** 간단한 비동기 로더 훅. deps 가 바뀌면 다시 불러옵니다. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: undefined, loading: true, error: undefined })
  useEffect(() => {
    let alive = true
    setState((s) => ({ data: s.data, loading: true, error: undefined }))
    load().then(
      (data) => alive && setState({ data, loading: false, error: undefined }),
      (error: Error) => alive && setState({ data: undefined, loading: false, error }),
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return state
}

export const useUniversities = () => useAsync(loadUniversities, [])
export const useTrends = () => useAsync(loadTrends, [])
