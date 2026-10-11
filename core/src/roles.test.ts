import { describe, expect, it } from 'vitest'
import { can, CAPABILITIES, hasConsoleRole, SHOWN_CAPABILITIES } from './roles'

describe('hasConsoleRole', () => {
  it('콘솔 역할이 하나라도 있으면 들어온다', () => {
    expect(hasConsoleRole(['offline_access', 'feature_flag_operator'])).toBe(true)
    expect(hasConsoleRole(['admin_console_viewer'])).toBe(true)
  })

  it('일반 회원 역할뿐이면 권한 없음 화면으로 간다', () => {
    expect(hasConsoleRole(['offline_access', 'uma_authorization', 'default-roles-replix'])).toBe(false)
    expect(hasConsoleRole([])).toBe(false)
  })
})

describe('can — 할 일마다 허락하는 역할(BE SecurityConfig와 같은 집합)', () => {
  it('조회 전용 역할은 보기만 한다', () => {
    expect(can(['admin_console_viewer'], 'view')).toBe(true)
    expect(can(['admin_console_viewer'], 'moderate')).toBe(false)
    expect(can(['admin_console_viewer'], 'operateFeatures')).toBe(false)
  })

  it('admin은 모든 일을 한다', () => {
    for (const capability of Object.keys(CAPABILITIES) as (keyof typeof CAPABILITIES)[]) {
      expect(can(['admin'], capability)).toBe(true)
    }
  })

  it('기능 제어 역할은 기능 제어와 인시던트 메모만 한다', () => {
    expect(can(['feature_flag_operator'], 'operateFeatures')).toBe(true)
    expect(can(['feature_flag_operator'], 'note')).toBe(true)
    expect(can(['feature_flag_operator'], 'moderate')).toBe(false)
    expect(can(['feature_flag_operator'], 'approveProd')).toBe(false)
  })

  it('권한 없음 화면의 표는 네 줄이다(인시던트 메모는 보이지 않는다)', () => {
    expect(SHOWN_CAPABILITIES).toEqual(['view', 'moderate', 'operateFeatures', 'approveProd'])
  })
})
