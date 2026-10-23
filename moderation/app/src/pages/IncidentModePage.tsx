import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { addIncidentEvent, addIncidentNote, declareIncident, getIncident, listIncidents, transitionIncident, updateIncident } from '../api/admin'
import type { Incident, IncidentDeclare, IncidentResourceType, IncidentStatus, IncidentTransition } from '../api/types'
import { realmRoles } from '@core/auth'
import Dialog from '@core/Dialog'
import { can } from '@core/roles'
import FeatureControlTabs, { featureControlTitle } from '../components/FeatureControlTabs'
import { useLatestRequest } from '@core/useLatestRequest'
import { selectableRow } from '../selectableRow'
import { useRevealPickedDetail } from '../revealPickedDetail'
import { INCIDENT_RESOURCE_LABELS, INCIDENT_STATUS_LABELS, incidentEventLabel } from '../recordLabels'
import { env } from '@core/env'
import { formatKstShort, isoToKstInput, kstInputToIso } from '@core/time'
import { useWriting } from '@core/writing'

const STATUS = INCIDENT_STATUS_LABELS
const TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  DECLARED: ['INVESTIGATING', 'CANCELLED'], INVESTIGATING: ['MITIGATING', 'CANCELLED'],
  MITIGATING: ['MONITORING', 'CANCELLED'], MONITORING: ['MITIGATING', 'RESOLVED', 'CANCELLED'],
  RESOLVED: ['INVESTIGATING'], CANCELLED: ['INVESTIGATING'],
}
const RESOURCE_LABEL = INCIDENT_RESOURCE_LABELS
const active = (status: IncidentStatus) => !['RESOLVED', 'CANCELLED'].includes(status)
// 인시던트 선언·전이는 기능 제어 역할이 하고, PROD에서는 승인 역할까지 함께 있어야 한다(admin은 늘 된다).
const writable = () => { const r = realmRoles(); return r.includes('admin') || (can(r, 'operateFeatures')
  && (env.environment !== 'PROD' || can(r, 'approveProd'))) }
const canNote = () => can(realmRoles(), 'note')

/**
 * 인시던트 다이얼로그의 제출(HP-528). 처리 중에는 제출·닫기를 잠근다 — 잠그지 않던 동안 연타하면 두 번째 요청이 버전
 * 충돌로 실패해, 성공했는데도 오류가 보였다. 쓰는 동안은 서버 전환·이탈도 막는다(다른 기능 제어 창과 같다).
 * requestId는 창을 열 때 한 번 만든다: 다시 보내도 감사 기록에서 같은 제출의 재시도로 묶인다. 중복 저장을 막는 것은
 * 서버의 참조 중복·버전 검사다(requestId는 기록용이라 서버가 중복을 거르지 않는다).
 */
function useSubmission(setError: (message: string | null) => void) {
  const [busy, setBusy] = useState(false)
  const [requestId] = useState(() => crypto.randomUUID())
  const { setWriting } = useWriting()
  const run = async (work: () => Promise<void>) => {
    setBusy(true); setWriting(true); setError(null)
    try { await work() }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { setBusy(false); setWriting(false) }
  }
  return { busy, requestId, run }
}

function DeclareDialog({ close, created }: { close: () => void; created: (row: Incident) => void }) {
  const [reference, setReference] = useState(''); const [title, setTitle] = useState('')
  const [severity, setSeverity] = useState<IncidentDeclare['severity']>('SEV3'); const [primary, setPrimary] = useState(false)
  const [impact, setImpact] = useState(''); const [reason, setReason] = useState(''); const [error, setError] = useState<string | null>(null)
  const { busy, requestId, run } = useSubmission(setError)
  const submit = () => { if (!reference.trim() || !title.trim() || impact.trim().length < 10 || reason.trim().length < 10) {
    setError('참조·제목과 10자 이상의 영향·선언 사유를 입력하세요'); return }
    void run(async () => created(await declareIncident({ reference: reference.trim(), title: title.trim(), severity, primary,
      impactSummary: impact.trim(), reason: reason.trim(), requestId }))) }
  return <Dialog label="인시던트 선언" title="인시던트 선언" className="incident-dialog" busy={busy} onClose={close}
      closeOnBackdrop={false}>
    <p className="sub">대상 환경 {env.environment} · 선언 뒤 삭제할 수 없으며 모든 변경이 타임라인에 남습니다.</p>
    {error && <div className="error-box" role="alert">{error}</div>}<div className="feature-form-grid">
      <label><span>인시던트 참조</span><input value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)} /></label>
      <label><span>SEV</span><select value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)}>
        <option>SEV1</option><option>SEV2</option><option>SEV3</option><option>SEV4</option></select></label>
      <label className="span2"><span>제목</span><input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></label>
      <label className="span2"><span>현재 영향</span><textarea rows={3} value={impact} maxLength={1000} onChange={(e) => setImpact(e.target.value)} /></label>
      <label className="span2"><span>선언 사유</span><textarea rows={2} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} /></label>
      <label className="span2 auto-rollback-policy"><span><input type="checkbox" checked={primary} onChange={(e) => setPrimary(e.target.checked)} /> 현재 환경 primary 인시던트</span></label>
    </div><div className="dialog-actions"><button className="btn" disabled={busy} onClick={close}>취소</button>
      <button className="btn btn-danger-solid" disabled={busy} onClick={submit}>{busy ? '선언 중…' : '인시던트 선언'}</button></div>
  </Dialog>
}

