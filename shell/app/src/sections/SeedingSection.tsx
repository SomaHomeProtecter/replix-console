import { SeedingWorkspace } from '@seeding/App'
import GlobalUserSearch from '../GlobalUserSearch'
import Shell from '../shell/Shell'

function idParam(params: URLSearchParams, name: string): number | null {
  const value = Number(params.get(name))
  return Number.isInteger(value) && value > 0 ? value : null
}

/**
 * 시딩 구역 — 회차 작업(기본)과 AI 프롬프트(?view=prompts)를 왼쪽 메뉴가 고른다. 홈의 최근 회차는
 * ?work=&episode= 로 그 회차를 바로 연다.
 *
 * <p>시딩 화면은 틀과 같은 문서에 그린다(HP-525). 시딩의 클래스는 모두 sd- 로 시작하고 색·버튼은 공용 기반(core)의
 * 토큰과 클래스를 쓰므로 조치·틀의 CSS와 서로 덮어쓰지 않는다 — 종전의 격리 영역(Shadow DOM, HP-506)과 Tailwind
 * 등록 우회는 걷어 냈다. 주소의 화면·작품·회차가 바뀌면 시딩 화면을 처음부터 다시 그린다(key).
 */
export default function SeedingSection({ path }: { path: string }) {
  const params = new URLSearchParams(path.includes('?') ? path.slice(path.indexOf('?')) : '')
  const view = params.get('view') === 'prompts' ? 'prompts' : 'work'
  const workId = idParam(params, 'work')
  const episodeId = idParam(params, 'episode')
  return (
    <Shell section="seeding" path={path} search={<GlobalUserSearch />}>
      <SeedingWorkspace key={`${view}:${workId}:${episodeId}`} view={view} workId={workId} episodeId={episodeId} />
    </Shell>
  )
}
