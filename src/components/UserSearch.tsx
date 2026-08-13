import { type FormEvent, type MouseEvent, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { searchUsers } from '../api/admin'
import type { UserSearchRow, UserStatus } from '../api/types'
import Avatar from './Avatar'

const STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: '활성',
  SUSPENDED: '정지',
  WITHDRAWN: '탈퇴',
}

function origin(pathname: string): { from: string; label: string } {
  if (pathname === '/actions') return { from: pathname, label: '조치 로그' }
  if (pathname === '/suspensions') return { from: pathname, label: '정지 현황' }
  if (pathname.startsWith('/users/')) return { from: pathname, label: '사용자 상세' }
  return { from: '/', label: '신고 큐' }
}

interface Props {
  disabled: boolean
  disabledTitle?: string
}

/** HP-301: 전체 회원 목록 없이 상세로 바로 들어가는 톱바 검색. */
export default function UserSearch({ disabled, disabledTitle }: Props) {
  const location = useLocation()
  const requestSequence = useRef(0)
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<UserSearchRow[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const open = loading || searched || error !== null

  const resetResult = () => {
    requestSequence.current += 1
    setRows([])
    setLoading(false)
    setSearched(false)
    setError(null)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = query.trim()
    if (disabled || trimmed === '') {
      resetResult()
      return
    }

    const sequence = ++requestSequence.current
    setLoading(true)
    setSearched(false)
    setError(null)
    try {
      const result = await searchUsers(trimmed)
      if (sequence !== requestSequence.current) return
      setRows(result.rows)
      setSearched(true)
    } catch (e) {
      if (sequence !== requestSequence.current) return
      setRows([])
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (sequence === requestSequence.current) setLoading(false)
    }
  }

  const onResultClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (disabled) {
      event.preventDefault()
      return
    }
    resetResult()
    setQuery('')
  }

  return (
    <div className="user-search">
      <form className="user-search-form" role="search" onSubmit={(event) => void submit(event)}>
        <input
            type="search" value={query} aria-label="사용자 검색"
            aria-expanded={open} autoComplete="off" maxLength={320}
            placeholder="ID · 닉네임 · 이메일" disabled={disabled} title={disabledTitle}
            onKeyDown={(event) => {
              if (event.key === 'Escape') resetResult()
            }}
            onChange={(event) => {
              setQuery(event.target.value)
              resetResult()
            }} />
        <button type="submit" disabled={disabled || query.trim() === ''} title={disabledTitle}>
          검색
        </button>
      </form>
      {open && (
        <div className="user-search-results" aria-live="polite">
          {loading && <div className="user-search-note">검색 중…</div>}
          {error && <div className="user-search-note error" role="alert">{error}</div>}
          {searched && rows.length === 0 && (
            <div className="user-search-note">검색 결과가 없습니다</div>
          )}
          {searched && rows.length > 0 && (
            <ul aria-label="사용자 검색 결과">
              {rows.map((row) => (
                <li key={row.userId}>
                  <Link
                      to={`/users/${row.userId}`} state={origin(location.pathname)}
                      aria-disabled={disabled || undefined} onClick={onResultClick}>
                    <Avatar url={row.profileImageUrl} name={row.displayName} />
                    <span className="user-search-identity">
                      <strong>{row.displayName}</strong>
                      <span>userId {row.userId}</span>
                    </span>
                    <span className={`user-search-status ${row.status.toLowerCase()}`}>
                      {STATUS_LABELS[row.status]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
