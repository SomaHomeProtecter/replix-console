import { describe, expect, it } from 'vitest'
import { makeReportItem } from './test/fixtures'
import { isTypingTarget, nextOpenId } from './queueKeys'

/**
 * 조치 뒤 목록을 다시 읽으면 필터가 OPEN인 한 방금 처리한 건이 목록에서 빠진다 — 그래서 다음
 * 대상은 <b>재조회 전에</b> 잡아 두어야 한다(HP-295 함정 ①). 이 함수가 그 "잡아 두기"다.
 */
describe('nextOpenId — 조치 후 이어서 처리할 다음 건', () => {
  const items = [
    makeReportItem({ id: 1, status: 'OPEN' }),
    makeReportItem({ id: 2, status: 'RESOLVED' }),
    makeReportItem({ id: 3, status: 'OPEN' }),
  ]

  it('현재 건 다음의 첫 열림 건을 준다 — 종결된 건은 건너뛴다', () => {
    expect(nextOpenId(items, 1)).toBe(3)
  })

  it('뒤에 열림 건이 없으면 null — 모달을 닫으라는 뜻이다', () => {
    expect(nextOpenId(items, 3)).toBeNull()
  })

  it('앞으로 되돌아가지 않는다 — 큐는 위에서부터 내려가는 동선이라 되감으면 맴돈다', () => {
    // id 3 앞에 열림(id 1)이 있어도 잡지 않는다
    expect(nextOpenId([items[0], items[2]], 3)).toBeNull()
  })

  it('목록에 없는 현재 건이면 null', () => {
    expect(nextOpenId(items, 999)).toBeNull()
  })

  it('빈 목록도 안전하다', () => {
    expect(nextOpenId([], 1)).toBeNull()
  })
})

/**
 * 메모에 "b"를 치는 순간 메시지가 가려지면 안 된다(HP-295 함정 ③). 반대로 점수 칩(라디오)에
 * 포커스가 있을 때는 단축키가 살아 있어야 한다 — 라디오는 글자를 받는 자리가 아니다.
 */
describe('isTypingTarget — 글자를 받는 자리에서는 단축키를 죽인다', () => {
  const el = (html: string) => {
    const host = document.createElement('div')
    host.innerHTML = html
    return host.firstElementChild as HTMLElement
  }

  it('textarea는 타이핑 자리다', () => {
    expect(isTypingTarget(el('<textarea></textarea>'))).toBe(true)
  })

  it('텍스트 input도 타이핑 자리다', () => {
    expect(isTypingTarget(el('<input type="text">'))).toBe(true)
    expect(isTypingTarget(el('<input type="search">'))).toBe(true)
  })

  it('라디오·체크박스는 아니다 — 점수 칩에 포커스가 있어도 조치 키는 살아 있어야 한다', () => {
    expect(isTypingTarget(el('<input type="radio">'))).toBe(false)
    expect(isTypingTarget(el('<input type="checkbox">'))).toBe(false)
  })

  it('버튼·행 같은 보통 요소는 아니다', () => {
    expect(isTypingTarget(el('<button></button>'))).toBe(false)
    expect(isTypingTarget(el('<tr></tr>'))).toBe(false)
  })

  it('contentEditable도 타이핑 자리다', () => {
    const div = el('<div></div>')
    Object.defineProperty(div, 'isContentEditable', { value: true })
    expect(isTypingTarget(div)).toBe(true)
  })

  it('target이 요소가 아니면(document 등) 아니다', () => {
    expect(isTypingTarget(null)).toBe(false)
  })
})
