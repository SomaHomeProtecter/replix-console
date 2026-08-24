import { NavLink } from 'react-router'

export default function FeatureControlTabs() {
  return (
    <nav className="control-tabs" aria-label="기능 제어 메뉴">
      <NavLink to="/feature-control" end>기능 목록</NavLink>
      <NavLink to="/feature-control/change-sets">변경 세트</NavLink>
    </nav>
  )
}
