import { useEffect } from 'react'
import { SITE_NAME } from '../config'

/** 브라우저 탭 제목: '건국대학교 지난 경쟁률 · 대학길잡이'. title 이 없으면 사이트 이름만 */
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${SITE_NAME}` : SITE_NAME
  }, [title])
}
