import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  applyFeatureChangeSet, approveFeatureChangeSet, cancelFeatureChangeSet,
  createFeatureChangeSet, dryRunFeatureChangeSet, getFeatureChangeSet,
  listFeatureChangeSets, listFeatureFlags, rejectFeatureChangeSet,
  requestFeatureChangeReview, rollbackFeatureChangeSet, scheduleFeatureChangeSet,
} from '../api/admin'
import type {
  FeatureChangeSet, FeatureChangeSetCreate, FeatureChangeSetItemInput,
  FeatureDryRunRow, FeatureFlagRow,
} from '../api/types'
import { realmRoles } from '../auth'
import FeatureControlTabs from '../components/FeatureControlTabs'
import { formatKstShort } from '../format'
import { useWriting } from '../writing'

const ROLLOUT_PRESETS = [0, 10, 25, 50, 100]
const STATUS_LABEL: Record<FeatureChangeSet['status'], string> = {
  DRAFT: '초안', REVIEW_REQUESTED: '검토 요청', APPROVED: '승인됨', REJECTED: '반려',
  SCHEDULED: '예약됨', RUNNING: '적용 중', SUCCEEDED: '적용 완료',
  PARTIALLY_FAILED: '일부 실패', FAILED: '실패', ROLLED_BACK: '롤백 완료', CANCELLED: '취소',
}

function permissions() {
  const roles = realmRoles()
  return {
    operate: roles.includes('admin') || roles.includes('feature_flag_operator'),
    approve: roles.includes('admin') || roles.includes('prod_change_approver'),
  }
}

function localInputToIso(value: string) {
  return value ? new Date(value).toISOString() : null
}

function ChangeSetCreateDialog({ flags, onClose, onCreated }: {
  flags: FeatureFlagRow[]
  onClose: () => void
  onCreated: (created: FeatureChangeSet) => void
}) {
  const [title, setTitle] = useState('')
  const [purpose, setPurpose] = useState('')
  const [jira, setJira] = useState('HP-343')
  const [incident, setIncident] = useState('')
  const [autoRollback, setAutoRollback] = useState(true)
  const [verificationWindow, setVerificationWindow] = useState(60)
  const [items, setItems] = useState<Record<string, FeatureChangeSetItemInput>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { setWriting } = useWriting()

  const toggle = (flag: FeatureFlagRow) => {
    setItems((current) => {
      const next = { ...current }
      if (next[flag.key]) delete next[flag.key]
      else next[flag.key] = {
        flagKey: flag.key, enabled: flag.enabled, rolloutPercentage: flag.rolloutPercentage,
        expiresAt: flag.expiresAt, owner: flag.owner,
        allowlistedUserIds: flag.allowlistedUserIds, expectedRevision: flag.revision,
      }
      return next
    })
  }
  const patchItem = (key: string, patch: Partial<FeatureChangeSetItemInput>) =>
    setItems((current) => ({ ...current, [key]: { ...current[key], ...patch } }))

  const submit = async () => {
    const selected = Object.values(items)
    if (!title.trim() || purpose.trim().length < 10 || selected.length === 0) {
      setError('제목, 10자 이상의 목적, 변경할 기능을 입력하세요')
      return
    }
    if (flags[0]?.environment === 'PROD'
        && selected.some((item) => !item.enabled && !item.expiresAt)) {
      setError('PROD에서 OFF로 바꾸는 기능은 만료 시각이 필요합니다')
      return
    }
    const request: FeatureChangeSetCreate = {
      title: title.trim(), purpose: purpose.trim(), jiraReference: jira.trim() || null,
      incidentReference: incident.trim() || null, autoRollbackEnabled: autoRollback,
      verificationWindowSeconds: verificationWindow, items: selected,
    }
    setBusy(true); setWriting(true); setError(null)
    try { onCreated(await createFeatureChangeSet(request)) }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { setBusy(false); setWriting(false) }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog change-set-create" role="dialog" aria-modal="true" aria-labelledby="change-set-create-title">
        <button type="button" className="modal-close" aria-label="닫기" disabled={busy} onClick={onClose}>✕</button>
        <h2 id="change-set-create-title">새 변경 세트</h2>
        <p className="sub">여러 기능을 하나의 승인·적용·롤백 단위로 묶습니다.</p>
        {error && <div className="error-box" role="alert">{error}</div>}
        <div className="feature-form-grid">
          <label className="span2"><span>제목</span><input value={title} maxLength={120} disabled={busy}
              onChange={(event) => setTitle(event.target.value)} /></label>
          <label><span>Jira</span><input value={jira} maxLength={100} disabled={busy}
              onChange={(event) => setJira(event.target.value)} /></label>
          <label><span>인시던트</span><input value={incident} maxLength={100} disabled={busy}
              placeholder="선택" onChange={(event) => setIncident(event.target.value)} /></label>
          <label className="span2"><span>변경 목적 <b>필수</b></span><textarea value={purpose} rows={2}
              maxLength={500} disabled={busy} onChange={(event) => setPurpose(event.target.value)} /></label>
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
        <div className="change-picks" aria-label="변경 기능 선택">
          {flags.map((flag) => {
            const item = items[flag.key]
            return <div className={`change-pick ${item ? 'selected' : ''}`} key={flag.key}>
              <label className="change-pick-main">
                <input type="checkbox" checked={Boolean(item)} disabled={busy || !flag.connected}
                    onChange={() => toggle(flag)} />
                <span><strong>{flag.displayName}</strong><code>{flag.key}</code></span>
                <small>{flag.risk}</small>
              </label>
              {item && <div className="change-target">
                <button type="button" className="chip-f" aria-pressed={item.enabled}
                    onClick={() => patchItem(flag.key, { enabled: true })}>ON</button>
                <button type="button" className="chip-f" aria-pressed={!item.enabled}
                    onClick={() => patchItem(flag.key, { enabled: false })}>OFF</button>
                <span className="preset-label">Rollout</span>
                {ROLLOUT_PRESETS.map((preset) => <button key={preset} type="button" className="chip-f"
                    aria-pressed={item.rolloutPercentage === preset}
                    onClick={() => patchItem(flag.key, { rolloutPercentage: preset })}>{preset}%</button>)}
                <input aria-label={`${flag.displayName} 만료 시각`} type="datetime-local"
                    value={item.expiresAt ? item.expiresAt.slice(0, 16) : ''}
                    onChange={(event) => patchItem(flag.key, { expiresAt: localInputToIso(event.target.value) })} />
              </div>}
            </div>
          })}
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn" disabled={busy} onClick={onClose}>취소</button>
          <button type="button" className="btn btn-blind" disabled={busy} onClick={() => void submit()}>
            {busy ? '생성 중…' : `초안 생성 (${Object.keys(items).length})`}
          </button>
        </div>
      </div>
    </div>
  )
}

