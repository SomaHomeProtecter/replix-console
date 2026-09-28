import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import {
  cancelServiceNotice, createServiceNotice, endServiceNotice, getServiceNotice,
  listServiceNotices, publishServiceNotice, scheduleServiceNotice,
} from '../api/admin'
import type {
  FeatureControlPreset, ServiceNotice, ServiceNoticeCreate, ServiceNoticeKind,
} from '../api/types'
import { realmRoles } from '../auth'
import FeatureControlTabs from '../components/FeatureControlTabs'
import { formatKstShort } from '../format'
import { useWriting } from '../writing'

const STATUS_LABEL: Record<ServiceNotice['status'], string> = {
  DRAFT: '초안', SCHEDULED: '예약됨', PUBLISHED: '게시 중', ENDED: '종료', CANCELLED: '취소',
}
const KIND_LABEL: Record<ServiceNoticeKind, string> = {
  NOTICE: '일반 안내', MAINTENANCE: '점검 안내', INCIDENT: '장애 안내',
}
const PRESETS: { value: FeatureControlPreset['id']; label: string }[] = [
  { value: 'NORMAL_OPERATION', label: '정상 운영' }, { value: 'READ_ONLY', label: '읽기 전용' },
  { value: 'CHAT_BLOCK', label: '채팅 차단' }, { value: 'REPORT_LIMIT', label: '신고 제한' },
  { value: 'STAGE2_BYPASS', label: '2차 모더레이션 우회' },
  { value: 'PUBLIC_CONTENT_STOP', label: '외부 공개 콘텐츠 중지' },
  { value: 'PRIVACY_TRANSMISSION_STOP', label: '개인정보 전송 중지' },
  { value: 'VIDEO_OVERLAY_MINIMIZE', label: '비디오 오버레이 최소화' },
  { value: 'DISNEY_PLUS_ISOLATION', label: 'Disney+ 격리' },
]

// 서버(DTO·엔티티)와 같은 규칙 — 미리보기 href 가드와 제출 검증이 갈라지면 한쪽만 통과한 값이
// 서버에서 400으로 되돌아온다. 규칙을 한 곳에 두어 둘이 항상 같은 값을 받아들이게 한다.
const HTTPS_LINK = /^https:\/\/\S+$/

function canOperate() {
  const roles = realmRoles()
  return roles.includes('admin') || roles.includes('feature_flag_operator')
}

function localInputToIso(value: string) {
  return value ? new Date(value).toISOString() : null
}

function NoticePreview({ kind, title, message, linkUrl }: {
  kind: ServiceNoticeKind; title: string; message: string; linkUrl?: string | null
}) {
  return <div className={`notice-preview notice-${kind.toLowerCase()}`} aria-label="사용자 노출 미리보기">
    <span>{KIND_LABEL[kind]}</span><strong>{title || '공지 제목이 표시됩니다'}</strong>
    <p>{message || '사용자에게 공개할 메시지가 표시됩니다.'}</p>
    {/* 작성 중 미리보기도 같은 컴포넌트를 쓰므로, 아직 검증 전인 값이 href에 실리지 않게 여기서 한 번 더 막는다. */}
    {linkUrl && HTTPS_LINK.test(linkUrl) &&
      <a className="notice-link" href={linkUrl} target="_blank" rel="noopener noreferrer">전문 보기 ↗</a>}
  </div>
}

