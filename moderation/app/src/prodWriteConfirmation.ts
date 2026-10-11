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

/**
 * 묶음 확인으로 받은 승인(HP-514) — 'PROD'를 한 번 입력해 <b>정해진 건수</b>의 쓰기를 보낸다.
 *
 * <p><b>왜 필요한가</b>: 작성자 글 일괄 가림은 고른 건마다 단건 API를 부른다(감사 1건 1행).
 * 그런데 확인 겹은 창을 하나만 띄우고 떠 있는 동안 들어온 요청을 거절하므로, 동시에 흘려보낸
 * 요청 중 첫 건만 확인 창에 닿고 나머지는 전부 실패했다 — "N건 중 N−1건 실패"가 PROD에서
 * 늘 나던 이유다. 건마다 창을 띄우면 40건에 'PROD'를 40번 쳐야 한다.
 *
 * <p>HP-337이 요구하는 것은 "prod 쓰기 전 환경·대상·diff·사유를 다시 확인"이다. 묶음 확인은
 * 대상 N건 전체를 한 창에 보여 주고 받으므로 그 조건을 묶음 단위로 충족한다. 대신 승인은
 * <b>확인한 건수만큼만</b> 쓸 수 있다 — 남는 승인으로 다른 쓰기가 확인 없이 나가지 않게.
 *
 * <p>발급 여부는 이 모듈 안의 WeakMap이 기억한다. 같은 모양의 객체를 다른 곳에서 만들어
 * 넘겨도 승인으로 인정되지 않는다 — 확인 창을 거치지 않고는 손에 넣을 수 없다.
 */
export interface ProductionWriteApproval {
  readonly summary: ProductionWriteSummary
  readonly count: number
}

const issued = new WeakMap<ProductionWriteApproval, { remaining: number }>()

/** 묶음 전체를 한 번 확인받는다. 취소하면 reject — 그 경우 요청을 하나도 보내지 않아야 한다. */
export async function approveProductionBatch(
  summary: ProductionWriteSummary, count: number,
): Promise<ProductionWriteApproval> {
  await confirmProductionWrite(summary)
  const approval: ProductionWriteApproval = Object.freeze({ summary, count })
  issued.set(approval, { remaining: count })
  return approval
}

export function isProductionApproval(value: unknown): value is ProductionWriteApproval {
  return typeof value === 'object' && value !== null && issued.has(value as ProductionWriteApproval)
}

/** 승인 한 건을 쓴다. 다 썼거나 발급되지 않은 승인이면 false — 호출부는 전송을 막는다. */
export function spendProductionApproval(approval: ProductionWriteApproval): boolean {
  const slot = issued.get(approval)
  if (!slot || slot.remaining <= 0) return false
  slot.remaining -= 1
  return true
}
