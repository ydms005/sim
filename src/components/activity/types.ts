/** 활동정리 화면에서 지금 무엇을 보고 있는지 (왼쪽 목록에서 고른 것) */
export type Selection = { kind: 'doc'; id: string } | { kind: 'card'; id: number } | null
