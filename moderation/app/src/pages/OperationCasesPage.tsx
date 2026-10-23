import { useCallback, useEffect, useState } from 'react'
import {
  addOperationCaseNote, assignOperationCase, getOperationCase, listOperationCases,
} from '../api/admin'
import type {
  CaseNoteType, OperationCaseDetail, OperationCaseRow, OperationCaseView,
} from '../api/types'
import { formatKstShort, isoToKstInput, kstInputToIso } from '@core/time'
import { moderateDenied } from '../permissions'
import { REASON_LABELS } from '../format'
import { useLatestRequest } from '@core/useLatestRequest'
import { selectableRow } from '../selectableRow'
import { useRevealPickedDetail } from '../revealPickedDetail'
import { CASE_NOTE_LABELS, caseEventLabel } from '../recordLabels'

const VIEWS: Array<[OperationCaseView, string]> = [
  ['ALL', '전체'], ['MINE', '내 담당'], ['UNASSIGNED', '미배정'], ['OVERDUE', '기한 초과'],
]

export default function OperationCasesPage() {
  const [view, setView] = useState<OperationCaseView>('ALL')
  const [rows, setRows] = useState<OperationCaseRow[]>([])
  const [selected, setSelected] = useState<OperationCaseDetail | null>(null)
  const reveal = useRevealPickedDetail(selected?.item.reportId)
  const [workloads, setWorkloads] = useState<Array<{ operator: { id: number; displayName: string | null }; assigned: number; overdue: number }>>([])
  const [truncated, setTruncated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const denied = moderateDenied() // 조회 전용 계정은 조치 버튼이 꺼진다(HP-529)
  const [assignee, setAssignee] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [reason, setReason] = useState('')
  const [noteType, setNoteType] = useState<CaseNoteType>('INTERNAL')
  const [note, setNote] = useState('')

  // 목록과 상세는 따로 순서를 지킨다(HP-527) — 필터를 빠르게 바꾸면 먼저 고른 필터의 늦은 응답이 지금 필터의 목록을
  // 덮어, 고른 필터와 다른 케이스가 보였다. 상세도 행을 빠르게 옮겨 고를 때 같은 일이 난다.
  const beginList = useLatestRequest()
  const beginDetail = useLatestRequest()
  const load = useCallback(async () => {
    const current = beginList()
    setLoading(true); setError(null)
    try {
      const page = await listOperationCases(view)
      if (!current()) return
      setRows(page.items); setWorkloads(page.workloads); setTruncated(page.truncated)
      setSelected((selectedNow) => selectedNow && page.items.some(
        (row) => row.reportId === selectedNow.item.reportId) ? selectedNow : null)
    } catch (e) { if (current()) setError(e instanceof Error ? e.message : String(e)) }
    finally { if (current()) setLoading(false) }
  }, [view, beginList])
  useEffect(() => { void load() }, [load])

  const applyDetail = (detail: OperationCaseDetail) => {
    setSelected(detail)
    setAssignee(detail.item.assignee ? String(detail.item.assignee.id) : '')
    setDueAt(isoToKstInput(detail.item.dueAt))
  }

  const open = async (id: number, reflectInUrl = true) => {
    const current = beginDetail()
    setError(null)
    try {
      const detail = await getOperationCase(id)
      if (!current()) return
      applyDetail(detail)
      if (reflectInUrl) {
        const url = new URL(window.location.href); url.searchParams.set('selected', String(id))
        window.history.replaceState(null, '', url)
      }
    }
    catch (e) { if (current()) setError(e instanceof Error ? e.message : String(e)) }
  }
  useEffect(() => {
    // 앱은 /moderation/<env>/ 아래에서 돈다(HP-456) — 루트 기준 경로와 같은지가 아니라 끝을 본다.
    // 라우터가 끝 슬래시·대소문자 차이도 같은 화면으로 그리므로 판정도 그만큼 느슨하게 한다.
    if (!/\/operation-cases\/?$/i.test(window.location.pathname)) return
    const selectedParam = new URLSearchParams(window.location.search).get('selected')
    const id = Number(selectedParam)
    if (Number.isInteger(id) && id > 0) void open(id, false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (work: () => Promise<OperationCaseDetail>) => {
    // 저장 응답이 오는 사이 다른 케이스를 열었으면 그 응답을 지금 상세에 그리지 않는다 — 그리면 열어 둔 케이스 화면에
    // 앞 케이스의 담당·version이 들어가, 다음 저장이 앞 케이스에 간다(2026-10-12 리뷰).
    const current = beginDetail()
    setBusy(true); setError(null)
    try { const detail = await work(); if (current()) applyDetail(detail); await load() }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  return <section className="feature-control" aria-label="운영 협업">
    <div className="board-head"><div><h1>운영 협업</h1><p>신고 케이스의 담당·인계·재검토와 동시 처리 상태를 감사합니다.</p></div>
      <button className="btn" type="button" disabled={loading} onClick={() => void load()}>새로고침</button></div>
    {denied && <p className="readonly-note">{denied}</p>}
    {error && <div className="error-box" role="alert">{error}</div>}
    {truncated && <div className="incident-guide"><strong>최근 열린 케이스 200건 기준</strong>
      <p>업무량과 목록은 조회 상한 안의 값입니다. 오래된 케이스는 기존 신고 큐에서 검색하세요.</p></div>}
    <div className="filter-bar" role="group" aria-label="케이스 필터">
      {VIEWS.map(([key, label]) => <button key={key} className="chip-f" aria-pressed={view === key}
          onClick={() => setView(key)}>{label}</button>)}
      <span className="filter-note">업무량 {workloads.map((w) => `${w.operator.displayName ?? `#${w.operator.id}`} ${w.assigned}${w.overdue ? `/${w.overdue} 초과` : ''}`).join(' · ') || '배정 없음'}</span>
    </div>
    <div className="change-workspace" ref={reveal.workspace}><div className="change-list"><table><thead><tr><th>케이스</th><th>담당</th><th>상태</th></tr></thead><tbody>
      {rows.map((row) => <tr key={row.reportId} aria-current={selected?.item.reportId === row.reportId}
          {...selectableRow(() => { reveal.picked(row.reportId); void open(row.reportId) })}><td><strong>신고 #{row.reportId}</strong><span>{row.messagePreview}</span></td>
        <td>{row.assignee?.displayName ?? '미배정'}</td><td>{row.overdue ? '기한 초과' : row.stale ? '오래된 상태' : row.reviewRequested ? '재검토 요청' : '진행 가능'}</td></tr>)}
    </tbody></table>{loading && rows.length === 0 && <div className="page-status">불러오는 중…</div>}
      {!loading && rows.length === 0 && <div className="empty-hint">조건에 맞는 열린 케이스가 없습니다</div>}</div>
    <aside className="change-detail" aria-label="케이스 상세">
      {!selected ? <div className="empty-hint">케이스를 선택하세요</div> : <>
        <span className="feature-state">version {selected.item.version}</span><h2>신고 #{selected.item.reportId}</h2>
        <p className="sub">{selected.item.targetUser.displayName} · {REASON_LABELS[selected.item.reason]} · 접수 {formatKstShort(selected.item.createdAt)}</p>
        {(selected.item.stale || selected.item.overdue) && <div className="incident-guide"><strong>동시 처리 확인 필요</strong><p>{selected.item.overdue ? '처리 기한을 지났습니다.' : '30분 이상 갱신되지 않은 상태입니다.'} 저장 전 최신 version을 다시 확인합니다.</p></div>}
        <div className="feature-form-grid"><label><span>담당자 사용자 ID</span><input value={assignee} placeholder="비우면 미배정" onChange={(e) => setAssignee(e.target.value)} /></label>
          <label><span>기한</span><input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></label>
          <label className="span2"><span>배정·인계 사유</span><input value={reason} onChange={(e) => setReason(e.target.value)} /></label></div>
        <button className="btn" type="button" disabled={busy || !reason.trim() || denied !== null} title={denied ?? undefined} onClick={() => void run(() => assignOperationCase(
          selected.item.reportId, selected.item.version, assignee ? Number(assignee) : null,
          kstInputToIso(dueAt), reason))}>담당·기한 저장</button>
        <h3>내부 메모·인수인계</h3><div className="feature-form-grid"><label><span>유형</span><select value={noteType} onChange={(e) => setNoteType(e.target.value as CaseNoteType)}>
          <option value="INTERNAL">내부 메모</option><option value="HANDOFF">인수인계</option><option value="REVIEW_REQUEST">재검토 요청</option></select></label>
          <label className="span2"><span>내용</span><textarea value={note} onChange={(e) => setNote(e.target.value)} /></label></div>
        <button className="btn" type="button" disabled={busy || !note.trim() || denied !== null} title={denied ?? undefined} onClick={() => void run(async () => {
          const next = await addOperationCaseNote(selected.item.reportId, selected.item.version, noteType, note); setNote(''); return next
        })}>기록 추가</button>
        <h3>협업 메모</h3><ol className="case-log">{selected.notes.map((entry) => <li key={entry.id}>
          <span>{formatKstShort(entry.createdAt)}</span><strong>{CASE_NOTE_LABELS[entry.type]}</strong>
          <p>{entry.body} · {entry.author.displayName ?? `#${entry.author.id}`}</p></li>)}</ol>
        {selected.notes.length === 0 && <div className="empty-hint">아직 등록된 메모가 없습니다</div>}
        <h3>감사 타임라인</h3><ol className="case-log">{selected.events.map((event) => <li key={event.id}>
          <span>{formatKstShort(event.createdAt)}</span><strong>{caseEventLabel(event.type)}</strong><p>{event.detail} · {event.actor.displayName ?? `#${event.actor.id}`}</p></li>)}</ol>
        {selected.events.length === 0 && <div className="empty-hint">아직 기록된 변경이 없습니다</div>}
      </>}
    </aside></div>
  </section>
}
