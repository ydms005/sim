/**
 * react-pdf 11 이 쓰는 pdfjs-dist 6 는 아주 새로운 자바스크립트 기능을 씁니다.
 * (Map.getOrInsertComputed, Math.sumPrecise, Iterator 헬퍼, Promise.try, URL.parse, Uint8Array base64 등)
 * vite.config.ts 에서 메인 스레드도 legacy(폴리필 포함) 빌드로 바꿔 두었지만, 안전망으로
 * 구형 크롬·사파리·삼성 인터넷에 없는 기능만 채워 넣습니다. (이미 있으면 아무것도 하지 않음)
 * 반드시 pdfjs 를 불러오기 전에 실행되어야 하므로 PdfViewer.tsx 가 이 파일을 먼저 불러온 뒤
 * 뷰어 본체(pdfjs 포함)를 동적으로 import 합니다. 워커 쪽은 폴리필이 들어 있는 legacy 워커를 씁니다.
 */

function define(target: object, name: PropertyKey, value: unknown) {
  if (name in target) return
  Object.defineProperty(target, name, { value, writable: true, configurable: true, enumerable: false })
}

// ── Iterator 전역 객체와 헬퍼 ───────────────────────────────────
type AnyIterator = Iterator<unknown>
type Callback = (value: unknown, index: number) => unknown

const IteratorPrototype: object = Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()))
const g = globalThis as unknown as Record<string, unknown>
if (typeof g.Iterator !== 'function') {
  const IteratorCtor = function Iterator() {} as unknown as { prototype: object }
  IteratorCtor.prototype = IteratorPrototype
  define(globalThis, 'Iterator', IteratorCtor)
}

function* values(it: AnyIterator): Generator<unknown, void, undefined> {
  for (;;) {
    const r = it.next()
    if (r.done) return
    yield r.value
  }
}

const iteratorHelpers: Record<string, (this: AnyIterator, ...args: never[]) => unknown> = {
  map(this: AnyIterator, fn: Callback) {
    const it = this
    return (function* () {
      let i = 0
      for (const v of values(it)) yield fn(v, i++)
    })()
  },
  filter(this: AnyIterator, fn: Callback) {
    const it = this
    return (function* () {
      let i = 0
      for (const v of values(it)) if (fn(v, i++)) yield v
    })()
  },
  flatMap(this: AnyIterator, fn: (value: unknown, index: number) => Iterable<unknown>) {
    const it = this
    return (function* () {
      let i = 0
      for (const v of values(it)) yield* fn(v, i++)
    })()
  },
  take(this: AnyIterator, limit: number) {
    const it = this
    return (function* () {
      let n = 0
      if (n >= limit) return
      for (const v of values(it)) {
        yield v
        if (++n >= limit) return
      }
    })()
  },
  drop(this: AnyIterator, count: number) {
    const it = this
    return (function* () {
      let n = 0
      for (const v of values(it)) if (n++ >= count) yield v
    })()
  },
  toArray(this: AnyIterator) {
    return [...values(this)]
  },
  forEach(this: AnyIterator, fn: Callback) {
    let i = 0
    for (const v of values(this)) fn(v, i++)
  },
  some(this: AnyIterator, fn: Callback) {
    let i = 0
    for (const v of values(this)) if (fn(v, i++)) return true
    return false
  },
  every(this: AnyIterator, fn: Callback) {
    let i = 0
    for (const v of values(this)) if (!fn(v, i++)) return false
    return true
  },
  find(this: AnyIterator, fn: Callback) {
    let i = 0
    for (const v of values(this)) if (fn(v, i++)) return v
    return undefined
  },
  reduce(this: AnyIterator, ...args: never[]) {
    const [fn, initial] = args as unknown as [(acc: unknown, value: unknown, index: number) => unknown, unknown]
    let i = 0
    let acc = initial
    let started = args.length > 1
    for (const v of values(this)) {
      if (!started) {
        acc = v
        started = true
        i++
        continue
      }
      acc = fn(acc, v, i++)
    }
    if (!started) throw new TypeError('Reduce of empty iterator with no initial value')
    return acc
  },
}
for (const [name, fn] of Object.entries(iteratorHelpers)) define(IteratorPrototype, name, fn)

// ── Map / WeakMap: getOrInsert, getOrInsertComputed ─────────────
type KeyedStore = { has(key: unknown): boolean; get(key: unknown): unknown; set(key: unknown, value: unknown): unknown }
for (const proto of [Map.prototype, WeakMap.prototype]) {
  define(proto, 'getOrInsert', function (this: KeyedStore, key: unknown, value: unknown) {
    if (!this.has(key)) this.set(key, value)
    return this.get(key)
  })
  define(proto, 'getOrInsertComputed', function (this: KeyedStore, key: unknown, compute: (key: unknown) => unknown) {
    if (!this.has(key)) this.set(key, compute(key))
    return this.get(key)
  })
}

// ── Math.sumPrecise (Neumaier 보정 합) ──────────────────────────
define(Math, 'sumPrecise', (items: Iterable<number>) => {
  let sum = 0
  let comp = 0
  let any = false
  for (const x of items) {
    any = true
    const t = sum + x
    comp += Math.abs(sum) >= Math.abs(x) ? sum - t + x : x - t + sum
    sum = t
  }
  return any ? sum + comp : -0
})

// ── Promise.try, Promise.withResolvers ──────────────────────────
define(Promise, 'try', (fn: (...args: unknown[]) => unknown, ...args: unknown[]) => new Promise((resolve) => resolve(fn(...args))))
define(Promise, 'withResolvers', () => {
  let resolve!: (value: unknown) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
})

// ── URL.parse ──────────────────────────────────────────────────
define(URL, 'parse', (url: string | URL, base?: string | URL) => {
  try {
    return new URL(url, base)
  } catch {
    return null
  }
})

// ── Uint8Array.fromBase64 / toBase64 ────────────────────────────
define(Uint8Array, 'fromBase64', (text: string) => {
  const bin = atob(text.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
})
define(Uint8Array.prototype, 'toBase64', function (this: Uint8Array) {
  let bin = ''
  for (let i = 0; i < this.length; i += 0x8000) bin += String.fromCharCode(...this.subarray(i, i + 0x8000))
  return btoa(bin)
})

// ── ReadableStream 비동기 반복 (for await … of stream) ─────────────
if (typeof ReadableStream !== 'undefined') {
  define(ReadableStream.prototype, Symbol.asyncIterator, async function* (this: ReadableStream<unknown>) {
    const reader = this.getReader()
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) return
        yield value
      }
    } finally {
      reader.releaseLock()
    }
  })
}

export {}