function ChangeSetDetail({ changeSet, onReload }: {
  changeSet: FeatureChangeSet
  onReload: (id?: number) => Promise<void>
}) {
  const { operate, approve } = permissions()
  const [reason, setReason] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [safetyExpiresAt, setSafetyExpiresAt] = useState('')
  const [dryUsers, setDryUsers] = useState('')
  const [dryRows, setDryRows] = useState<FeatureDryRunRow[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { setWriting } = useWriting()

  const action = async (run: () => Promise<FeatureChangeSet>) => {
    if (reason.trim().length < 10) { setError('조치 사유를 10자 이상 입력하세요'); return }
    setBusy(true); setWriting(true); setError(null)
    try { const result = await run(); setReason(''); await onReload(result.id) }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { setBusy(false); setWriting(false) }
  }
  const dryRun = async () => {
    const ids = dryUsers.split(',').map((value) => Number(value.trim())).filter(Boolean)
    if (ids.length === 0 || ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
      setError('드라이런 사용자 ID를 쉼표로 구분해 입력하세요'); return
    }
    setBusy(true); setError(null)
    try { setDryRows(await dryRunFeatureChangeSet(changeSet.id, [...new Set(ids)])) }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { setBusy(false) }
  }

  const workflow = changeSet.status === 'DRAFT' || changeSet.status === 'REJECTED'
    ? <>
        <button className="btn" disabled={!operate || busy} onClick={() => void action(() =>
          requestFeatureChangeReview(changeSet.id, changeSet.version, reason))}>검토 요청</button>
        {changeSet.environment !== 'PROD' && <button className="btn btn-blind" disabled={!operate || busy}
            onClick={() => void action(() => applyFeatureChangeSet(changeSet.id, changeSet.version, reason))}>즉시 적용</button>}
      </>
    : changeSet.status === 'REVIEW_REQUESTED'
      ? <>
          <button className="btn" disabled={!approve || busy} onClick={() => void action(() =>
            rejectFeatureChangeSet(changeSet.id, changeSet.version, reason))}>반려</button>
          <button className="btn btn-blind" disabled={!approve || busy} onClick={() => void action(() =>
            approveFeatureChangeSet(changeSet.id, changeSet.version, reason))}>승인</button>
        </>
      : changeSet.status === 'APPROVED'
        ? <button className="btn btn-blind" disabled={!operate || busy} onClick={() => void action(() =>
            applyFeatureChangeSet(changeSet.id, changeSet.version, reason))}>승인본 적용</button>
        : null

  const cancellable = ['DRAFT', 'REVIEW_REQUESTED', 'APPROVED', 'SCHEDULED'].includes(changeSet.status)
  const rollbackable = ['SUCCEEDED', 'PARTIALLY_FAILED'].includes(changeSet.status)
  const schedulable = ['DRAFT', 'APPROVED'].includes(changeSet.status)

  return <aside className="change-detail" aria-label={`변경 세트 #${changeSet.id} 상세`}>
    <div className="change-detail-head">
      <div><span className={`feature-state status-${changeSet.status.toLowerCase()}`}>{STATUS_LABEL[changeSet.status]}</span>
        <h2>{changeSet.title}</h2><p>#{changeSet.id} · {changeSet.environment} · {changeSet.risk}</p></div>
      <button type="button" className="btn" disabled={busy} onClick={() => void onReload(changeSet.id)}>새로고침</button>
    </div>
    <dl className="change-summary">
      <div><dt>목적</dt><dd>{changeSet.purpose}</dd></div>
      <div><dt>참조</dt><dd>{[changeSet.jiraReference, changeSet.incidentReference].filter(Boolean).join(' · ') || '—'}</dd></div>
      <div><dt>작성/승인</dt><dd>#{changeSet.createdByUserId} / {changeSet.approvedByUserId ? `#${changeSet.approvedByUserId}` : '—'}</dd></div>
      <div><dt>예약/적용</dt><dd>{changeSet.scheduledAt ? formatKstShort(changeSet.scheduledAt) : '—'} / {changeSet.appliedAt ? formatKstShort(changeSet.appliedAt) : '—'}</dd></div>
      <div><dt>자동 롤백</dt><dd>{changeSet.autoRollbackEnabled ? `${changeSet.verificationWindowSeconds}초 관찰` : '사용 안 함'}</dd></div>
      <div><dt>검증 완료</dt><dd>{changeSet.verificationCompletedAt ? formatKstShort(changeSet.verificationCompletedAt) : changeSet.verificationDueAt ? `${formatKstShort(changeSet.verificationDueAt)} 이후` : '—'}</dd></div>
    </dl>
    <h3>변경 diff</h3>
    <div className="change-diffs">{changeSet.items.map((item) => {
      const before = JSON.parse(item.beforeState) as { enabled: boolean; rolloutPercentage: number }
      return <div className="change-diff" key={item.flagKey}>
        <code>{item.flagKey}</code><span>{before.enabled ? 'ON' : 'OFF'} · {before.rolloutPercentage}%</span>
        <b>→</b><strong>{item.targetEnabled ? 'ON' : 'OFF'} · {item.targetRolloutPercentage}%</strong>
        {item.resultCode && <small>{item.resultCode}</small>}
      </div>
    })}</div>
    <div className="dry-run-box">
      <label><span>Dry-run 사용자 ID</span><input value={dryUsers} placeholder="17, 29"
          onChange={(event) => setDryUsers(event.target.value)} /></label>
      <button type="button" className="btn" disabled={busy} onClick={() => void dryRun()}>미리보기</button>
      {dryRows.length > 0 && <div className="dry-results">{dryRows.map((row) =>
        <span key={`${row.flagKey}-${row.userId}`}>#{row.userId} · {row.flagKey}: {row.currentEnabled ? 'ON' : 'OFF'} → {row.proposedEnabled ? 'ON' : 'OFF'}</span>)}</div>}
    </div>
    {error && <div className="error-box" role="alert">{error}</div>}
    {(workflow || cancellable || rollbackable) && <div className="change-actions">
      <label><span>조치 사유 <b>필수</b></span><textarea value={reason} rows={2} maxLength={500}
          disabled={busy} onChange={(event) => setReason(event.target.value)} /></label>
      <div className="dialog-actions">
        {cancellable && <button className="btn" disabled={!operate || busy} onClick={() => void action(() =>
          cancelFeatureChangeSet(changeSet.id, changeSet.version, reason))}>취소 처리</button>}
        {workflow}
        {rollbackable && <button className="btn btn-danger-solid" disabled={!operate || busy} onClick={() => void action(() =>
          rollbackFeatureChangeSet(changeSet.id, changeSet.version, localInputToIso(safetyExpiresAt), reason))}>롤백 초안</button>}
      </div>
      {rollbackable && changeSet.environment === 'PROD' && <label><span>OFF 복구 안전 만료</span>
        <input type="datetime-local" value={safetyExpiresAt} onChange={(event) => setSafetyExpiresAt(event.target.value)} /></label>}
      {schedulable && <div className="schedule-row"><input aria-label="예약 적용 시각" type="datetime-local"
          value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />
        <button className="btn" disabled={!operate || busy || !scheduledAt} onClick={() => void action(() =>
          scheduleFeatureChangeSet(changeSet.id, changeSet.version, localInputToIso(scheduledAt)!, reason))}>예약 적용</button></div>}
    </div>}
    <h3>불변 이벤트</h3>
    <ol className="change-events">{changeSet.events.map((event) => <li key={event.id}>
      <span>{formatKstShort(event.createdAt)}</span><strong>{event.type}</strong><p>{event.reason}</p>
    </li>)}</ol>
  </aside>
}

export default function FeatureChangeSetPage() {
  const [sets, setSets] = useState<FeatureChangeSet[]>([])
  const [flags, setFlags] = useState<FeatureFlagRow[]>([])
  const [selected, setSelected] = useState<FeatureChangeSet | null>(null)
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const writable = permissions().operate

  const load = useCallback(async (detailId?: number) => {
    setLoading(true)
    try {
      const [nextSets, nextFlags] = await Promise.all([listFeatureChangeSets(), listFeatureFlags()])
      setSets(nextSets); setFlags(nextFlags); setError(null)
      const id = detailId ?? selected?.id
      if (id) setSelected(await getFeatureChangeSet(id))
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { setLoading(false) }
  }, [selected?.id])
  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => ({
    waiting: sets.filter((set) => ['DRAFT', 'REVIEW_REQUESTED', 'APPROVED', 'SCHEDULED'].includes(set.status)).length,
    failed: sets.filter((set) => ['PARTIALLY_FAILED', 'FAILED'].includes(set.status)).length,
  }), [sets])

  return <section className="feature-control change-set-page" aria-label="기능 변경 세트">
    <div className="board-head"><div><h1>기능 제어</h1><p>변경을 승인·예약·적용·복구 가능한 단위로 관리합니다.</p></div>
      <span className="filter-note">대기 {counts.waiting} · 실패 {counts.failed}</span>
      <button type="button" className="btn" disabled={!writable || loading} onClick={() => setCreating(true)}>새 변경 세트</button>
      <button type="button" className="btn refresh" disabled={loading} onClick={() => void load()}>새로고침</button></div>
    <FeatureControlTabs />
    {error && <div className="error-box" role="alert">{error}</div>}
    <div className="change-workspace">
      <div className="change-list report-table-wrap">
        <table><thead><tr><th>변경 세트</th><th>상태</th><th>범위</th><th>생성</th></tr></thead>
          <tbody>{sets.map((set) => <tr key={set.id} className={selected?.id === set.id ? 'selected' : ''}
              onClick={() => void getFeatureChangeSet(set.id).then(setSelected)}>
            <td><strong>{set.title}</strong><span>#{set.id} · {set.jiraReference ?? '참조 없음'}</span></td>
            <td><span className={`feature-state status-${set.status.toLowerCase()}`}>{STATUS_LABEL[set.status]}</span></td>
            <td>{set.items.length}개 · {set.risk}</td><td>{formatKstShort(set.createdAt)}</td>
          </tr>)}</tbody></table>
        {!loading && sets.length === 0 && <div className="empty-hint">아직 변경 세트가 없습니다</div>}
      </div>
      {selected ? <ChangeSetDetail changeSet={selected} onReload={load} />
        : <div className="change-empty">변경 세트를 선택하면 diff와 승인 이력을 확인할 수 있습니다.</div>}
    </div>
    {creating && <ChangeSetCreateDialog flags={flags} onClose={() => setCreating(false)}
        onCreated={(created) => { setCreating(false); setSelected(created); void load(created.id) }} />}
  </section>
}
