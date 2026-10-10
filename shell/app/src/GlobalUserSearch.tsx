import { useEffect } from 'react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router'
import UserSearch from '@moderation/components/UserSearch'
import { env } from '@moderation/env'
import { navigate } from './navigation'
import { moderationBasename } from './sections'

const IDLE = '/__console-search'

/** 검색 결과의 링크(/users/42)를 콘솔 안 이동으로 넘기고, 검색 칸은 제자리로 돌린다. */
function ForwardToModeration() {
  const location = useLocation()
  const go = useNavigate()
  useEffect(() => {
    if (location.pathname === IDLE) return
    navigate(`${moderationBasename(env.environment)}${location.pathname}${location.search}`)
    go(IDLE, { replace: true })
  }, [location, go])
  return null
}

/**
 * 홈·시딩 화면의 톱바 사용자 검색. 조치 콘솔의 검색(HP-301)을 그대로 쓰되, 조치 라우터 밖이라 작은 메모리 라우터에
 * 띄우고 결과를 고르면 같은 서버의 조치 사용자 상세로 옮긴다. 조치 구역 안에서는 조치 라우터에 직접 붙은 검색을 쓴다.
 */
export default function GlobalUserSearch() {
  return (
    <MemoryRouter initialEntries={[IDLE]}>
      <UserSearch disabled={false} />
      <ForwardToModeration />
    </MemoryRouter>
  )
}
