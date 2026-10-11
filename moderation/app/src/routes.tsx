import { Route, Routes } from 'react-router'
import ActionLogPage from './pages/ActionLogPage'
import CleanbotPolicyPage from './pages/CleanbotPolicyPage'
import FeatureChangeSetPage from './pages/FeatureChangeSetPage'
import FeatureControlPage from './pages/FeatureControlPage'
import FeatureControlPresetPage from './pages/FeatureControlPresetPage'
import FeatureDriftPage from './pages/FeatureDriftPage'
import FeedbackPage from './pages/FeedbackPage'
import IncidentModePage from './pages/IncidentModePage'
import IncidentTimelinePage from './pages/IncidentTimelinePage'
import ModerationReviewPage from './pages/ModerationReviewPage'
import OperationCasesPage from './pages/OperationCasesPage'
import ReportQueuePage from './pages/ReportQueuePage'
import ServiceNoticePage from './pages/ServiceNoticePage'
import SuspensionBoardPage from './pages/SuspensionBoardPage'
import UserDetailPage from './pages/UserDetailPage'

export type ModerationPage = { label: string; path: string }

/**
 * 조치 메뉴 — 공용 틀의 왼쪽 메뉴와 홈 카드가 이 목록 하나를 쓴다(HP-523). 화면을 더하면 아래 라우트와 여기만 고친다.
 * 경로는 라우터 basename(/moderation/&lt;env&gt;) 기준이다.
 *
 * <p>성격별 묶음(HP-529) — 여덟 항목이 한 줄로 놓여 있으면 어디서 무엇을 하는지 메뉴만 보고는 알 수 없었다. 신고를
 * 처리하고 제재하는 일, 자동 필터(클린봇)를 다듬는 일, 서비스 전체를 다루는 일로 나눈다.
 */
export const MODERATION_MENU: readonly { group: string; items: readonly ModerationPage[] }[] = [
  {
    group: '신고·제재',
    items: [
      { label: '신고 큐', path: '/' },
      { label: '운영 협업', path: '/operation-cases' },
      { label: '정지 현황', path: '/suspensions' },
      { label: '조치 로그', path: '/actions' },
    ],
  },
  {
    group: '클린봇',
    items: [
      { label: '오탐 검토', path: '/moderation-reviews' },
      { label: '정책 실험', path: '/moderation-policies' },
    ],
  },
  {
    group: '서비스 운영',
    items: [
      { label: '기능 제어', path: '/feature-control' },
      { label: '피드백', path: '/feedback' },
    ],
  },
]

/** 묶음을 펼친 조치 화면 목록 — 메뉴 순서 그대로(홈 바로가기가 쓴다). */
export const MODERATION_PAGES: readonly ModerationPage[] = MODERATION_MENU.flatMap((group) => group.items)

/**
 * 조치 콘솔 화면 경로 묶음 — 운영 콘솔 공용 틀(shell/app, HP-506)이 자기 톱바·메뉴 안에 이것을 그린다.
 * 경로는 라우터 basename(/moderation/&lt;env&gt;) 기준이다.
 *
 * <p>종전에는 조치만 따로 띄우는 단독 앱(톱바·도구 전환 메뉴·PROD 띠)이 이 옆에 있었다. 배포는 공용 틀만 하므로
 * 단독 앱은 고칠 때마다 함께 맞춰야 하는 짐이 됐고 이미 서로 어긋나 있어 지웠다(HP-521). 개발도 공용 틀 개발
 * 서버에서 한다.
 */
export function ModerationRoutes() {
  return (
    <Routes>
      <Route path="/" element={<ReportQueuePage />} />
      <Route path="/suspensions" element={<SuspensionBoardPage />} />
      <Route path="/actions" element={<ActionLogPage />} />
      <Route path="/moderation-reviews" element={<ModerationReviewPage />} />
      <Route path="/operation-cases" element={<OperationCasesPage />} />
      <Route path="/moderation-policies" element={<CleanbotPolicyPage />} />
      <Route path="/feedback" element={<FeedbackPage />} />
      <Route path="/feature-control" element={<FeatureControlPage />} />
      <Route path="/feature-control/change-sets" element={<FeatureChangeSetPage />} />
      <Route path="/feature-control/presets" element={<FeatureControlPresetPage />} />
      <Route path="/feature-control/notices" element={<ServiceNoticePage />} />
      <Route path="/feature-control/drift" element={<FeatureDriftPage />} />
      <Route path="/feature-control/incidents" element={<IncidentTimelinePage />} />
      <Route path="/feature-control/incident-mode" element={<IncidentModePage />} />
      <Route path="/users/:userId" element={<UserDetailPage />} />
    </Routes>
  )
}
