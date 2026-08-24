import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { addIncidentEvent, addIncidentNote, declareIncident, getIncident, listIncidents, transitionIncident, updateIncident } from '../api/admin'
import type { Incident, IncidentDeclare, IncidentResourceType, IncidentStatus, IncidentTransition } from '../api/types'
import { realmRoles } from '../auth'
import FeatureControlTabs from '../components/FeatureControlTabs'
import { env } from '../env'
import { formatKstShort } from '../format'

const STATUS: Record<IncidentStatus, string> = { DECLARED: '선언', INVESTIGATING: '조사', MITIGATING: '완화',
  MONITORING: '관찰', RESOLVED: '해결', CANCELLED: '취소' }
const TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  DECLARED: ['INVESTIGATING', 'CANCELLED'], INVESTIGATING: ['MITIGATING', 'CANCELLED'],
  MITIGATING: ['MONITORING', 'CANCELLED'], MONITORING: ['MITIGATING', 'RESOLVED', 'CANCELLED'],
  RESOLVED: ['INVESTIGATING'], CANCELLED: ['INVESTIGATING'],
}
const RESOURCE_LABEL: Record<IncidentResourceType, string> = {
  CHANGE_SET: '변경 세트', NOTICE: '사용자 공지', PRESET: '장애 대응 프리셋',
  RUNBOOK: '런북', DASHBOARD: '대시보드', JIRA: 'Jira',
}
const active = (status: IncidentStatus) => !['RESOLVED', 'CANCELLED'].includes(status)
const writable = () => { const r = realmRoles(); return r.includes('admin') || (r.includes('feature_flag_operator')
  && (env.environment !== 'PROD' || r.includes('prod_change_approver'))) }
const canNote = () => { const r = realmRoles(); return r.some((role) => ['admin','moderation_operator','feature_flag_operator','prod_change_approver'].includes(role)) }
const iso = (value: string) => value ? new Date(value).toISOString() : null

function DeclareDialog({ close, created }: { close: () => void; created: (row: Incident) => void }) {
  const [reference, setReference] = useState(''); const [title, setTitle] = useState('')
  const [severity, setSeverity] = useState<IncidentDeclare['severity']>('SEV3'); const [primary, setPrimary] = useState(false)
  const [impact, setImpact] = useState(''); const [reason, setReason] = useState(''); const [error, setError] = useState<string | null>(null)
  const submit = async () => { if (!reference.trim() || !title.trim() || impact.trim().length < 10 || reason.trim().length < 10) {
    setError('참조·제목과 10자 이상의 영향·선언 사유를 입력하세요'); return }
    try { created(await declareIncident({ reference: reference.trim(), title: title.trim(), severity, primary,
      impactSummary: impact.trim(), reason: reason.trim(), requestId: crypto.randomUUID() })) }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) } }
  return <div className="dialog-backdrop"><div className="dialog incident-dialog" role="dialog" aria-modal="true" aria-labelledby="declare-title">
    <button className="modal-close" aria-label="닫기" onClick={close}>✕</button><h2 id="declare-title">인시던트 선언</h2>
    <p className="sub">대상 환경 {env.environment} · 선언 뒤 삭제할 수 없으며 모든 변경이 타임라인에 남습니다.</p>
    {error && <div className="error-box" role="alert">{error}</div>}<div className="feature-form-grid">
      <label><span>인시던트 참조</span><input value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)} /></label>
      <label><span>SEV</span><select value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)}>
        <option>SEV1</option><option>SEV2</option><option>SEV3</option><option>SEV4</option></select></label>
      <label className="span2"><span>제목</span><input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></label>
      <label className="span2"><span>현재 영향</span><textarea rows={3} value={impact} maxLength={1000} onChange={(e) => setImpact(e.target.value)} /></label>
      <label className="span2"><span>선언 사유</span><textarea rows={2} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} /></label>
      <label className="span2 auto-rollback-policy"><span><input type="checkbox" checked={primary} onChange={(e) => setPrimary(e.target.checked)} /> 현재 환경 primary 인시던트</span></label>
    </div><div className="dialog-actions"><button className="btn" onClick={close}>취소</button>
      <button className="btn btn-danger-solid" onClick={() => void submit()}>인시던트 선언</button></div></div></div>
}

