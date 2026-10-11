import { useEffect } from 'react'
import { BrowserRouter, useLocation } from 'react-router'
import { ModerationRoutes } from '@moderation/routes'
import IncidentPrimaryBanner from '@moderation/components/IncidentPrimaryBanner'
import UserSearch from '@moderation/components/UserSearch'
import { env } from '@moderation/env'
import { useWriting, WritingProvider } from '@moderation/writing'
import { notifyLocationChanged } from '../navigation'
import { moderationBasename } from '../sections'
import Shell from '../shell/Shell'

const WRITING_TITLE = '조치를 처리하는 중입니다 — 끝나면 이동할 수 있습니다'

/** 조치 라우터가 자기 링크로 주소를 바꾸면 틀의 메뉴 켜짐 표시가 따라오게 알린다. */
function LocationBridge() {
  const location = useLocation()
  useEffect(() => { notifyLocationChanged() }, [location])
  return null
}

function ModerationFrame({ path }: { path: string }) {
  const { writing } = useWriting()
  const title = writing ? WRITING_TITLE : undefined
  return (
    <Shell
        section="moderation" path={path} locked={writing} lockedTitle={title}
        search={<UserSearch disabled={writing} disabledTitle={title} />}
        banner={<IncidentPrimaryBanner />}>
      <main className="content">
        <ModerationRoutes />
      </main>
    </Shell>
  )
}

/**
 * 조치 구역 — 조치 콘솔의 라우터(basename = /moderation/&lt;env&gt;, HP-456)를 그대로 두고 그 안에 공용 틀을 그린다.
 * 틀이 라우터 안에 있어야 톱바 사용자 검색이 지금 보던 화면을 기억해 상세의 '돌아가기'가 그 화면을 가리킨다.
 *
 * <p>주소가 이 페이지의 서버와 다르면(환경 조각이 없거나 다른 서버) 새로 연다 — 부팅의 initEnv가 정본 주소로 바꾸고
 * 그 서버로 로그인한다. 콘솔 안 이동은 서버가 바뀌면 처음부터 새로 열므로(navigation.ts) 평소에는 일어나지 않는다.
 */
export default function ModerationSection({ path }: { path: string }) {
  const basename = moderationBasename(env.environment)
  const pathname = path.split('?')[0] ?? ''
  const inside = pathname === basename || pathname.startsWith(`${basename}/`)
  useEffect(() => {
    if (!inside) window.location.replace(path)
  }, [inside, path])
  if (!inside) return null
  return (
    <BrowserRouter basename={basename}>
      <LocationBridge />
      <WritingProvider>
        <ModerationFrame path={path} />
      </WritingProvider>
    </BrowserRouter>
  )
}
