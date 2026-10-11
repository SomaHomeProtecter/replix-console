import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { isoToKstInput, kstInputToIso } from '@core/time'
import { api, ApiError, type Collection, type Density, type Episode, type Injection, type InjectionKind, type NewPlanItem, type NewSceneNote, type Plan, type PlanView, type Post, type PostsPage, type Prompt, type PromptVersion, type SceneNote, type SourceKind, type SyncAnchor, type Work } from './api'
import { canRead, canWrite, currentUser, logout } from './auth'
import { OTHER, WORKSPACE, type Env } from './env'
import { seedingHost, type ProductionWriteSummary } from './host'
import { callOther, type EngagementSummary, type ExternalItem, type ExternalResult, type PlanItem } from './api'
import { secondaryToken, secondarySignedIn, secondaryLogout } from './secondaryAuth'
import './seeding.css'

/* 시딩 도구 화면(HP-435/436) — 2026-09-26 전면 재설계.
   원칙(조현빈): 함축·생략보다 각 기능의 용도가 문장으로 이해돼야 한다. 직관적인 것은 단순한 것이 아니고, 친절한 것은 장황한 것이
   아니다. 표·그래프·목록은 담길 분량에 맞게 넓게 잡는다.
   구조: 왼쪽에 작품·회차 목록, 오른쪽에 고른 회차의 네 단계를 위에서 아래로. 단계마다 "무엇을 하는 단계"와 "지금 상태"를 먼저 말한다.
   라우팅은 없다(관리자 한 명이 한 회차씩 다루는 도구). 진행 중인 작업은 2초마다 다시 읽는다.
   모양은 콘솔 공용 기반의 토큰·버튼과 seeding.css(sd- 클래스)를 쓴다 — 조치 화면과 같은 패널·표·상태 알약(HP-525). */

const KST = 'Asia/Seoul'
const WEEKDAYS = ['', '월', '화', '수', '목', '금', '토', '일']
const SOURCE_LABEL: Record<SourceKind, string> = { DCINSIDE: '디시인사이드', THEQOO: '더쿠' }
const SOURCE_SHORT: Record<SourceKind, string> = { DCINSIDE: '디시', THEQOO: '더쿠' }
const KIND_LABEL: Record<InjectionKind, string> = { VERBATIM: '그대로', LIGHT_EDIT: '살짝 고침', VARIANT: '다시 씀', MANUAL: '새로 씀' }
const KIND_DESC: Record<InjectionKind, string> = {
  VERBATIM: '수집한 글을 한 글자도 바꾸지 않고 넣습니다. "ㅋㅋㅋㅋ", "미쳤다"처럼 누구나 똑같이 쓸 만한 짧은 반응에만 씁니다.',
  LIGHT_EDIT: '수집한 글에서 한두 군데만 고칩니다. 어미나 조사, ㅋ 개수 정도를 손보고 말투와 띄어쓰기는 그대로 두어, 남의 글을 그대로 옮기지 않으면서 원래 느낌을 지킵니다. 대부분의 글이 여기에 해당합니다.',
  VARIANT: '뜻과 감정은 지키고 문장을 다시 씁니다. 욕설이 문장의 뼈대라 한두 군데 고쳐서는 안 되는 글에 씁니다.',
  MANUAL: '수집한 글이 적은 구간에 AI가 자막과 장면 메모에 있는 사실만 근거로 새로 씁니다.',
}
/* 상태 알약의 색 — 조치 화면의 상태 표기와 같은 뜻으로 쓴다: 초록 = 끝남, 파랑 = 진행·사람 차례, 호박 = 손볼 일(실패), 회색 = 대기·취소.
   빨강은 쓰지 않는다 — 콘솔에서 빨강은 되돌리기 어려운 조치(지우기) 전용이다. */
type Tone = 'on' | 'pending' | 'warn' | 'idle'
const COLL_STATUS: Record<Collection['status'], { label: string; tone: Tone }> = {
  QUEUED: { label: '대기 중', tone: 'idle' }, RUNNING: { label: '수집 중', tone: 'pending' },
  DONE: { label: '완료', tone: 'on' }, FAILED: { label: '실패', tone: 'warn' }, CANCELLED: { label: '취소됨', tone: 'idle' },
}
const PLAN_STATUS: Record<Plan['status'], { label: string; tone: Tone }> = {
  DRAFT: { label: '검수 대기', tone: 'pending' }, RUNNING: { label: '넣는 중', tone: 'pending' }, EXECUTED: { label: '넣기 완료', tone: 'on' },
}

function fmtKst(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = {}) {
  if (!iso) return '없음'
  return new Intl.DateTimeFormat('ko-KR', { timeZone: KST, hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', ...opts }).format(new Date(iso))
}
function fmtTime(iso: string | null | undefined) { return iso ? new Intl.DateTimeFormat('ko-KR', { timeZone: KST, hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(iso)) : '없음' }
function fmtSec(sec: number | null | undefined) {
  if (sec == null || !Number.isFinite(sec)) return '--:--'
  const s = Math.max(0, sec); const m = Math.floor(s / 60); const r = Math.floor(s % 60)
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}
function fmtDuration(a: string | null, b: string | null) {
  if (!a || !b) return '측정 중'
  const s = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000)
  return s < 60 ? `${s}초` : `${Math.floor(s / 60)}분 ${s % 60}초`
}
function lastAirDate(weekday: number | null): string {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: KST }))
  if (!weekday) return now.toISOString().slice(0, 10)
  const isoDow = ((now.getDay() + 6) % 7) + 1
  now.setDate(now.getDate() - ((isoDow - weekday + 7) % 7))
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
function errText(e: unknown) { return e instanceof ApiError ? `${e.message}${e.code ? ` (${e.code})` : ''}` : e instanceof Error ? e.message : String(e) }
/* 채팅을 넣고 지우는 일의 최종 확인. 운영 서버를 건드릴 때는 조치 콘솔과 같은 'PROD' 입력 확인 창(공용 틀, HP-506)을
   쓰고, 개발 서버는 브라우저 확인 창을 쓴다. */
async function confirmWrite(env: Env, summary: ProductionWriteSummary, message: string): Promise<boolean> {
  const host = seedingHost()
  if (host && env === 'prod') return host.confirmProductionWrite(summary).then(() => true, () => false)
  return confirm(message)
}

/* ─── 틀 ─────────────────────────────────────────────────────────── */
/* 운영 콘솔 공용 틀(shell/app, HP-506) 안에서 그리는 시딩 — 톱바와 탭 없이 화면만. 로그인은 틀이 콘솔을 열 때
   마쳤으므로 여기서는 권한만 본다. 회차 작업과 AI 프롬프트는 틀의 왼쪽 메뉴가 고른다. */
export function SeedingWorkspace({ view, workId, episodeId }: { view: 'work' | 'prompts'; workId?: number | null; episodeId?: number | null }) {
  const user = currentUser()
  if (!user) return null
  return (
    <div className="sd-root">
      {!canRead(user)
        ? <Gate title="이 계정에는 시딩 권한이 없습니다" body={`${user.name} 계정에 관리자 역할(admin, moderation_operator, admin_console_viewer 중 하나)이 없습니다. 팀 관리자에게 역할을 요청하세요.`}><button className="btn sd-primary" onClick={logout}>다른 계정으로 로그인</button></Gate>
        : view === 'work'
          ? <Workspace writable={canWrite(user)} initialWorkId={workId ?? null} initialEpisodeId={episodeId ?? null} />
          : <PromptsView writable={canWrite(user)} />}
    </div>
  )
}

