import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigationType, useSearchParams } from 'react-router-dom'
import { FOUND_TYPES, REGIONS, type FoundType, type Region } from '../../data/types'

export interface HomeFilters {
  region?: Region
  type?: FoundType
  /** 찜한 대학만 보기 */
  fav: boolean
  q: string
}

/** 입력창이 직접 바꾼 URL 인지 표시하는 history state */
interface InputState {
  fromInput?: boolean
}

/** 검색어를 URL 에 반영하기까지 기다리는 시간 (히스토리 API 과다 호출 방지) */
const URL_DELAY = 300

function readParams(params: URLSearchParams): HomeFilters {
  const region = params.get('region')
  const type = params.get('type')
  return {
    region: REGIONS.find((r) => r === region),
    type: FOUND_TYPES.find((t) => t === type),
    fav: params.get('fav') === '1',
    q: params.get('q') ?? '',
  }
}

function toParams(f: HomeFilters): URLSearchParams {
  const p = new URLSearchParams()
  if (f.region) p.set('region', f.region)
  if (f.type) p.set('type', f.type)
  if (f.fav) p.set('fav', '1')
  const q = f.q.trim()
  if (q) p.set('q', q)
  return p
}

/**
 * 홈 화면 필터 상태 (?region=서울&type=사립&fav=1&q=…).
 * - 지역·구분·찜 필터는 URL 이 곧 상태이고, 바꿀 때마다 히스토리에 쌓여 뒤로가기가 됩니다.
 * - 검색어는 입력 중 한글 조합이 끊기지 않도록 로컬 상태로 두고, 잠시 뒤 URL 을 replace 로 맞춥니다.
 */
export function useHomeFilters() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navType = useNavigationType()
  const url = readParams(params)
  const [q, setQuery] = useState(url.q)
  const timer = useRef<number | undefined>(undefined)

  // 뒤로가기·링크 이동 등 바깥에서 URL 이 바뀌면 입력창을 URL 에 맞춥니다.
  useEffect(() => {
    const fromInput = (location.state as InputState | null)?.fromInput === true
    if (navType === 'POP' || !fromInput) {
      window.clearTimeout(timer.current)
      setQuery(url.q)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  /** 필터를 바꿔 URL 에 기록. input=true 면 검색어 입력으로 보고 replace 합니다. */
  const commit = (next: Partial<HomeFilters>, input = false) => {
    window.clearTimeout(timer.current)
    setParams(toParams({ ...url, q, ...next }), {
      replace: input,
      preventScrollReset: true,
      state: input ? ({ fromInput: true } satisfies InputState) : undefined,
    })
  }

  /** 검색어 입력: 목록은 바로 거르고, URL 은 잠시 뒤에 맞춥니다. */
  const setQ = (value: string) => {
    setQuery(value)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          const v = value.trim()
          if (v) p.set('q', v)
          else p.delete('q')
          return p
        },
        { replace: true, preventScrollReset: true, state: { fromInput: true } satisfies InputState },
      )
    }, URL_DELAY)
  }

  const reset = () => {
    setQuery('')
    commit({ region: undefined, type: undefined, fav: false, q: '' })
  }

  const active = !!(url.region || url.type || url.fav || q.trim())

  return { region: url.region, type: url.type, fav: url.fav, q, setQ, commit, reset, active }
}