function NoticeCreateDialog({ onClose, onCreated }: {
  onClose: () => void; onCreated: (notice: ServiceNotice) => void
}) {
  const [kind, setKind] = useState<ServiceNoticeKind>('NOTICE')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [internalNote, setInternalNote] = useState('')
  const [changeSetId, setChangeSetId] = useState('')
  const [presetId, setPresetId] = useState<FeatureControlPreset['id'] | ''>('')
  const [linkUrl, setLinkUrl] = useState('')
  const [jira, setJira] = useState('HP-343')
  const [incident, setIncident] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { setWriting } = useWriting()

  const submit = async () => {
    const linkedId = changeSetId ? Number(changeSetId) : null
    const trimmedLink = linkUrl.trim()
    if (!title.trim() || !message.trim() || internalNote.trim().length < 10) {
      setError('제목, 공개 메시지, 10자 이상의 내부 메모를 입력하세요'); return
    }
    if (linkedId !== null && (!Number.isSafeInteger(linkedId) || linkedId <= 0)) {
      setError('변경 세트 ID는 양의 정수로 입력하세요'); return
    }
    if (trimmedLink && !HTTPS_LINK.test(trimmedLink)) {
      setError('링크 URL은 https:// 로 시작하는 공백 없는 주소여야 합니다'); return
    }
    const request: ServiceNoticeCreate = {
      kind, title: title.trim(), publicMessage: message.trim(), internalNote: internalNote.trim(),
      linkedChangeSetId: linkedId, presetId: presetId || null,
      jiraReference: jira.trim() || null, incidentReference: incident.trim() || null,
      // 빈 문자열은 서버가 400으로 거절한다 — 비었으면 null.
      linkUrl: trimmedLink || null,
    }
    setBusy(true); setWriting(true); setError(null)
    try { onCreated(await createServiceNotice(request)) }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { setBusy(false); setWriting(false) }
  }

  return <div className="dialog-backdrop" role="presentation">
    <div className="dialog notice-dialog" role="dialog" aria-modal="true" aria-labelledby="notice-create-title">
      <button type="button" className="modal-close" aria-label="닫기" disabled={busy} onClick={onClose}>✕</button>
      <h2 id="notice-create-title">새 사용자 공지</h2>
      <p className="sub">공개될 내용과 내부 운영 근거를 분리해 작성합니다.</p>
      <NoticePreview kind={kind} title={title} message={message} linkUrl={linkUrl.trim()} />
      {error && <div className="error-box" role="alert">{error}</div>}
      <div className="feature-form-grid">
        <label><span>유형</span><select value={kind} disabled={busy}
            onChange={(event) => setKind(event.target.value as ServiceNoticeKind)}>
          {Object.entries(KIND_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label><span>연결 프리셋</span><select value={presetId} disabled={busy}
            onChange={(event) => setPresetId(event.target.value as typeof presetId)}>
          <option value="">선택 안 함</option>{PRESETS.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}
        </select></label>
        <label className="span2"><span>제목</span><input value={title} maxLength={120} disabled={busy}
            onChange={(event) => setTitle(event.target.value)} /></label>
        <label className="span2"><span>공개 메시지</span><textarea value={message} rows={3} maxLength={1000}
            disabled={busy} onChange={(event) => setMessage(event.target.value)} /></label>
        <label className="span2"><span>내부 메모 <b>외부 비공개·필수</b></span><textarea value={internalNote}
            rows={2} maxLength={1000} disabled={busy} onChange={(event) => setInternalNote(event.target.value)} /></label>
        <label><span>변경 세트 ID</span><input inputMode="numeric" value={changeSetId} placeholder="선택"
            disabled={busy} onChange={(event) => setChangeSetId(event.target.value)} /></label>
        <label className="span2"><span>링크 URL <b>선택</b></span><input type="url" value={linkUrl}
            maxLength={500} disabled={busy} placeholder="https://replix.tv/terms"
            onChange={(event) => setLinkUrl(event.target.value)} /></label>
        <label><span>Jira</span><input value={jira} maxLength={100} disabled={busy}
            onChange={(event) => setJira(event.target.value)} /></label>
        <label className="span2"><span>인시던트</span><input value={incident} maxLength={100} placeholder="선택"
            disabled={busy} onChange={(event) => setIncident(event.target.value)} /></label>
      </div>
      <div className="dialog-actions"><button type="button" className="btn" disabled={busy} onClick={onClose}>취소</button>
        <button type="button" className="btn btn-blind" disabled={busy} onClick={() => void submit()}>
          {busy ? '생성 중…' : '공지 초안 생성'}
        </button></div>
    </div>
  </div>
}

function NoticeDetail({ notice, onReload }: {
  notice: ServiceNotice; onReload: (id?: number) => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { setWriting } = useWriting()

  const action = async (run: () => Promise<ServiceNotice>) => {
    if (reason.trim().length < 10) { setError('조치 사유를 10자 이상 입력하세요'); return }
    setBusy(true); setWriting(true); setError(null)
    try { const result = await run(); setReason(''); await onReload(result.id) }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { setBusy(false); setWriting(false) }
  }
  const schedule = () => action(() => scheduleServiceNotice(notice.id, notice.version,
    localInputToIso(startsAt)!, localInputToIso(endsAt), reason))

  return <aside className="change-detail notice-detail" aria-label={`사용자 공지 #${notice.id} 상세`}>
    <div className="change-detail-head"><div>
      <span className={`feature-state status-${notice.status.toLowerCase()}`}>{STATUS_LABEL[notice.status]}</span>
      <h2>{notice.title}</h2><p>#{notice.id} · {notice.environment} · {KIND_LABEL[notice.kind]}</p>
    </div><button type="button" className="btn" disabled={busy} onClick={() => void onReload(notice.id)}>새로고침</button></div>
    <NoticePreview kind={notice.kind} title={notice.title} message={notice.publicMessage}
      linkUrl={notice.linkUrl} />
    <dl className="change-summary">
      <div><dt>게시 시작</dt><dd>{notice.startsAt ? formatKstShort(notice.startsAt) : '—'}</dd></div>
      <div><dt>게시 종료</dt><dd>{notice.endsAt ? formatKstShort(notice.endsAt) : '—'}</dd></div>
      <div><dt>변경 연결</dt><dd>{notice.linkedChangeSetId ? `변경 세트 #${notice.linkedChangeSetId}` : '—'}</dd></div>
      <div><dt>프리셋</dt><dd>{notice.presetId ?? '—'}</dd></div>
      <div><dt>참조</dt><dd>{[notice.jiraReference, notice.incidentReference].filter(Boolean).join(' · ') || '—'}</dd></div>
      <div><dt>작성/게시</dt><dd>#{notice.createdByUserId} / {notice.publishedByUserId ? `#${notice.publishedByUserId}` : '—'}</dd></div>
    </dl>
    <div className="internal-note"><strong>내부 메모 · 외부 비공개</strong><p>{notice.internalNote}</p></div>
    {error && <div className="error-box" role="alert">{error}</div>}
    {['DRAFT', 'SCHEDULED', 'PUBLISHED'].includes(notice.status) && <div className="change-actions">
      <label><span>조치 사유 <b>필수</b></span><textarea rows={2} maxLength={500} value={reason}
          disabled={busy} onChange={(event) => setReason(event.target.value)} /></label>
      {notice.status === 'DRAFT' && <div className="notice-schedule">
        <label><span>게시 시작</span><input type="datetime-local" value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)} /></label>
        <label><span>게시 종료</span><input type="datetime-local" value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)} /></label>
      </div>}
      <div className="dialog-actions">
        {notice.status !== 'PUBLISHED' && <button className="btn" disabled={!canOperate() || busy}
            onClick={() => void action(() => cancelServiceNotice(notice.id, notice.version, reason))}>취소 처리</button>}
        {notice.status === 'DRAFT' && <><button className="btn" disabled={!canOperate() || busy || !startsAt}
            onClick={() => void schedule()}>예약 게시</button>
          <button className="btn btn-blind" disabled={!canOperate() || busy}
              onClick={() => void action(() => publishServiceNotice(notice.id, notice.version, reason))}>즉시 게시</button></>}
        {notice.status === 'SCHEDULED' && <button className="btn btn-blind" disabled={!canOperate() || busy}
            onClick={() => void action(() => publishServiceNotice(notice.id, notice.version, reason))}>지금 게시</button>}
        {notice.status === 'PUBLISHED' && <button className="btn btn-danger-solid" disabled={!canOperate() || busy}
            onClick={() => void action(() => endServiceNotice(notice.id, notice.version, reason))}>게시 종료</button>}
      </div>
    </div>}
    <h3>불변 이벤트</h3><ol className="change-events">{notice.events.map((event) => <li key={event.id}>
      <span>{formatKstShort(event.createdAt)}</span><strong>{event.type}</strong><p>{event.reason}</p>
    </li>)}</ol>
  </aside>
}

