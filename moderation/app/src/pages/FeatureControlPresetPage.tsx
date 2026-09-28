import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { createPresetChangeSet, listFeatureControlPresets } from '../api/admin'
import type {
  FeatureChangeSet, FeatureControlPreset, FeatureControlPresetApply,
} from '../api/types'
import { realmRoles } from '../auth'
import FeatureControlTabs from '../components/FeatureControlTabs'
import { env } from '../env'
import { useWriting } from '../writing'

function localInputToIso(value: string) {
  return value ? new Date(value).toISOString() : null
}

function canOperate() {
  const roles = realmRoles()
  return roles.includes('admin') || roles.includes('feature_flag_operator')
}

function PresetDialog({ preset, onClose, onCreated }: {
  preset: FeatureControlPreset
  onClose: () => void
  onCreated: (changeSet: FeatureChangeSet) => void
}) {
  const [reason, setReason] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [jira, setJira] = useState('HP-343')
  const [incident, setIncident] = useState('')
  const [autoRollback, setAutoRollback] = useState(true)
  const [verificationWindow, setVerificationWindow] = useState(60)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { setWriting } = useWriting()
  const expiryRequired = env.environment === 'PROD' && preset.requiresExpiry

  const submit = async () => {
    if (reason.trim().length < 10) { setError('적용 사유를 10자 이상 입력하세요'); return }
    if (expiryRequired && !expiresAt) { setError('PROD 중지 프리셋은 만료 시각이 필요합니다'); return }
    const request: FeatureControlPresetApply = {
      reason: reason.trim(), expiresAt: localInputToIso(expiresAt),
      jiraReference: jira.trim() || null, incidentReference: incident.trim() || null,
      autoRollbackEnabled: autoRollback, verificationWindowSeconds: verificationWindow,
    }
    setBusy(true); setWriting(true); setError(null)
    try { onCreated(await createPresetChangeSet(preset, request)) }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { setBusy(false); setWriting(false) }
  }

  return <div className="dialog-backdrop" role="presentation">
    <div className="dialog preset-dialog" role="dialog" aria-modal="true" aria-labelledby="preset-dialog-title">
      <button type="button" className="modal-close" aria-label="닫기" disabled={busy} onClick={onClose}>✕</button>
      <h2 id="preset-dialog-title">{preset.displayName} 변경 세트</h2>
      <p className="sub">즉시 반영하지 않고 검토 가능한 초안을 생성합니다.</p>
      <div className="preset-preview">
        {preset.targets.map((target) => <div key={target.flagKey}>
          <span><strong>{target.displayName}</strong><code>{target.flagKey}</code></span>
          <b className={`feature-state ${target.enabled ? 'on' : 'off'}`}>
            {target.enabled ? 'ON' : 'OFF'} · {target.rolloutPercentage}%
          </b>
        </div>)}
      </div>
      {error && <div className="error-box" role="alert">{error}</div>}
      <div className="feature-form-grid">
        <label className="span2"><span>적용 사유 <b>필수</b></span><textarea rows={3} maxLength={500}
            value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} /></label>
        <label><span>Jira</span><input value={jira} maxLength={100} disabled={busy}
            onChange={(event) => setJira(event.target.value)} /></label>
        <label><span>인시던트</span><input value={incident} maxLength={100} disabled={busy}
            placeholder="선택" onChange={(event) => setIncident(event.target.value)} /></label>
        {preset.requiresExpiry && <label className="span2"><span>중지 만료 시각 {expiryRequired && <b>PROD 필수</b>}</span>
          <input type="datetime-local" value={expiresAt} disabled={busy}
              onChange={(event) => setExpiresAt(event.target.value)} /></label>}
        <label className="span2 auto-rollback-policy">
          <span><input type="checkbox" checked={autoRollback} disabled={busy}
              onChange={(event) => setAutoRollback(event.target.checked)} /> runtime 불일치 자동 롤백</span>
          <select aria-label="적용 관찰 구간" value={verificationWindow} disabled={busy || !autoRollback}
              onChange={(event) => setVerificationWindow(Number(event.target.value))}>
            <option value={30}>30초 관찰</option><option value={60}>1분 관찰</option>
            <option value={300}>5분 관찰</option><option value={600}>10분 관찰</option>
          </select>
        </label>
      </div>
      <div className="dialog-actions"><button type="button" className="btn" disabled={busy} onClick={onClose}>취소</button>
        <button type="button" className="btn btn-blind" disabled={busy} onClick={() => void submit()}>
          {busy ? '생성 중…' : '변경 세트 초안 생성'}
        </button></div>
    </div>
  </div>
}

export default function FeatureControlPresetPage() {
  const [presets, setPresets] = useState<FeatureControlPreset[]>([])
  const [selected, setSelected] = useState<FeatureControlPreset | null>(null)
  const [created, setCreated] = useState<FeatureChangeSet | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try { setPresets(await listFeatureControlPresets()); setError(null) }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  return <section className="feature-control preset-page" aria-label="장애 대응 프리셋">
    <div className="board-head"><div><h1>기능 제어</h1><p>검증된 조합으로 대응하되 승인과 감사 절차는 유지합니다.</p></div>
      <span className="filter-note">{presets.length}개 프리셋</span>
      <button type="button" className="btn refresh" disabled={loading} onClick={() => void load()}>새로고침</button></div>
    <FeatureControlTabs />
    {error && <div className="error-box" role="alert">{error}</div>}
    {created && <div className="preset-created" role="status">
      <span><strong>변경 세트 #{created.id} 초안을 생성했습니다.</strong> 검토 후 승인·예약·적용하세요.</span>
      <Link className="btn" to={`/feature-control/change-sets?selected=${created.id}`}>변경 세트 열기</Link>
    </div>}
    <div className="preset-grid">
      {presets.map((preset) => <article className="preset-card" key={preset.id}>
        <div className="preset-card-head"><span className={`feature-state ${preset.risk === 'HIGH' ? 'off' : 'pending'}`}>{preset.risk}</span>
          {preset.requiresExpiry && <small>PROD 만료 필수</small>}</div>
        <h2>{preset.displayName}</h2><p>{preset.description}</p>
        <div className="preset-targets">{preset.targets.map((target) => <div key={target.flagKey}>
          <span><strong>{target.displayName}</strong><code>{target.flagKey}</code></span>
          <b>{target.enabled ? 'ON' : 'OFF'} · {target.rolloutPercentage}%</b>
        </div>)}</div>
        <button type="button" className="btn" disabled={!canOperate() || loading} onClick={() => setSelected(preset)}>
          초안 만들기
        </button>
      </article>)}
    </div>
    {selected && <PresetDialog preset={selected} onClose={() => setSelected(null)}
        onCreated={(changeSet) => { setCreated(changeSet); setSelected(null) }} />}
  </section>
}