function TransitionDialog({ incident, close, done }: { incident: Incident; close: () => void; done: (row: Incident) => void }) {
  const [target, setTarget] = useState<IncidentStatus>(TRANSITIONS[incident.status][0])
  const [owner, setOwner] = useState(incident.ownerUserId?.toString() ?? ''); const [next, setNext] = useState('')
  const [metrics, setMetrics] = useState(''); const [criteria, setCriteria] = useState(''); const [monitorEnd, setMonitorEnd] = useState('')
  const [revisions, setRevisions] = useState(''); const [impactEnd, setImpactEnd] = useState(''); const [risk, setRisk] = useState('')
  const [jira, setJira] = useState('HP-343'); const [reason, setReason] = useState(''); const [error, setError] = useState<string | null>(null)
  const submit = async () => { if (reason.trim().length < 10) { setError('전이 사유를 10자 이상 입력하세요'); return }
    const request: IncidentTransition = { expectedVersion: incident.version, targetStatus: target,
      ownerUserId: owner ? Number(owner) : null, nextUpdateAt: iso(next), observationMetrics: metrics.trim() || null,
      successCriteria: criteria.trim() || null, monitoringEndsAt: iso(monitorEnd), recoveryRevisions: revisions.trim() || null,
      impactEndedAt: iso(impactEnd), residualRisk: risk.trim() || null, followUpJira: jira.trim() || null,
      reason: reason.trim(), requestId: crypto.randomUUID() }
    try { done(await transitionIncident(incident.id, request)) }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) } }
  return <div className="dialog-backdrop"><div className="dialog incident-dialog" role="dialog" aria-modal="true" aria-labelledby="transition-title">
    <button className="modal-close" aria-label="닫기" onClick={close}>✕</button><h2 id="transition-title">인시던트 상태 변경</h2>
    <p className="sub">{incident.reference} · {STATUS[incident.status]} → {STATUS[target]} · {incident.environment}</p>
    {error && <div className="error-box" role="alert">{error}</div>}<div className="feature-form-grid">
      <label className="span2"><span>다음 상태</span><select value={target} onChange={(e) => setTarget(e.target.value as IncidentStatus)}>
        {TRANSITIONS[incident.status].map((s) => <option key={s} value={s}>{STATUS[s]}</option>)}</select></label>
      {target === 'INVESTIGATING' && <><label><span>담당자 사용자 ID</span><input value={owner} onChange={(e) => setOwner(e.target.value)} /></label>
        <label><span>다음 업데이트</span><input type="datetime-local" value={next} onChange={(e) => setNext(e.target.value)} /></label></>}
      {target === 'MITIGATING' && <p className="span2 sub">완화 전에는 변경 세트·공지·프리셋 또는 운영 리소스를 먼저 연결하세요.</p>}
      {target === 'MONITORING' && <><label><span>관찰 지표</span><input value={metrics} onChange={(e) => setMetrics(e.target.value)} /></label>
        <label><span>관찰 종료</span><input type="datetime-local" value={monitorEnd} onChange={(e) => setMonitorEnd(e.target.value)} /></label>
        <label className="span2"><span>성공 기준</span><textarea value={criteria} onChange={(e) => setCriteria(e.target.value)} /></label></>}
      {target === 'RESOLVED' && <><label><span>복구 revision</span><input value={revisions} onChange={(e) => setRevisions(e.target.value)} /></label>
        <label><span>영향 종료</span><input type="datetime-local" value={impactEnd} onChange={(e) => setImpactEnd(e.target.value)} /></label>
        <label><span>후속 Jira</span><input value={jira} onChange={(e) => setJira(e.target.value)} /></label>
        <label><span>잔여 위험</span><input value={risk} onChange={(e) => setRisk(e.target.value)} /></label></>}
      <label className="span2"><span>전이 사유</span><textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
    </div><div className="dialog-actions"><button className="btn" onClick={close}>취소</button>
      <button className="btn btn-blind" onClick={() => void submit()}>상태 변경</button></div></div></div>
}

function EditDialog({ incident, close, done }: { incident: Incident; close: () => void; done: (row: Incident) => void }) {
  const [title, setTitle] = useState(incident.title); const [severity, setSeverity] = useState(incident.severity)
  const [primary, setPrimary] = useState(incident.primary); const [impact, setImpact] = useState(incident.impactSummary)
  const [owner, setOwner] = useState(incident.ownerUserId?.toString() ?? ''); const [next, setNext] = useState('')
  const [reason, setReason] = useState(''); const [error, setError] = useState<string | null>(null)
  const submit = async () => { if (!title.trim() || impact.trim().length < 10 || reason.trim().length < 10) { setError('제목과 10자 이상의 영향·수정 사유를 입력하세요'); return }
    try { done(await updateIncident(incident.id, { expectedVersion: incident.version, title: title.trim(), severity, primary,
      impactSummary: impact.trim(), ownerUserId: owner ? Number(owner) : null, nextUpdateAt: iso(next),
      reason: reason.trim(), requestId: crypto.randomUUID() })) } catch (f) { setError(f instanceof Error ? f.message : String(f)) } }
  return <div className="dialog-backdrop"><div className="dialog incident-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-title">
    <button className="modal-close" aria-label="닫기" onClick={close}>✕</button><h2 id="edit-title">인시던트 정보 수정</h2>
    <p className="sub">{incident.reference} · version {incident.version} · SEV·담당·영향 변경은 감사 이벤트로 남습니다.</p>
    {error && <div className="error-box" role="alert">{error}</div>}<div className="feature-form-grid">
      <label><span>SEV</span><select value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)}><option>SEV1</option><option>SEV2</option><option>SEV3</option><option>SEV4</option></select></label>
      <label><span>담당자 사용자 ID</span><input value={owner} onChange={(e) => setOwner(e.target.value)} /></label>
      <label className="span2"><span>제목</span><input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label className="span2"><span>현재 영향</span><textarea rows={3} value={impact} onChange={(e) => setImpact(e.target.value)} /></label>
      <label><span>다음 업데이트</span><input type="datetime-local" value={next} onChange={(e) => setNext(e.target.value)} /></label>
      <label className="auto-rollback-policy"><span><input type="checkbox" checked={primary} onChange={(e) => setPrimary(e.target.checked)} /> primary</span></label>
      <label className="span2"><span>수정 사유</span><textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
    </div><div className="dialog-actions"><button className="btn" onClick={close}>취소</button><button className="btn btn-blind" onClick={() => void submit()}>정보 수정</button></div>
  </div></div>
}

