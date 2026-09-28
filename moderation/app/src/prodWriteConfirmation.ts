export interface ProductionWriteSummary {
  target: string
  change: string
  reason: string
}

type Handler = (summary: ProductionWriteSummary) => Promise<void>
let handler: Handler | null = null

export function registerProductionWriteGuard(next: Handler): () => void {
  handler = next
  return () => {
    if (handler === next) handler = null
  }
}

/** PROD 요청 전용. 확인 UI가 배선되지 않은 상태에서는 쓰기를 허용하지 않는다(fail-closed). */
export function confirmProductionWrite(summary: ProductionWriteSummary): Promise<void> {
  if (!handler) return Promise.reject(new Error('PROD 쓰기 확인 화면이 준비되지 않아 요청을 차단했습니다'))
  return handler(summary)
}