function Gate({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  return (
    <div className="sd-page">
      <div className="sd-panel sd-gate">
        <h1>{title}</h1>
        <p>{body}</p>
        <div>{children}</div>
      </div>
    </div>
  )
}

function Banner({ kind, children, onClose }: { kind: 'bad' | 'info'; children: ReactNode; onClose?: () => void }) {
  return (
    <div className={`sd-banner ${kind === 'bad' ? 'error-box' : 'sd-info'}`} role={kind === 'bad' ? 'alert' : 'status'}>
      <div>{children}</div>
      {onClose && <button type="button" className="sd-banner-close" onClick={onClose}>닫기</button>}
    </div>
  )
}

function State({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`sd-state is-${tone}`}>{children}</span>
}

/* 단계 카드 — 머리에 "무엇을 하는 단계인지"(제목·설명)와 그 단계의 버튼, 몸에 지금 상태. */
function Card({ no, title, lead, actions, children }: { no?: number; title: ReactNode; lead?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="sd-panel">
      <div className="sd-card-head">
        <div className="sd-card-title">
          <h2>{no != null && <span className="sd-step-no">{no}</span>}{title}</h2>
          {lead}
        </div>
        {actions ? <div className="sd-card-actions">{actions}</div> : null}
      </div>
      <div className="sd-card-body">{children}</div>
    </section>
  )
}

/* ─── 작업 공간: 왼쪽 작품·회차, 오른쪽 단계 ───────────────────────── */
/* initialWorkId·initialEpisodeId: 공용 틀 홈의 '최근 회차'에서 고른 회차로 바로 연다(HP-506). 없거나 지워졌으면 첫 작품·첫 회차. */
function Workspace({ writable, initialWorkId = null, initialEpisodeId = null }: { writable: boolean; initialWorkId?: number | null; initialEpisodeId?: number | null }) {
  const [works, setWorks] = useState<Work[] | null>(null)
  const [workId, setWorkId] = useState<number | null>(initialWorkId)
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [episodeId, setEpisodeId] = useState<number | null>(initialEpisodeId)
  const [error, setError] = useState<string | null>(null)
  const workSelectId = useId()
  const work = useMemo(() => works?.find((w) => w.id === workId) ?? null, [works, workId])
  const episode = useMemo(() => episodes.find((e) => e.id === episodeId) ?? null, [episodes, episodeId])

  const loadWorks = useCallback(() => api.works().then((ws) => { setWorks(ws); setWorkId((cur) => (cur != null && ws.some((w) => w.id === cur)) ? cur : (ws[0]?.id ?? null)) }).catch((e) => setError(errText(e))), [])
  const loadEpisodes = useCallback((wid: number) => api.episodes(wid).then((es) => { setEpisodes(es); setEpisodeId((cur) => es.some((e) => e.id === cur) ? cur : (es[0]?.id ?? null)) }).catch((e) => setError(errText(e))), [])
  useEffect(() => { loadWorks() }, [loadWorks])
  useEffect(() => { if (workId != null) loadEpisodes(workId) }, [workId, loadEpisodes])

  return (
    <div className="sd-layout">
      <aside className="sd-panel sd-side">
        <div className="sd-side-block">
          <label className="sd-caption" htmlFor={workSelectId}>작품</label>
          <select id={workSelectId} value={workId ?? ''} onChange={(e) => setWorkId(Number(e.target.value))} className="sd-input sd-w-full">
            {works == null && <option>불러오는 중</option>}
            {works?.map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}
          </select>
          {work && (
            <p className="sd-note">
              {work.airWeekday ? `${WEEKDAYS[work.airWeekday]}요일 ${work.airTime ?? ''} 방영` : '정기 편성 없음'}
              {work.defaultRuntimeSec ? ` · 본편 약 ${Math.round(work.defaultRuntimeSec / 60)}분` : ''}
              <br />글을 모으는 곳: {work.sources.map((s) => `${SOURCE_LABEL[s.kind]} ${s.kind === 'DCINSIDE' ? '갤러리' : '게시판'} ${s.boardId}`).join(', ') || '없음'}
            </p>
          )}
        </div>
        <div className="sd-side-caption">회차</div>
        <ul className="sd-list">
          {work && episodes.length === 0 && <li className="sd-list-empty">아직 회차가 없습니다. 아래에서 방영일을 추가하세요.</li>}
          {episodes.map((e) => (
            <li key={e.id}>
              <button onClick={() => setEpisodeId(e.id)} className="sd-list-item" aria-current={e.id === episodeId ? 'true' : undefined}>
                <strong>{e.label ?? e.airDate}</strong>
                <span>{e.airDate} · {fmtTime(e.airStartAt).slice(0, 5)} 시작{e.episodeId ? ' · 넷플릭스 연결됨' : ''}</span>
              </button>
            </li>
          ))}
        </ul>
        {work && writable && <AddEpisode work={work} onAdded={(id) => { loadEpisodes(work.id); setEpisodeId(id) }} onError={setError} />}
      </aside>

      <section className="sd-main">
        {error && <Banner kind="bad" onClose={() => setError(null)}>{error}</Banner>}
        {!episode && <div className="sd-panel sd-guide">왼쪽에서 회차를 고르면 그 회차의 작업 단계가 여기에 나타납니다.</div>}
        {episode && work && <EpisodeWorkspace key={episode.id} work={work} episode={episode} writable={writable} onEpisodeChanged={() => loadEpisodes(work.id)} onError={setError} />}
      </section>
    </div>
  )
}

function AddEpisode({ work, onAdded, onError }: { work: Work; onAdded: (id: number) => void; onError: (m: string) => void }) {
  const [open, setOpen] = useState(false)
  const [airDate, setAirDate] = useState(() => lastAirDate(work.airWeekday))
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const add = async () => {
    setBusy(true)
    try { const e = await api.createEpisode(work.id, { airDate, label: label || undefined }); setOpen(false); setLabel(''); onAdded(e.id) }
    catch (e) { onError(errText(e)) } finally { setBusy(false) }
  }
  return (
    <div className="sd-side-foot">
      {!open ? <button className="btn sd-block" onClick={() => { setAirDate(lastAirDate(work.airWeekday)); setOpen(true) }}>회차 추가</button> : (
        <div className="sd-form">
          <label className="sd-field"><span>방영일</span><input type="date" value={airDate} onChange={(e) => setAirDate(e.target.value)} className="sd-input" /></label>
          <label className="sd-field"><span>이름 (예: 33기 9회)</span><input value={label} onChange={(e) => setLabel(e.target.value)} className="sd-input" /></label>
          <p className="sd-note">방영 시작 시각은 작품의 편성 시각으로 채워집니다. 종료 시각은 수집이 끝난 뒤 글 밀도를 보고 정합니다.</p>
          <div className="sd-actions"><button className="btn sd-primary" disabled={busy} onClick={add}>추가</button><button className="btn" onClick={() => setOpen(false)}>취소</button></div>
        </div>
      )}
    </div>
  )
}

/* ─── 한 회차의 작업 흐름 ──────────────────────────────────────────── */
function EpisodeWorkspace({ work, episode, writable, onEpisodeChanged, onError }: { work: Work; episode: Episode; writable: boolean; onEpisodeChanged: () => void; onError: (m: string) => void }) {
  const [collections, setCollections] = useState<Collection[]>([])
  const [anchors, setAnchors] = useState<SyncAnchor[]>([])
  const [notes, setNotes] = useState<SceneNote[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [injections, setInjections] = useState<Injection[]>([])
  const reloadCollections = useCallback(() => api.collections(episode.id).then(setCollections).catch((e) => onError(errText(e))), [episode.id, onError])
  const reloadSync = useCallback(() => Promise.all([api.anchors(episode.id), api.sceneNotes(episode.id)]).then(([a, n]) => { setAnchors(a); setNotes(n) }).catch((e) => onError(errText(e))), [episode.id, onError])
  const reloadPlans = useCallback(() => Promise.all([api.plans(episode.id), api.injections(episode.id)]).then(([p, i]) => { setPlans(p); setInjections(i) }).catch((e) => onError(errText(e))), [episode.id, onError])
  useEffect(() => { reloadCollections(); reloadSync(); reloadPlans() }, [reloadCollections, reloadSync, reloadPlans])

  const done = collections.filter((c) => c.status === 'DONE')
  const latestDone = done[0] ?? null
  const steps = [
    { label: '수집', state: latestDone ? `완료 · ${latestDone.postCount.toLocaleString()}건` : collections.some((c) => c.status === 'RUNNING' || c.status === 'QUEUED') ? '진행 중' : '아직 없음', ok: !!latestDone },
    { label: '시각 맞추기', state: anchors.length ? `기준점 ${anchors.length}개 · 장면 메모 ${notes.length}분` : '아직 없음', ok: anchors.length > 0 },
    { label: 'AI 계획', state: plans.length ? `${plans.length}개 (검수 대기 ${plans.filter((p) => p.status === 'DRAFT').length})` : '아직 없음', ok: plans.length > 0 },
    { label: '채팅 넣기', state: injections.length ? `${injections.length.toLocaleString()}건 넣음` : '아직 없음', ok: injections.length > 0 },
  ]

  return (
    <>
      <header className="sd-episode-head">
        <div>
          <div className="sd-eyebrow">{work.title}</div>
          <h1>{episode.label ?? episode.airDate} <span>{episode.airDate}</span></h1>
        </div>
        <ol className="sd-progress">
          {steps.map((s, i) => (
            <li key={s.label} className={s.ok ? 'is-done' : undefined}>
              <span className="sd-progress-no">{i + 1}</span>
              <span className="sd-progress-text"><b>{s.label}</b><span>{s.state}</span></span>
            </li>
          ))}
        </ol>
      </header>

      <EpisodeInfo episode={episode} work={work} writable={writable} onChanged={onEpisodeChanged} onError={onError} />
      <CollectStep episode={episode} collections={collections} writable={writable} reload={reloadCollections} onEpisodeChanged={onEpisodeChanged} onError={onError} />
      <SyncStep episode={episode} anchors={anchors} notes={notes} writable={writable} reload={reloadSync} onError={onError} />
      <PlanStep episode={episode} plans={plans} injections={injections} writable={writable} reload={reloadPlans} onError={onError} />
    </>
  )
}

/* ─── 회차 정보 ────────────────────────────────────────────────────── */
/* 편집 칸에 넣을 값 — 회차의 지금 값을 칸의 글자로 바꾼 것. */
function episodeFields(e: Episode) {
  return { label: e.label ?? '', start: isoToKstInput(e.airStartAt), end: isoToKstInput(e.airEndAt), runtime: e.runtimeSec ? String(Math.round(e.runtimeSec / 60)) : '' }
}

function EpisodeInfo({ episode, work, writable, onChanged, onError }: { episode: Episode; work: Work; writable: boolean; onChanged: () => void; onError: (m: string) => void }) {
  const [edit, setEdit] = useState(false)
  const [label, setLabel] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [runtime, setRuntime] = useState('')
  const [busy, setBusy] = useState(false)
  /* 칸은 '고치기'를 누른 순간의 회차 값으로 채운다(HP-517). 처음 열 때만 채우던 동안, 그래프의 '회차 정보에 적용'으로
     바뀐 방영 시각을 칸이 몰라 저장하는 순간 옛 값으로 되돌렸다(비어 있던 종료 시각이면 지웠다). 칸을 연 뒤 다른 곳에서
     또 바뀌는 경우까지 막으려고, 사람이 손대지 않은 칸은 저장할 때의 회차 값을 그대로 보낸다. */
  const opened = useRef(episodeFields(episode))
  const startEdit = () => {
    const f = episodeFields(episode)
    opened.current = f
    setLabel(f.label); setStart(f.start); setEnd(f.end); setRuntime(f.runtime); setEdit(true)
  }
  /* 편집하는 사이 회차가 바뀌면(그래프의 '회차 정보에 적용' 등) 손대지 않은 칸을 새 값으로 다시 채운다 — 저장은 어차피 새 값을
     보내므로, 칸이 옛 값을 보이면 보이는 것과 저장되는 것이 갈린다. 사람이 고친 칸은 그대로 둔다. */
  const latest = episodeFields(episode)
  useEffect(() => {
    if (!edit) return
    const o = opened.current
    if (label === o.label) setLabel(latest.label)
    if (start === o.start) setStart(latest.start)
    if (end === o.end) setEnd(latest.end)
    if (runtime === o.runtime) setRuntime(latest.runtime)
    opened.current = {
      label: label === o.label ? latest.label : o.label, start: start === o.start ? latest.start : o.start,
      end: end === o.end ? latest.end : o.end, runtime: runtime === o.runtime ? latest.runtime : o.runtime,
    }
    // 칸의 값이 아니라 회차 값이 바뀔 때만 돈다 — 칸을 고칠 때마다 돌면 '손대지 않음' 판정이 흐려진다.
  }, [latest.label, latest.start, latest.end, latest.runtime]) // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    const o = opened.current
    const airStartAt = start === o.start ? episode.airStartAt : kstInputToIso(start)
    if (!airStartAt) { onError('방영 시작 시각은 비울 수 없습니다.'); return }
    const body = {
      label: label === o.label ? episode.label : (label || null),
      airStartAt,
      airEndAt: end === o.end ? episode.airEndAt : kstInputToIso(end),
      runtimeSec: runtime === o.runtime ? episode.runtimeSec : (runtime ? Number(runtime) * 60 : null),
      episodeId: episode.episodeId,
    }
    setBusy(true)
    try { await api.updateEpisode(episode.id, body); setEdit(false); onChanged() }
    catch (e) { onError(errText(e)) } finally { setBusy(false) }
  }
  const unlink = async () => {
    if (!confirm('넷플릭스 회차와의 연결을 끊습니다. 익스텐션 패널에서 다시 연결할 수 있습니다.')) return
    try { await api.linkEpisode(episode.id, null); onChanged() } catch (e) { onError(errText(e)) }
  }
  return (
    <Card
        title="회차 정보"
        lead={<p className="sd-lead">방영 시각은 글을 모을 범위와 채팅 시각 계산의 기준입니다. 편성표 시각이 아니라 실제로 본편이 시작하고 끝난 시각을 적으세요. 정확한 값은 수집 뒤 분당 글 수 그래프와 AI 장면 복원이 알려 줍니다.</p>}
        actions={writable && !edit && <button className="btn" onClick={startEdit}>고치기</button>}>
      <div className="sd-info-grid">
        {!edit ? (
          <>
            <div className="sd-kv">
              <span className="sd-kv-key">이름</span><span>{episode.label ?? '없음'}</span>
              <span className="sd-kv-key">방영 시작</span><span className="sd-mono">{fmtKst(episode.airStartAt)}</span>
              <span className="sd-kv-key">방영 종료</span><span className="sd-mono">{episode.airEndAt ? fmtKst(episode.airEndAt) : <span className="sd-muted">아직 모름 (시작 후 3시간까지 수집)</span>}</span>
              <span className="sd-kv-key">넷플릭스 본편 길이</span><span>{episode.runtimeSec ? `${Math.round(episode.runtimeSec / 60)}분` : work.defaultRuntimeSec ? `작품 기본값 ${Math.round(work.defaultRuntimeSec / 60)}분` : '모름'}</span>
            </div>
            <div className="sd-kv">
              <span className="sd-kv-key">넷플릭스 회차 연결</span>
              <span>{episode.episodeId
                ? <span className="sd-inline"><State tone="on">연결됨</State><span className="sd-muted sd-small">회차 id {episode.episodeId}</span>{writable && <button className="btn sd-sm" onClick={unlink}>연결 끊기</button>}</span>
                : <span className="sd-muted">아직 연결되지 않았습니다. 넷플릭스에서 이 회차를 재생하고 익스텐션의 시딩 도구에서 "이 회차에 연결"을 누르면 연결됩니다. 채팅은 연결된 뒤에만 넣을 수 있습니다.</span>}</span>
            </div>
          </>
        ) : (
          <>
            <div className="sd-kv">
              <span className="sd-kv-key">이름</span><input value={label} onChange={(e) => setLabel(e.target.value)} className="sd-input" placeholder="예: 33기 9회" />
              <span className="sd-kv-key">방영 시작 (KST)</span><input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="sd-input sd-mono" />
              <span className="sd-kv-key">방영 종료 (KST)</span><input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className="sd-input sd-mono" />
              <span className="sd-kv-key">본편 길이 (분)</span><input type="number" value={runtime} onChange={(e) => setRuntime(e.target.value)} className="sd-input sd-mono sd-w-num" placeholder="예: 97" />
            </div>
            <div className="sd-stack">
              <p className="sd-note">종료 시각을 비워 두면 시작 후 3시간까지 넉넉히 수집하고, 밀도 그래프의 제안으로 나중에 채울 수 있습니다. 본편 길이는 넷플릭스 재생 화면의 길이입니다. 광고를 뺀 값이라 방송 길이보다 짧습니다.</p>
              <div className="sd-actions"><button className="btn sd-primary" disabled={busy} onClick={save}>저장</button><button className="btn" onClick={() => setEdit(false)}>취소</button></div>
            </div>
          </>
        )}
      </div>
    </Card>
  )
}

/* ─── 1단계: 수집 ──────────────────────────────────────────────────── */
function CollectStep({ episode, collections, writable, reload, onEpisodeChanged, onError }: { episode: Episode; collections: Collection[]; writable: boolean; reload: () => void; onEpisodeChanged: () => void; onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const active = collections.some((c) => c.status === 'QUEUED' || c.status === 'RUNNING')
  const selected = collections.find((c) => c.id === selectedId) ?? collections.find((c) => c.status === 'DONE') ?? collections[0] ?? null
  useEffect(() => { if (!active) return; const t = setInterval(reload, 2000); return () => clearInterval(t) }, [active, reload])
  const start = async () => { setBusy(true); try { await api.startCollection(episode.id); reload() } catch (e) { onError(errText(e)) } finally { setBusy(false) } }
  const cancel = async (id: number) => { try { await api.cancel(id); reload() } catch (e) { onError(errText(e)) } }
  const remove = async (c: Collection) => {
    if (!confirm(`수집 #${c.id}의 글 ${c.postCount.toLocaleString()}건을 서버에서 지웁니다. 이 수집으로 만든 계획이 있으면 그 계획의 원글 참조가 끊깁니다.`)) return
    try { await api.remove(c.id); reload() } catch (e) { onError(errText(e)) }
  }
  return (
    <Card
        no={1} title="수집"
        lead={<p className="sd-lead">방송 시간대에 디시인사이드와 더쿠에 올라온 글을 모아 서버에 저장합니다. 이 글이 뒤의 모든 단계의 재료입니다. 모으는 범위는 방영 시작 20분 전부터 종료 30분 뒤까지이고, 종료 시각을 모르면 시작 후 3시간까지 모은 뒤 분당 글 수를 보고 종료를 찾습니다. 한 회차에 보통 5분쯤 걸립니다.</p>}
        actions={writable && <button className="btn sd-primary" disabled={busy || active} onClick={start}>{active ? '수집 중' : collections.length ? '다시 수집' : '수집 시작'}</button>}>
      {collections.length === 0 && <p className="sd-empty">아직 수집한 적이 없습니다.</p>}
      {collections.length > 0 && (
        <div className="sd-table-wrap">
          <table className="sd-table">
            <thead><tr><th>번호</th><th>상태</th><th>모은 글</th><th>모은 범위 (방송 시각)</th><th>걸린 시간</th><th>진행 상황 또는 오류</th><th></th></tr></thead>
            <tbody>
              {collections.map((c) => (
                <tr key={c.id} className={`sd-clickable${selected?.id === c.id ? ' is-selected' : ''}`} onClick={() => setSelectedId(c.id)}>
                  <td className="sd-mono">#{c.id}</td>
                  <td><State tone={COLL_STATUS[c.status].tone}>{COLL_STATUS[c.status].label}</State></td>
                  <td className="sd-mono">{c.postCount.toLocaleString()}</td>
                  <td className="sd-mono sd-nowrap">{fmtKst(c.windowStartAt, { second: undefined })} ~ {fmtTime(c.windowEndAt).slice(0, 5)}</td>
                  <td className="sd-nowrap">{c.status === 'DONE' ? fmtDuration(c.startedAt, c.finishedAt) : c.status === 'RUNNING' ? fmtDuration(c.startedAt, new Date().toISOString()) : ''}</td>
                  <td className="sd-muted sd-small sd-col-progress">{c.status === 'RUNNING' ? c.progress : c.error ? <span className="sd-warn">{c.error}</span> : ''}</td>
                  <td className="sd-row-actions" onClick={(e) => e.stopPropagation()}>
                    {writable && (c.status === 'RUNNING' || c.status === 'QUEUED') && <button className="btn sd-sm" onClick={() => cancel(c.id)}>취소</button>}
                    {c.status === 'DONE' && <button className="btn sd-sm" onClick={() => api.download(c.id).catch((e) => onError(errText(e)))}>JSON 내려받기</button>}
                    {writable && (c.status === 'DONE' || c.status === 'FAILED' || c.status === 'CANCELLED') && <button className="btn sd-sm sd-danger" onClick={() => remove(c)}>지우기</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && selected.status === 'DONE' && selected.postCount > 0 && <>
        <DensityChart collection={selected} episode={episode} writable={writable} onEpisodeChanged={onEpisodeChanged} onError={onError} />
        <PostBrowser key={selected.id} collection={selected} episode={episode} onError={onError} />
      </>}
    </Card>
  )
}

/* 분당 글 수 그래프 — 방송 시작·종료를 눈으로 확인하고 제안 시각을 회차 정보에 적용한다. 자동 반영은 하지 않는다. */
function DensityChart({ collection: c, episode, writable, onEpisodeChanged, onError }: { collection: Collection; episode: Episode; writable: boolean; onEpisodeChanged: () => void; onError: (m: string) => void }) {
  const [d, setD] = useState<Density | null>(null)
  const [busy, setBusy] = useState(false)
  const [jump, setJump] = useState<string | null>(null)
  useEffect(() => { let alive = true; api.density(c.id).then((x) => { if (alive) setD(x) }).catch((e) => onError(errText(e))); return () => { alive = false } }, [c.id, onError])
  if (!d) return <p className="sd-empty">분당 글 수를 계산하고 있습니다.</p>
  const W = 1000, H = 140, n = d.buckets.length
  const max = Math.max(1, ...d.buckets.map((b) => b.count))
  const x = (iso: string) => ((new Date(iso).getTime() - new Date(d.from).getTime()) / 60000) / Math.max(1, n - 1) * W
  const apply = async (field: 'airStartAt' | 'airEndAt', value: string) => {
    setBusy(true)
    try { await api.updateEpisode(episode.id, { label: episode.label, airStartAt: field === 'airStartAt' ? value : episode.airStartAt, airEndAt: field === 'airEndAt' ? value : episode.airEndAt, runtimeSec: episode.runtimeSec, episodeId: episode.episodeId }); onEpisodeChanged() }
    catch (e) { onError(errText(e)) } finally { setBusy(false) }
  }
  // 점선 색 — 파랑 = 회차 정보에 저장된 시각, 주황 = 이 그래프로 추정한 시각(seeding.css .sd-chart-mark).
  const Marker = ({ iso, tone, label, dy }: { iso: string | null; tone: 'saved' | 'estimate'; label: string; dy: number }) => iso ? (
    <g className={`sd-chart-mark is-${tone}`}><line x1={x(iso)} x2={x(iso)} y1={0} y2={H} strokeWidth={1.5} strokeDasharray="4 3" /><text x={x(iso) + 4} y={dy} fontSize={11}>{label} {fmtTime(iso).slice(0, 5)}</text></g>
  ) : null
  const ticks = d.buckets.filter((_, i) => i % 10 === 0)
  return (
    <div className="sd-section">
      <div>
        <h3>분당 글 수</h3>
        <p className="sd-note">글이 갑자기 늘어나는 곳이 방송 시작, 확 줄어드는 곳이 방송 종료입니다. 파란 점선은 회차 정보에 저장된 시각, 주황 점선은 이 그래프로 추정한 시각입니다. 막대를 누르면 아래 글 목록이 그 분으로 이동합니다.</p>
      </div>
      <div className="sd-chart">
        <svg viewBox={`0 0 ${W} ${H + 18}`}>
          {d.buckets.map((b, i) => <rect key={i} className="sd-chart-bar" x={i / Math.max(1, n - 1) * W} y={H - (b.count / max) * H} width={Math.max(1.5, W / n)} height={(b.count / max) * H} />)}
          {d.buckets.map((b, i) => <rect key={`h${i}`} className="sd-chart-hit" x={i / Math.max(1, n - 1) * W} y={0} width={Math.max(1.5, W / n)} height={H} onClick={() => setJump(b.at)}><title>{fmtTime(b.at).slice(0, 5)} · {b.count}건</title></rect>)}
          {ticks.map((b, i) => <text key={`t${i}`} className="sd-chart-tick" x={x(b.at)} y={H + 14} fontSize={10}>{fmtTime(b.at).slice(0, 5)}</text>)}
          <Marker iso={episode.airStartAt} tone="saved" label="저장된 시작" dy={14} />
          <Marker iso={episode.airEndAt} tone="saved" label="저장된 종료" dy={14} />
          <Marker iso={d.suggestedStartAt} tone="estimate" label="추정 시작" dy={30} />
          <Marker iso={d.suggestedEndAt} tone="estimate" label="추정 종료" dy={30} />
        </svg>
      </div>
      <div className="sd-chart-legend">
        <span className="sd-muted">최대 {max}건/분</span>
        {d.suggestedStartAt && <span className="sd-inline">추정 시작 <b className="sd-mono">{fmtTime(d.suggestedStartAt).slice(0, 5)}</b>{writable && d.suggestedStartAt !== episode.airStartAt && <button className="btn sd-sm" disabled={busy} onClick={() => apply('airStartAt', d.suggestedStartAt!)}>회차 정보에 적용</button>}</span>}
        {d.suggestedEndAt
          ? <span className="sd-inline">추정 종료 <b className="sd-mono">{fmtTime(d.suggestedEndAt).slice(0, 5)}</b>{writable && d.suggestedEndAt !== episode.airEndAt && <button className="btn sd-sm" disabled={busy} onClick={() => apply('airEndAt', d.suggestedEndAt!)}>회차 정보에 적용</button>}</span>
          : <span className="sd-muted">종료를 추정하지 못했습니다. 글 수가 끝까지 줄지 않았기 때문입니다. AI 장면 복원이 예고와 총평 글을 근거로 더 정확한 종료를 찾아 줍니다.</span>}
      </div>
      {jump && <PostJumpContext at={jump} onClear={() => setJump(null)} />}
    </div>
  )
}

/* 그래프 클릭 → 글 목록 점프. 목록 컴포넌트가 이 값을 읽는다(간단한 전역 이벤트). */
function PostJumpContext({ at, onClear }: { at: string; onClear: () => void }) {
  useEffect(() => { window.dispatchEvent(new CustomEvent('seed:jump', { detail: at })); onClear() }, [at, onClear])
  return null
}

/* 수집한 글 목록 — 시각으로 이동하고, 아래로 내리면 이어서 불러온다. 수천 건을 "더 보기"로 넘기지 않는다. */
function PostBrowser({ collection: c, episode, onError }: { collection: Collection; episode: Episode; onError: (m: string) => void }) {
  const [page, setPage] = useState<PostsPage | null>(null)
  const [items, setItems] = useState<Post[]>([])
  const [source, setSource] = useState<SourceKind | ''>('')
  const [anchor, setAnchor] = useState<{ from: string | null; order: 'asc' | 'desc' }>({ from: null, order: 'asc' })
  const [timeText, setTimeText] = useState('')
  const [open, setOpen] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadingRef = useRef(false)
  useEffect(() => {
    const h = (e: Event) => { setOpen(true); setAnchor({ from: (e as CustomEvent<string>).detail, order: 'asc' }) }
    window.addEventListener('seed:jump', h); return () => window.removeEventListener('seed:jump', h)
  }, [])
  useEffect(() => {
    if (!open) return
    let alive = true
    api.posts(c.id, { source: source || undefined, from: anchor.from, order: anchor.order, size: 200 }).then((p) => { if (alive) { setPage(p); setItems(p.items); listRef.current?.scrollTo({ top: 0 }) } }).catch((e) => onError(errText(e)))
    return () => { alive = false }
  }, [open, c.id, source, anchor, onError])
  useEffect(() => {
    const el = sentinelRef.current, root = listRef.current
    if (!open || !el || !root || !page?.nextCursor) return
    const io = new IntersectionObserver(async (entries) => {
      if (!entries[0].isIntersecting || loadingRef.current) return
      loadingRef.current = true
      try { const p = await api.posts(c.id, { source: source || undefined, cursor: page.nextCursor, order: anchor.order, size: 500 }); setPage(p); setItems((cur) => [...cur, ...p.items]) }
      catch (e) { onError(errText(e)) } finally { loadingRef.current = false }
    }, { root, rootMargin: '300px' })
    io.observe(el); return () => io.disconnect()
  }, [open, c.id, source, anchor.order, page, onError])
  const jumpToTime = () => {
    if (!/^\d{2}:\d{2}$/.test(timeText)) return
    let t = new Date(`${episode.airDate}T${timeText}:00+09:00`)
    if (t.getTime() < new Date(c.windowStartAt).getTime()) t = new Date(t.getTime() + 86400000)
    setAnchor({ from: t.toISOString(), order: 'asc' })
  }
  return (
    <div className="sd-section">
      <div className="sd-section-head">
        <div>
          <h3>수집한 글 보기</h3>
          <p className="sd-note">글은 방송 시각 순으로 흐릅니다. 시각을 넣어 이동하거나 위 그래프의 막대를 누르면 그 분부터 보입니다. 목록 끝까지 내리면 다음 500건이 자동으로 이어집니다.</p>
        </div>
        <button className="btn" onClick={() => setOpen((v) => !v)}>{open ? '접기' : '펼치기'}</button>
      </div>
      {open && (
        <>
          <div className="sd-toolbar">
            <button className="btn sd-sm" disabled={anchor.from === null && anchor.order === 'asc'} onClick={() => setAnchor({ from: null, order: 'asc' })}>처음부터</button>
            <button className="btn sd-sm" disabled={anchor.order === 'desc'} onClick={() => setAnchor({ from: null, order: 'desc' })}>마지막 글부터 (역순)</button>
            <span className="sd-muted">시각으로 이동</span>
            <input type="time" value={timeText} onChange={(e) => setTimeText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') jumpToTime() }} className="sd-input sd-sm sd-w-time" />
            <button className="btn sd-sm" disabled={!timeText} onClick={jumpToTime}>이동</button>
            <span className="sd-spacer" />
            <select value={source} onChange={(e) => setSource(e.target.value as SourceKind | '')} className="sd-input sd-sm">
              <option value="">디시인사이드와 더쿠 모두</option><option value="DCINSIDE">디시인사이드만</option><option value="THEQOO">더쿠만</option>
            </select>
            {page && <span className="sd-muted sd-small">{(Object.keys(SOURCE_LABEL) as SourceKind[]).map((k) => `${SOURCE_SHORT[k]} ${(page.countBySource[k] ?? 0).toLocaleString()}건`).join(' · ')}</span>}
          </div>
          <div ref={listRef} className="sd-table-wrap sd-h-lg">
            <table className="sd-table">
              <thead><tr><th className="sd-col-time">방송 시각</th><th className="sd-col-source">출처</th><th>글</th><th className="sd-col-author">작성자</th></tr></thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id}>
                    <td className="sd-mono sd-small sd-nowrap">{fmtTime(p.postedAt)}{p.precision === 'MINUTE' && <span className="sd-faint" title="더쿠는 분 단위까지만 남습니다"> (분)</span>}</td>
                    <td className="sd-muted sd-small">{SOURCE_SHORT[p.source]}</td>
                    <td>{p.sourceUrl ? <a href={p.sourceUrl} target="_blank" rel="noreferrer" className="sd-link">{p.title}</a> : p.title}{p.body && <div className="sd-post-body">{p.body}</div>}</td>
                    <td className="sd-mono sd-small sd-faint">{p.authorToken.slice(0, 6)}</td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td colSpan={4} className="sd-muted">{anchor.from ? '이 시각 이후에는 글이 없습니다.' : '글이 없습니다.'}</td></tr>}
              </tbody>
            </table>
            <div ref={sentinelRef} className="sd-sentinel">{page?.nextCursor ? '이어서 불러오는 중' : items.length ? '목록의 끝입니다' : ''}</div>
          </div>
        </>
      )}
    </div>
  )
}

/* ─── 2단계: 싱크와 장면 ────────────────────────────────────────────── */
function SyncStep({ episode, anchors, notes, writable, reload, onError }: { episode: Episode; anchors: SyncAnchor[]; notes: SceneNote[]; writable: boolean; reload: () => void; onError: (m: string) => void }) {
  const removeAnchor = async (a: SyncAnchor) => { if (!confirm(`재생 ${fmtSec(a.playbackSec)} 기준점을 지웁니다.`)) return; try { await api.deleteAnchor(a.id); reload() } catch (e) { onError(errText(e)) } }
  return (
    <Card
        no={2} title="시각 맞추기와 장면 메모"
        lead={<p className="sd-lead">수집한 글에는 방송 시각이 적혀 있고, 넷플릭스는 재생 시각으로 돕니다. 이 단계는 그 둘을 잇는 <b>기준점</b>과, 방송 1분마다 화면에서 무슨 일이 있었는지 적은 <b>장면 메모</b>를 다룹니다. 둘 다 익스텐션의 시딩 도구에서 "AI 채팅 작업 시작"을 누르면 자막과 글을 읽어 자동으로 만들어집니다.</p>}>
      <section className="sd-section">
        <div>
          <h3>기준점 {anchors.length}개</h3>
          <p className="sd-note">기준점 하나는 "재생 몇 초가 방송 몇 시 몇 분이었다"는 쌍입니다. 방송에는 광고가 있어서 한 쌍으로는 뒤로 갈수록 어긋나므로 광고 뒤마다 기준점을 둡니다. 채팅을 넣을 때 글의 방송 시각을 이 표로 재생 시각으로 바꿉니다. 재생하며 어긋남이 보이면 익스텐션의 시딩 도구에서 초 단위로 다듬을 수 있습니다.</p>
        </div>
        {anchors.length === 0 ? <p className="sd-empty">아직 기준점이 없습니다. 없으면 방영 시작 시각을 재생 0초로 보고 환산하는데, 광고가 있는 방송에서는 뒤로 갈수록 어긋납니다. AI 작업을 먼저 돌리세요.</p> : (
          <div className="sd-table-wrap sd-h-sm sd-narrow">
            <table className="sd-table">
              <thead><tr><th className="sd-col-clock">재생 시각</th><th className="sd-col-clock">방송 시각</th><th>무엇으로 맞췄나</th><th className="sd-col-actions"></th></tr></thead>
              <tbody>
                {anchors.map((a) => (
                  <tr key={a.id}>
                    <td className="sd-mono">{fmtSec(a.playbackSec)}</td>
                    <td className="sd-mono">{fmtTime(a.wallclockAt)}</td>
                    <td className="sd-muted sd-small">{a.note}</td>
                    <td className="sd-row-actions">{writable && <button className="btn sd-sm sd-danger" onClick={() => removeAnchor(a)}>지우기</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <SceneNotesBlock episode={episode} notes={notes} writable={writable} reload={reload} onError={onError} />
    </Card>
  )
}

/* 장면 메모 — 태그(시작·광고·종료)를 연속 구간으로 묶어 "방송 구조"로 요약하고, 목록은 본편부터 보이게 한다.
   방송 전 대기 구간은 접어 두고, 검색으로 장면을 찾는다. */
function groupTagged(notes: SceneNote[]) {
  const out: { tag: string; from: string; to: string }[] = []
  for (const n of notes) {
    if (!n.tag) continue
    const last = out[out.length - 1]
    if (last && last.tag === n.tag && new Date(n.minuteAt).getTime() - new Date(last.to).getTime() <= 60_000) last.to = n.minuteAt
    else out.push({ tag: n.tag, from: n.minuteAt, to: n.minuteAt })
  }
  return out
}
const TAG_LABEL: Record<string, string> = { '시작': '본편 시작', '광고': '중간광고', '종료': '종료·예고' }
/* 방송 구조 표식 — 시작 초록, 광고 호박, 종료 회색(빨강은 지우기 전용이라 종료에 쓰지 않는다). */
const TAG_TONE: Record<string, string> = { '시작': 'is-on', '광고': 'is-warn' }
const CONF_DOT: Record<string, string> = { '높음': 'is-high', '중간': 'is-mid', '낮음': 'is-low' }

function SceneNotesBlock({ episode, notes, writable, reload, onError }: { episode: Episode; notes: SceneNote[]; writable: boolean; reload: () => void; onError: (m: string) => void }) {
  const [open, setOpen] = useState(false)
  const [showPre, setShowPre] = useState(false)
  const [q, setQ] = useState('')
  const [paste, setPaste] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const parsed = useMemo(() => parseSceneTable(text, episode.airDate, episode.airStartAt), [text, episode.airDate, episode.airStartAt])
  const groups = useMemo(() => groupTagged(notes), [notes])
  const startAt = groups.find((g) => g.tag === '시작')?.from ?? episode.airStartAt
  const endAt = groups.find((g) => g.tag === '종료')?.from ?? null
  const pre = notes.filter((n) => new Date(n.minuteAt) < new Date(startAt))
  const main = notes.filter((n) => new Date(n.minuteAt) >= new Date(startAt) && (!endAt || new Date(n.minuteAt) <= new Date(endAt)))
  const post = notes.filter((n) => endAt && new Date(n.minuteAt) > new Date(endAt))
  const visible = (q ? notes.filter((n) => n.note.includes(q)) : [...(showPre ? pre : []), ...main])
  const saveNotes = async () => { setBusy(true); try { await api.putSceneNotes(episode.id, parsed); setText(''); setPaste(false); reload() } catch (e) { onError(errText(e)) } finally { setBusy(false) } }
  const clearNotes = async () => { if (!confirm('장면 메모를 모두 지웁니다. AI 작업을 다시 돌리면 새로 만들어집니다.')) return; setBusy(true); try { await api.putSceneNotes(episode.id, []); reload() } catch (e) { onError(errText(e)) } finally { setBusy(false) } }
  const row = (n: SceneNote) => {
    const unknown = n.note.startsWith('추정 불가')
    return (
      <div key={n.id} className={`sd-scene${unknown ? ' is-unknown' : ''}`}>
        <span className="sd-scene-time">{fmtTime(n.minuteAt).slice(0, 5)}</span>
        <span className={`sd-dot ${CONF_DOT[n.confidence ?? ''] ?? ''}`} title={n.confidence ? `확신 ${n.confidence}` : ''} />
        <span className="sd-scene-note">{n.note}</span>
        <span>{n.tag && <span className={`sd-tag ${TAG_TONE[n.tag] ?? ''}`}>{TAG_LABEL[n.tag] ?? n.tag}</span>}</span>
      </div>
    )
  }
  return (
    <section className="sd-section">
      <div className="sd-section-head">
        <div>
          <h3>장면 메모 {notes.length > 0 && <span className="sd-sub">{main.length}분 (방송 전 {pre.length}분, 종료 후 {post.length}분 별도)</span>}</h3>
          <p className="sd-note">AI가 자막과 글을 읽고 방송 1분마다 "이때 화면에서 무슨 일이 있었나"를 복원한 기록입니다. 세 곳에 쓰입니다. AI 채팅 계획을 만들 때 채팅을 고르고 다듬는 근거가 되고, 익스텐션의 시딩 도구에서 재생 중인 분의 장면을 보여 주며, 방송 시작·광고·종료 시각을 알려 줍니다. 각 줄 앞의 점은 AI의 확신 정도입니다(초록 높음, 노랑 중간, 회색 낮음).</p>
        </div>
        <div className="sd-actions">
          {notes.length > 0 && <button className="btn" onClick={() => setOpen((v) => !v)}>{open ? '목록 접기' : '목록 보기'}</button>}
          {writable && <button className="btn" onClick={() => setPaste((v) => !v)}>{paste ? '닫기' : '표로 바꿔 넣기'}</button>}
          {writable && notes.length > 0 && <button className="btn sd-danger" disabled={busy} onClick={clearNotes}>모두 지우기</button>}
        </div>
      </div>
      {notes.length === 0 && !paste && <p className="sd-empty">아직 장면 메모가 없습니다. 익스텐션 패널에서 "AI 채팅 작업 시작"을 누르면 만들어집니다.</p>}
      {groups.length > 0 && (
        <div className="sd-strip">
          <span className="sd-muted">방송 구조</span>
          {groups.map((g, i) => (
            <span key={i} className="sd-strip-item">
              <span className={`sd-tag ${TAG_TONE[g.tag] ?? ''}`}>{TAG_LABEL[g.tag] ?? g.tag}</span>
              <span className="sd-mono">{fmtTime(g.from).slice(0, 5)}{g.to !== g.from ? `~${fmtTime(g.to).slice(0, 5)}` : ''}</span>
            </span>
          ))}
        </div>
      )}
      {paste && (
        <div className="sd-stack sd-narrow">
          <p className="sd-note">AI가 만든 마크다운 표를 그대로 붙여 넣습니다. 한 줄이 방송 1분이고 형식은 <span className="sd-mono">| 22:35 | 장면 | 근거 | 확신 | 특이 |</span> 입니다. 근거 열은 저장하지 않으며, 저장하면 기존 메모를 전부 바꿉니다. 보통은 AI 작업이 자동으로 올리므로 손으로 할 일은 없습니다.</p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} spellCheck={false} className="sd-input sd-code" />
          <div className="sd-toolbar"><span className="sd-muted sd-small">인식된 줄 {parsed.length}개</span><span className="sd-spacer" /><button className="btn sd-primary" disabled={busy || parsed.length === 0} onClick={saveNotes}>저장 (전체 교체)</button></div>
        </div>
      )}
      {open && notes.length > 0 && (
        <div className="sd-stack">
          <div className="sd-toolbar">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="장면 검색 (예: 컵라면, 고백)" className="sd-input sd-w-search" />
            {!q && pre.length > 0 && <button className="btn sd-sm" onClick={() => setShowPre((v) => !v)}>{showPre ? '방송 전 접기' : `방송 전 ${pre.length}분 보기`}</button>}
            <span className="sd-muted sd-small">{q ? `${visible.length}분 일치` : `${visible.length}분 표시`}</span>
          </div>
          <div className="sd-scene-list">
            {visible.map(row)}
            {visible.length === 0 && <p className="sd-list-empty">일치하는 장면이 없습니다.</p>}
            {!q && post.length > 0 && <div className="sd-list-foot">종료 후 {post.length}분은 예고와 총평이라 표시하지 않습니다.</div>}
          </div>
        </div>
      )}
    </section>
  )
}

/* AI 프롬프트 편집(HP-436) — 시딩 도구가 쓰는 모든 프롬프트의 정본. 로컬 파이프라인은 실행할 때마다 여기서 받아 쓰고,
   서버의 "다시 써서 넣기"도 여기 것을 쓴다. 저장마다 버전이 올라가고 이력에서 되돌릴 수 있다. */
function PromptsView({ writable }: { writable: boolean }) {
  const [list, setList] = useState<Prompt[] | null>(null)
  const [key, setKey] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [note, setNote] = useState('')
  const [versions, setVersions] = useState<PromptVersion[] | null>(null)
  const [showVersions, setShowVersions] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const current = list?.find((p) => p.key === key) ?? null
  const reload = useCallback(() => api.prompts().then((ps) => { setList(ps); setKey((k) => k ?? ps[0]?.key ?? null) }).catch((e) => setError(errText(e))), [])
  useEffect(() => { reload() }, [reload])
  useEffect(() => { if (current) { setDraft(current.content); setNote(''); setShowVersions(false); setVersions(null) } }, [current?.key, current?.version]) // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = !!current && draft !== current.content
  const save = async () => {
    if (!current) return
    setBusy(true)
    try { await api.savePrompt(current.key, draft, note || null); await reload(); setSaved(`${current.title} 저장됨. 다음 실행부터 적용됩니다.`); setTimeout(() => setSaved(null), 4000) }
    catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }
  const openVersions = async () => { if (!current) return; try { setVersions(await api.promptVersions(current.key)); setShowVersions(true) } catch (e) { setError(errText(e)) } }
  const revert = async (v: PromptVersion) => {
    if (!current || !confirm(`버전 ${v.version}의 내용으로 되돌립니다. 지금 내용은 이력에 남습니다.`)) return
    setBusy(true); try { await api.revertPrompt(current.key, v.version); await reload() } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }
  const reset = async () => {
    if (!current || !confirm('저장소에 들어 있는 기본 프롬프트로 되돌립니다. 지금 내용은 이력에 남습니다.')) return
    setBusy(true); try { await api.resetPrompt(current.key); await reload() } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }
  return (
    <div className="sd-layout">
      <aside className="sd-panel sd-side">
        <div className="sd-side-caption">프롬프트</div>
        <ul className="sd-list">
          {list == null && <li className="sd-list-empty">불러오는 중</li>}
          {list?.map((p) => (
            <li key={p.key}>
              <button onClick={() => setKey(p.key)} className="sd-list-item" aria-current={p.key === key ? 'true' : undefined}>
                <strong>{p.title}</strong>
                <span>버전 {p.version} · {fmtKst(p.updatedAt, { second: undefined })}{p.updatedBy && p.updatedBy !== 'default' ? '' : ' · 기본값'}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="sd-note sd-side-foot">여기 저장한 내용이 정본입니다. 관리자 PC의 AI 작업은 시작할 때마다 최신 내용을 받아 쓰고, 서버의 "다시 써서 넣기"도 같은 내용을 씁니다. 파일 경로와 담당 구간 같은 실행 정보는 실행할 때 뒤에 자동으로 붙으므로 여기에 적지 않습니다.</p>
      </aside>
      <section className="sd-main">
        {error && <Banner kind="bad" onClose={() => setError(null)}>{error}</Banner>}
        {saved && <Banner kind="info">{saved}</Banner>}
        {!current && <div className="sd-panel sd-guide">왼쪽에서 프롬프트를 고르세요.</div>}
        {current && (
          <Card
              title={current.title}
              lead={<>
                <p className="sd-lead">{current.description}</p>
                <p className="sd-note sd-meta">버전 {current.version} · 마지막 저장 {fmtKst(current.updatedAt)}{current.updatedBy && current.updatedBy !== 'default' ? ` · ${current.updatedBy}` : ' · 기본값'}</p>
              </>}
              actions={<>
                <button className="btn" onClick={openVersions}>이력 보기</button>
                {writable && <button className="btn" disabled={busy} onClick={reset}>기본값으로 되돌리기</button>}
              </>}>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} disabled={!writable} rows={28} className="sd-input sd-code" />
            <div className="sd-toolbar">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="무엇을 바꿨는지 한 줄 (이력에 남습니다)" className="sd-input sd-grow" disabled={!writable} />
              <span className="sd-muted sd-small">{draft.length.toLocaleString()}자{dirty ? ' · 저장하지 않은 변경' : ''}</span>
              {writable && <button className="btn" disabled={!dirty} onClick={() => setDraft(current.content)}>변경 취소</button>}
              {writable && <button className="btn sd-primary" disabled={busy || !dirty} onClick={save}>저장</button>}
            </div>
            {showVersions && versions && (
              <div className="sd-table-wrap">
                <table className="sd-table">
                  <thead><tr><th className="sd-col-version">버전</th><th className="sd-col-when">저장 시각</th><th className="sd-col-who">저장한 사람</th><th>메모</th><th className="sd-col-when"></th></tr></thead>
                  <tbody>
                    {versions.map((v) => (
                      <tr key={v.id}>
                        <td className="sd-mono">{v.version}</td><td className="sd-mono">{fmtKst(v.createdAt)}</td><td className="sd-small">{v.createdBy ?? ''}</td><td className="sd-small">{v.note ?? ''}</td>
                        <td className="sd-row-actions"><button className="btn sd-sm" onClick={() => setDraft(v.content)}>편집칸에 불러오기</button>{writable && v.version !== current.version && <button className="btn sd-sm" disabled={busy} onClick={() => revert(v)}>이 버전으로 되돌리기</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </section>
    </div>
  )
}

function parseSceneTable(text: string, airDate: string, airStartAt: string): NewSceneNote[] {
  const out: NewSceneNote[] = []
  const start = new Date(airStartAt).getTime()
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line.startsWith('|')) continue
    const cells = line.slice(1, line.endsWith('|') ? -1 : undefined).split('|').map((c) => c.trim())
    const m = /^(\d{1,2}):(\d{2})$/.exec(cells[0] ?? '')
    if (!m || !cells[1] || /^-+$/.test(cells[1])) continue
    let t = new Date(`${airDate}T${m[1].padStart(2, '0')}:${m[2]}:00+09:00`).getTime()
    if (t < start - 3 * 3600_000) t += 86400_000
    out.push({ minuteAt: new Date(t).toISOString(), note: cells[1], confidence: cells[3] || null, tag: cells[4] || null })
  }
  return out
}

/** 채팅과 함께 넣은 참여 신호 요약. 채팅만 넣고 반응·감상 시간이 없는 옛 계획은 비어 있다. */
function engagementLine(e: EngagementSummary | null | undefined) {
  if (!e || (e.emojis === 0 && e.watchSeconds === 0)) return null
  const h = Math.floor(e.watchSeconds / 3600), m = Math.round((e.watchSeconds % 3600) / 60)
  return <p className="sd-note">채팅과 함께 넣은 것 — 장면 반응 {e.emojis.toLocaleString()}개 · 누적 감상 시간 {h > 0 ? `${h}시간 ` : ''}{m}분. 지울 때 함께 빠집니다.</p>
}

/* ─── 다른 환경 넣기 장부(HP-518) ──────────────────────────────────── */
/* 계획 행의 다른 환경 넣기 기록 — external = {env: {id, batchKey}}(정본 서버가 행마다 남긴다). */
function extOf(it: PlanItem): Record<string, { id: number; batchKey: string }> { try { return it.external ? JSON.parse(it.external) : {} } catch { return {} } }
/* 대상 서버에 넣었지만 정본 서버에 아직 기록하지 못한 결과(pending)와, 보내 본 묶음 키(attempted). 이 브라우저에만 남는다 —
   서버에 둘 자리가 없어서다. 장부가 사라져도(다른 브라우저·저장소 정리) 종전보다 나빠지지는 않는다. */
type OtherRecord = { batchKey: string; results: { itemId: number; remoteInjectionId: number | null }[] }
type OtherLedger = { attempted: string[]; pending: OtherRecord[] }
const otherLedgerKey = (planId: number) => `replix_seeding_other_${WORKSPACE.env}_${OTHER.env}_${planId}`
function readOtherLedger(planId: number): OtherLedger {
  try { const s = localStorage.getItem(otherLedgerKey(planId)); const l = s ? JSON.parse(s) as Partial<OtherLedger> : {}; return { attempted: l.attempted ?? [], pending: l.pending ?? [] } }
  catch { return { attempted: [], pending: [] } }
}
function writeOtherLedger(planId: number, l: OtherLedger) {
  try { if (l.attempted.length || l.pending.length) localStorage.setItem(otherLedgerKey(planId), JSON.stringify(l)); else localStorage.removeItem(otherLedgerKey(planId)) }
  catch { /* 저장할 수 없으면 이번 넣기 안에서만 지킨다 */ }
}
function noteOtherAttempt(planId: number, batchKey: string) { const l = readOtherLedger(planId); if (!l.attempted.includes(batchKey)) writeOtherLedger(planId, { ...l, attempted: [...l.attempted, batchKey] }) }
function keepOtherPending(planId: number, record: OtherRecord) { const l = readOtherLedger(planId); writeOtherLedger(planId, { ...l, pending: [...l.pending, record] }) }
function clearOtherLedger(planId: number) { writeOtherLedger(planId, { attempted: [], pending: [] }) }

/* 정본 서버 기록 — 순간 오류로 결과를 잃지 않게 세 번까지 시도한다(1초·2초 간격). 서버는 같은 기록을 다시 받아도 같은 값으로 덮는다. */
async function recordOtherWithRetry(planId: number, batchKey: string, results: OtherRecord['results']): Promise<PlanView> {
  for (let attempt = 0; ; attempt++) {
    try { return await api.recordExternal(planId, OTHER.env, batchKey, results) }
    catch (e) { if (attempt >= 2) throw e; await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt)) }
  }
}

/* 묶음들의 장면 반응·감상 시간을 대상 서버에 만든다(HP-436). 실패는 errors에 모으고 계속한다 — 채팅은 이미 들어갔다.
   돌려주는 값은 마지막으로 받은 요약이다. */
async function engageOther(token: string, batchKeys: string[], errors: string[]): Promise<EngagementSummary | null> {
  let eng: EngagementSummary | null = null
  for (const key of batchKeys) {
    try { eng = await callOther(OTHER.api, token, 'POST', `/api/v1/admin/seeding/external-injections/${encodeURIComponent(key)}/engagement`) as EngagementSummary }
    catch (e) { errors.unshift(`반응·감상 시간 넣기 실패: ${errText(e)}`) }
  }
  return eng
}

/* 장부에 남은 결과를 먼저 기록한다. 하나라도 못 하면 멈춘다 — 기록을 마치기 전에 다시 넣으면 같은 채팅이 또 들어간다.
   돌려주는 view는 마지막 기록의 응답(기록할 것이 없었으면 null), settled는 이번에 기록을 마친 묶음 키다. */
async function settleOtherLedger(planId: number): Promise<{ view: PlanView | null; settled: string[] }> {
  const l = readOtherLedger(planId)
  if (l.pending.length === 0) return { view: null, settled: [] }
  let view: PlanView | null = null
  const left: OtherRecord[] = []
  const settled: string[] = []
  for (const p of l.pending) {
    try { view = await recordOtherWithRetry(planId, p.batchKey, p.results); settled.push(p.batchKey) }
    catch { left.push(p) }
  }
  writeOtherLedger(planId, { ...readOtherLedger(planId), pending: left })
  if (left.length) {
    const n = left.reduce((a, p) => a + p.results.length, 0)
    throw new Error(`지난번 ${OTHER.label} 넣기 결과 ${n.toLocaleString()}건을 아직 운영 서버에 기록하지 못했습니다. 같은 채팅이 두 번 들어가지 않도록, 기록을 마칠 때까지 다시 넣지 않습니다. 잠시 뒤 다시 누르세요.`)
  }
  return { view, settled: Array.from(new Set(settled)) }
}

/* ─── 3단계: AI 계획과 4단계: 주입 ───────────────────────────────────── */
function PlanStep({ episode, plans, injections, writable, reload, onError }: { episode: Episode; plans: Plan[]; injections: Injection[]; writable: boolean; reload: () => void; onError: (m: string) => void }) {
  const [planId, setPlanId] = useState<number | null>(null)
  const [view, setView] = useState<PlanView | null>(null)
  const [upload, setUpload] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState<'all' | 'accepted' | 'rejected' | 'failed' | 'done'>('all')
  const [kindFilter, setKindFilter] = useState<InjectionKind | ''>('')
  const current = plans.find((p) => p.id === planId) ?? plans.find((p) => p.status === 'RUNNING') ?? plans.find((p) => p.status === 'DRAFT') ?? plans[0] ?? null
  const currentId = current?.id ?? null, currentStatus = current?.status ?? null
  useEffect(() => { if (!currentId) { setView(null); return } let alive = true; api.plan(currentId).then((v) => { if (alive) setView(v) }).catch((e) => onError(errText(e))); return () => { alive = false } }, [currentId, currentStatus, onError])
  useEffect(() => {
    if (!view || view.plan.status !== 'RUNNING') return
    const t = setInterval(async () => { try { const v = await api.plan(view.plan.id); setView(v); if (v.plan.status !== 'RUNNING') { setBusy(false); reload() } } catch { /* 다음 틱 */ } }, 2000)
    return () => clearInterval(t)
  }, [view, reload])

  const parsed = useMemo(() => {
    if (!text.trim()) return null
    try { const j = JSON.parse(text); const items: NewPlanItem[] = Array.isArray(j) ? j : j.items; return Array.isArray(items) ? { label: (Array.isArray(j) ? null : j.label) ?? null, source: (Array.isArray(j) ? null : j.source) ?? null, items } : null } catch { return null }
  }, [text])
  const doUpload = async () => { if (!parsed) return; setBusy(true); try { const v = await api.createPlan(episode.id, parsed); setText(''); setUpload(false); reload(); setPlanId(v.plan.id) } catch (e) { onError(errText(e)) } finally { setBusy(false) } }
  const toggle = async (itemId: number, accepted: boolean) => { try { const it = await api.patchPlanItem(itemId, { accepted }); setView((v) => v && { ...v, items: v.items.map((x) => x.item.id === it.id ? { ...x, item: it } : x) }) } catch (e) { onError(errText(e)) } }
  const execute = async () => {
    if (!view) return
    const n = view.items.filter((x) => x.item.accepted && !x.item.injectionId).length
    if (!await confirmWrite(WORKSPACE.env, { target: `${WORKSPACE.label} 서버 · ${episode.label ?? episode.airDate} 채팅`, change: `계획 #${view.plan.id}의 수락 ${n.toLocaleString()}건을 채팅으로 넣기`, reason: '넣은 뒤에는 "넣은 것 모두 지우기"로 계획 단위로 되돌릴 수 있습니다' },
      `수락한 ${n.toLocaleString()}건을 이 회차의 채팅으로 넣습니다. 넣은 뒤에는 "넣은 채팅 모두 지우기"나 익스텐션의 시딩 도구에서 한 건씩 지울 수 있습니다.`)) return
    setBusy(true)
    try {
      const v = await api.executePlan(view.plan.id)
      setView(v)
      /* 넣기는 서버 뒤에서 돌고 응답은 곧바로 온다. 넣을 행이 적으면 응답을 만들기 전에 끝나 RUNNING이 아니라 EXECUTED가
         오는데, 진행 지켜보기(위 효과)는 RUNNING일 때만 돌아 잠금이 영영 안 풀렸다(HP-519). 지켜볼 일이 없으면 곧바로 푼다. */
      if (v.plan.status !== 'RUNNING') { setBusy(false); reload() }
    } catch (e) { onError(errText(e)); setBusy(false) }
  }
  const rollback = async () => {
    if (!view || !await confirmWrite(WORKSPACE.env, { target: `${WORKSPACE.label} 서버 · ${episode.label ?? episode.airDate} 채팅`, change: `계획 #${view.plan.id}이 넣은 채팅 모두 지우기`, reason: '계획을 검수 대기 상태로 되돌립니다' },
      '이 계획이 넣은 채팅을 모두 지우고 검수 대기 상태로 되돌립니다.')) return
    setBusy(true); try { setView(await api.rollbackPlan(view.plan.id)); reload() } catch (e) { onError(errText(e)) } finally { setBusy(false) } }
  /* 다른 서버에만 넣으면 계획은 초안으로 남아 지울 수 있었다 — 지우면 그 서버의 채팅을 지울 화면이 사라진다(HP-518 리뷰). */
  const otherInjected = !!view && (view.items.some((x) => !!extOf(x.item)[OTHER.env]) || readOtherLedger(view.plan.id).attempted.length > 0)
  const remove = async () => { if (!view || otherInjected || !confirm('이 계획을 지웁니다. 아직 채팅에 넣지 않은 계획만 지울 수 있습니다.')) return; setBusy(true); try { await api.deletePlan(view.plan.id); setPlanId(null); reload() } catch (e) { onError(errText(e)) } finally { setBusy(false) } }

  /* 다른 환경에 넣기(HP-436): 수락했고 그 환경에 아직 안 넣은 행을, 정본 서버가 환산한 재생 초와 함께 그 서버의 외부 넣기 API 로
     보낸다(500건씩). 결과를 정본 서버에 행별로 기록해 표에 "개발 넣음"이 보이게 한다.
     대상 서버는 같은 행이 다시 와도 걸러 내지 않으므로 기록을 잃으면 안 된다(HP-518) — 기록이 끝내 실패하면 결과를 장부에
     남기고 멈추며, 다음 넣기·지우기는 장부부터 기록한다. 시도한 묶음 키도 보내기 전에 장부에 적어 '모두 지우기'가 지운다. */
  const [extProgress, setExtProgress] = useState<string | null>(null)
  const [otherEngagement, setOtherEngagement] = useState<EngagementSummary | null>(null)
  const injectOther = async () => {
    if (!view) return
    if (!view.platformEpisodeId || !view.platformCode) { onError('이 회차는 넷플릭스 회차와 연결되지 않아 다른 환경에 넣을 수 없습니다.'); return }
    setBusy(true)
    try {
      // 지난번에 기록하지 못한 결과부터 기록한다 — 그래야 아래 '넣을 행'에서 이미 들어간 행이 빠진다.
      const { view: fresh, settled } = await settleOtherLedger(view.plan.id)
      const current = fresh ?? view
      if (fresh) setView(fresh)
      const errors: string[] = []
      let token: string | null = null
      if (settled.length) {
        // 기록만 늦게 마친 묶음의 반응·감상 시간은 여기서 바로 부른다 — 새로 넣을 행이 없거나 아래 확인을 취소해도
        // 빠지지 않게(HP-518 리뷰). 서버는 이미 만든 묶음이면 그 요약을 그대로 준다.
        token = await secondaryToken(OTHER)
        setOtherEngagement(await engageOther(token, settled, errors))
      }
      const rows = current.items.filter((x) => x.item.accepted && !x.item.error && !extOf(x.item)[OTHER.env] && x.previewSec != null)
      if (rows.length === 0) {
        // 정산만으로 끝났으면 오류가 아니다 — 표에 방금 기록한 행이 '넣음'으로 보인다.
        if (settled.length) { if (errors.length) onError(errors[0]); reload() } else onError(`${OTHER.label} 서버에 넣을 행이 없습니다.`)
        return
      }
      if (!await confirmWrite(OTHER.env, { target: `${OTHER.label} 서버(${OTHER.api}) · 같은 회차 채팅`, change: `계획 #${current.plan.id}의 수락 ${rows.length.toLocaleString()}건을 채팅으로 넣기`, reason: `${OTHER.label} 서버에 그 회차가 없으면 실패합니다` },
        `수락한 ${rows.length.toLocaleString()}건을 ${OTHER.label} 서버(${OTHER.api})의 같은 회차 채팅에 넣습니다. ${OTHER.label} 서버에 그 회차가 없으면 실패합니다.`)) return
      token ??= await secondaryToken(OTHER)
      const batchKey = `plan:${WORKSPACE.env}:${current.plan.id}:${Date.now().toString(36)}`
      noteOtherAttempt(current.plan.id, batchKey)
      let injected = 0
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500)
        setExtProgress(`${OTHER.label} 서버에 넣는 중 ${Math.min(i + 500, rows.length)} / ${rows.length}`)
        const items: ExternalItem[] = chunk.map((x) => ({ ref: String(x.item.id), ghostKey: x.item.ghostKey ?? (x.item.seedPostId != null ? `post:${x.item.seedPostId}` : null), message: x.item.message, playbackSec: x.previewSec!, spoiler: x.item.spoiler, kind: x.item.kind }))
        const r = await callOther(OTHER.api, token!, 'POST', '/api/v1/admin/seeding/external-injections', { platformCode: current.platformCode, platformEpisodeId: current.platformEpisodeId, batchKey, origin: `${WORKSPACE.env}:plan:${current.plan.id}`, items }) as { results: ExternalResult[] }
        const results: { itemId: number; remoteInjectionId: number | null }[] = []
        for (const x of r.results) { if (x.injectionId) results.push({ itemId: Number(x.ref), remoteInjectionId: x.injectionId }); else if (x.error) errors.push(x.error) }
        if (results.length === 0) continue
        try {
          setView(await recordOtherWithRetry(current.plan.id, batchKey, results))
          injected += results.length
        } catch (e) {
          // 대상 서버에는 들어갔는데 정본 서버에 기록하지 못했다. 결과를 장부에 남기고 멈춘다 — 계속 넣으면 기록 못 한 행만 늘어난다.
          keepOtherPending(current.plan.id, { batchKey, results })
          throw new Error(`${OTHER.label} 서버에 넣은 ${results.length.toLocaleString()}건을 운영 서버에 기록하지 못했습니다. 다시 누르면 기록부터 마치고 이어서 넣습니다. (${errText(e)})`)
        }
      }
      // 채팅이 다 들어간 뒤 한 번 — 묶음 전체를 보고 장면 반응·감상 시간을 만든다(HP-436, 2026-10-02 결정).
      if (injected) {
        setExtProgress(`${OTHER.label} 서버에 반응·감상 시간 넣는 중`)
        setOtherEngagement(await engageOther(token, [batchKey], errors))
      }
      if (errors.length) onError(`${OTHER.label} 서버에 ${injected}건을 넣었고 ${errors.length}건은 실패했습니다. 첫 실패: ${errors[0]}`)
      reload()
    } catch (e) { onError(errText(e)) } finally { setExtProgress(null); setBusy(false) }
  }
  const rollbackOther = async () => {
    if (!view) return
    setBusy(true)
    try {
      // 다른 사람이 그사이 넣거나 지웠을 수 있다 — 낡은 화면이 아니라 방금 읽은 계획으로 지울 묶음을 정한다.
      const { view: fresh } = await settleOtherLedger(view.plan.id)
      const current = fresh ?? await api.plan(view.plan.id)
      setView(current)
      // 기록된 묶음에 더해, 보내 보았지만 기록이 없는 묶음(응답을 못 받고 끊긴 경우)도 지운다 — 대상 서버에 없으면 0건이다.
      const recorded = current.items.map((x) => extOf(x.item)[OTHER.env]?.batchKey).filter(Boolean) as string[]
      const batches = Array.from(new Set([...recorded, ...readOtherLedger(current.plan.id).attempted]))
      if (batches.length === 0) return
      if (!await confirmWrite(OTHER.env, { target: `${OTHER.label} 서버(${OTHER.api}) · 같은 회차 채팅`, change: `계획 #${current.plan.id}이 넣은 채팅 모두 지우기`, reason: `${OTHER.label} 서버에 넣은 묶음만 지웁니다` },
        `${OTHER.label} 서버에 넣은 이 계획의 채팅을 모두 지웁니다.`)) return
      const token = await secondaryToken(OTHER)
      for (const b of batches) await callOther(OTHER.api, token, 'DELETE', `/api/v1/admin/seeding/external-injections/${encodeURIComponent(b)}`)
      setView(await api.clearExternal(current.plan.id, OTHER.env)); clearOtherLedger(current.plan.id); setOtherEngagement(null); reload()
    } catch (e) { onError(errText(e)) } finally { setBusy(false) }
  }

  const stats = view ? { total: view.items.length, accepted: view.items.filter((x) => x.item.accepted).length, done: view.items.filter((x) => x.item.injectionId).length, failed: view.items.filter((x) => x.item.error).length, otherDone: view.items.filter((x) => !!extOf(x.item)[OTHER.env]).length,
    kinds: (Object.keys(KIND_LABEL) as InjectionKind[]).map((k) => [k, view.items.filter((x) => x.item.kind === k).length] as const) } : null
  const rows = (view?.items ?? []).filter((x) => (kindFilter ? x.item.kind === kindFilter : true) && (filter === 'all' ? true : filter === 'accepted' ? x.item.accepted && !x.item.error && !x.item.injectionId : filter === 'rejected' ? !x.item.accepted : filter === 'failed' ? !!x.item.error : (!!x.item.injectionId || !!extOf(x.item)[OTHER.env])))
  const running = view?.plan.status === 'RUNNING'

  return (
    <>
      <Card
          no={3} title="AI 채팅 계획"
          lead={<>
            <p className="sd-lead">AI가 수집한 글 가운데 화면 반응이 아닌 글(광고 불평, 다른 기수 이야기, 비하와 욕설)을 빼고, 남은 글을 아래 네 종류로 정리한 목록입니다. 익스텐션의 시딩 도구에서 "AI 채팅 작업 시작"을 누르면 만들어져 여기로 옵니다. 여기서는 훑어보며 뺄 행만 거부하면 됩니다. 표의 재생 시각은 지금 저장된 기준점으로 계산한 값이고, 실제로 넣을 때 다시 계산합니다.</p>
            <dl className="sd-kinds">
              {(Object.keys(KIND_LABEL) as InjectionKind[]).map((k) => <div key={k} className="sd-kind"><dt>{KIND_LABEL[k]}</dt><dd>{KIND_DESC[k]}</dd></div>)}
            </dl>
          </>}
          actions={writable && <button className="btn" onClick={() => setUpload((v) => !v)}>{upload ? '닫기' : '계획 파일을 손으로 올리기'}</button>}>
        {upload && (
          <div className="sd-stack">
            <p className="sd-note">관리자 PC의 파이프라인이 만든 plan.json 내용을 붙여 넣습니다. 보통은 AI 작업이 끝나면 자동으로 올라오므로 쓸 일이 없습니다.</p>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} spellCheck={false} className="sd-input sd-code" />
            <div className="sd-toolbar"><span className="sd-muted sd-small">{parsed ? `인식된 행 ${parsed.items.length}개` : text.trim() ? 'JSON 형식이 아닙니다' : ''}</span><span className="sd-spacer" /><button className="btn sd-primary" disabled={busy || !parsed || parsed.items.length === 0} onClick={doUpload}>올리기</button></div>
          </div>
        )}
        {plans.length === 0 && <p className="sd-empty">아직 계획이 없습니다. 수집이 끝났다면 넷플릭스에서 이 회차를 재생하고 익스텐션의 시딩 도구에서 "AI 채팅 작업 시작"을 누르세요. 한 시간쯤 뒤 계획이 여기에 나타납니다.</p>}
        {plans.length > 0 && (
          <div className="sd-plan-picks">
            {plans.map((p) => (
              <button key={p.id} className="sd-plan-pick" aria-pressed={current?.id === p.id} onClick={() => setPlanId(p.id)}>
                <strong>#{p.id} {p.label ?? p.source ?? ''}</strong>
                <span><State tone={PLAN_STATUS[p.status].tone}>{PLAN_STATUS[p.status].label}</State>{fmtKst(p.createdAt, { second: undefined })}</span>
              </button>
            ))}
          </div>
        )}
        {view && stats && (
          <>
            <div className="sd-stats">
              <div className="sd-stat"><b>{stats.total.toLocaleString()}</b><span>전체 행</span></div>
              <div className="sd-stat"><b>{stats.accepted.toLocaleString()}</b><span>수락</span></div>
              <div className="sd-stat"><b>{(stats.total - stats.accepted).toLocaleString()}</b><span>거부</span></div>
              <div className="sd-stat"><b className={stats.done ? 'is-on' : undefined}>{stats.done.toLocaleString()}</b><span>{WORKSPACE.label}에 넣음</span></div>
              <div className="sd-stat"><b className={stats.otherDone ? 'is-on' : undefined}>{stats.otherDone.toLocaleString()}</b><span>{OTHER.label}에 넣음</span></div>
              {stats.failed > 0 && <div className="sd-stat"><b className="is-warn">{stats.failed}</b><span>실패</span></div>}
              <div className="sd-stats-rule" />
              {stats.kinds.map(([k, n]) => <div key={k} className="sd-stat"><b>{n.toLocaleString()}</b><span>{KIND_LABEL[k]}</span></div>)}
              <span className="sd-spacer" />
              <span className="sd-muted sd-small">재생 시각은 기준점 {view.anchorCount}개로 계산{view.anchorCount === 0 && ' (기준점이 없어 방영 시작 시각만으로 계산)'}</span>
            </div>
            <div className="sd-toolbar">
              <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="sd-input sd-sm">
                <option value="all">모든 행</option><option value="accepted">수락했고 아직 넣지 않음</option><option value="rejected">거부함</option><option value="done">어느 서버든 넣음</option><option value="failed">넣기 실패</option>
              </select>
              <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value as InjectionKind | '')} className="sd-input sd-sm">
                <option value="">모든 종류</option>{(Object.keys(KIND_LABEL) as InjectionKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
              <span className="sd-muted sd-small">{rows.length.toLocaleString()}행 표시</span>
            </div>
            <div className="sd-table-wrap sd-h-xl">
              <table className="sd-table">
                <thead><tr><th className="sd-col-clock-sm">재생 시각</th><th className="sd-col-kind">종류</th><th>채팅</th><th className="sd-col-reason">근거 장면과 고른 이유</th><th className="sd-col-review">검수</th></tr></thead>
                <tbody>
                  {rows.map(({ item, previewSec, gap }) => (
                    <tr key={item.id} className={[!item.accepted ? 'is-rejected' : '', item.error ? 'is-failed' : item.injectionId ? 'is-done' : ''].filter(Boolean).join(' ') || undefined}>
                      <td className="sd-mono sd-nowrap">{fmtSec(previewSec)}{gap && <span className="sd-warn" title="광고 중에 올라온 글이라 다음 기준점 시각에 붙습니다"> 광고</span>}</td>
                      <td className="sd-nowrap"><span className="sd-tag">{KIND_LABEL[item.kind]}</span>{item.spoiler && <span className="sd-tag is-warn">스포일러</span>}</td>
                      <td>{item.message}</td>
                      <td className="sd-muted sd-small">{item.scene}{item.reason && <div className="sd-faint">{item.reason}</div>}{item.error && <div className="sd-warn">{item.error}</div>}</td>
                      <td className="sd-row-actions">
                        {item.injectionId && <span className="sd-ok sd-small">{WORKSPACE.label} 넣음</span>}
                        {extOf(item)[OTHER.env] && <span className="sd-ok sd-small">{OTHER.label} 넣음</span>}
                        {item.error ? <span className="sd-warn sd-small">실패</span>
                          : item.injectionId ? null
                          : writable && !running ? <button className="btn sd-sm" onClick={() => toggle(item.id, !item.accepted)}>{item.accepted ? '거부' : '다시 수락'}</button> : <span className="sd-muted sd-small">{item.accepted ? '수락' : '거부'}</span>}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={5} className="sd-muted">조건에 맞는 행이 없습니다.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <Card
          no={4} title="채팅 넣기"
          lead={<p className="sd-lead">검수를 마친 계획의 수락 행을 회차의 채팅으로 넣습니다. 넣을 서버를 고를 수 있습니다. <b>{WORKSPACE.label}</b>은 이 콘솔이 붙은 서버라 바로 넣고, <b>{OTHER.label}</b>은 완성된 행을 그 서버로 보내 넣습니다(처음 한 번 {OTHER.label} 로그인 창이 뜹니다). 각 행은 시딩 전용 계정(유령 계정) 이름으로 저장되어 다른 사용자 채팅과 똑같이 보이고, 접속자 수나 활동 통계에는 잡히지 않습니다. 넷플릭스 회차가 연결되어 있어야 하며, 잘못 넣었으면 서버별로 계획 단위로 모두 지울 수 있습니다.</p>}>
        <div className="sd-toolbar">
          <div className="sd-stat"><b>{injections.length.toLocaleString()}</b><span>{WORKSPACE.label} 서버에 넣은 채팅</span></div>
          {stats && <div className="sd-stat"><b>{stats.otherDone.toLocaleString()}</b><span>{OTHER.label} 서버에 넣은 채팅 (이 계획)</span></div>}
          <span className="sd-spacer" />
          {!episode.episodeId && <span className="notice-box">넷플릭스 회차가 연결되지 않아 채팅을 넣을 수 없습니다.</span>}
          {view && writable && view.plan.status === 'DRAFT' && <button className="btn sd-danger" disabled={busy || otherInjected} title={otherInjected ? `${OTHER.label} 서버에 넣은 채팅을 먼저 지우세요` : undefined} onClick={remove}>계획 #{view.plan.id} 지우기</button>}
        </div>
        {view && writable && stats && (
          <div className="sd-targets">
            <div className={`sd-target${WORKSPACE.env === 'prod' ? ' is-prod' : ''}`}>
              <div className="sd-target-head">{WORKSPACE.label} 서버 <span className="sd-mono">{WORKSPACE.api}</span></div>
              <p className="sd-note">{WORKSPACE.env === 'prod' ? '실제 사용자에게 보입니다.' : '개발 서버에만 보입니다.'} 서버가 뒤에서 처리하며 진행률이 여기와 익스텐션의 시딩 도구에 표시됩니다. 채팅이 다 들어가면 그에 맞춰 장면 반응과 누적 감상 시간도 함께 넣습니다(카탈로그 순위에 반영).</p>
              <div className="sd-actions">
                <button className="btn sd-primary" disabled={busy || running || !episode.episodeId || stats.accepted - stats.done <= 0} onClick={execute}>
                  {running ? `넣는 중 ${(stats.done + stats.failed).toLocaleString()} / ${stats.accepted.toLocaleString()}` : `${WORKSPACE.label}에 ${(stats.accepted - stats.done).toLocaleString()}건 넣기`}
                </button>
                {stats.done > 0 && !running && <button className="btn sd-danger" disabled={busy} onClick={rollback}>{WORKSPACE.label}에 넣은 것 모두 지우기</button>}
              </div>
              {engagementLine(view.engagement)}
            </div>
            <div className={`sd-target${OTHER.env === 'prod' ? ' is-prod' : ''}`}>
              <div className="sd-target-head">{OTHER.label} 서버 <span className="sd-mono">{OTHER.api}</span>{secondarySignedIn(OTHER) && <button className="btn sd-sm" onClick={() => { secondaryLogout(OTHER); reload() }}>로그아웃</button>}</div>
              <p className="sd-note">{OTHER.env === 'prod' ? '실제 사용자에게 보입니다.' : '개발 서버에만 보입니다.'} 이 콘솔이 환산한 재생 시각과 문장을 {OTHER.label} 서버로 보내 넣습니다. {OTHER.label} 서버에 이 회차가 있어야 합니다(그 환경에서 회차를 한 번 열면 생깁니다).</p>
              <div className="sd-actions">
                <button className="btn sd-primary" disabled={busy || !episode.episodeId || stats.accepted - stats.otherDone <= 0} onClick={injectOther}>
                  {extProgress ?? `${OTHER.label}에 ${Math.max(0, stats.accepted - stats.otherDone).toLocaleString()}건 넣기`}
                </button>
                {(stats.otherDone > 0 || readOtherLedger(view.plan.id).attempted.length > 0) && <button className="btn sd-danger" disabled={busy} onClick={rollbackOther}>{OTHER.label}에 넣은 것 모두 지우기</button>}
              </div>
              {engagementLine(otherEngagement)}
            </div>
          </div>
        )}
      </Card>
    </>
  )
}