function ResourceLinkDialog({ incident, close, done }: { incident: Incident; close: () => void; done: (row: Incident) => void }) {
  const [sourceType, setSourceType] = useState<IncidentResourceType>('CHANGE_SET')
  const [sourceId, setSourceId] = useState(''); const [summary, setSummary] = useState('')
  const [error, setError] = useState<string | null>(null)
  const submit = async () => {
    if (!sourceId.trim() || summary.trim().length < 10) { setError('리소스 ID와 10자 이상의 연결 사유를 입력하세요'); return }
    try { done(await addIncidentEvent(incident.id, { expectedVersion: incident.version, sourceType,
      sourceId: sourceId.trim(), summary: summary.trim(), structuredPayload: '{}', requestId: crypto.randomUUID() })) }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
  }
  return <div className="dialog-backdrop"><div className="dialog incident-dialog" role="dialog" aria-modal="true" aria-labelledby="resource-title">
    <button className="modal-close" aria-label="닫기" onClick={close}>✕</button><h2 id="resource-title">완화 리소스 연결</h2>
    <p className="sub">{incident.reference} · 연결 사실과 근거는 삭제할 수 없는 이벤트로 남습니다.</p>
    {error && <div className="error-box" role="alert">{error}</div>}<div className="feature-form-grid">
      <label><span>리소스 유형</span><select value={sourceType} onChange={(event) => { setSourceType(event.target.value as IncidentResourceType); setSourceId('') }}>
        {(Object.keys(RESOURCE_LABEL) as IncidentResourceType[]).map((type) => <option key={type} value={type}>{RESOURCE_LABEL[type]}</option>)}</select></label>
      {sourceType === 'PRESET' ? <label><span>리소스 ID</span><select value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
        <option value="">선택</option><option value="NORMAL_OPERATION">정상 운영</option><option value="READ_ONLY">읽기 전용</option>
        <option value="CHAT_BLOCK">채팅 차단</option><option value="REPORT_LIMIT">신고 제한</option><option value="STAGE2_BYPASS">2차 모더레이션 우회</option>
      </select></label> : <label><span>리소스 ID</span><input value={sourceId} placeholder={sourceType === 'CHANGE_SET' || sourceType === 'NOTICE' ? '숫자 ID' : 'URL 또는 식별자'} onChange={(event) => setSourceId(event.target.value)} /></label>}
      <label className="span2"><span>연결 사유</span><textarea rows={3} value={summary} maxLength={500} onChange={(event) => setSummary(event.target.value)} /></label>
    </div><div className="dialog-actions"><button className="btn" onClick={close}>취소</button>
      <button className="btn btn-blind" onClick={() => void submit()}>리소스 연결</button></div></div></div>
}

