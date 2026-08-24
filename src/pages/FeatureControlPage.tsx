import { useCallback, useEffect, useMemo, useState } from 'react'
import { changeFeatureFlag, listFeatureFlags } from '../api/admin'
import type { FeatureFlagChange, FeatureFlagRow } from '../api/types'
import { realmRoles } from '../auth'
import { formatKstShort } from '../format'
import { useWriting } from '../writing'

type View = 'ALL' | 'ON' | 'OFF' | 'PARTIAL' | 'ATTENTION'

const VIEW_LABELS: Record<View, string> = {
  ALL: '전체', ON: 'ON', OFF: 'OFF', PARTIAL: '부분 적용', ATTENTION: '확인 필요',
}

function canChange() {
  const roles = realmRoles()
  return roles.includes('admin') || roles.includes('feature_flag_operator')
}

function statusOf(row: FeatureFlagRow) {
  if (!row.connected) return { label: '미연결', className: 'disconnected' }
  if (!row.converged) return { label: '적용 확인 중', className: 'pending' }
  if (!row.enabled) return { label: 'OFF', className: 'off' }
  if (row.rolloutPercentage < 100) return { label: '부분 적용', className: 'partial' }
  return { label: 'ON', className: 'on' }
}

function toLocalInput(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function ChangeDialog({ row, onClose, onChanged }: {
  row: FeatureFlagRow
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const [enabled, setEnabled] = useState(row.enabled)
  const [rollout, setRollout] = useState(row.rolloutPercentage)
  const [expiresAt, setExpiresAt] = useState(toLocalInput(row.expiresAt))
  const [owner, setOwner] = useState(row.owner)
  const [allowlist, setAllowlist] = useState(row.allowlistedUserIds.join(', '))
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { setWriting } = useWriting()

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [busy, onClose])

  const apply = async () => {
    const ids = allowlist.trim() === '' ? [] : allowlist.split(',').map((part) => Number(part.trim()))
    if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
      setError('allowlist는 쉼표로 구분한 양의 사용자 ID여야 합니다')
      return
    }
    if (!reason.trim()) {
      setError('변경 사유를 입력하세요')
      return
    }
    if (row.environment === 'PROD' && !enabled && !expiresAt) {
      setError('PROD 기능 중지는 만료 시각이 필요합니다')
      return
    }
    const change: FeatureFlagChange = {
      enabled, rolloutPercentage: rollout,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      owner: owner.trim(), allowlistedUserIds: [...new Set(ids)],
      expectedRevision: row.revision, reason: reason.trim(),
    }
    setBusy(true)
    setWriting(true)
    setError(null)
    try {
      await changeFeatureFlag(row.key, change)
      await onChanged()
      onClose()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(false)
      setWriting(false)
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation"
        onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <div className="dialog feature-dialog" role="dialog" aria-modal="true" aria-labelledby="feature-title">
        <button type="button" className="modal-close" aria-label="닫기" disabled={busy} onClick={onClose}>✕</button>
        <h2 id="feature-title">{row.displayName} 변경</h2>
        <p className="sub"><code>{row.key}</code> · revision {row.revision}</p>
        {error && <div className="error-box" role="alert">{error}</div>}
        <div className="feature-toggle" aria-label="기능 상태">
          <button type="button" className="chip-f" aria-pressed={enabled} disabled={busy}
              onClick={() => setEnabled(true)}>ON</button>
          <button type="button" className="chip-f" aria-pressed={!enabled} disabled={busy}
              onClick={() => setEnabled(false)}>OFF</button>
        </div>
        <div className="feature-form-grid">
          <label><span>Rollout</span><input type="number" min="0" max="100" value={rollout}
              disabled={busy} onChange={(e) => setRollout(Math.min(100, Math.max(0, Number(e.target.value))))} /></label>
          <label><span>만료 시각</span><input type="datetime-local" value={expiresAt}
              disabled={busy} onChange={(e) => setExpiresAt(e.target.value)} /></label>
          <label className="span2"><span>Owner</span><input value={owner} maxLength={100}
              disabled={busy} onChange={(e) => setOwner(e.target.value)} /></label>
          <label className="span2"><span>Allowlist 사용자 ID</span><input value={allowlist}
              placeholder="예: 17, 29" disabled={busy} onChange={(e) => setAllowlist(e.target.value)} /></label>
          <label className="span2"><span>변경 사유 <b>필수</b></span><textarea value={reason}
              maxLength={500} rows={3} disabled={busy} onChange={(e) => setReason(e.target.value)} /></label>
        </div>
        {!enabled && <div className="warnline">OFF는 신규 실행만 차단하며 기존 데이터와 관리 조치는 유지됩니다.</div>}
        <div className="dialog-actions">
          <button type="button" className="btn" disabled={busy} onClick={onClose}>취소</button>
          <button type="button" className="btn btn-blind" disabled={busy || !owner.trim()}
              onClick={() => void apply()}>{busy ? '적용 중…' : '변경 적용'}</button>
        </div>
      </div>
    </div>
  )
}

export default function FeatureControlPage() {
  const [rows, setRows] = useState<FeatureFlagRow[]>([])
  const [view, setView] = useState<View>('ALL')
  const [loading, setLoading] = useState(true)
  const [stale, setStale] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<FeatureFlagRow | null>(null)
  const writable = canChange()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await listFeatureFlags()
      setRows(result)
      setStale(false)
      setError(null)
    } catch (failure) {
      setStale(true)
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const counts = useMemo(() => ({
    ALL: rows.length,
    ON: rows.filter((row) => row.enabled && row.rolloutPercentage === 100).length,
    OFF: rows.filter((row) => !row.enabled).length,
    PARTIAL: rows.filter((row) => row.enabled && row.rolloutPercentage < 100).length,
    ATTENTION: rows.filter((row) => !row.connected || !row.converged).length,
  }), [rows])
  const visible = rows.filter((row) => view === 'ALL'
    || (view === 'ON' && row.enabled && row.rolloutPercentage === 100)
    || (view === 'OFF' && !row.enabled)
    || (view === 'PARTIAL' && row.enabled && row.rolloutPercentage < 100)
    || (view === 'ATTENTION' && (!row.connected || !row.converged)))

  return (
    <section className="feature-control" aria-label="기능 제어">
      <div className="board-head">
        <div><h1>기능 제어</h1><p>저장 상태와 실행 인스턴스의 적용 수렴을 함께 확인합니다.</p></div>
        <button type="button" className="btn refresh" disabled={loading} onClick={() => void load()}>새로고침</button>
      </div>
      <div className="filter-bar" aria-label="기능 상태 필터">
        {(Object.keys(VIEW_LABELS) as View[]).map((candidate) => (
          <button key={candidate} type="button" className="chip-f" aria-pressed={view === candidate}
              onClick={() => setView(candidate)}>{VIEW_LABELS[candidate]} <b>{counts[candidate]}</b></button>
        ))}
        <span className="filter-note">registry {rows[0]?.registryDigest.slice(0, 8) ?? '—'}</span>
      </div>
      {error && <div className="error-box" role="alert">목록 갱신 실패 — 변경을 잠갔습니다. {error}</div>}
      {loading && rows.length === 0 && <div className="page-status">불러오는 중…</div>}
      {!loading && !error && visible.length === 0 && <div className="empty-hint">조건에 맞는 기능이 없습니다</div>}
      {visible.length > 0 && (
        <div className="report-table-wrap">
          <table className="feature-table">
            <thead><tr><th>기능</th><th>상태</th><th>Rollout</th><th>Owner · 위험도</th><th>적용 상태</th><th>변경</th></tr></thead>
            <tbody>{visible.map((row) => {
              const status = statusOf(row)
              return (
                <tr key={row.key}>
                  <td className="feature-name"><strong>{row.displayName}</strong><code>{row.key}</code><span>{row.description}</span></td>
                  <td><span className={`feature-state ${status.className}`}>{status.label}</span></td>
                  <td className="mono">{row.rolloutPercentage}%</td>
                  <td><strong>{row.owner}</strong><span className="feature-meta">{row.risk}</span></td>
                  <td className="feature-runtime">
                    <strong>{row.activeInstances}개 활성 · 불일치 {row.mismatchedInstances}</strong>
                    <span>rev {row.revision} · {row.lastReportedAt ? formatKstShort(row.lastReportedAt) : '보고 없음'}</span>
                  </td>
                  <td><button type="button" className="btn" disabled={!writable || stale || !row.connected}
                      title={!writable ? '기능 제어 변경 권한이 없습니다' : stale ? '최신 목록 확인이 필요합니다' : undefined}
                      onClick={() => setSelected(row)}>변경</button></td>
                </tr>
              )
            })}</tbody>
          </table>
        </div>
      )}
      {selected && <ChangeDialog row={selected} onClose={() => setSelected(null)} onChanged={load} />}
    </section>
  )
}
