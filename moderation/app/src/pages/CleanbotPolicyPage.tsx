import { useCallback, useEffect, useRef, useState } from 'react'
import {
  activateCleanbotPolicy, approveCleanbotPolicy, createCleanbotPolicy, listCleanbotPolicies,
  requestCleanbotPolicyReview, retireCleanbotPolicy, simulateCleanbotPolicy, updateCleanbotPolicy,
} from '../api/admin'
import type { CleanbotPolicy, CleanbotSimulation } from '../api/types'
import Dialog from '@core/Dialog'
import { env } from '@core/env'
import { formatKstShort } from '@core/time'
import { moderateDenied } from '../permissions'
import { useLatestRequest } from '@core/useLatestRequest'
import { selectableRow } from '../selectableRow'
import { useRevealPickedDetail } from '../revealPickedDetail'
import { CLEANBOT_STATUS_LABELS } from '../recordLabels'

/**
 * 한 줄에 키=값인 칸(카테고리 매핑·라벨별 임계값)을 읽는다 — 첫 '='로 가르고, 값이 맞지 않거나(parse 가 null) 같은 키가 두 번
 * 나오면 거절한다. 같은 키를 말없이 받으면 마지막 줄만 남아, 운영자가 위 줄의 값이 적용됐다고 믿는다(HP-693 리뷰).
 */
function keyValueLines<T>(text: string, field: string, parse: (value: string) => T | null): Record<string, T> {
  const entries = new Map<string, T>()
  for (const line of text.split('\n').filter((l) => l.trim())) {
    const separator = line.indexOf('=')
    const key = line.slice(0, separator).trim()
    const value = separator < 1 ? null : parse(line.slice(separator + 1).trim())
    if (!key || value === null) throw new Error(`${field} 형식 오류: ${line}`)
    if (entries.has(key)) throw new Error(`${field}에 같은 항목이 두 번 있습니다: ${key}`)
    entries.set(key, value)
  }
  return Object.fromEntries(entries)
}

