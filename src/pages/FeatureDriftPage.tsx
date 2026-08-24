import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { createDriftReapplyChangeSet, listFeatureDrift } from '../api/admin'
import type { FeatureChangeSet, FeatureDriftReapply, FeatureDriftState } from '../api/types'
import { realmRoles } from '../auth'
import FeatureControlTabs from '../components/FeatureControlTabs'
import { env } from '../env'
import { formatKstShort } from '../format'
import { useWriting } from '../writing'

const STATUS_LABEL: Record<FeatureDriftState['status'], string> = {
  HEALTHY: '정상', PROPAGATING: '전파 중', DRIFT: 'Drift', STALE: 'Stale', NO_SIGNAL: '신호 없음',
}
const ACTION_LABEL: Record<string, string> = {
  WAIT_FOR_PROPAGATION: '관찰 구간까지 대기', CREATE_REAPPLY_DRAFT: '원하는 revision 재적용',
  CHECK_DEPLOYED_REVISION: '배포 revision 확인', CHECK_RUNTIME_INSTANCES: 'runtime 인스턴스 확인',
  CHECK_RUNTIME_REPORTING: '상태 보고 설정 확인',
}

function canOperate() {
  const roles = realmRoles()
  return roles.includes('admin') || roles.includes('feature_flag_operator')
}

function localInputToIso(value: string) {
  return value ? new Date(value).toISOString() : null
}

function ReapplyDialog({ drift, onClose, onCreated }: {
  drift: FeatureDriftState; onClose: () => void; onCreated: (changeSet: FeatureChangeSet) => void
}) {
  const [reason, setReason] = useState('')
  const [jira, setJira] = useState('HP-343')
  const [incident, setIncident] = useState('')
  const [safetyExpiresAt, setSafetyExpiresAt] = useState('')
  const [autoRollback, setAutoRollback] = useState(true)
  const [windowSeconds, setWindowSeconds] = useState(60)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { setWriting } = useWriting()

  const submit = async () => {
    if (reason.trim().length < 10) { setError('복구 사유를 10자 이상 입력하세요'); return }
    const request: FeatureDriftReapply = {
      reason: reason.trim(), jiraReference: jira.trim() || null,
      incidentReference: incident.trim() || null, safetyExpiresAt: localInputToIso(safetyExpiresAt),
      autoRollbackEnabled: autoRollback, verificationWindowSeconds: windowSeconds,
    }
    setBusy(true); setWriting(true); setError(null)
    try { onCreated(await createDriftReapplyChangeSet(drift, request)) }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { setBusy(false); setWriting(false) }
  }

  return <div className="dialog-backdrop" role="presentation"><div className="dialog drift-dialog"
      role="dialog" aria-modal="true" aria-labelledby="drift-reapply-title">
    <button type="button" className="modal-close" aria-label="닫기" disabled={busy} onClick={onClose}>✕</button>
    <h2 id="drift-reapply-title">원하는 revision 재적용</h2>
    <p className="sub">현재 DB 상태는 유지하고 revision을 새로 발행하는 변경 세트 초안을 만듭니다.</p>
    <div className="drift-reapply-target"><strong>{drift.displayName}</strong><code>{drift.flagKey}</code>
      <span>desired r{drift.desiredRevision} · mismatch {drift.mismatchedInstances}/{drift.activeInstances}</span></div>
    {error && <div className="error-box" role="alert">{error}</div>}
    <div className="feature-form-grid">
      <label className="span2"><span>복구 사유 <b>필수</b></span><textarea rows={3} maxLength={500}
          value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} /></label>
      <label><span>Jira</span><input value={jira} maxLength={100} disabled={busy}
          onChange={(event) => setJira(event.target.value)} /></label>
      <label><span>인시던트</span><input value={incident} maxLength={100} disabled={busy}
          onChange={(event) => setIncident(event.target.value)} /></label>
      {env.environment === 'PROD' && <label className="span2"><span>OFF 안전 만료</span>
        <input type="datetime-local" value={safetyExpiresAt} disabled={busy}
            onChange={(event) => setSafetyExpiresAt(event.target.value)} /></label>}
      <label className="span2 auto-rollback-policy"><span><input type="checkbox" checked={autoRollback}
          disabled={busy} onChange={(event) => setAutoRollback(event.target.checked)} /> runtime 불일치 자동 롤백</span>
        <select aria-label="적용 관찰 구간" value={windowSeconds} disabled={busy || !autoRollback}
            onChange={(event) => setWindowSeconds(Number(event.target.value))}>
          <option value={30}>30초 관찰</option><option value={60}>1분 관찰</option>
          <option value={300}>5분 관찰</option><option value={600}>10분 관찰</option>
        </select></label>
    </div>
    <div className="dialog-actions"><button className="btn" disabled={busy} onClick={onClose}>취소</button>
      <button className="btn btn-blind" disabled={busy} onClick={() => void submit()}>
        {busy ? '생성 중…' : '재적용 초안 생성'}</button></div>
  </div></div>
}