function TransitionDialog({ incident, close, done }: { incident: Incident; close: () => void; done: (row: Incident) => void }) {
  const [target, setTarget] = useState<IncidentStatus>(TRANSITIONS[incident.status][0])
  const [owner, setOwner] = useState(incident.ownerUserId?.toString() ?? ''); const [next, setNext] = useState('')
  const [metrics, setMetrics] = useState(''); const [criteria, setCriteria] = useState(''); const [monitorEnd, setMonitorEnd] = useState('')
  const [revisions, setRevisions] = useState(''); const [impactEnd, setImpactEnd] = useState(''); const [risk, setRisk] = useState('')
  const [jira, setJira] = useState(''); const [reason, setReason] = useState(''); const [error, setError] = useState<string | null>(null)
  const { busy, requestId, run } = useSubmission(setError)
  const submit = () => { if (reason.trim().length < 10) { setError('전이 사유를 10자 이상 입력하세요'); return }
    const request: IncidentTransition = { expectedVersion: incident.version, targetStatus: target,
      ownerUserId: owner ? Number(owner) : null, nextUpdateAt: kstInputToIso(next), observationMetrics: metrics.trim() || null,
      successCriteria: criteria.trim() || null, monitoringEndsAt: kstInputToIso(monitorEnd), recoveryRevisions: revisions.trim() || null,
      impactEndedAt: kstInputToIso(impactEnd), residualRisk: risk.trim() || null, followUpJira: jira.trim() || null,
      reason: reason.trim(), requestId }
    void run(async () => done(await transitionIncident(incident.id, request))) }
  return <Dialog label="인시던트 상태 변경" title="인시던트 상태 변경" className="incident-dialog" busy={busy} onClose={close}
      closeOnBackdrop={false}>
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
    </div><div className="dialog-actions"><button className="btn" disabled={busy} onClick={close}>취소</button>
      <button className="btn btn-blind" disabled={busy} onClick={submit}>{busy ? '변경 중…' : '상태 변경'}</button></div>
  </Dialog>
}

function EditDialog({ incident, close, done }: { incident: Incident; close: () => void; done: (row: Incident) => void }) {
  const [title, setTitle] = useState(incident.title); const [severity, setSeverity] = useState(incident.severity)
  const [primary, setPrimary] = useState(incident.primary); const [impact, setImpact] = useState(incident.impactSummary)
  // 다음 업데이트도 지금 값으로 채운다 — 수정은 서버가 이 값을 그대로 덮어써서(Incident.update) 빈 칸으로 열면
  // 제목만 고쳐도 지워진다(HP-558). 손대지 않았으면 원래 값을 그대로 보낸다 — 칸은 분 단위라 되돌려 만들면 초가 잘린다.
  // 상태 변경 창은 빈 칸 = 그대로라(Incident.transition) 비워 둔다.
  const initialNext = isoToKstInput(incident.nextUpdateAt)
  const [owner, setOwner] = useState(incident.ownerUserId?.toString() ?? ''); const [next, setNext] = useState(initialNext)
  const [reason, setReason] = useState(''); const [error, setError] = useState<string | null>(null)
  const { busy, requestId, run } = useSubmission(setError)
  const submit = () => { if (!title.trim() || impact.trim().length < 10 || reason.trim().length < 10) { setError('제목과 10자 이상의 영향·수정 사유를 입력하세요'); return }
    void run(async () => done(await updateIncident(incident.id, { expectedVersion: incident.version, title: title.trim(), severity, primary,
      impactSummary: impact.trim(), ownerUserId: owner ? Number(owner) : null,
      nextUpdateAt: next === initialNext ? incident.nextUpdateAt : kstInputToIso(next),
      reason: reason.trim(), requestId }))) }
  return <Dialog label="인시던트 정보 수정" title="인시던트 정보 수정" className="incident-dialog" busy={busy} onClose={close}
      closeOnBackdrop={false}>
    <p className="sub">{incident.reference} · version {incident.version} · SEV·담당·영향 변경은 감사 이벤트로 남습니다.</p>
    {error && <div className="error-box" role="alert">{error}</div>}<div className="feature-form-grid">
      <label><span>SEV</span><select value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)}><option>SEV1</option><option>SEV2</option><option>SEV3</option><option>SEV4</option></select></label>
      <label><span>담당자 사용자 ID</span><input value={owner} onChange={(e) => setOwner(e.target.value)} /></label>
      <label className="span2"><span>제목</span><input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label className="span2"><span>현재 영향</span><textarea rows={3} value={impact} onChange={(e) => setImpact(e.target.value)} /></label>
      <label><span>다음 업데이트</span><input type="datetime-local" value={next} onChange={(e) => setNext(e.target.value)} /></label>
      <label className="auto-rollback-policy"><span><input type="checkbox" checked={primary} onChange={(e) => setPrimary(e.target.checked)} /> primary</span></label>
      <label className="span2"><span>수정 사유</span><textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
    </div><div className="dialog-actions"><button className="btn" disabled={busy} onClick={close}>취소</button>
      <button className="btn btn-blind" disabled={busy} onClick={submit}>{busy ? '수정 중…' : '정보 수정'}</button></div>
  </Dialog>
}

