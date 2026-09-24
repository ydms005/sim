import { useEffect, useState } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * 뒤로·앞으로 가기로 이 화면에 돌아온 직후 잠깐(두 프레임) true.
 *
 * 대학 카드는 화면 밖이면 그리지 않고(content-visibility: auto) 어림 높이로 자리만 잡습니다.
 * 한 번 그린 카드는 실제 높이를 기억하지만, 돌아와서 새로 만든 목록은 아직 아무 높이도 모릅니다.
 * 그 상태로 ScrollRestoration 이 저장해 둔 위치로 스크롤하면 위쪽 카드들의 높이 차이만큼
 * (데스크톱에서 수십~백여 px) 어긋나므로, 이 값이 true 인 동안 카드를 모두 그려 실제 높이를 기억시킵니다.
 */
export function useRenderAllOnPop(): boolean {
  const { key } = useLocation()
  const navType = useNavigationType()
  const [entry, setEntry] = useState(key)
  const [all, setAll] = useState(navType === 'POP')

  // 같은 화면 안에서 뒤로 가기(예: 홈 필터 기록)로 목록이 바뀐 경우도 복원 전에 다시 그리게 합니다.
  if (entry !== key) {
    setEntry(key)
    if (navType === 'POP') setAll(true)
  }

  useEffect(() => {
    if (!all) return
    // 첫 프레임에서 카드 크기가 기록된 뒤 다시 화면 밖 카드를 건너뜁니다.
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setAll(false))
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [all, entry])

  return all
}

/** 대학 카드 그리드에 붙이는 클래스: 화면 밖 카드도 모두 그립니다 (UnivCard 의 링크가 content-visibility: auto) */
export const RENDER_ALL_CARDS = '[&_a]:[content-visibility:visible]'
