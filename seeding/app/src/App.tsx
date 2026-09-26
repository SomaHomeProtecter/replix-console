import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, ApiError, type Collection, type Density, type Episode, type Injection, type InjectionKind, type NewPlanItem, type NewSceneNote, type Plan, type PlanView, type Post, type PostsPage, type Prompt, type PromptVersion, type SceneNote, type SourceKind, type SyncAnchor, type Work } from './api'
import { canRead, canWrite, login, logout, useAuth } from './auth'
import { ENV } from './env'

/* 시딩 도구 화면(HP-435/436) — 2026-09-26 전면 재설계.
   원칙(조현빈): 함축·생략보다 각 기능의 용도가 문장으로 이해돼야 한다. 직관적인 것은 단순한 것이 아니고, 친절한 것은 장황한 것이
   아니다. 표·그래프·목록은 담길 분량에 맞게 넓게 잡는다.
   구조: 왼쪽에 작품·회차 목록, 오른쪽에 고른 회차의 네 단계를 위에서 아래로. 단계마다 "무엇을 하는 단계"와 "지금 상태"를 먼저 말한다.
   라우팅은 없다(관리자 한 명이 한 회차씩 다루는 도구). 진행 중인 작업은 2초마다 다시 읽는다. */

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
const COLL_STATUS: Record<Collection['status'], { label: string; cls: string }> = {
  QUEUED: { label: '대기 중', cls: 'bg-soft text-muted' }, RUNNING: { label: '수집 중', cls: 'bg-warnw text-warn' },
  DONE: { label: '완료', cls: 'bg-okw text-ok' }, FAILED: { label: '실패', cls: 'bg-badw text-bad' }, CANCELLED: { label: '취소됨', cls: 'bg-soft text-muted' },
}
const PLAN_STATUS: Record<Plan['status'], { label: string; cls: string }> = {
  DRAFT: { label: '검수 대기', cls: 'bg-infow text-info' }, RUNNING: { label: '넣는 중', cls: 'bg-warnw text-warn' }, EXECUTED: { label: '넣기 완료', cls: 'bg-okw text-ok' },
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
function isoToLocalInput(iso: string | null): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat('sv-SE', { timeZone: KST, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)).replace(' ', 'T')
}
function localInputToIso(v: string): string | null { return v ? new Date(`${v}:00+09:00`).toISOString() : null }
function lastAirDate(weekday: number | null): string {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: KST }))
  if (!weekday) return now.toISOString().slice(0, 10)
  const isoDow = ((now.getDay() + 6) % 7) + 1
  now.setDate(now.getDate() - ((isoDow - weekday + 7) % 7))
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
function errText(e: unknown) { return e instanceof ApiError ? `${e.message}${e.code ? ` (${e.code})` : ''}` : e instanceof Error ? e.message : String(e) }

/* ─── 틀 ─────────────────────────────────────────────────────────── */
export default function App() {
  const { ready, user } = useAuth()
  if (!ready) return <Shell><p className="text-muted p-6">로그인 상태를 확인하고 있습니다.</p></Shell>
  if (!user) return <Shell><Gate title="관리자 로그인이 필요합니다" body="이 도구는 운영 데이터를 다룹니다. 팀 Keycloak 계정으로 로그인하세요."><button className="btn-primary" onClick={login}>로그인</button></Gate></Shell>
  if (!canRead(user)) return <Shell user={user.name}><Gate title="이 계정에는 권한이 없습니다" body={`${user.name} 계정에 관리자 역할(admin, moderation_operator, admin_console_viewer 중 하나)이 없습니다. 팀 관리자에게 역할을 요청하세요.`}><button className="btn" onClick={logout}>로그아웃</button></Gate></Shell>
  return <Shell user={user.name} nav><Main writable={canWrite(user)} /></Shell>
}

/* 상단 이동: 회차 작업(기본) ↔ AI 프롬프트. 라우팅 없이 상태로 바꾼다. */
function Main({ writable }: { writable: boolean }) {
  const [view, setView] = useState<'work' | 'prompts'>('work')
  return (
    <>
      <nav className="h-11 border-b border-line bg-raise flex items-center gap-1 px-6">
        {([['work', '회차 작업'], ['prompts', 'AI 프롬프트']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setView(k)} className={`h-11 px-3 text-sm border-b-2 ${view === k ? 'border-accent font-semibold' : 'border-transparent text-muted hover:text-ink'}`}>{label}</button>
        ))}
      </nav>
      {view === 'work' ? <Workspace writable={writable} /> : <PromptsView writable={writable} />}
    </>
  )
}