export default function ServiceNoticePage() {
  const [searchParams] = useSearchParams()
  const [notices, setNotices] = useState<ServiceNotice[]>([])
  const [selected, setSelected] = useState<ServiceNotice | null>(null)
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (detailId?: number) => {
    setLoading(true)
    try {
      const next = await listServiceNotices(); setNotices(next); setError(null)
      const id = detailId ?? selected?.id
      if (id) setSelected(await getServiceNotice(id))
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { setLoading(false) }
  }, [selected?.id])
  useEffect(() => {
    const id = Number(searchParams.get('selected'))
    void load(Number.isSafeInteger(id) && id > 0 ? id : undefined)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const counts = useMemo(() => ({
    published: notices.filter((notice) => notice.status === 'PUBLISHED').length,
    scheduled: notices.filter((notice) => notice.status === 'SCHEDULED').length,
  }), [notices])

  return <section className="feature-control notice-page" aria-label="사용자 공지 관리">
    <div className="board-head"><div><h1>기능 제어</h1><p>환경별 안내를 미리 보고 예약·게시·종료합니다.</p></div>
      <span className="filter-note">게시 중 {counts.published} · 예약 {counts.scheduled}</span>
      <button type="button" className="btn" disabled={!canOperate() || loading} onClick={() => setCreating(true)}>새 공지</button>
      <button type="button" className="btn refresh" disabled={loading} onClick={() => void load()}>새로고침</button></div>
    <FeatureControlTabs />
    {error && <div className="error-box" role="alert">{error}</div>}
    <div className="change-workspace"><div className="change-list report-table-wrap">
      <table><thead><tr><th>사용자 공지</th><th>상태</th><th>유형</th><th>생성</th></tr></thead>
        <tbody>{notices.map((notice) => <tr key={notice.id} className={selected?.id === notice.id ? 'selected' : ''}
            onClick={() => void getServiceNotice(notice.id).then(setSelected)}>
          <td><strong>{notice.title}</strong><span>#{notice.id} · {notice.incidentReference ?? notice.jiraReference ?? '참조 없음'}</span></td>
          <td><span className={`feature-state status-${notice.status.toLowerCase()}`}>{STATUS_LABEL[notice.status]}</span></td>
          <td>{KIND_LABEL[notice.kind]}</td><td>{formatKstShort(notice.createdAt)}</td>
        </tr>)}</tbody></table>
      {!loading && notices.length === 0 && <div className="empty-hint">아직 사용자 공지가 없습니다</div>}
    </div>{selected ? <NoticeDetail notice={selected} onReload={load} />
      : <div className="change-empty">공지를 선택하면 사용자 노출 미리보기와 게시 이력을 확인할 수 있습니다.</div>}</div>
    {creating && <NoticeCreateDialog onClose={() => setCreating(false)}
        onCreated={(notice) => { setCreating(false); setSelected(notice); void load(notice.id) }} />}
  </section>
}