function ResourceLinkDialog({ incident, close, done }: { incident: Incident; close: () => void; done: (row: Incident) => void }) {
  const [sourceType, setSourceType] = useState<IncidentResourceType>('CHANGE_SET')
  const [sourceId, setSourceId] = useState(''); const [summary, setSummary] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { busy, requestId, run } = useSubmission(setError)
  const submit = () => {
    if (!sourceId.trim() || summary.trim().length < 10) { setError('리소스 ID와 10자 이상의 연결 사유를 입력하세요'); return }
    void run(async () => done(await addIncidentEvent(incident.id, { expectedVersion: incident.version, sourceType,
      sourceId: sourceId.trim(), summary: summary.trim(), structuredPayload: '{}', requestId })))
  }
  return <Dialog label="완화 리소스 연결" title="완화 리소스 연결" className="incident-dialog" busy={busy} onClose={close}
      closeOnBackdrop={false}>
    <p className="sub">{incident.reference} · 연결 사실과 근거는 삭제할 수 없는 이벤트로 남습니다.</p>
    {error && <div className="error-box" role="alert">{error}</div>}<div className="feature-form-grid">
      <label><span>리소스 유형</span><select value={sourceType} onChange={(event) => { setSourceType(event.target.value as IncidentResourceType); setSourceId('') }}>
        {(Object.keys(RESOURCE_LABEL) as IncidentResourceType[]).map((type) => <option key={type} value={type}>{RESOURCE_LABEL[type]}</option>)}</select></label>
      {sourceType === 'PRESET' ? <label><span>리소스 ID</span><select value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
        <option value="">선택</option><option value="NORMAL_OPERATION">정상 운영</option><option value="READ_ONLY">읽기 전용</option>
        <option value="CHAT_BLOCK">채팅 차단</option><option value="REPORT_LIMIT">신고 제한</option><option value="STAGE2_BYPASS">2차 모더레이션 우회</option>
        <option value="PUBLIC_CONTENT_STOP">외부 공개 콘텐츠 중지</option><option value="PRIVACY_TRANSMISSION_STOP">개인정보 전송 중지</option>
        <option value="VIDEO_OVERLAY_MINIMIZE">비디오 오버레이 최소화</option><option value="DISNEY_PLUS_ISOLATION">Disney+ 격리</option>
      </select></label> : <label><span>리소스 ID</span><input value={sourceId} placeholder={sourceType === 'CHANGE_SET' || sourceType === 'NOTICE' ? '숫자 ID' : 'URL 또는 식별자'} onChange={(event) => setSourceId(event.target.value)} /></label>}
      <label className="span2"><span>연결 사유</span><textarea rows={3} value={summary} maxLength={500} onChange={(event) => setSummary(event.target.value)} /></label>
    </div><div className="dialog-actions"><button className="btn" disabled={busy} onClick={close}>취소</button>
      <button className="btn btn-blind" disabled={busy} onClick={submit}>{busy ? '연결 중…' : '리소스 연결'}</button></div>
  </Dialog>
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
    <h3>인시던트 이벤트</h3><ol className="change-events">{incident.events.map((event) => <li key={event.id}><span>{formatKstShort(event.occurredAt)}</span><strong>{incidentEventLabel(event.type)}</strong>
      <p>{event.summary}{event.sourceType && event.sourceId ? ` · ${RESOURCE_LABEL[event.sourceType as IncidentResourceType] ?? event.sourceType} ${event.sourceId}` : ''}</p></li>)}</ol>
    {transitioning && <TransitionDialog incident={incident} close={() => setTransitioning(false)} done={(row) => { setTransitioning(false); void reload(row.id) }} />}
    {editing && <EditDialog incident={incident} close={() => setEditing(false)} done={(row) => { setEditing(false); void reload(row.id) }} />}
    {linking && <ResourceLinkDialog incident={incident} close={() => setLinking(false)} done={(row) => { setLinking(false); void reload(row.id) }} />}
  </aside>
}