function Shell({ user, children }: { user?: string; nav?: boolean; children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-14 bg-ink text-white flex items-center gap-4 px-6">
        <span className="inline-block w-2.5 h-2.5 rounded-sm bg-accent" />
        <span className="font-bold tracking-wide text-[15px]">Replix 시딩 도구</span>
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold tracking-wider ${ENV === 'prod' ? 'bg-accent text-white' : 'bg-warn text-white'}`}>{ENV === 'prod' ? '운영 서버' : '개발 서버'}</span>
        <span className="text-white/55 text-xs">{ENV === 'prod' ? '여기서 넣은 채팅은 실제 사용자에게 보입니다.' : '개발 서버에만 반영됩니다. 실제 사용자에게는 보이지 않습니다.'}</span>
        <span className="flex-1" />
        {user && <><span className="text-sm text-white/80">{user}</span><button className="text-xs text-white/60 hover:text-white" onClick={logout}>로그아웃</button></>}
      </header>
      <main className="flex-1">{children}</main>
    </div>
  )
}

function Gate({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  return (
    <div className="max-w-md mx-auto mt-24 card p-6 flex flex-col gap-3">
      <h1 className="text-lg font-bold">{title}</h1>
      <p className="text-sm text-ink2 leading-relaxed">{body}</p>
      <div>{children}</div>
    </div>
  )
}

function Banner({ kind, children, onClose }: { kind: 'bad' | 'info'; children: ReactNode; onClose?: () => void }) {
  return (
    <div className={`rounded-lg px-4 py-3 text-sm flex items-start gap-3 ${kind === 'bad' ? 'bg-badw text-bad' : 'bg-infow text-info'}`}>
      <div className="flex-1 leading-relaxed">{children}</div>
      {onClose && <button className="text-xs underline" onClick={onClose}>닫기</button>}
    </div>
  )
}

/* ─── 작업 공간: 왼쪽 작품·회차, 오른쪽 단계 ───────────────────────── */
function Workspace({ writable }: { writable: boolean }) {
  const [works, setWorks] = useState<Work[] | null>(null)
  const [workId, setWorkId] = useState<number | null>(null)
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [episodeId, setEpisodeId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const work = useMemo(() => works?.find((w) => w.id === workId) ?? null, [works, workId])
  const episode = useMemo(() => episodes.find((e) => e.id === episodeId) ?? null, [episodes, episodeId])

  const loadWorks = useCallback(() => api.works().then((ws) => { setWorks(ws); setWorkId((cur) => cur ?? ws[0]?.id ?? null) }).catch((e) => setError(errText(e))), [])
  const loadEpisodes = useCallback((wid: number) => api.episodes(wid).then((es) => { setEpisodes(es); setEpisodeId((cur) => es.some((e) => e.id === cur) ? cur : (es[0]?.id ?? null)) }).catch((e) => setError(errText(e))), [])
  useEffect(() => { loadWorks() }, [loadWorks])
  useEffect(() => { if (workId != null) loadEpisodes(workId) }, [workId, loadEpisodes])

  return (
    <div className="grid grid-cols-[300px_minmax(0,1fr)] min-h-[calc(100vh-56px)]">
      <aside className="border-r border-line bg-raise flex flex-col">
        <div className="px-5 pt-5 pb-3">
          <div className="text-[11px] font-semibold text-muted mb-2">작품</div>
          <select value={workId ?? ''} onChange={(e) => setWorkId(Number(e.target.value))} className="input w-full">
            {works == null && <option>불러오는 중</option>}
            {works?.map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}
          </select>
          {work && (
            <p className="note mt-2">
              {work.airWeekday ? `${WEEKDAYS[work.airWeekday]}요일 ${work.airTime ?? ''} 방영` : '정기 편성 없음'}
              {work.defaultRuntimeSec ? ` · 본편 약 ${Math.round(work.defaultRuntimeSec / 60)}분` : ''}
              <br />글을 모으는 곳: {work.sources.map((s) => `${SOURCE_LABEL[s.kind]} ${s.kind === 'DCINSIDE' ? '갤러리' : '게시판'} ${s.boardId}`).join(', ') || '없음'}
            </p>
          )}
        </div>
        <div className="px-5 pb-2 text-[11px] font-semibold text-muted">회차</div>
        <ul className="px-3 pb-3 flex flex-col gap-1 overflow-auto">
          {work && episodes.length === 0 && <li className="px-2 py-2 text-sm text-muted">아직 회차가 없습니다. 아래에서 방영일을 추가하세요.</li>}
          {episodes.map((e) => (
            <li key={e.id}>
              <button onClick={() => setEpisodeId(e.id)} className={`w-full text-left rounded-lg px-3 py-2.5 border ${e.id === episodeId ? 'border-info bg-infow' : 'border-transparent hover:bg-soft'}`}>
                <div className="font-semibold">{e.label ?? e.airDate}</div>
                <div className="text-xs text-muted mt-0.5">{e.airDate} · {fmtTime(e.airStartAt).slice(0, 5)} 시작{e.episodeId ? ' · 넷플릭스 연결됨' : ''}</div>
              </button>
            </li>
          ))}
        </ul>
        {work && writable && <AddEpisode work={work} onAdded={(id) => { loadEpisodes(work.id); setEpisodeId(id) }} onError={setError} />}
      </aside>

      <section className="p-6 flex flex-col gap-5 max-w-[1400px]">
        {error && <Banner kind="bad" onClose={() => setError(null)}>{error}</Banner>}
        {!episode && <div className="card card-body text-sm text-muted">왼쪽에서 회차를 고르면 그 회차의 작업 단계가 여기에 나타납니다.</div>}
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
    <div className="mt-auto border-t border-line px-5 py-4">
      {!open ? <button className="btn w-full justify-center" onClick={() => { setAirDate(lastAirDate(work.airWeekday)); setOpen(true) }}>회차 추가</button> : (
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex flex-col gap-1"><span className="text-xs text-muted">방영일</span><input type="date" value={airDate} onChange={(e) => setAirDate(e.target.value)} className="input" /></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-muted">이름 (예: 33기 9회)</span><input value={label} onChange={(e) => setLabel(e.target.value)} className="input" /></label>
          <p className="note">방영 시작 시각은 작품의 편성 시각으로 채워집니다. 종료 시각은 수집이 끝난 뒤 글 밀도를 보고 정합니다.</p>
          <div className="flex gap-2"><button className="btn-primary" disabled={busy} onClick={add}>추가</button><button className="btn" onClick={() => setOpen(false)}>취소</button></div>
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
      <div className="flex items-end justify-between gap-6">
        <div>
          <div className="text-xs text-muted">{work.title}</div>
          <h1 className="text-2xl font-bold mt-0.5">{episode.label ?? episode.airDate} <span className="text-base font-normal text-muted ml-1">{episode.airDate}</span></h1>
        </div>
        <ol className="flex gap-2">
          {steps.map((s, i) => (
            <li key={s.label} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${s.ok ? 'border-ok/30 bg-okw' : 'border-line bg-raise'}`}>
              <span className={`w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center ${s.ok ? 'bg-ok text-white' : 'bg-soft text-muted'}`}>{i + 1}</span>
              <div className="leading-tight"><div className="text-xs font-semibold">{s.label}</div><div className="text-[11px] text-muted">{s.state}</div></div>
            </li>
          ))}
        </ol>
      </div>

      <EpisodeInfo episode={episode} work={work} writable={writable} onChanged={onEpisodeChanged} onError={onError} />
      <CollectStep episode={episode} collections={collections} writable={writable} reload={reloadCollections} onEpisodeChanged={onEpisodeChanged} onError={onError} />
      <SyncStep episode={episode} anchors={anchors} notes={notes} writable={writable} reload={reloadSync} onError={onError} />
      <PlanStep episode={episode} plans={plans} injections={injections} writable={writable} reload={reloadPlans} onError={onError} />
    </>
  )
}

