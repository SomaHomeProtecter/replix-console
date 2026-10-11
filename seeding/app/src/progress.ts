/* 회차 작업 네 단계(수집 → 시각 맞추기 → AI 계획 → 채팅 넣기)의 진행 판정 — 시딩 영역의 규칙이라 여기 둔다(HP-523).
   공용 틀 홈의 '최근 회차'가 쓴다. 시딩 회차 화면 머리(App.tsx EpisodeWorkspace)는 아직 자기 문구로 따로 판정한다 —
   화면 정비(HP-525) 때 이 판정으로 합친다. */
import type { Collection, Injection, Plan, SyncAnchor } from './api'

export type StepState = 'done' | 'current' | 'idle'
export type EpisodeStep = { label: string; state: StepState; detail: string }
export type EpisodeProgress = { steps: EpisodeStep[]; status: { state: StepState; label: string } }

/**
 * 회차 작업 네 단계(수집 → 시각 맞추기 → AI 계획 → 채팅 넣기)의 진행 — 시딩 화면 머리(EpisodeWorkspace)의 단계 표시와
 * 같은 근거를 쓰되, "지금 사람이 할 차례"(current)를 따로 짚는다: 수집이 도는 중, 검수 대기 계획, 넣는 중.
 */
export function episodeProgress(
  collections: Collection[], anchors: SyncAnchor[], plans: Plan[], injections: Injection[],
): EpisodeProgress {
  const done = collections.find((collection) => collection.status === 'DONE')
  const collecting = collections.some((collection) => collection.status === 'RUNNING' || collection.status === 'QUEUED')
  const drafts = plans.filter((plan) => plan.status === 'DRAFT').length
  const running = plans.some((plan) => plan.status === 'RUNNING')

  const steps: EpisodeStep[] = [
    done
      ? { label: '수집', state: 'done', detail: `${done.postCount.toLocaleString()}건` }
      : { label: '수집', state: collecting ? 'current' : 'idle', detail: collecting ? '수집 중' : '아직' },
    anchors.length > 0
      ? { label: '시각 맞추기', state: 'done', detail: `기준점 ${anchors.length}개` }
      : { label: '시각 맞추기', state: 'idle', detail: '아직' },
    plans.length === 0
      ? { label: 'AI 계획', state: 'idle', detail: '아직' }
      : drafts > 0
        ? { label: 'AI 계획', state: 'current', detail: '검수 대기' }
        : { label: 'AI 계획', state: 'done', detail: `계획 ${plans.length}개` },
    running
      ? { label: '채팅 넣기', state: 'current', detail: '넣는 중' }
      : injections.length > 0
        ? { label: '채팅 넣기', state: 'done', detail: `${injections.length.toLocaleString()}건` }
        : { label: '채팅 넣기', state: 'idle', detail: '아직' },
  ]
  // 회차의 한 줄 상태 — 사람이 손댈 일이 먼저다: 넣는 중 > 검수 대기 > 수집 중 > 끝남 > 다음 단계 전.
  const next = steps.find((step) => step.state !== 'done')
  const status: EpisodeProgress['status'] = running ? { state: 'current', label: '채팅 넣는 중' }
    : drafts > 0 ? { state: 'current', label: 'AI 계획 검수 대기' }
    : !done && collecting ? { state: 'current', label: '수집 중' }
    : !next ? { state: 'done', label: '넣기 완료' }
    : { state: 'idle', label: `${next.label} 전` }
  return { steps, status }
}
