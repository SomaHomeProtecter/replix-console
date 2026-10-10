import { useLayoutEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { SeedingWorkspace } from '@seeding/App'
import seedingCss from '@seeding/index.css?inline'
import GlobalUserSearch from '../GlobalUserSearch'
import Shell from '../shell/Shell'

/* 격리 영역 안 뿌리 — 본문 자리를 채워야 시딩 왼쪽 작품·회차 칸의 바탕이 아래까지 내려온다. 글자 크기는 시딩을 단독으로
   띄울 때처럼 문서 기본(16px)에서 시작한다 — 그러지 않으면 조치 콘솔 본문 크기(13px)를 물려받는다. */
const FRAME_CSS = ':host{display:block;font-size:1rem}.seeding-root{height:100%}'

/* Tailwind v4는 테두리 모양·그림자·변형 같은 유틸리티를 @property로 등록한 변수(--tw-*)의 초깃값에 기댄다. 그런데
   브라우저는 격리 영역 안의 @property를 무시한다(등록은 문서 단위다) — 그대로 두면 시딩의 입력칸·카드 테두리가 사라진다
   (2026-10-10 실화면). 같은 등록 규칙만 문서에 한 번 올린다. --tw- 변수만 등록하므로 틀·조치 화면에는 닿지 않는다. */
const TAILWIND_PROPERTIES = (seedingCss.match(/@property\s+--tw-[\w-]+\s*\{[^}]*\}/g) ?? []).join('\n')

function registerTailwindProperties() {
  if (document.getElementById('seeding-tw-properties')) return
  const style = document.createElement('style')
  style.id = 'seeding-tw-properties'
  style.textContent = TAILWIND_PROPERTIES
  document.head.appendChild(style)
}

type SeedingView = { view: 'work' | 'prompts'; workId: number | null; episodeId: number | null }

/**
 * 시딩 화면을 격리 영역(Shadow DOM)에 그린다(HP-506).
 *
 * <p>시딩은 Tailwind(기본 초기화 규칙 포함)와 `.btn`·`.card`·`.pill`·`.note` 같은 자체 클래스를 쓰고, 조치 콘솔도
 * 같은 이름의 클래스를 전역 CSS로 쓴다. 한 페이지에 그대로 두면 서로의 버튼·표 모양을 덮어쓴다. 격리 영역은 바깥
 * CSS가 안으로, 안의 CSS가 바깥으로 넘지 못하게 하므로 두 도구의 화면을 고치지 않고 함께 둘 수 있다.
 *
 * <p>React 뿌리를 격리 영역 안에 따로 만든다 — 바깥 뿌리에서 포털로 넣으면 이벤트가 격리 영역 경계에서 대상이 바뀌어
 * React가 처리기를 찾지 못한다. 시딩은 로그인·PROD 확인을 모듈(@seeding/host)로 받으므로 컨텍스트를 나눌 필요가 없다.
 */
function IsolatedSeeding({ view, workId, episodeId }: SeedingView) {
  const hostRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<Root | null>(null)

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    registerTailwindProperties()
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = `${seedingCss}\n${FRAME_CSS}`
    const mount = document.createElement('div')
    mount.className = 'seeding-root'
    shadow.replaceChildren(style, mount)
    const root = createRoot(mount)
    rootRef.current = root
    return () => {
      rootRef.current = null
      // 렌더 도중에 다른 뿌리를 동기로 내리면 React가 경고한다 — 이번 렌더가 끝난 뒤 내린다.
      queueMicrotask(() => root.unmount())
    }
  }, [])

  useLayoutEffect(() => {
    rootRef.current?.render(
      <SeedingWorkspace key={`${view}:${workId}:${episodeId}`} view={view} workId={workId} episodeId={episodeId} />)
  }, [view, workId, episodeId])

  return <div ref={hostRef} className="cs-seeding-host" />
}

function idParam(params: URLSearchParams, name: string): number | null {
  const value = Number(params.get(name))
  return Number.isInteger(value) && value > 0 ? value : null
}

/**
 * 시딩 구역 — 회차 작업(기본)과 AI 프롬프트(?view=prompts)를 왼쪽 메뉴가 고른다. 홈의 최근 회차는
 * ?work=&episode= 로 그 회차를 바로 연다.
 */
export default function SeedingSection({ path }: { path: string }) {
  const params = new URLSearchParams(path.includes('?') ? path.slice(path.indexOf('?')) : '')
  const view = params.get('view') === 'prompts' ? 'prompts' : 'work'
  return (
    <Shell section="seeding" path={path} search={<GlobalUserSearch />}>
      <IsolatedSeeding view={view} workId={idParam(params, 'work')} episodeId={idParam(params, 'episode')} />
    </Shell>
  )
}
