import { describe, expect, it } from 'vitest'
import { FEATURE_CONTROL_TABS, featureControlTitle } from './FeatureControlTabs'

describe('기능 제어 탭 제목(HP-529)', () => {
  it('일곱 화면이 저마다 다른 제목을 갖는다 — 기능 제어 · <탭 이름>', () => {
    const titles = FEATURE_CONTROL_TABS.map(({ path }) => featureControlTitle(path))
    expect(new Set(titles).size).toBe(FEATURE_CONTROL_TABS.length)
    expect(featureControlTitle('/feature-control/change-sets')).toBe('기능 제어 · 변경 세트')
  })
})
