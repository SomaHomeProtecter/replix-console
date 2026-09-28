import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Avatar from './Avatar'

describe('Avatar(HP-268)', () => {
  it('프로필 사진이 있으면 사진을 쓴다', () => {
    render(<Avatar url="https://cdn.example/9.png" name="스포일러꾼" />)
    expect(screen.getByRole('presentation')).toHaveAttribute('src', 'https://cdn.example/9.png')
  })

  it('사진이 없으면 이름 첫 글자로 대체한다', () => {
    render(<Avatar url={null} name="스포일러꾼" />)
    expect(screen.getByText('스')).toBeInTheDocument()
  })

  it('이름도 없으면 물음표 — 빈 원을 두지 않는다', () => {
    render(<Avatar url={null} name={null} />)
    expect(screen.getByText('?')).toBeInTheDocument()
  })

  /**
   * 프로필 사진은 S3에 있고 퍼블릭 정책이 GetObject만 허용해 **없는 키는 404가 아니라 403**이다.
   * 그대로 두면 운영 화면에 깨진 이미지 아이콘이 박혀 "이 계정이 이상한가?"로 오독될 수 있다.
   */
  it('사진이 깨지면 조용히 글자 아바타로 돌아간다', () => {
    render(<Avatar url="https://cdn.example/gone.png" name="스포일러꾼" />)

    fireEvent.error(screen.getByRole('presentation'))

    expect(screen.queryByRole('presentation')).not.toBeInTheDocument()
    expect(screen.getByText('스')).toBeInTheDocument()
  })

  it('이미지는 장식이다 — 이름이 옆에 있으므로 스크린리더가 두 번 읽지 않게 alt를 비운다', () => {
    render(<Avatar url="https://cdn.example/9.png" name="스포일러꾼" />)
    expect(screen.getByRole('presentation')).toHaveAttribute('alt', '')
  })
})
