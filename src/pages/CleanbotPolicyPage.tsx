import { useCallback, useEffect, useState } from 'react'
import {
  activateCleanbotPolicy, approveCleanbotPolicy, createCleanbotPolicy, listCleanbotPolicies,
  requestCleanbotPolicyReview, simulateCleanbotPolicy, updateCleanbotPolicy,
} from '../api/admin'
import type { CleanbotPolicy, CleanbotSimulation } from '../api/types'
import { env } from '../env'
import { formatKstShort } from '../format'

export default function CleanbotPolicyPage() {
  const [policies, setPolicies] = useState<CleanbotPolicy[]>([])
  const [selected, setSelected] = useState<CleanbotPolicy | null>(null)
  const [simulation, setSimulation] = useState<CleanbotSimulation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CleanbotPolicy | null>(null)
  const [name, setName] = useState('')
  const [blocked, setBlocked] = useState('')
  const [allowed, setAllowed] = useState('')
  const [threshold, setThreshold] = useState('0.7')
  const [mapping, setMapping] = useState('')
  const [reason, setReason] = useState('')
  const [changeSetId, setChangeSetId] = useState('')
  const load = useCallback(async (selectedId?: number) => {
    try {
      const rows = await listCleanbotPolicies(); setPolicies(rows)
      setSelected((current) => {
        const id = selectedId ?? current?.id
        return id ? rows.find((p) => p.id === id) ?? null : null
      })
    }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [])
  useEffect(() => { void load() }, [load])
  const run = async (work: () => Promise<CleanbotPolicy>) => {
    setBusy(true); setError(null)
    try { const result = await work(); setSelected(result); setReason(''); setChangeSetId(''); await load(result.id) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }
  const openForm = (policy: CleanbotPolicy | null) => {
    setEditing(policy); setName(policy?.name ?? '')
    setBlocked(policy?.blockedTerms.join(', ') ?? ''); setAllowed(policy?.allowedTerms.join(', ') ?? '')
    setThreshold(String(policy?.threshold ?? 0.7))
    setMapping(policy ? Object.entries(policy.categoryMapping).map(([from, to]) => `${from}=${to}`).join('\n') : '')
    setError(null); setFormOpen(true)
  }
  const categoryMapping = () => Object.fromEntries(mapping.split('\n').filter((line) => line.trim()).map((line) => {
    const separator = line.indexOf('=')
    if (separator < 1 || !line.slice(separator + 1).trim()) throw new Error(`카테고리 매핑 형식 오류: ${line}`)
    return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()]
  }))
  const parsedChangeSetId = Number(changeSetId)
  const validChangeSetId = Number.isInteger(parsedChangeSetId) && parsedChangeSetId > 0
  return <section className="feature-page" aria-label="클린봇 정책">
    <div className="page-title-row"><div><h1>클린봇 정책</h1><p>정책 버전과 과거 차단 표본 dry-run을 분리해 운영 데이터 변경 없이 비교합니다.</p></div>
      <button className="btn" type="button" onClick={() => openForm(null)}>새 정책</button></div>
    {error && <div className="error-box" role="alert">{error}</div>}
    <div className="change-workspace"><div className="change-list"><table><thead><tr><th>정책 버전</th><th>상태</th></tr></thead><tbody>
      {policies.map((p) => <tr key={p.id} aria-current={selected?.id === p.id} onClick={() => { setSelected(p); setSimulation(null) }}>
        <td><strong>{p.name}</strong><span>#{p.id} · rev {p.revision}</span></td><td>{p.status}</td></tr>)}</tbody></table>
      {policies.length === 0 && <div className="empty-hint">정책 버전이 없습니다</div>}</div>
      <aside className="change-detail">{!selected ? <div className="empty-hint">정책을 선택하세요</div> : <>
        <span className="feature-state">{selected.status}</span><h2>{selected.name}</h2><p className="sub">작성 {selected.createdBy.displayName} · {formatKstShort(selected.createdAt)}</p>
        <dl className="change-summary"><div><dt>차단어</dt><dd>{selected.blockedTerms.join(', ') || '—'}</dd></div>
          <div><dt>허용어</dt><dd>{selected.allowedTerms.join(', ') || '—'}</dd></div><div><dt>임계값</dt><dd>{selected.threshold}</dd></div>
          <div><dt>카테고리 매핑</dt><dd>{Object.entries(selected.categoryMapping).map(([from, to]) => `${from} → ${to}`).join(', ') || '—'}</dd></div>
          <div><dt>PROD 변경 세트</dt><dd>{selected.activatedChangeSetId ? `#${selected.activatedChangeSetId}` : '—'}</dd></div></dl>
        <label><span>조치 사유</span><input value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        {env.environment === 'PROD' && <label><span>적용 완료 변경 세트 ID</span><input value={changeSetId} onChange={(e) => setChangeSetId(e.target.value)} /></label>}
        <div className="dialog-actions">
          {selected.status === 'DRAFT' && <button className="btn" type="button" disabled={busy} onClick={() => openForm(selected)}>초안 수정</button>}
          {selected.status === 'DRAFT' && <button className="btn" disabled={busy || !reason.trim()} onClick={() => void run(() => requestCleanbotPolicyReview(selected.id, selected.revision, reason))}>검토 요청</button>}
          {selected.status === 'REVIEW_REQUESTED' && <button className="btn" disabled={busy || !reason.trim()} onClick={() => void run(() => approveCleanbotPolicy(selected.id, selected.revision, reason))}>승인</button>}
          {(selected.status === 'APPROVED' || selected.status === 'RETIRED') && <button className="btn" disabled={busy || !reason.trim() || (env.environment === 'PROD' && !validChangeSetId)} onClick={() => void run(() => activateCleanbotPolicy(selected.id, selected.revision, reason, validChangeSetId ? parsedChangeSetId : undefined))}>{selected.status === 'RETIRED' ? '이 버전으로 복구' : '활성화'}</button>}
          <button className="btn" disabled={busy} onClick={async () => { setBusy(true); try { setSimulation(await simulateCleanbotPolicy(selected.id, 100)) } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) } }}>표본 dry-run</button>
        </div>
        {simulation && <div className="incident-guide"><strong>무변경 시뮬레이션 · 표본 {simulation.sampleCount}</strong>
          <p>신규 차단 {simulation.newlyBlocked} · 신규 허용 {simulation.newlyAllowed} · 유지 {simulation.unchanged} · 실패 {simulation.failures}</p><p>{simulation.limitation}</p></div>}
      </>}</aside></div>
    {formOpen && <div className="modal-backdrop"><div className="modal-card"><div className="dialog-head"><h2>{editing ? '클린봇 정책 초안 수정' : '새 클린봇 정책'}</h2></div>
      <div className="dialog-fields"><label className="span2"><span>이름</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="span2"><span>차단어 (쉼표 구분)</span><textarea value={blocked} onChange={(e) => setBlocked(e.target.value)} /></label>
        <label className="span2"><span>허용어 (쉼표 구분)</span><textarea value={allowed} onChange={(e) => setAllowed(e.target.value)} /></label>
        <label><span>임계값 0~1</span><input type="number" min="0" max="1" step="0.05" value={threshold} onChange={(e) => setThreshold(e.target.value)} /></label>
        <label className="span2"><span>카테고리 매핑 (한 줄에 원본=표준)</span><textarea value={mapping} placeholder="지역=regional_hate" onChange={(e) => setMapping(e.target.value)} /></label></div>
      <div className="dialog-actions"><button className="btn" type="button" onClick={() => setFormOpen(false)}>취소</button><button className="btn" type="button" disabled={busy || !name.trim() || Number(threshold) < 0 || Number(threshold) > 1} onClick={async () => {
        setBusy(true); setError(null); try {
          const payload = { name, blockedTerms: blocked.split(',').map((v) => v.trim()).filter(Boolean), allowedTerms: allowed.split(',').map((v) => v.trim()).filter(Boolean), threshold: Number(threshold), categoryMapping: categoryMapping(), basePolicyId: editing?.basePolicyId ?? selected?.id ?? null }
          const p = editing ? await updateCleanbotPolicy(editing.id, editing.revision, payload) : await createCleanbotPolicy(payload)
          setFormOpen(false); setSelected(p); await load(p.id)
        } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
      }}>{editing ? '초안 저장' : '초안 생성'}</button></div></div></div>}
  </section>
}