/* ─── 회차 정보 ────────────────────────────────────────────────────── */
function EpisodeInfo({ episode, work, writable, onChanged, onError }: { episode: Episode; work: Work; writable: boolean; onChanged: () => void; onError: (m: string) => void }) {
  const [edit, setEdit] = useState(false)
  const [label, setLabel] = useState(episode.label ?? '')
  const [start, setStart] = useState(isoToLocalInput(episode.airStartAt))
  const [end, setEnd] = useState(isoToLocalInput(episode.airEndAt))
  const [runtime, setRuntime] = useState(episode.runtimeSec ? String(Math.round(episode.runtimeSec / 60)) : '')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    const s = localInputToIso(start)
    if (!s) { onError('방영 시작 시각은 비울 수 없습니다.'); return }
    setBusy(true)
    try { await api.updateEpisode(episode.id, { label: label || null, airStartAt: s, airEndAt: localInputToIso(end), runtimeSec: runtime ? Number(runtime) * 60 : null, episodeId: episode.episodeId }); setEdit(false); onChanged() }
    catch (e) { onError(errText(e)) } finally { setBusy(false) }
  }
  const unlink = async () => {
    if (!confirm('넷플릭스 회차와의 연결을 끊습니다. 확장 패널에서 다시 연결할 수 있습니다.')) return
    try { await api.linkEpisode(episode.id, null); onChanged() } catch (e) { onError(errText(e)) }
  }
  return (
    <div className="card">
      <div className="card-head flex items-start justify-between gap-4">
        <div>
          <h2 className="font-bold">회차 정보</h2>
          <p className="lead mt-1">방영 시각은 글을 모을 범위와 채팅 시각 계산의 기준입니다. 편성표 시각이 아니라 실제로 본편이 시작하고 끝난 시각을 적으세요. 정확한 값은 수집 뒤 분당 글 수 그래프와 AI 장면 복원이 알려 줍니다.</p>
        </div>
        {writable && !edit && <button className="btn" onClick={() => setEdit(true)}>고치기</button>}
      </div>
      <div className="card-body grid grid-cols-2 gap-x-10 gap-y-4">
        {!edit ? (
          <>
            <div className="kv">
              <span className="text-muted">이름</span><span>{episode.label ?? '없음'}</span>
              <span className="text-muted">방영 시작</span><span className="mono">{fmtKst(episode.airStartAt)}</span>
              <span className="text-muted">방영 종료</span><span className="mono">{episode.airEndAt ? fmtKst(episode.airEndAt) : <span className="text-muted">아직 모름 (시작 후 3시간까지 수집)</span>}</span>
              <span className="text-muted">넷플릭스 본편 길이</span><span>{episode.runtimeSec ? `${Math.round(episode.runtimeSec / 60)}분` : work.defaultRuntimeSec ? `작품 기본값 ${Math.round(work.defaultRuntimeSec / 60)}분` : '모름'}</span>
            </div>
            <div className="kv">
              <span className="text-muted">넷플릭스 회차 연결</span>
              <span>{episode.episodeId
                ? <span className="flex items-center gap-2"><span className="pill bg-okw text-ok">연결됨</span><span className="text-xs text-muted">회차 id {episode.episodeId}</span>{writable && <button className="btn btn-sm" onClick={unlink}>연결 끊기</button>}</span>
                : <span className="text-muted">아직 연결되지 않았습니다. 넷플릭스에서 이 회차를 재생하고 확장의 시딩 도구에서 "이 회차에 연결"을 누르면 연결됩니다. 채팅은 연결된 뒤에만 넣을 수 있습니다.</span>}</span>
            </div>
          </>
        ) : (
          <>
            <div className="kv">
              <span className="text-muted">이름</span><input value={label} onChange={(e) => setLabel(e.target.value)} className="input" placeholder="예: 33기 9회" />
              <span className="text-muted">방영 시작 (KST)</span><input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="input mono" />
              <span className="text-muted">방영 종료 (KST)</span><input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className="input mono" />
              <span className="text-muted">본편 길이 (분)</span><input type="number" value={runtime} onChange={(e) => setRuntime(e.target.value)} className="input mono w-28" placeholder="예: 97" />
            </div>
            <div className="flex flex-col gap-2">
              <p className="note">종료 시각을 비워 두면 시작 후 3시간까지 넉넉히 수집하고, 밀도 그래프의 제안으로 나중에 채울 수 있습니다. 본편 길이는 넷플릭스 재생 화면의 길이입니다. 광고를 뺀 값이라 방송 길이보다 짧습니다.</p>
              <div className="flex gap-2"><button className="btn-primary" disabled={busy} onClick={save}>저장</button><button className="btn" onClick={() => setEdit(false)}>취소</button></div>
            </div>
          </>
        )}
      </div>
    </div>
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
    <div className="card">
      <div className="card-head flex items-start justify-between gap-4">
        <div>
          <h2 className="font-bold flex items-center"><span className="step-no">1</span>수집</h2>
          <p className="lead mt-2">방송 시간대에 디시인사이드와 더쿠에 올라온 글을 모아 서버에 저장합니다. 이 글이 뒤의 모든 단계의 재료입니다. 모으는 범위는 방영 시작 20분 전부터 종료 30분 뒤까지이고, 종료 시각을 모르면 시작 후 3시간까지 모은 뒤 분당 글 수를 보고 종료를 찾습니다. 한 회차에 보통 5분쯤 걸립니다.</p>
        </div>
        {writable && <button className="btn-primary" disabled={busy || active} onClick={start}>{active ? '수집 중' : collections.length ? '다시 수집' : '수집 시작'}</button>}
      </div>
      <div className="card-body flex flex-col gap-5">
        {collections.length === 0 && <p className="text-sm text-muted">아직 수집한 적이 없습니다.</p>}
        {collections.length > 0 && (
          <div className="overflow-auto rounded-lg border border-line">
            <table className="table">
              <thead><tr><th>번호</th><th>상태</th><th>모은 글</th><th>모은 범위 (방송 시각)</th><th>걸린 시간</th><th>진행 상황 또는 오류</th><th></th></tr></thead>
              <tbody>
                {collections.map((c) => (
                  <tr key={c.id} className={`cursor-pointer ${selected?.id === c.id ? 'bg-infow' : 'hover:bg-soft'}`} onClick={() => setSelectedId(c.id)}>
                    <td className="mono">#{c.id}</td>
                    <td><span className={`pill ${COLL_STATUS[c.status].cls}`}>{COLL_STATUS[c.status].label}</span></td>
                    <td className="mono">{c.postCount.toLocaleString()}</td>
                    <td className="mono whitespace-nowrap">{fmtKst(c.windowStartAt, { second: undefined })} ~ {fmtTime(c.windowEndAt).slice(0, 5)}</td>
                    <td>{c.status === 'DONE' ? fmtDuration(c.startedAt, c.finishedAt) : c.status === 'RUNNING' ? fmtDuration(c.startedAt, new Date().toISOString()) : ''}</td>
                    <td className="text-xs text-muted max-w-[360px]">{c.status === 'RUNNING' ? c.progress : c.error ? <span className="text-bad">{c.error}</span> : ''}</td>
                    <td className="whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                      {writable && (c.status === 'RUNNING' || c.status === 'QUEUED') && <button className="btn btn-sm" onClick={() => cancel(c.id)}>취소</button>}
                      {c.status === 'DONE' && <button className="btn btn-sm" onClick={() => api.download(c.id).catch((e) => onError(errText(e)))}>JSON 내려받기</button>}
                      {writable && (c.status === 'DONE' || c.status === 'FAILED' || c.status === 'CANCELLED') && <button className="btn btn-sm ml-1 text-bad" onClick={() => remove(c)}>지우기</button>}
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
      </div>
    </div>
  )
}

/* 분당 글 수 그래프 — 방송 시작·종료를 눈으로 확인하고 제안 시각을 회차 정보에 적용한다. 자동 반영은 하지 않는다. */
function DensityChart({ collection: c, episode, writable, onEpisodeChanged, onError }: { collection: Collection; episode: Episode; writable: boolean; onEpisodeChanged: () => void; onError: (m: string) => void }) {
  const [d, setD] = useState<Density | null>(null)
  const [busy, setBusy] = useState(false)
  const [jump, setJump] = useState<string | null>(null)
  useEffect(() => { let alive = true; api.density(c.id).then((x) => { if (alive) setD(x) }).catch((e) => onError(errText(e))); return () => { alive = false } }, [c.id, onError])
  if (!d) return <p className="text-sm text-muted">분당 글 수를 계산하고 있습니다.</p>
  const W = 1000, H = 140, n = d.buckets.length
  const max = Math.max(1, ...d.buckets.map((b) => b.count))
  const x = (iso: string) => ((new Date(iso).getTime() - new Date(d.from).getTime()) / 60000) / Math.max(1, n - 1) * W
  const apply = async (field: 'airStartAt' | 'airEndAt', value: string) => {
    setBusy(true)
    try { await api.updateEpisode(episode.id, { label: episode.label, airStartAt: field === 'airStartAt' ? value : episode.airStartAt, airEndAt: field === 'airEndAt' ? value : episode.airEndAt, runtimeSec: episode.runtimeSec, episodeId: episode.episodeId }); onEpisodeChanged() }
    catch (e) { onError(errText(e)) } finally { setBusy(false) }
  }
  const Marker = ({ iso, color, label, dy }: { iso: string | null; color: string; label: string; dy: number }) => iso ? (
    <g><line x1={x(iso)} x2={x(iso)} y1={0} y2={H} stroke={color} strokeWidth={1.5} strokeDasharray="4 3" /><text x={x(iso) + 4} y={dy} fontSize={11} fill={color}>{label} {fmtTime(iso).slice(0, 5)}</text></g>
  ) : null
  const ticks = d.buckets.filter((_, i) => i % 10 === 0)
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="font-semibold text-sm">분당 글 수</h3>
        <p className="note mt-1">글이 갑자기 늘어나는 곳이 방송 시작, 확 줄어드는 곳이 방송 종료입니다. 파란 점선은 회차 정보에 저장된 시각, 빨간 점선은 이 그래프로 추정한 시각입니다. 막대를 누르면 아래 글 목록이 그 분으로 이동합니다.</p>
      </div>
      <div className="rounded-lg border border-line bg-soft/60 p-3">
        <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full h-44">
          {d.buckets.map((b, i) => <rect key={i} x={i / Math.max(1, n - 1) * W} y={H - (b.count / max) * H} width={Math.max(1.5, W / n)} height={(b.count / max) * H} fill="#9db4ff" />)}
          {d.buckets.map((b, i) => <rect key={`h${i}`} x={i / Math.max(1, n - 1) * W} y={0} width={Math.max(1.5, W / n)} height={H} fill="transparent" className="cursor-pointer hover:fill-[#2f6da833]" onClick={() => setJump(b.at)}><title>{fmtTime(b.at).slice(0, 5)} · {b.count}건</title></rect>)}
          {ticks.map((b, i) => <text key={`t${i}`} x={x(b.at)} y={H + 14} fontSize={10} fill="#666672">{fmtTime(b.at).slice(0, 5)}</text>)}
          <Marker iso={episode.airStartAt} color="#2b66a3" label="저장된 시작" dy={14} />
          <Marker iso={episode.airEndAt} color="#2b66a3" label="저장된 종료" dy={14} />
          <Marker iso={d.suggestedStartAt} color="#a82a2a" label="추정 시작" dy={30} />
          <Marker iso={d.suggestedEndAt} color="#a82a2a" label="추정 종료" dy={30} />
        </svg>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className="text-muted">최대 {max}건/분</span>
        {d.suggestedStartAt && <span className="flex items-center gap-2">추정 시작 <b className="mono">{fmtTime(d.suggestedStartAt).slice(0, 5)}</b>{writable && d.suggestedStartAt !== episode.airStartAt && <button className="btn btn-sm" disabled={busy} onClick={() => apply('airStartAt', d.suggestedStartAt!)}>회차 정보에 적용</button>}</span>}
        {d.suggestedEndAt
          ? <span className="flex items-center gap-2">추정 종료 <b className="mono">{fmtTime(d.suggestedEndAt).slice(0, 5)}</b>{writable && d.suggestedEndAt !== episode.airEndAt && <button className="btn btn-sm" disabled={busy} onClick={() => apply('airEndAt', d.suggestedEndAt!)}>회차 정보에 적용</button>}</span>
          : <span className="text-muted">종료를 추정하지 못했습니다. 글 수가 끝까지 줄지 않았기 때문입니다. AI 장면 복원이 예고와 총평 글을 근거로 더 정확한 종료를 찾아 줍니다.</span>}
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
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">수집한 글 보기</h3>
          <p className="note mt-1">글은 방송 시각 순으로 흐릅니다. 시각을 넣어 이동하거나 위 그래프의 막대를 누르면 그 분부터 보입니다. 목록 끝까지 내리면 다음 500건이 자동으로 이어집니다.</p>
        </div>
        <button className="btn" onClick={() => setOpen((v) => !v)}>{open ? '접기' : '펼치기'}</button>
      </div>
      {open && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button className="btn btn-sm" disabled={anchor.from === null && anchor.order === 'asc'} onClick={() => setAnchor({ from: null, order: 'asc' })}>처음부터</button>
            <button className="btn btn-sm" disabled={anchor.order === 'desc'} onClick={() => setAnchor({ from: null, order: 'desc' })}>마지막 글부터 (역순)</button>
            <span className="text-muted ml-2">시각으로 이동</span>
            <input type="time" value={timeText} onChange={(e) => setTimeText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') jumpToTime() }} className="input h-8 text-xs w-28" />
            <button className="btn btn-sm" disabled={!timeText} onClick={jumpToTime}>이동</button>
            <span className="flex-1" />
            <select value={source} onChange={(e) => setSource(e.target.value as SourceKind | '')} className="input h-8 text-xs">
              <option value="">디시인사이드와 더쿠 모두</option><option value="DCINSIDE">디시인사이드만</option><option value="THEQOO">더쿠만</option>
            </select>
            {page && <span className="text-xs text-muted">{(Object.keys(SOURCE_LABEL) as SourceKind[]).map((k) => `${SOURCE_SHORT[k]} ${(page.countBySource[k] ?? 0).toLocaleString()}건`).join(' · ')}</span>}
          </div>
          <div ref={listRef} className="max-h-[640px] overflow-auto rounded-lg border border-line">
            <table className="table">
              <thead><tr><th className="w-24">방송 시각</th><th className="w-16">출처</th><th>글</th><th className="w-20">작성자</th></tr></thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id}>
                    <td className="mono text-xs whitespace-nowrap">{fmtTime(p.postedAt)}{p.precision === 'MINUTE' && <span className="text-faint" title="더쿠는 분 단위까지만 남습니다"> (분)</span>}</td>
                    <td className="text-xs text-muted">{SOURCE_SHORT[p.source]}</td>
                    <td>{p.sourceUrl ? <a href={p.sourceUrl} target="_blank" rel="noreferrer" className="hover:underline">{p.title}</a> : p.title}{p.body && <div className="text-xs text-muted mt-0.5 line-clamp-2">{p.body}</div>}</td>
                    <td className="mono text-xs text-faint">{p.authorToken.slice(0, 6)}</td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td colSpan={4} className="text-sm text-muted py-4">{anchor.from ? '이 시각 이후에는 글이 없습니다.' : '글이 없습니다.'}</td></tr>}
              </tbody>
            </table>
            <div ref={sentinelRef} className="p-2 text-center text-[11px] text-faint">{page?.nextCursor ? '이어서 불러오는 중' : items.length ? '목록의 끝입니다' : ''}</div>
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
    <div className="card">
      <div className="card-head">
        <h2 className="font-bold flex items-center"><span className="step-no">2</span>시각 맞추기와 장면 메모</h2>
        <p className="lead mt-2">수집한 글에는 방송 시각이 적혀 있고, 넷플릭스는 재생 시각으로 돕니다. 이 단계는 그 둘을 잇는 <b>기준점</b>과, 방송 1분마다 화면에서 무슨 일이 있었는지 적은 <b>장면 메모</b>를 다룹니다. 둘 다 확장의 시딩 도구에서 "AI 채팅 작업 시작"을 누르면 자막과 글을 읽어 자동으로 만들어집니다.</p>
      </div>
      <div className="card-body flex flex-col gap-8">
        <section className="flex flex-col gap-3">
          <div>
            <h3 className="font-semibold">기준점 {anchors.length}개</h3>
            <p className="note mt-1">기준점 하나는 "재생 몇 초가 방송 몇 시 몇 분이었다"는 쌍입니다. 방송에는 광고가 있어서 한 쌍으로는 뒤로 갈수록 어긋나므로 광고 뒤마다 기준점을 둡니다. 채팅을 넣을 때 글의 방송 시각을 이 표로 재생 시각으로 바꿉니다. 재생하며 어긋남이 보이면 확장의 시딩 도구에서 초 단위로 다듬을 수 있습니다.</p>
          </div>
          {anchors.length === 0 ? <p className="text-sm text-muted">아직 기준점이 없습니다. 없으면 방영 시작 시각을 재생 0초로 보고 환산하는데, 광고가 있는 방송에서는 뒤로 갈수록 어긋납니다. AI 작업을 먼저 돌리세요.</p> : (
            <div className="overflow-auto rounded-lg border border-line max-h-80 max-w-3xl">
              <table className="table">
                <thead><tr><th className="w-28">재생 시각</th><th className="w-28">방송 시각</th><th>무엇으로 맞췄나</th><th className="w-20"></th></tr></thead>
                <tbody>
                  {anchors.map((a) => (
                    <tr key={a.id}>
                      <td className="mono">{fmtSec(a.playbackSec)}</td>
                      <td className="mono">{fmtTime(a.wallclockAt)}</td>
                      <td className="text-xs text-muted">{a.note}</td>
                      <td className="text-right">{writable && <button className="btn btn-sm text-bad" onClick={() => removeAnchor(a)}>지우기</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <SceneNotesBlock episode={episode} notes={notes} writable={writable} reload={reload} onError={onError} />
      </div>
    </div>
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
const CONF_DOT: Record<string, string> = { '높음': 'bg-ok', '중간': 'bg-warn', '낮음': 'bg-faint' }

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
      <div key={n.id} className={`grid grid-cols-[56px_14px_1fr_auto] items-start gap-3 px-3 py-2 border-t border-line first:border-t-0 ${unknown ? 'text-faint' : ''}`}>
        <span className="mono text-xs text-muted pt-0.5">{fmtTime(n.minuteAt).slice(0, 5)}</span>
        <span className={`mt-1.5 w-2 h-2 rounded-full ${CONF_DOT[n.confidence ?? ''] ?? 'bg-soft'}`} title={n.confidence ? `확신 ${n.confidence}` : ''} />
        <span className="text-sm leading-relaxed">{n.note}</span>
        <span className="text-[11px] whitespace-nowrap">{n.tag && <span className="pill bg-warnw text-warn">{TAG_LABEL[n.tag] ?? n.tag}</span>}</span>
      </div>
    )
  }
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold">장면 메모 {notes.length > 0 && <span className="font-normal text-muted">{main.length}분 (방송 전 {pre.length}분, 종료 후 {post.length}분 별도)</span>}</h3>
          <p className="note mt-1">AI가 자막과 글을 읽고 방송 1분마다 "이때 화면에서 무슨 일이 있었나"를 복원한 기록입니다. 세 곳에 쓰입니다. AI 채팅 계획을 만들 때 채팅을 고르고 다듬는 근거가 되고, 확장의 시딩 도구에서 재생 중인 분의 장면을 보여 주며, 방송 시작·광고·종료 시각을 알려 줍니다. 각 줄 앞의 점은 AI의 확신 정도입니다(초록 높음, 노랑 중간, 회색 낮음).</p>
        </div>
        <div className="flex gap-1 shrink-0">
          {notes.length > 0 && <button className="btn" onClick={() => setOpen((v) => !v)}>{open ? '목록 접기' : '목록 보기'}</button>}
          {writable && <button className="btn" onClick={() => setPaste((v) => !v)}>{paste ? '닫기' : '표로 바꿔 넣기'}</button>}
          {writable && notes.length > 0 && <button className="btn text-bad" disabled={busy} onClick={clearNotes}>모두 지우기</button>}
        </div>
      </div>
      {notes.length === 0 && !paste && <p className="text-sm text-muted">아직 장면 메모가 없습니다. 확장 패널에서 "AI 채팅 작업 시작"을 누르면 만들어집니다.</p>}
      {groups.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm rounded-lg bg-soft/60 px-4 py-3">
          <span className="text-muted mr-1">방송 구조</span>
          {groups.map((g, i) => (
            <span key={i} className="inline-flex items-center gap-1.5">
              <span className={`pill ${g.tag === '광고' ? 'bg-warnw text-warn' : g.tag === '종료' ? 'bg-badw text-bad' : 'bg-okw text-ok'}`}>{TAG_LABEL[g.tag] ?? g.tag}</span>
              <span className="mono">{fmtTime(g.from).slice(0, 5)}{g.to !== g.from ? `~${fmtTime(g.to).slice(0, 5)}` : ''}</span>
            </span>
          ))}
        </div>
      )}
      {paste && (
        <div className="flex flex-col gap-2 max-w-3xl">
          <p className="note">AI가 만든 마크다운 표를 그대로 붙여 넣습니다. 한 줄이 방송 1분이고 형식은 <span className="mono">| 22:35 | 장면 | 근거 | 확신 | 특이 |</span> 입니다. 근거 열은 저장하지 않으며, 저장하면 기존 메모를 전부 바꿉니다. 보통은 AI 작업이 자동으로 올리므로 손으로 할 일은 없습니다.</p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} spellCheck={false} className="input mono text-xs py-2 h-auto" />
          <div className="flex items-center gap-2 text-xs text-muted"><span>인식된 줄 {parsed.length}개</span><span className="flex-1" /><button className="btn-primary" disabled={busy || parsed.length === 0} onClick={saveNotes}>저장 (전체 교체)</button></div>
        </div>
      )}
      {open && notes.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="장면 검색 (예: 컵라면, 고백)" className="input w-72" />
            {!q && pre.length > 0 && <button className="btn btn-sm" onClick={() => setShowPre((v) => !v)}>{showPre ? '방송 전 접기' : `방송 전 ${pre.length}분 보기`}</button>}
            <span className="text-xs text-muted">{q ? `${visible.length}분 일치` : `${visible.length}분 표시`}</span>
          </div>
          <div className="max-h-[560px] overflow-auto rounded-lg border border-line">
            {visible.map(row)}
            {visible.length === 0 && <p className="px-3 py-4 text-sm text-muted">일치하는 장면이 없습니다.</p>}
            {!q && post.length > 0 && <div className="px-3 py-2 text-xs text-muted border-t border-line">종료 후 {post.length}분은 예고와 총평이라 표시하지 않습니다.</div>}
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
    <div className="grid grid-cols-[300px_minmax(0,1fr)] min-h-[calc(100vh-100px)]">
      <aside className="border-r border-line bg-raise flex flex-col">
        <div className="px-5 pt-5 pb-3 text-[11px] font-semibold text-muted">프롬프트</div>
        <ul className="px-3 flex flex-col gap-1">
          {list == null && <li className="px-2 py-2 text-sm text-muted">불러오는 중</li>}
          {list?.map((p) => (
            <li key={p.key}>
              <button onClick={() => setKey(p.key)} className={`w-full text-left rounded-lg px-3 py-2.5 border ${p.key === key ? 'border-info bg-infow' : 'border-transparent hover:bg-soft'}`}>
                <div className="font-semibold">{p.title}</div>
                <div className="text-xs text-muted mt-0.5">버전 {p.version} · {fmtKst(p.updatedAt, { second: undefined })}{p.updatedBy && p.updatedBy !== 'default' ? '' : ' · 기본값'}</div>
              </button>
            </li>
          ))}
        </ul>
        <p className="note px-5 py-4 mt-auto border-t border-line">여기 저장한 내용이 정본입니다. 관리자 PC의 AI 작업은 시작할 때마다 최신 내용을 받아 쓰고, 서버의 "다시 써서 넣기"도 같은 내용을 씁니다. 파일 경로와 담당 구간 같은 실행 정보는 실행할 때 뒤에 자동으로 붙으므로 여기에 적지 않습니다.</p>
      </aside>
      <section className="p-6 flex flex-col gap-4 max-w-[1400px]">
        {error && <Banner kind="bad" onClose={() => setError(null)}>{error}</Banner>}
        {saved && <Banner kind="info">{saved}</Banner>}
        {!current && <div className="card card-body text-sm text-muted">왼쪽에서 프롬프트를 고르세요.</div>}
        {current && (
          <div className="card">
            <div className="card-head flex items-start justify-between gap-4">
              <div>
                <h2 className="font-bold">{current.title}</h2>
                <p className="lead mt-1">{current.description}</p>
                <p className="note mt-2">버전 {current.version} · 마지막 저장 {fmtKst(current.updatedAt)}{current.updatedBy && current.updatedBy !== 'default' ? ` · ${current.updatedBy}` : ' · 기본값'}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button className="btn" onClick={openVersions}>이력 보기</button>
                {writable && <button className="btn" disabled={busy} onClick={reset}>기본값으로 되돌리기</button>}
              </div>
            </div>
            <div className="card-body flex flex-col gap-3">
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} disabled={!writable} rows={28}
                className="input mono text-[13px] leading-relaxed py-3 h-auto w-full" />
              <div className="flex items-center gap-3">
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="무엇을 바꿨는지 한 줄 (이력에 남습니다)" className="input flex-1" disabled={!writable} />
                <span className="text-xs text-muted">{draft.length.toLocaleString()}자{dirty ? ' · 저장하지 않은 변경' : ''}</span>
                {writable && <button className="btn" disabled={!dirty} onClick={() => setDraft(current.content)}>변경 취소</button>}
                {writable && <button className="btn-primary" disabled={busy || !dirty} onClick={save}>저장</button>}
              </div>
              {showVersions && versions && (
                <div className="rounded-lg border border-line overflow-hidden">
                  <table className="table">
                    <thead><tr><th className="w-16">버전</th><th className="w-40">저장 시각</th><th className="w-32">저장한 사람</th><th>메모</th><th className="w-40"></th></tr></thead>
                    <tbody>
                      {versions.map((v) => (
                        <tr key={v.id}>
                          <td className="mono">{v.version}</td><td className="mono">{fmtKst(v.createdAt)}</td><td className="text-xs">{v.createdBy ?? ''}</td><td className="text-xs">{v.note ?? ''}</td>
                          <td className="text-right"><button className="btn btn-sm" onClick={() => setDraft(v.content)}>편집칸에 불러오기</button>{writable && v.version !== current.version && <button className="btn btn-sm ml-1" disabled={busy} onClick={() => revert(v)}>이 버전으로 되돌리기</button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
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
    if (!confirm(`수락한 ${n.toLocaleString()}건을 이 회차의 채팅으로 넣습니다. 넣은 뒤에는 "넣은 채팅 모두 지우기"나 확장의 시딩 도구에서 한 건씩 지울 수 있습니다.`)) return
    setBusy(true); try { setView(await api.executePlan(view.plan.id)) } catch (e) { onError(errText(e)); setBusy(false) }
  }
  const rollback = async () => { if (!view || !confirm('이 계획이 넣은 채팅을 모두 지우고 검수 대기 상태로 되돌립니다.')) return; setBusy(true); try { setView(await api.rollbackPlan(view.plan.id)); reload() } catch (e) { onError(errText(e)) } finally { setBusy(false) } }
  const remove = async () => { if (!view || !confirm('이 계획을 지웁니다. 아직 채팅에 넣지 않은 계획만 지울 수 있습니다.')) return; setBusy(true); try { await api.deletePlan(view.plan.id); setPlanId(null); reload() } catch (e) { onError(errText(e)) } finally { setBusy(false) } }

  const stats = view ? { total: view.items.length, accepted: view.items.filter((x) => x.item.accepted).length, done: view.items.filter((x) => x.item.injectionId).length, failed: view.items.filter((x) => x.item.error).length,
    kinds: (Object.keys(KIND_LABEL) as InjectionKind[]).map((k) => [k, view.items.filter((x) => x.item.kind === k).length] as const) } : null
  const rows = (view?.items ?? []).filter((x) => (kindFilter ? x.item.kind === kindFilter : true) && (filter === 'all' ? true : filter === 'accepted' ? x.item.accepted && !x.item.error && !x.item.injectionId : filter === 'rejected' ? !x.item.accepted : filter === 'failed' ? !!x.item.error : !!x.item.injectionId))
  const running = view?.plan.status === 'RUNNING'

  return (
    <>
      <div className="card">
        <div className="card-head flex items-start justify-between gap-4">
          <div>
            <h2 className="font-bold flex items-center"><span className="step-no">3</span>AI 채팅 계획</h2>
            <p className="lead mt-2">AI가 수집한 글 가운데 화면 반응이 아닌 글(광고 불평, 다른 기수 이야기, 비하와 욕설)을 빼고, 남은 글을 아래 네 종류로 정리한 목록입니다. 확장의 시딩 도구에서 "AI 채팅 작업 시작"을 누르면 만들어져 여기로 옵니다. 여기서는 훑어보며 뺄 행만 거부하면 됩니다. 표의 재생 시각은 지금 저장된 기준점으로 계산한 값이고, 실제로 넣을 때 다시 계산합니다.</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 mt-3 text-xs max-w-3xl">
              {(Object.keys(KIND_LABEL) as InjectionKind[]).map((k) => <div key={k} className="contents"><dt className="font-semibold text-ink2 whitespace-nowrap">{KIND_LABEL[k]}</dt><dd className="text-muted">{KIND_DESC[k]}</dd></div>)}
            </dl>
          </div>
          {writable && <button className="btn" onClick={() => setUpload((v) => !v)}>{upload ? '닫기' : '계획 파일을 손으로 올리기'}</button>}
        </div>
        <div className="card-body flex flex-col gap-4">
          {upload && (
            <div className="flex flex-col gap-2">
              <p className="note">관리자 PC의 파이프라인이 만든 plan.json 내용을 붙여 넣습니다. 보통은 AI 작업이 끝나면 자동으로 올라오므로 쓸 일이 없습니다.</p>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} spellCheck={false} className="input mono text-xs py-2 h-auto" />
              <div className="flex items-center gap-2 text-xs text-muted"><span>{parsed ? `인식된 행 ${parsed.items.length}개` : text.trim() ? 'JSON 형식이 아닙니다' : ''}</span><span className="flex-1" /><button className="btn-primary" disabled={busy || !parsed || parsed.items.length === 0} onClick={doUpload}>올리기</button></div>
            </div>
          )}
          {plans.length === 0 && <p className="text-sm text-muted">아직 계획이 없습니다. 수집이 끝났다면 넷플릭스에서 이 회차를 재생하고 확장의 시딩 도구에서 "AI 채팅 작업 시작"을 누르세요. 한 시간쯤 뒤 계획이 여기에 나타납니다.</p>}
          {plans.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {plans.map((p) => (
                <button key={p.id} className={`rounded-lg border px-3 py-2 text-left ${current?.id === p.id ? 'border-info bg-infow' : 'border-line bg-raise hover:bg-soft'}`} onClick={() => setPlanId(p.id)}>
                  <div className="text-sm font-semibold">#{p.id} {p.label ?? p.source ?? ''}</div>
                  <div className="text-xs mt-0.5 flex items-center gap-2"><span className={`pill ${PLAN_STATUS[p.status].cls}`}>{PLAN_STATUS[p.status].label}</span><span className="text-muted">{fmtKst(p.createdAt, { second: undefined })}</span></div>
                </button>
              ))}
            </div>
          )}
          {view && stats && (
            <>
              <div className="flex flex-wrap items-end gap-6 rounded-lg bg-soft/60 px-4 py-3">
                <div className="stat"><b>{stats.total.toLocaleString()}</b><span>전체 행</span></div>
                <div className="stat"><b>{stats.accepted.toLocaleString()}</b><span>수락</span></div>
                <div className="stat"><b>{(stats.total - stats.accepted).toLocaleString()}</b><span>거부</span></div>
                <div className="stat"><b className={stats.done ? 'text-ok' : ''}>{stats.done.toLocaleString()}</b><span>채팅에 넣음</span></div>
                {stats.failed > 0 && <div className="stat"><b className="text-bad">{stats.failed}</b><span>실패</span></div>}
                <div className="w-px h-8 bg-line" />
                {stats.kinds.map(([k, n]) => <div key={k} className="stat min-w-[72px]"><b>{n.toLocaleString()}</b><span>{KIND_LABEL[k]}</span></div>)}
                <span className="flex-1" />
                <span className="text-xs text-muted">재생 시각은 기준점 {view.anchorCount}개로 계산{view.anchorCount === 0 && ' (기준점이 없어 방영 시작 시각만으로 계산)'}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="input h-8 text-xs">
                  <option value="all">모든 행</option><option value="accepted">수락했고 아직 넣지 않음</option><option value="rejected">거부함</option><option value="done">채팅에 넣음</option><option value="failed">넣기 실패</option>
                </select>
                <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value as InjectionKind | '')} className="input h-8 text-xs">
                  <option value="">모든 종류</option>{(Object.keys(KIND_LABEL) as InjectionKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </select>
                <span className="text-xs text-muted">{rows.length.toLocaleString()}행 표시</span>
              </div>
              <div className="max-h-[720px] overflow-auto rounded-lg border border-line">
                <table className="table">
                  <thead><tr><th className="w-20">재생 시각</th><th className="w-24">종류</th><th>채팅</th><th className="w-64">근거 장면과 고른 이유</th><th className="w-28 text-right">검수</th></tr></thead>
                  <tbody>
                    {rows.map(({ item, previewSec, gap }) => (
                      <tr key={item.id} className={`${!item.accepted ? 'opacity-40' : ''} ${item.error ? 'bg-badw/40' : item.injectionId ? 'bg-okw/40' : ''}`}>
                        <td className="mono whitespace-nowrap">{fmtSec(previewSec)}{gap && <span className="text-warn" title="광고 중에 올라온 글이라 다음 기준점 시각에 붙습니다"> 광고</span>}</td>
                        <td className="whitespace-nowrap"><span className="pill bg-soft text-ink2">{KIND_LABEL[item.kind]}</span>{item.spoiler && <span className="pill bg-warnw text-warn ml-1">스포일러</span>}</td>
                        <td>{item.message}</td>
                        <td className="text-xs text-muted">{item.scene}{item.reason && <div className="text-faint">{item.reason}</div>}{item.error && <div className="text-bad">{item.error}</div>}</td>
                        <td className="text-right whitespace-nowrap">
                          {item.injectionId ? <span className="text-xs text-ok">넣음</span> : item.error ? <span className="text-xs text-bad">실패</span>
                            : writable && !running ? <button className="btn btn-sm" onClick={() => toggle(item.id, !item.accepted)}>{item.accepted ? '거부' : '다시 수락'}</button> : <span className="text-xs text-muted">{item.accepted ? '수락' : '거부'}</span>}
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 && <tr><td colSpan={5} className="py-4 text-sm text-muted">조건에 맞는 행이 없습니다.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head flex items-start justify-between gap-4">
          <div>
            <h2 className="font-bold flex items-center"><span className="step-no">4</span>채팅 넣기</h2>
            <p className="lead mt-2">검수를 마친 계획의 수락 행을 이 회차의 채팅으로 넣습니다. 각 행은 시딩 전용 계정(유령 계정) 이름으로 저장되어 다른 사용자 채팅과 똑같이 보이고, 접속자 수나 활동 통계에는 잡히지 않습니다. 넷플릭스 회차가 연결되어 있어야 하며, 서버가 뒤에서 처리하므로 진행률이 여기와 확장의 시딩 도구에 표시됩니다. 잘못 넣었으면 계획 단위로 모두 지우거나 확장의 시딩 도구에서 한 건씩 지울 수 있습니다.</p>
          </div>
        </div>
        <div className="card-body flex flex-wrap items-center gap-4">
          <div className="stat"><b>{injections.length.toLocaleString()}</b><span>이 회차에 넣은 채팅</span></div>
          <span className="flex-1" />
          {!episode.episodeId && <span className="text-sm text-warn">넷플릭스 회차가 연결되지 않아 채팅을 넣을 수 없습니다.</span>}
          {view && writable && stats && (
            <>
              {view.plan.status === 'DRAFT' && <button className="btn-danger" disabled={busy} onClick={remove}>계획 #{view.plan.id} 지우기</button>}
              {stats.done > 0 && !running && <button className="btn-danger" disabled={busy} onClick={rollback}>계획 #{view.plan.id}이 넣은 채팅 모두 지우기</button>}
              <button className="btn-primary" disabled={busy || running || !episode.episodeId || stats.accepted - stats.done <= 0} onClick={execute}>
                {running ? `넣는 중 ${(stats.done + stats.failed).toLocaleString()} / ${stats.accepted.toLocaleString()}` : `계획 #${view.plan.id}의 수락 ${(stats.accepted - stats.done).toLocaleString()}건을 채팅에 넣기`}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  )
}
