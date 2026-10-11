import ProductionWriteGuard from '@core/ProductionWriteGuard'
import { useCurrentPath } from './navigation'
import { sectionOf } from './sections'
import HomeSection from './sections/HomeSection'
import ModerationSection from './sections/ModerationSection'
import SeedingSection from './sections/SeedingSection'

/**
 * 운영 콘솔(HP-506). 주소 첫 조각이 구역을 고르고, 각 구역이 공용 틀(톱바·왼쪽 메뉴) 안에 자기 화면을 그린다.
 *
 * <p>PROD 쓰기 최종 확인(HP-337)은 콘솔 전체에 하나다 — 조치의 모든 PROD 쓰기와 시딩의 운영 넣기·지우기가 같은
 * 'PROD' 입력 창을 거친다. 확인 창이 걸려 있지 않으면 조치 API는 PROD 쓰기를 막는다(fail-closed).
 */
export default function ConsoleApp() {
  const path = useCurrentPath()
  const section = sectionOf(path.split('?')[0] ?? '/')
  return (
    <ProductionWriteGuard>
      {section === 'moderation' && <ModerationSection path={path} />}
      {section === 'seeding' && <SeedingSection path={path} />}
      {section === 'home' && <HomeSection path={path} />}
    </ProductionWriteGuard>
  )
}
