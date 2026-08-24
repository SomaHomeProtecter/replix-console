import { NavLink } from 'react-router'

export default function FeatureControlTabs() {
  return (
    <nav className="control-tabs" aria-label="기능 제어 메뉴">
      <NavLink to="/feature-control" end>기능 목록</NavLink>
      <NavLink to="/feature-control/change-sets">변경 세트</NavLink>
      <NavLink to="/feature-control/presets">장애 대응 프리셋</NavLink>
      <NavLink to="/feature-control/notices">사용자 공지</NavLink>
      <NavLink to="/feature-control/drift">Drift 해소</NavLink>
    </nav>
  )
}