export default function IncidentModePage() {
  const [params] = useSearchParams(); const [rows, setRows] = useState<Incident[]>([]); const [selected, setSelected] = useState<Incident | null>(null)
  const reveal = useRevealPickedDetail(selected?.id)
  const [creating, setCreating] = useState(false); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null)
  // 목록과 상세는 따로 순서를 지킨다(HP-527). 새로고침이나 조치가 끝나 상세를 다시 열 때는, 그사이 운영자가 다른 행을
  // 골랐으면 다시 열지 않는다 — 고른 행이 이전 행으로 되돌아가면 그 위의 승인·적용이 엉뚱한 것에 간다(2026-10-12 리뷰).
  // 고른 횟수(picks)를 세어, 새로고침은 시작할 때의 수를, 상세 화면의 조치는 그 화면을 그린 때의 수(pickCount)를 넘긴다.
  const beginList = useLatestRequest()
  const beginDetail = useLatestRequest()
  const picks = useRef(0)
  const [pickCount, setPickCount] = useState(0)
  const open = useCallback(async (id: number) => {
    const current = beginDetail()
    try { const detail = await getIncident(id); if (current()) setSelected(detail) }
    catch (f) { if (current()) setError(f instanceof Error ? f.message : String(f)) }
  }, [beginDetail])
  const pick = (id: number) => { picks.current += 1; setPickCount(picks.current); void open(id) }
  const load = useCallback(async (id?: number, seenPicks = picks.current) => {
    const current = beginList()
    setLoading(true)
    try {
      const next = await listIncidents()
      if (!current()) return
      setRows(next); setError(null)
      if (id && picks.current === seenPicks) await open(id)
    } catch (f) { if (current()) setError(f instanceof Error ? f.message : String(f)) }
    finally { if (current()) setLoading(false) }
  }, [beginList, open])
  useEffect(() => { const id = Number(params.get('selected')); void load(Number.isSafeInteger(id) && id > 0 ? id : undefined) }, []) // eslint-disable-line
  const counts = useMemo(() => ({ active: rows.filter((r) => active(r.status)).length, primary: rows.filter((r) => r.primary && active(r.status)).length }), [rows])
  return <section className="feature-control incident-mode-page" aria-label="인시던트"><div className="board-head"><div><h1>{featureControlTitle('/feature-control/incident-mode')}</h1><p>장애 선언부터 완화·관찰·종료까지 책임과 근거를 관리합니다.</p></div>
    <span className="filter-note">활성 {counts.active} · primary {counts.primary}</span><button className="btn" disabled={!writable()} onClick={() => setCreating(true)}>인시던트 선언</button></div>
    <FeatureControlTabs />{error && <div className="error-box" role="alert">{error}</div>}<div className="change-workspace" ref={reveal.workspace}><div className="change-list"><table><thead><tr><th>인시던트</th><th>SEV</th><th>상태</th><th>담당</th></tr></thead><tbody>
      {rows.map((row) => <tr key={row.id} className={selected?.id === row.id ? 'selected' : ''} aria-selected={selected?.id === row.id} {...selectableRow(() => { reveal.picked(row.id); pick(row.id) })}><td><strong>{row.title}</strong><span>{row.reference}{row.primary ? ' · primary' : ''}</span></td>
        <td><span className={`incident-sev ${row.severity.toLowerCase()}`}>{row.severity}</span></td><td>{STATUS[row.status]}</td><td>{row.ownerUserId ? `#${row.ownerUserId}` : '—'}</td></tr>)}</tbody></table>
      {loading && rows.length === 0 && <div className="page-status">불러오는 중…</div>}
      {!loading && rows.length === 0 && <div className="empty-hint">현재 환경의 인시던트가 없습니다</div>}</div>{selected ? <Detail incident={selected} reload={(id) => load(id, pickCount)} /> : <div className="change-empty">인시던트를 선택하면 영향·상태·타임라인을 확인할 수 있습니다.</div>}</div>
    {creating && <DeclareDialog close={() => setCreating(false)} created={(row) => { setCreating(false); void load(row.id) }} />}</section>
}
