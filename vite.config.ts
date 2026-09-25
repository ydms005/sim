import { copyFileSync, cpSync, createReadStream, existsSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages 프로젝트 사이트(https://<user>.github.io/sim/)에 맞춘 기본 경로.
// 사용자 지정 도메인을 쓰면 BASE_PATH=/ 로 빌드하세요. (GitHub Actions 배포는 저장소 주소에 맞춰 자동으로 넘겨 줍니다)
const base = process.env.BASE_PATH ?? '/sim/'

/**
 * GitHub Pages 는 /sim/univ/3/competition 같은 주소를 새로고침하면 404 를 냅니다.
 * 빌드가 끝나면 index.html 을 404.html 로 복사해, 없는 주소에서도 앱이 떠서 라우터가 화면을 그리게 합니다.
 */
function spaFallback(): Plugin {
  let outDir = ''
  return {
    name: 'spa-404-fallback',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    writeBundle(options) {
      const dir = options.dir ?? outDir
      const index = join(dir, 'index.html')
      if (!existsSync(index)) return
      copyFileSync(index, join(dir, '404.html'))
    },
  }
}

/**
 * pdf.js 가 필요할 때 받아 가는 파일(한글 CMap·표준 글꼴·이미지 디코더 wasm·ICC)을 사이트에 함께 올립니다.
 * CDN(jsdelivr)이 막힌 학교망에서도 PDF 가 보이도록 /sim/pdfjs/ 아래에서 직접 제공합니다.
 * react-pdf 가 고정한 pdfjs-dist 와 같은 버전의 파일이어야 합니다. (npm 이 한 벌만 설치)
 */
const PDFJS_DIRS = ['cmaps', 'standard_fonts', 'wasm', 'iccs']
/** 스크립트 실행용 QuickJS 는 쓰지 않으므로(react-pdf 는 PDF 내 스크립트를 끔) 빼서 용량을 줄입니다. */
const skipPdfjsFile = (file: string) => basename(file).startsWith('quickjs')
const PDFJS_TYPES: Record<string, string> = {
  '.bcmap': 'application/octet-stream',
  '.pfb': 'application/octet-stream',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.js': 'text/javascript',
  '.icc': 'application/vnd.iccprofile',
}

function pdfjsAssets(): Plugin {
  const pkgDir = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))
  let outDir = ''
  let mount = ''
  return {
    name: 'pdfjs-assets',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
      mount = `${config.base}pdfjs/`
    },
    // 개발 서버: node_modules 에서 바로 읽어 줍니다.
    configureServer(server) {
      server.middlewares.use(mount, (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '')
        const file = resolve(pkgDir, rel)
        const top = rel.split('/')[0]
        if (!PDFJS_DIRS.includes(top) || !file.startsWith(pkgDir + sep) || skipPdfjsFile(file)) return next()
        if (!existsSync(file) || !statSync(file).isFile()) return next()
        res.setHeader('Content-Type', PDFJS_TYPES[extname(file)] ?? 'application/octet-stream')
        createReadStream(file).pipe(res)
      })
    },
    // 빌드: dist/pdfjs/ 로 복사합니다.
    writeBundle(options) {
      const dir = options.dir ?? outDir
      for (const d of PDFJS_DIRS) {
        cpSync(join(pkgDir, d), join(dir, 'pdfjs', d), { recursive: true, filter: (src) => !skipPdfjsFile(src) })
      }
    },
  }
}

/** 이 라이브러리가 든 공유 청크의 파일 이름 */
const NAMED_CHUNKS: [RegExp, string][] = [
  [/node_modules[\\/]recharts[\\/]/, 'charts'], // 지난 경쟁률·경쟁률 추세 화면에서만 받음
  [/node_modules[\\/]react-router[\\/]/, 'router'],
  [/node_modules[\\/]@supabase[\\/]/, 'supabase'], // 로그인·커뮤니티를 쓸 때만 받음
]

export default defineConfig({
  base,
  plugins: [react(), tailwindcss(), spaFallback(), pdfjsAssets()],
  resolve: {
    // pdfjs-dist 6 의 기본(modern) 빌드는 아주 새로운 문법·기능을 써서 구형 브라우저에서 깨질 수 있어,
    // 같은 버전의 legacy(트랜스파일·폴리필 포함) 빌드를 씁니다. 워커도 legacy 를 씁니다(PdfViewerImpl.tsx).
    alias: [{ find: /^pdfjs-dist$/, replacement: 'pdfjs-dist/legacy/build/pdf.mjs' }],
  },
  build: {
    // pdf.js(약 1MB)·그래프 라이브러리는 필요한 화면에서만 따로 받으므로 경고 기준을 넉넉히
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      output: {
        // 청크 구성은 그대로 두고 이름만 알아보기 쉽게 (기본은 청크의 첫 모듈 이름이라 헷갈림)
        chunkFileNames: (chunk) => {
          const hit = NAMED_CHUNKS.find(([re]) => chunk.moduleIds.some((id) => re.test(id)))
          return `assets/${hit ? hit[1] : '[name]'}-[hash].js`
        },
      },
    },
  },
})
