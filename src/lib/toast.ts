import { useSyncExternalStore } from 'react'

/** 화면 아래에 잠깐 떴다 사라지는 알림 (예: '로그아웃했어요', 오류 안내) */
export interface Toast {
  id: number
  message: string
  tone: 'info' | 'error'
}

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function showToast(message: string, tone: Toast['tone'] = 'info') {
  const id = nextId++
  toasts = [...toasts.filter((t) => t.message !== message), { id, message, tone }].slice(-3)
  emit()
  window.setTimeout(() => dismissToast(id), tone === 'error' ? 7000 : 4000)
}

export function dismissToast(id: number) {
  if (!toasts.some((t) => t.id === id)) return
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

export function useToasts() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => toasts,
  )
}
