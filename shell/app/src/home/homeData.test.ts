import { describe, expect, it } from 'vitest'
import { airDateLabel } from './homeData'

describe('airDateLabel', () => {
  it('방영일을 월/일(요일)로 쓴다 — 한국 시간 기준', () => {
    expect(airDateLabel('2026-10-07')).toBe('10/07 (수)')
    expect(airDateLabel('2026-10-08')).toBe('10/08 (목)')
  })
})
