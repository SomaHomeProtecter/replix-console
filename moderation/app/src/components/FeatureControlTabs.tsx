import { NavLink } from 'react-router'

/** 기능 제어 탭 — 탭 이름이 곧 각 화면 제목의 뒷부분이다(featureControlTitle). */
export const FEATURE_CONTROL_TABS = [
  { path: '/feature-control', label: '기능 목록' },
  { path: '/feature-control/change-sets', label: '변경 세트' },
  { path: '/feature-control/presets', label: '장애 대응 프리셋' },
  { path: '/feature-control/notices', label: '사용자 공지' },
  { path: '/feature-control/drift', label: 'Drift 해소' },
  { path: '/feature-control/incident-mode', label: '인시던트' },
  { path: '/feature-control/incidents', label: '참조 타임라인' },
] as const

export type FeatureControlPath = (typeof FEATURE_CONTROL_TABS)[number]['path']

/**
 * 탭 화면의 제목(HP-529). 일곱 화면이 모두 "기능 제어"라 제목만 보고는 어느 탭인지 알 수 없었다 — 북마크·브라우저
 * 기록·화면 읽기 프로그램이 모두 같은 이름을 읽었다.
 */
export function featureControlTitle(path: FeatureControlPath): string {
  const tab = FEATURE_CONTROL_TABS.find((candidate) => candidate.path === path)
  return tab ? `기능 제어 · ${tab.label}` : '기능 제어'
}

export default function FeatureControlTabs() {
  return (
    <nav className="control-tabs" aria-label="기능 제어 메뉴">
      {FEATURE_CONTROL_TABS.map(({ path, label }) => (
        <NavLink key={path} to={path} end={path === '/feature-control'}>{label}</NavLink>
      ))}
    </nav>
  )
}