function Detail({ incident, reload }: { incident: Incident; reload: (id: number) => Promise<void> }) {
  const [transitioning, setTransitioning] = useState(false); const [editing, setEditing] = useState(false)
  const [linking, setLinking] = useState(false); const [note, setNote] = useState(''); const [error, setError] = useState<string | null>(null)
  const addNote = async () => { if (note.trim().length < 10) { setError('운영 메모를 10자 이상 입력하세요'); return }
    try { await addIncidentNote(incident.id, incident.version, note.trim()); setNote(''); await reload(incident.id) }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) } }
  return <aside className="change-detail incident-detail" aria-label={`인시던트 ${incident.reference} 상세`}>
    <div className="change-detail-head"><div><span className={`incident-sev ${incident.severity.toLowerCase()}`}>{incident.severity}</span>
      <h2>{incident.title}</h2><p>{incident.reference} · {incident.environment}</p></div>
      <div className="incident-head-actions">{active(incident.status) && <><button className="btn" disabled={!writable()} onClick={() => setEditing(true)}>정보 수정</button>
        <button className="btn" disabled={!writable()} onClick={() => setLinking(true)}>리소스 연결</button></>}
        <button className="btn" disabled={!writable()} onClick={() => setTransitioning(true)}>{active(incident.status) ? '상태 변경' : '인시던트 재개'}</button></div></div>
    <dl className="change-summary"><div><dt>상태</dt><dd>{STATUS[incident.status]}</dd></div><div><dt>담당자</dt><dd>{incident.ownerUserId ? `#${incident.ownerUserId}` : '미지정'}</dd></div>
      <div><dt>다음 업데이트</dt><dd>{incident.nextUpdateAt ? formatKstShort(incident.nextUpdateAt) : '—'}</dd></div><div><dt>후속 Jira</dt><dd>{incident.followUpJira ?? '—'}</dd></div></dl>
    <div className="incident-impact"><strong>현재 영향</strong><p>{incident.impactSummary}</p></div>
    <div className="change-actions"><label><span>운영 메모</span><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      {error && <div className="error-box" role="alert">{error}</div>}<div className="dialog-actions"><button className="btn" disabled={!canNote()} onClick={() => void addNote()}>메모 추가</button>
        <Link className="btn" to={`/feature-control/incidents?reference=${encodeURIComponent(incident.reference)}`}>참조 타임라인</Link></div></div>
    <h3>인시던트 이벤트</h3><ol className="change-events">{incident.events.map((event) => <li key={event.id}><span>{formatKstShort(event.occurredAt)}</span><strong>{event.type}</strong>
      <p>{event.summary}{event.sourceType && event.sourceId ? ` · ${event.sourceType} ${event.sourceId}` : ''}</p></li>)}</ol>
    {transitioning && <TransitionDialog incident={incident} close={() => setTransitioning(false)} done={(row) => { setTransitioning(false); void reload(row.id) }} />}
    {editing && <EditDialog incident={incident} close={() => setEditing(false)} done={(row) => { setEditing(false); void reload(row.id) }} />}
    {linking && <ResourceLinkDialog incident={incident} close={() => setLinking(false)} done={(row) => { setLinking(false); void reload(row.id) }} />}
  </aside>
}

export default function IncidentModePage() {
  const [params] = useSearchParams(); const [rows, setRows] = useState<Incident[]>([]); const [selected, setSelected] = useState<Incident | null>(null)
  const [creating, setCreating] = useState(false); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null)
  const load = useCallback(async (id?: number) => { setLoading(true); try { const next = await listIncidents(); setRows(next)
    if (id) setSelected(await getIncident(id)); setError(null) } catch (f) { setError(f instanceof Error ? f.message : String(f)) } finally { setLoading(false) } }, [])
  useEffect(() => { const id = Number(params.get('selected')); void load(Number.isSafeInteger(id) && id > 0 ? id : undefined) }, []) // eslint-disable-line
  const counts = useMemo(() => ({ active: rows.filter((r) => active(r.status)).length, primary: rows.filter((r) => r.primary && active(r.status)).length }), [rows])
  return <section className="feature-control incident-mode-page" aria-label="Incident Mode"><div className="board-head"><div><h1>기능 제어</h1><p>장애 선언부터 완화·관찰·종료까지 책임과 근거를 관리합니다.</p></div>
    <span className="filter-note">활성 {counts.active} · primary {counts.primary}</span><button className="btn" disabled={!writable()} onClick={() => setCreating(true)}>인시던트 선언</button></div>
    <FeatureControlTabs />{error && <div className="error-box" role="alert">{error}</div>}<div className="change-workspace"><div className="change-list"><table><thead><tr><th>인시던트</th><th>SEV</th><th>상태</th><th>담당</th></tr></thead><tbody>
      {rows.map((row) => <tr key={row.id} className={selected?.id === row.id ? 'selected' : ''} onClick={() => void getIncident(row.id).then(setSelected)}><td><strong>{row.title}</strong><span>{row.reference}{row.primary ? ' · PRIMARY' : ''}</span></td>
        <td><span className={`incident-sev ${row.severity.toLowerCase()}`}>{row.severity}</span></td><td>{STATUS[row.status]}</td><td>{row.ownerUserId ? `#${row.ownerUserId}` : '—'}</td></tr>)}</tbody></table>
      {!loading && rows.length === 0 && <div className="empty-hint">현재 환경의 인시던트가 없습니다</div>}</div>{selected ? <Detail incident={selected} reload={load} /> : <div className="change-empty">인시던트를 선택하면 영향·상태·타임라인을 확인할 수 있습니다.</div>}</div>
    {creating && <DeclareDialog close={() => setCreating(false)} created={(row) => { setCreating(false); void load(row.id) }} />}</section>
}
