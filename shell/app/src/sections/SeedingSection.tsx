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
 * 등록 우회는 걷어 냈다.
 *
 * <p>주소의 화면·작품·회차가 바뀌면 시딩 화면을 처음부터 다시 그린다(key) — 왼쪽 메뉴·홈의 최근 회차·뒤로 가기가 모두
 * 주소로 온다. 시딩은 고른 작품·회차를 주소에 적을 때 replaceState만 쓰고 popstate를 내지 않는다(HP-526) — 고를
 * 때마다 다시 그려지지 않고, 새로고침·뒤로 가기는 그 회차로 돌아온다. 쿼리 없는 '회차 작업'으로 오면 시딩이 이 탭에서
 * 마지막으로 고른 회차를 연다.
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
