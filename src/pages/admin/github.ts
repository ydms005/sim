// 관리 화면의 'GitHub에 올리기': 개인 액세스 토큰으로 GitHub REST API 를 불러 파일들을 커밋 하나로 올립니다.
// 토큰은 이 브라우저의 localStorage 에만 저장하며, api.github.com 으로 보내는 요청 머리글 말고는 어디에도 쓰지 않습니다(로그 출력 금지).
import { GITHUB_BRANCH, GITHUB_REPO } from '../../config'
import type { UploadFile } from './analyze'

const TOKEN_KEY = 'sim-admin-github-token'
const API = 'https://api.github.com'

export function loadToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}
export function saveToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // 저장소를 못 쓰면 이번 화면에서만 씁니다.
  }
}
export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // 무시
  }
}

/** 사용자에게 보여 줄 한국어 오류 */
export class GitHubError extends Error {}

const branchPath = GITHUB_BRANCH.split('/').map(encodeURIComponent).join('/')
const repoPath = GITHUB_REPO.split('/').map(encodeURIComponent).join('/')

async function describe(res: Response, step: string): Promise<GitHubError> {
  let detail = ''
  try {
    const body = (await res.json()) as { message?: string }
    detail = body.message ?? ''
  } catch {
    // 본문 없음
  }
  const suffix = detail ? ` (GitHub 응답: ${detail})` : ''
  switch (res.status) {
    case 401:
      return new GitHubError(`토큰이 올바르지 않거나 만료되었습니다. 토큰을 다시 만들어 붙여 넣어 주세요.${suffix}`)
    case 403:
      if (res.headers.get('x-ratelimit-remaining') === '0') {
        return new GitHubError(`GitHub 요청 한도를 넘었습니다. 한 시간쯤 뒤에 다시 시도해 주세요.${suffix}`)
      }
      return new GitHubError(
        `이 토큰에는 ${GITHUB_REPO} 저장소에 파일을 쓸 권한이 없습니다. 토큰의 Repository access 에 ${GITHUB_REPO} 가 있고, ` +
          `Permissions 의 Contents 가 'Read and write' 인지 확인해 주세요.${suffix}`,
      )
    case 404:
      return new GitHubError(
        `저장소(${GITHUB_REPO}) 또는 브랜치(${GITHUB_BRANCH})를 찾을 수 없습니다. 토큰이 이 저장소에 접근할 수 있게 만들어졌는지 확인해 주세요 ` +
          `(권한이 없는 저장소는 GitHub 이 '찾을 수 없음'으로 답합니다). 브랜치 이름은 src/config.ts 의 GITHUB_BRANCH 입니다.${suffix}`,
      )
    case 409:
    case 422:
      return new GitHubError(
        `${step} 단계에서 GitHub 이 요청을 받아들이지 않았습니다. 그 사이 다른 변경이 먼저 올라갔을 수 있습니다. ` + `잠시 뒤 '올리기'를 다시 눌러 주세요.${suffix}`,
      )
    default:
      return new GitHubError(`${step} 단계에서 GitHub 오류가 났습니다(상태 ${res.status}). 잠시 뒤 다시 시도해 주세요.${suffix}`)
  }
}

async function call<T>(token: string, method: string, path: string, step: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new GitHubError('GitHub 에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요(학교망에서 github.com 이 막혀 있을 수도 있습니다).')
  }
  if (!res.ok) throw await describe(res, step)
  return (await res.json()) as T
}

/** 파일 → base64 (큰 파일도 스택이 넘치지 않도록 조금씩) */
async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

/** 토큰으로 저장소·브랜치를 읽을 수 있는지 확인 */
export async function checkAccess(token: string): Promise<void> {
  await call(token, 'GET', `/repos/${repoPath}/git/ref/heads/${branchPath}`, '연결 확인')
}

export interface CommitResult {
  sha: string
  url: string
  actionsUrl: string
}

/**
 * 파일들을 커밋 하나로 올립니다 (Git Data API: blob → tree → commit → 브랜치 이동).
 * 한 파일씩 올리면 파일마다 배포가 돌고 중간 상태가 배포될 수 있어, 한 번에 올립니다.
 */
export async function uploadFiles(
  token: string,
  files: UploadFile[],
  message: string,
  onProgress?: (text: string) => void,
): Promise<CommitResult> {
  onProgress?.('브랜치 정보를 확인하는 중…')
  const ref = await call<{ object: { sha: string } }>(token, 'GET', `/repos/${repoPath}/git/ref/heads/${branchPath}`, '브랜치 확인')
  const head = ref.object.sha
  const commit = await call<{ tree: { sha: string } }>(token, 'GET', `/repos/${repoPath}/git/commits/${head}`, '최근 커밋 확인')

  const tree: { path: string; mode: '100644'; type: 'blob'; sha: string }[] = []
  for (const [i, f] of files.entries()) {
    onProgress?.(`파일 올리는 중 (${i + 1}/${files.length}): ${f.path}`)
    const blob = await call<{ sha: string }>(token, 'POST', `/repos/${repoPath}/git/blobs`, '파일 올리기', {
      content: await toBase64(f.blob),
      encoding: 'base64',
    })
    tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha })
  }
  onProgress?.('커밋을 만드는 중…')
  const newTree = await call<{ sha: string }>(token, 'POST', `/repos/${repoPath}/git/trees`, '파일 목록 만들기', {
    base_tree: commit.tree.sha,
    tree,
  })
  const newCommit = await call<{ sha: string; html_url?: string }>(token, 'POST', `/repos/${repoPath}/git/commits`, '커밋 만들기', {
    message,
    tree: newTree.sha,
    parents: [head],
  })
  onProgress?.('브랜치에 반영하는 중…')
  await call(token, 'PATCH', `/repos/${repoPath}/git/refs/heads/${branchPath}`, '브랜치 반영', { sha: newCommit.sha, force: false })
  return {
    sha: newCommit.sha,
    url: newCommit.html_url ?? `https://github.com/${GITHUB_REPO}/commit/${newCommit.sha}`,
    actionsUrl: `https://github.com/${GITHUB_REPO}/actions`,
  }
}
