import { useEffect, useState } from 'react'

/**
 * 1분마다 지금 시각을 새로 준다.
 *
 * <p>없으면 시각에 기댄 표기가 <b>렌더 시점에 굳는다</b> — 콘솔을 열어 둔 채 두는 흔한 사용(벽에
 * 띄운 큐 화면)에서 경계를 넘긴 값이 계속 옛 모습으로 남는다. 큐의 경과 뱃지는 24h·48h 경계가
 * (HP-296), 정지 현황판은 만료 경계가(HP-300) 그렇다 — 하필 "지금 어떤가"가 화면의 전부인
 * 곳들이라, 굳으면 그 화면의 존재 이유가 사라진다.
 *
 * <p>분 단위면 충분하다 — 두 곳 모두 경계가 시간·일 단위다.
 *
 * <p><b>한 화면은 한 시각을 본다.</b> 쓰는 쪽은 이 값을 받아 판정 함수들에 <i>넘겨야</i> 한다.
 * 각자 {@code new Date()}를 부르면 같은 렌더 안에서도 시각이 갈려, 현황판의 칩이 센 갈래와
 * 그 아래 행이 말하는 갈래가 어긋나는 순간이 생긴다.
 */
export function useMinuteTick(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  return now
}