export default function CleanbotPolicyPage() {
  const [policies, setPolicies] = useState<CleanbotPolicy[]>([])
  const [selected, setSelected] = useState<CleanbotPolicy | null>(null)
  const reveal = useRevealPickedDetail(selected?.id)
  const [simulation, setSimulation] = useState<CleanbotSimulation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const denied = moderateDenied() // 조회 전용 계정은 조치 버튼이 꺼진다(HP-529)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CleanbotPolicy | null>(null)
  const [name, setName] = useState('')
  const [blocked, setBlocked] = useState('')
  const [allowed, setAllowed] = useState('')
  const [threshold, setThreshold] = useState('0.7')
  const [mapping, setMapping] = useState('')
  const [labelThresholds, setLabelThresholds] = useState('')
  const [reason, setReason] = useState('')
  const [changeSetId, setChangeSetId] = useState('')
  const begin = useLatestRequest()
  const load = useCallback(async (selectedId?: number) => {
    const current = begin() // 늦게 온 응답이 새 목록을 덮지 않게(HP-527)
    setLoading(true)
    try {
      const rows = await listCleanbotPolicies()
      if (!current()) return
      setPolicies(rows)
      setSelected((selectedNow) => {
        const id = selectedId ?? selectedNow?.id
        return id ? rows.find((p) => p.id === id) ?? null : null
      })
    }
    catch (e) { if (current()) setError(e instanceof Error ? e.message : String(e)) }
    finally { if (current()) setLoading(false) }
  }, [begin])
  useEffect(() => { void load() }, [load])
  // 운영자가 정책을 고른 횟수 — 저장·dry-run 응답이 오는 사이 다른 정책을 골랐으면 그 결과를 지금 상세에 그리지 않는다
  // (그리면 고른 정책의 화면에 앞 정책의 결과·revision이 섞여, 다음 조치가 엉뚱한 정책에 간다 — 2026-10-12 리뷰).
  const picks = useRef(0)
  const pick = (policy: CleanbotPolicy) => { picks.current += 1; setSelected(policy); setSimulation(null) }
  const run = async (work: () => Promise<CleanbotPolicy>) => {
    const seen = picks.current
    setBusy(true); setError(null)
    try {
      const result = await work()
      const still = picks.current === seen
      if (still) { setSelected(result); setReason(''); setChangeSetId('') }
      await load(still ? result.id : undefined)
    }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }
  const dryRun = async (policyId: number) => {
    const seen = picks.current
    setBusy(true)
    try { const result = await simulateCleanbotPolicy(policyId, 100); if (picks.current === seen) setSimulation(result) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }
  const openForm = (policy: CleanbotPolicy | null) => {
    setEditing(policy); setName(policy?.name ?? '')
    setBlocked(policy?.blockedTerms.join(', ') ?? ''); setAllowed(policy?.allowedTerms.join(', ') ?? '')
    setThreshold(String(policy?.threshold ?? 0.7))
    setMapping(policy ? Object.entries(policy.categoryMapping).map(([from, to]) => `${from}=${to}`).join('\n') : '')
    setLabelThresholds(Object.entries(policy?.categoryThresholds ?? {}).map(([label, value]) => `${label}=${value}`).join('\n'))
    setError(null); setFormOpen(true)
  }
  const categoryMapping = () => keyValueLines(mapping, '카테고리 매핑', (value) => value || null)
  // 라벨 이름은 서버가 모델 라벨로 거른다(모르는 라벨이면 쓸 수 있는 라벨과 함께 거절) — 여기서는 모양과 범위만 본다.
  const categoryThresholds = () => keyValueLines(labelThresholds, '라벨별 임계값', (value) => {
    const n = Number(value)
    return value && n >= 0 && n <= 1 ? n : null
  })
  const parsedChangeSetId = Number(changeSetId)
  const validChangeSetId = Number.isInteger(parsedChangeSetId) && parsedChangeSetId > 0
  return <section className="feature-control" aria-label="클린봇 정책">
    <div className="board-head"><div><h1>클린봇 정책</h1><p>정책 버전과 과거 차단 표본 dry-run을 분리해 운영 데이터 변경 없이 비교합니다.</p></div>
      <button className="btn" type="button" disabled={denied !== null} title={denied ?? undefined} onClick={() => openForm(null)}>새 정책</button></div>
    {denied && <p className="readonly-note">{denied}</p>}
    {error && <div className="error-box" role="alert">{error}</div>}
    <div className="change-workspace" ref={reveal.workspace}><div className="change-list"><table><thead><tr><th>정책 버전</th><th>상태</th></tr></thead><tbody>
      {policies.map((p) => <tr key={p.id} aria-current={selected?.id === p.id} {...selectableRow(() => { reveal.picked(p.id); pick(p) })}>
        <td><strong>{p.name}</strong><span>#{p.id} · rev {p.revision}</span></td><td>{CLEANBOT_STATUS_LABELS[p.status]}</td></tr>)}</tbody></table>
      {loading && policies.length === 0 && <div className="page-status">불러오는 중…</div>}
      {!loading && policies.length === 0 && <div className="empty-hint">정책 버전이 없습니다</div>}</div>
      <aside className="change-detail">{!selected ? <div className="empty-hint">정책을 선택하세요</div> : <>
        <span className="feature-state">{CLEANBOT_STATUS_LABELS[selected.status]}</span><h2>{selected.name}</h2><p className="sub">작성 {selected.createdBy.displayName} · {formatKstShort(selected.createdAt)}</p>
        <dl className="change-summary"><div><dt>차단어</dt><dd>{selected.blockedTerms.join(', ') || '—'}</dd></div>
          <div><dt>허용어</dt><dd>{selected.allowedTerms.join(', ') || '—'}</dd></div><div><dt>임계값</dt><dd>{selected.threshold}</dd></div>
          <div><dt>라벨별 임계값</dt><dd>{Object.entries(selected.categoryThresholds ?? {}).map(([label, value]) => `${label} ${value}`).join(', ') || '—'}</dd></div>
          <div><dt>카테고리 매핑</dt><dd>{Object.entries(selected.categoryMapping).map(([from, to]) => `${from} → ${to}`).join(', ') || '—'}</dd></div>
          <div><dt>PROD 변경 세트</dt><dd>{selected.activatedChangeSetId ? `#${selected.activatedChangeSetId}` : '—'}</dd></div></dl>
        <div className="change-actions">
          <label><span>조치 사유</span><input value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          {env.environment === 'PROD' && <label><span>적용 완료 변경 세트 ID</span><input value={changeSetId} onChange={(e) => setChangeSetId(e.target.value)} /></label>}
          <div className="dialog-actions">
            {selected.status === 'DRAFT' && <button className="btn" type="button" disabled={busy || denied !== null} title={denied ?? undefined} onClick={() => openForm(selected)}>초안 수정</button>}
            {selected.status === 'DRAFT' && <button className="btn" disabled={busy || !reason.trim() || denied !== null} title={denied ?? undefined} onClick={() => void run(() => requestCleanbotPolicyReview(selected.id, selected.revision, reason))}>검토 요청</button>}
            {selected.status === 'REVIEW_REQUESTED' && <button className="btn" disabled={busy || !reason.trim() || denied !== null} title={denied ?? undefined} onClick={() => void run(() => approveCleanbotPolicy(selected.id, selected.revision, reason))}>승인</button>}
            {(selected.status === 'APPROVED' || selected.status === 'RETIRED') && <button className="btn" disabled={busy || !reason.trim() || (env.environment === 'PROD' && !validChangeSetId) || denied !== null} title={denied ?? undefined} onClick={() => void run(() => activateCleanbotPolicy(selected.id, selected.revision, reason, validChangeSetId ? parsedChangeSetId : undefined))}>{selected.status === 'RETIRED' ? '이 버전으로 복구' : '활성화'}</button>}
            {selected.status === 'ACTIVE' && <button className="btn" disabled={busy || !reason.trim() || (env.environment === 'PROD' && !validChangeSetId) || denied !== null} title={denied ?? undefined} onClick={() => void run(() => retireCleanbotPolicy(selected.id, selected.revision, reason, validChangeSetId ? parsedChangeSetId : undefined))}>정책 폐기</button>}
            <button className="btn" disabled={busy || denied !== null} title={denied ?? undefined} onClick={() => void dryRun(selected.id)}>표본 dry-run</button>
          </div>
        </div>
        {simulation && <div className="incident-guide"><strong>무변경 시뮬레이션 · 표본 {simulation.sampleCount}</strong>
          <p>신규 차단 {simulation.newlyBlocked} · 신규 허용 {simulation.newlyAllowed} · 유지 {simulation.unchanged} · 실패 {simulation.failures}</p><p>{simulation.limitation}</p></div>}
      </>}</aside></div>
    {formOpen && <Dialog label={editing ? '클린봇 정책 초안 수정' : '새 클린봇 정책'} title={editing ? '클린봇 정책 초안 수정' : '새 클린봇 정책'}
        className="feature-dialog" busy={busy} onClose={() => setFormOpen(false)} closeOnBackdrop={false}>
      <div className="feature-form-grid"><label className="span2"><span>이름</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="span2"><span>차단어 (쉼표 구분)</span><textarea value={blocked} onChange={(e) => setBlocked(e.target.value)} /></label>
        <label className="span2"><span>허용어 (쉼표 구분)</span><textarea value={allowed} onChange={(e) => setAllowed(e.target.value)} /></label>
        <label><span>임계값 0~1</span><input type="number" min="0" max="1" step="0.05" value={threshold} onChange={(e) => setThreshold(e.target.value)} /></label>
        <label className="span2"><span>라벨별 임계값 (한 줄에 라벨=값, 없는 라벨은 위 임계값)</span><textarea value={labelThresholds} placeholder="악플/욕설=0.8" onChange={(e) => setLabelThresholds(e.target.value)} /></label>
        <label className="span2"><span>카테고리 매핑 (한 줄에 원본=표준)</span><textarea value={mapping} placeholder="지역=regional_hate" onChange={(e) => setMapping(e.target.value)} /></label></div>
      <div className="dialog-actions"><button className="btn" type="button" disabled={busy} onClick={() => setFormOpen(false)}>취소</button><button className="btn" type="button" disabled={busy || !name.trim() || Number(threshold) < 0 || Number(threshold) > 1} onClick={async () => {
        setBusy(true); setError(null); try {
          const payload = { name, blockedTerms: blocked.split(',').map((v) => v.trim()).filter(Boolean), allowedTerms: allowed.split(',').map((v) => v.trim()).filter(Boolean), threshold: Number(threshold), categoryMapping: categoryMapping(), categoryThresholds: categoryThresholds(), basePolicyId: editing?.basePolicyId ?? selected?.id ?? null }
          const p = editing ? await updateCleanbotPolicy(editing.id, editing.revision, payload) : await createCleanbotPolicy(payload)
          setFormOpen(false); setSelected(p); await load(p.id)
          // BE 릴리스 전 서버는 이 칸을 모르고 버린다 — 초안은 저장됐지만 라벨별 임계값이 빠졌음을 알린다. 저장 전에는 알 길이
          // 없다(정책이 하나도 없는 서버는 목록으로도 가릴 수 없다). 목록 새로고침 오류가 있으면 지우지 않고 함께 보인다.
          if (Object.entries(payload.categoryThresholds).some(([label, value]) => p.categoryThresholds?.[label] !== value)) {
            const dropped = '이 서버는 아직 라벨별 임계값을 받지 않습니다 — 저장된 초안에는 라벨별 임계값이 빠졌습니다'
            setError((current) => current ? `${current} · ${dropped}` : dropped)
          }
        } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
      }}>{editing ? '초안 저장' : '초안 생성'}</button></div></Dialog>}
  </section>
}
