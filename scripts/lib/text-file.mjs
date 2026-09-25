// CSV 파일 읽기 (Node 전용). 브라우저에서는 csv.mjs 의 decodeText 를 바로 씁니다.
import fs from 'node:fs'
import { decodeText } from './csv.mjs'

/**
 * 파일을 읽어 텍스트로 돌려줍니다. UTF-8 이 아니면 EUC-KR(CP949)로 다시 시도합니다.
 * @param {string} file
 * @returns {{ text: string, encoding: 'utf-8' | 'euc-kr' }}
 */
export function readTextFile(file) {
  return decodeText(fs.readFileSync(file))
}
