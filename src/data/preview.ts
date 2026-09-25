import { useSyncExternalStore } from 'react'
import type { TrendRow, UnivDetail, University } from './types'

/**
 * 관리 화면(/admin)의 '이 데이터로 사이트 미리보기' 상태.
 *
 * 미리보기 중에는 api.ts 가 public/data/*.json 을 받지 않고 여기 저장된 데이터를 돌려줍니다.
 * 데이터는 이 탭의 sessionStorage 에만 저장되므로(새로고침해도 유지, 탭을 닫으면 사라짐) 실제 사이트나
 * 다른 사람에게는 아무 영향이 없습니다. 함께 올린 PDF 는 브라우저 메모리의 임시 주소(object URL)로만 보여 주므로
 * 새로고침하면 사라집니다.
 */
export interface PreviewData {
  universities: University[]
  trends: TrendRow[]
  details: Record<string, UnivDetail>
  /** 미리보기에 쓴 파일 이름들 (안내용) */
  sources: string[]
  createdAt: string
}

const KEY = 'sim-admin-preview-v1'

let data: PreviewData | null = load()
/** public/ 기준 경로 → 함께 올린 PDF 의 임시 주소 */
let fileUrls = new Map<string, string>()
const listeners = new Set<() => void>()

function load(): PreviewData | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as PreviewData) : null
  } catch {
    return null
  }
}

function emit() {
  for (const l of listeners) l()
}

export function getPreview(): PreviewData | null {
  return data
}

/** 미리보기 시작. 저장 공간이 부족해 sessionStorage 에 못 넣어도 이 탭에서는(새로고침 전까지) 미리보기가 됩니다. */
export function startPreview(next: PreviewData, files: Map<string, Blob>) {
  for (const url of fileUrls.values()) URL.revokeObjectURL(url)
  fileUrls = new Map([...files].map(([path, blob]) => [path, URL.createObjectURL(blob)]))
  data = next
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // 용량 초과 등: 메모리에만 둡니다.
  }
  emit()
}

export function endPreview() {
  for (const url of fileUrls.values()) URL.revokeObjectURL(url)
  fileUrls = new Map()
  data = null
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // 무시
  }
  emit()
}

/** 미리보기 중 함께 올린 PDF 의 임시 주소 (없으면 undefined) */
export function previewFileUrl(path: string): string | undefined {
  return data ? fileUrls.get(path.replace(/^\/+/, '').normalize('NFC')) : undefined
}

/** 미리보기 중 함께 올린 PDF 가 있는지 (새로고침하면 사라짐) */
export const previewHasFiles = () => fileUrls.size > 0

export function subscribePreview(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function usePreview(): PreviewData | null {
  return useSyncExternalStore(subscribePreview, getPreview, getPreview)
}
