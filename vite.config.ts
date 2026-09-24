import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages 프로젝트 사이트(https://<user>.github.io/sim/)에 맞춘 기본 경로.
// 사용자 지정 도메인을 쓰면 BASE_PATH=/ 로 빌드하세요.
const base = process.env.BASE_PATH ?? '/sim/'

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
})
