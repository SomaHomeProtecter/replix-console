import { type FormEvent, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { getIncidentTimeline } from '../api/admin'
import type { IncidentTimeline } from '../api/types'
import FeatureControlTabs, { featureControlTitle } from '../components/FeatureControlTabs'
import { formatKstShort } from '@core/time'
import {
  CHANGE_SET_STATUS_LABELS, changeSetEventLabel, INCIDENT_RESOURCE_LABELS, INCIDENT_STATUS_LABELS, incidentEventLabel,
  NOTICE_STATUS_LABELS, noticeEventLabel,
} from '../recordLabels'
import { useLatestRequest } from '../useLatestRequest'

const SOURCE_LABEL = { CHANGE_SET: '변경 세트', NOTICE: '사용자 공지', INCIDENT: '인시던트' } as const
/* 한 타임라인에 세 종류의 기록이 섞인다 — 기록 이름과 상태는 그 기록의 종류로 한글 표를 고른다(HP-527). */
const EVENT_LABEL = { CHANGE_SET: changeSetEventLabel, NOTICE: noticeEventLabel, INCIDENT: incidentEventLabel } as const
const STATUS_LABEL: Record<keyof typeof SOURCE_LABEL, Readonly<Record<string, string>>> = {
  CHANGE_SET: CHANGE_SET_STATUS_LABELS, NOTICE: NOTICE_STATUS_LABELS, INCIDENT: INCIDENT_STATUS_LABELS,
}

export default function IncidentTimelinePage() {
  const [params] = useSearchParams()
  const [reference, setReference] = useState('')
  const [timeline, setTimeline] = useState<IncidentTimeline | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const begin = useLatestRequest()
  const load = async (incident: string) => {
    const current = begin() // 늦게 온 응답이 새 조회 결과를 덮지 않게(HP-527)
    setLoading(true); setError(null)
    try { const next = await getIncidentTimeline(incident); if (current()) setTimeline(next) }
    catch (failure) { if (current()) { setTimeline(null); setError(failure instanceof Error ? failure.message : String(failure)) } }
    finally { if (current()) setLoading(false) }
  }
  const search = (event: FormEvent) => {
    event.preventDefault(); const incident = reference.trim()
    if (!incident) { setError('인시던트 참조를 입력하세요'); return }
    void load(incident)
  }
  useEffect(() => { const incident = params.get('reference')?.trim()
    if (incident) { setReference(incident); void load(incident) } }, []) // eslint-disable-line

  return <section className="feature-control incident-page" aria-label="인시던트 통합 타임라인">
    <div className="board-head"><div><h1>{featureControlTitle('/feature-control/incidents')}</h1>
      <p>인시던트에 연결된 변경·프리셋·공지와 revision 흐름을 하나의 감사 타임라인으로 확인합니다.</p></div>
      {timeline && <span className="filter-note">연결 소스 {timeline.sourceCount} · 이벤트 {timeline.entries.length}</span>}
    </div>
    <FeatureControlTabs />
    <form className="incident-search" role="search" onSubmit={search}>
      <label htmlFor="incident-reference">인시던트 참조</label>
      <input id="incident-reference" value={reference} maxLength={100} placeholder="예: INC-42"
          disabled={loading} onChange={(event) => setReference(event.target.value)} />
      <button type="submit" className="btn" disabled={loading}>{loading ? '조회 중…' : '타임라인 조회'}</button>
    </form>
    {error && <div className="error-box" role="alert">{error}</div>}
    {!timeline && !error && <div className="incident-guide"><strong>인시던트 참조로 조회하세요.</strong>
      <span>현재 연결 환경의 변경 세트와 사용자 공지만 표시하며 다른 환경의 이력은 섞이지 않습니다.</span></div>}
    {timeline && <div className="incident-result">
      <dl className="incident-summary">
        <div><dt>인시던트</dt><dd>{timeline.incidentReference}</dd></div>
        <div><dt>환경</dt><dd><span className={`feature-state env-${timeline.environment.toLowerCase()}`}>{timeline.environment}</span></dd></div>
        <div><dt>Jira</dt><dd>{timeline.jiraReferences.join(' · ') || '—'}</dd></div>
        <div><dt>연결 소스</dt><dd>{timeline.sourceCount}개</dd></div>
      </dl>
      {timeline.entries.length === 0 ? <div className="empty-hint">연결된 변경 또는 공지 이력이 없습니다</div>
        : <ol className="incident-timeline">{timeline.entries.map((entry, index) =>
          <li key={`${entry.sourceType}-${entry.sourceId}-${entry.occurredAt}-${index}`}>
            <span className={`incident-dot source-${entry.sourceType.toLowerCase()}`} aria-hidden="true" />
            <time dateTime={entry.occurredAt}>{formatKstShort(entry.occurredAt)}</time>
            <article><header><span className={`incident-source source-${entry.sourceType.toLowerCase()}`}>
              {SOURCE_LABEL[entry.sourceType]}</span><strong>{EVENT_LABEL[entry.sourceType](entry.eventType)}</strong>
              <span className="feature-state">{STATUS_LABEL[entry.sourceType][entry.sourceStatus] ?? entry.sourceStatus}</span></header>
              <h2>{entry.sourceTitle}</h2><p>{entry.reason}</p>
              <div className="incident-links">
                {entry.sourceType === 'CHANGE_SET' && <Link to={`/feature-control/change-sets?selected=${entry.sourceId}`}>
                  변경 세트 #{entry.sourceId}</Link>}
                {entry.sourceType === 'NOTICE' && <Link to={`/feature-control/notices?selected=${entry.sourceId}`}>
                  공지 #{entry.sourceId}</Link>}
                {entry.sourceType === 'INCIDENT' && <Link to={`/feature-control/incident-mode?selected=${entry.sourceId}`}>
                  인시던트 #{entry.sourceId}</Link>}
                {entry.linkedChangeSetId && <Link to={`/feature-control/change-sets?selected=${entry.linkedChangeSetId}`}>
                  연결 변경 세트 #{entry.linkedChangeSetId}</Link>}
                {entry.presetId && <span>프리셋 {entry.presetId}</span>}
                {entry.linkedResourceType === 'CHANGE_SET' && entry.linkedResourceId && <Link to={`/feature-control/change-sets?selected=${entry.linkedResourceId}`}>
                  연결 변경 세트 #{entry.linkedResourceId}</Link>}
                {entry.linkedResourceType === 'NOTICE' && entry.linkedResourceId && <Link to={`/feature-control/notices?selected=${entry.linkedResourceId}`}>
                  연결 공지 #{entry.linkedResourceId}</Link>}
                {entry.linkedResourceType && entry.linkedResourceId && !['CHANGE_SET', 'NOTICE'].includes(entry.linkedResourceType)
                  && <span>연결 {INCIDENT_RESOURCE_LABELS[entry.linkedResourceType]} {entry.linkedResourceId}</span>}
                {entry.jiraReference && <span>Jira {entry.jiraReference}</span>}
                <span>운영자 #{entry.actorUserId}</span>
              </div>
              {entry.revisions.length > 0 && <div className="incident-revisions">
                {entry.revisions.map((revision) => <code key={revision.flagKey}>{revision.flagKey}
                  <b>r{revision.expectedRevision} → {revision.appliedRevision == null ? '미적용' : `r${revision.appliedRevision}`}</b>
                </code>)}
              </div>}
            </article>
          </li>)}</ol>}
    </div>}
  </section>
}
