import { useState } from 'react'

/**
 * 사용자 아바타(HP-268) — 프로필 사진이 있으면 사진, 없으면 이름 첫 글자.
 *
 * <p><b>깨진 이미지를 글자로 되돌리는 이유:</b> 프로필 사진은 S3에 있고 퍼블릭 정책이 GetObject만
 * 허용해서 <b>없는 키는 404가 아니라 403</b>이 온다. 그대로 두면 콘솔에 깨진 이미지 아이콘이
 * 박히는데, 운영자가 볼 화면에서 그건 "이 계정이 이상한가?"로 오독될 여지가 있다 — 조용히
 * 글자 아바타로 돌린다.
 *
 * <p>이름이 옆에 항상 함께 나오므로 이미지는 장식이다 — {@code alt=""}로 스크린리더가 이름을
 * 두 번 읽지 않게 한다.
 */
export default function Avatar({ url, name, className = 'ua' }: {
  url: string | null
  name: string | null
  className?: string
}) {
  const [broken, setBroken] = useState(false)
  const initial = (name ?? '?').slice(0, 1)

  if (!url || broken) {
    return <span className={className}>{initial}</span>
  }
  return (
    <img
        className={`${className} img`} src={url} alt=""
        onError={() => setBroken(true)} />
  )
}
