import { useEffect } from 'react'
import { SITE_NAME } from '../config'

/**
 * 브라우저 탭 제목: '건국대학교 지난 경쟁률 · 대학길잡이'. title 이 없으면 사이트 이름만.
 * null 이면 건드리지 않습니다(하위 화면이 제목을 정하는 경우).
 */
export function useDocumentTitle(title?: string | null) {
  useEffect(() => {
    if (title === null) return
    document.title = title ? `${title} · ${SITE_NAME}` : SITE_NAME
  }, [title])
}