export default function FeatureDriftPage() {
  const [rows, setRows] = useState<FeatureDriftState[]>([])
  const [selected, setSelected] = useState<FeatureDriftState | null>(null)
  const [created, setCreated] = useState<FeatureChangeSet | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try { setRows(await listFeatureDrift()); setError(null) }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  const counts = useMemo(() => ({
    blocking: rows.filter((row) => ['DRIFT', 'STALE'].includes(row.status)).length,
    propagating: rows.filter((row) => row.status === 'PROPAGATING').length,
  }), [rows])

  return <section className="feature-control drift-page" aria-label="runtime drift 해소">
    <div className="board-head"><div><h1>기능 제어</h1><p>의도한 전파와 실제 drift를 구분해 다음 조치를 결정합니다.</p></div>
      <span className="filter-note">점검 {counts.blocking} · 전파 중 {counts.propagating}</span>
      <button type="button" className="btn refresh" disabled={loading} onClick={() => void load()}>새로고침</button></div>
    <FeatureControlTabs />
    {error && <div className="error-box" role="alert">{error}</div>}
    {created && <div className="preset-created" role="status"><span>
      <strong>변경 세트 #{created.id} 재적용 초안을 생성했습니다.</strong> 승인·적용 뒤 runtime 수렴을 확인하세요.</span>
      <Link className="btn" to={`/feature-control/change-sets?selected=${created.id}`}>변경 세트 열기</Link></div>}
    <div className="drift-table report-table-wrap"><table className="feature-table"><thead><tr>
      <th>기능</th><th>판정</th><th>원하는 revision</th><th>runtime</th><th>최근 보고</th><th>권장 조치</th>
    </tr></thead><tbody>{rows.map((row) => <tr key={row.flagKey}>
      <td><span className="feature-name"><strong>{row.displayName}</strong><code>{row.flagKey}</code></span></td>
      <td><span className={`feature-state drift-${row.status.toLowerCase()}`}>{STATUS_LABEL[row.status]}</span></td>
      <td className="mono">r{row.desiredRevision}</td>
      <td className="mono">mismatch {row.mismatchedInstances} / {row.activeInstances}</td>
      <td>{row.lastReportedAt ? formatKstShort(row.lastReportedAt) : '—'}</td><td>
        <div className="drift-actions">{row.recommendedActions.map((action) => <span key={action}>
          {ACTION_LABEL[action] ?? action}</span>)}
          {row.status === 'DRIFT' && <button type="button" className="btn" disabled={!canOperate()}
              onClick={() => setSelected(row)}>재적용 초안</button>}
        </div></td>
    </tr>)}</tbody></table>{!loading && rows.length === 0 && <div className="empty-hint">drift 상태가 없습니다</div>}</div>
    {selected && <ReapplyDialog drift={selected} onClose={() => setSelected(null)}
        onCreated={(changeSet) => { setCreated(changeSet); setSelected(null); void load() }} />}
  </section>
}
