import { useCallback, useRef } from 'react'

/**
 * 늦게 도착한 응답이 새 결과를 덮지 못하게 한다(HP-527) — 초기 화면(신고 큐·조치 로그)의 loadSeq와 같은 규칙을
 * 나중 조치 화면과 시딩이 함께 쓰도록 공용 기반에 둔다. begin()이 돌려준 current()는 그 뒤에 begin()이 다시 불리면 false가 된다:
 * 새로고침을 연달아 누르거나 행을 빠르게 옮겨 고를 때, 먼저 보낸 느린 응답이 나중 결과 위에 그려지지 않는다.
 */
export function useLatestRequest(): () => () => boolean {
  const seq = useRef(0)
  return useCallback(() => {
    const mine = ++seq.current
    return () => mine === seq.current
  }, [])
}
