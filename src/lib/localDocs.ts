/**
 * 학생이 올린 PDF 원본(생기부 등)을 이 브라우저의 IndexedDB에만 저장합니다. 서버(우리 데이터베이스)로는
 * 절대 올리지 않습니다. 계정이 다르면(같은 컴퓨터를 다른 학생이 써도) 서로의 자료가 안 보이도록
 * Supabase 로그인 id로 걸러서 읽습니다.
 */

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/** 목록에 보여 줄 정도의 가벼운 정보 (PDF 파일·전체 글은 뺌) */
export interface LocalDocMeta {
  id: string
  userId: string
  name: string
  size: number
  pageCount: number
  addedAt: number
  updatedAt: number
  hasSummary: boolean
}

export interface LocalDoc extends LocalDocMeta {
  pdf: Blob
  /** PDF에서 그대로 뽑은 글 (가리기 전) */
  text: string
  /** AI로 보낼, 개인정보를 가린 글. 학생이 미리보기에서 고친 내용까지 반영됩니다. */
  maskedText: string
  /** 이 문서에서 가리기 미리보기를 한 번이라도 확인했는지 (첫 AI 사용 전에 한 번은 보여 줘야 함) */
  maskReviewed: boolean
  /** 가리기 규칙 버전. 규칙이 바뀌면(MASK_VERSION 증가) 다시 확인을 받습니다. */
  maskVersion?: number
  summary: string
  chat: ChatMessage[]
  memo: string
}

const DB_NAME = 'activity-docs'
const DB_VERSION = 1
const STORE = 'docs'
const BY_USER = 'by_user'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('이 브라우저는 자료 저장(IndexedDB)을 지원하지 않아요.'))
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' })
          store.createIndex(BY_USER, 'userId')
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error ?? new Error('자료 저장소를 여는 데 실패했어요.'))
    })
    dbPromise.catch(() => {
      dbPromise = null
    })
  }
  return dbPromise
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('자료 저장소 작업에 실패했어요.'))
  })
}

function toMeta(d: LocalDoc): LocalDocMeta {
  return {
    id: d.id,
    userId: d.userId,
    name: d.name,
    size: d.size,
    pageCount: d.pageCount,
    addedAt: d.addedAt,
    updatedAt: d.updatedAt,
    hasSummary: d.summary.trim().length > 0,
  }
}

export async function listDocs(userId: string): Promise<LocalDocMeta[]> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readonly')
  const rows = await wrap(tx.objectStore(STORE).index(BY_USER).getAll(userId) as IDBRequest<LocalDoc[]>)
  return rows.map(toMeta).sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getDoc(userId: string, id: string): Promise<LocalDoc | null> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readonly')
  const row = await wrap(tx.objectStore(STORE).get(id) as IDBRequest<LocalDoc | undefined>)
  return row && row.userId === userId ? row : null
}

export async function putDoc(doc: LocalDoc): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  await wrap(tx.objectStore(STORE).put(doc))
}

export async function deleteDoc(userId: string, id: string): Promise<void> {
  const existing = await getDoc(userId, id)
  if (!existing) return
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  await wrap(tx.objectStore(STORE).delete(id))
}

/** '이 기기에서 내 자료 모두 지우기' 버튼과 로그아웃 시 자동 지우기에서 씁니다. */
export async function clearAllForUser(userId: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  const store = tx.objectStore(STORE)
  const rows = await wrap(store.index(BY_USER).getAllKeys(userId) as IDBRequest<IDBValidKey[]>)
  await Promise.all(rows.map((key) => wrap(store.delete(key))))
}

export function newDocId(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

// ── 로그아웃 시 자동으로 지우기 설정 (기기별, 브라우저 저장소) ─────────────────
const AUTO_CLEAR_KEY = 'activity-docs-auto-clear-on-logout'

/** 기본값 켜짐: 학교 공용 컴퓨터에서 로그아웃을 잊어도 다음 사람이 못 보도록 안전하게 시작합니다. */
export function getAutoClearOnLogout(): boolean {
  try {
    const v = localStorage.getItem(AUTO_CLEAR_KEY)
    return v === null ? true : v === '1'
  } catch {
    return true
  }
}

export function setAutoClearOnLogout(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_CLEAR_KEY, enabled ? '1' : '0')
  } catch {
    /* 저장소를 못 쓰면 무시 (다음에 열었을 때 다시 기본값으로 보임) */
  }
}
