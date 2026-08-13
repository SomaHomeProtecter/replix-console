import { describe, expect, it } from 'vitest'
import { isTypingTarget, shortcutKey } from './queueKeys'

describe('isTypingTarget', () => {
  const el = (html: string) => {
    const host = document.createElement('div')
    host.innerHTML = html
    return host.firstElementChild as HTMLElement
  }

  it('textarea와 문자 input은 단축키를 막는다', () => {
    expect(isTypingTarget(el('<textarea></textarea>'))).toBe(true)
    expect(isTypingTarget(el('<input type="text">'))).toBe(true)
    expect(isTypingTarget(el('<input type="search">'))).toBe(true)
  })

  it('라디오·체크박스·버튼은 문자 입력 자리가 아니다', () => {
    expect(isTypingTarget(el('<input type="radio">'))).toBe(false)
    expect(isTypingTarget(el('<input type="checkbox">'))).toBe(false)
    expect(isTypingTarget(el('<button></button>'))).toBe(false)
  })

  it('contentEditable과 비요소 target을 가른다', () => {
    const editable = el('<div></div>')
    Object.defineProperty(editable, 'isContentEditable', { value: true })
    expect(isTypingTarget(editable)).toBe(true)
    expect(isTypingTarget(document)).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})

describe('shortcutKey', () => {
  it('대소문자 논리 키를 소문자로 정규화한다', () => {
    expect(shortcutKey('B')).toBe('b')
    expect(shortcutKey('x')).toBe('x')
  })

  it('한글 IME 결과·기능키·기호는 조치 키로 해석하지 않는다', () => {
    expect(shortcutKey('ㅠ')).toBeNull()
    expect(shortcutKey('Enter')).toBeNull()
    expect(shortcutKey('/')).toBeNull()
  })
})
