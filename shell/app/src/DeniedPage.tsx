import { logout, userName } from '@core/auth'
import { env } from '@core/env'
import { CAPABILITIES, SHOWN_CAPABILITIES } from '@core/roles'

/** 역할별로 할 수 있는 일 — 콘솔 역할 표(core/roles.ts) 그대로 보인다. */
const ROLES: readonly [string, string][] = SHOWN_CAPABILITIES.map((capability) =>
  [CAPABILITIES[capability].label, CAPABILITIES[capability].roles.join(' · ')])

/**
 * 콘솔 역할이 하나도 없는 계정(HP-506). 종전 조치 콘솔은 서버 대조 요청이 거부되어 "콘솔 초기화 실패"로 멈췄다.
 * 가장 흔한 원인은 같은 브라우저의 작품 탐색·익스텐션 로그인이 일반 계정이라 콘솔도 그 계정으로 자동 로그인되는 것이다
 * (2026-09-30 함정) — 그래서 계정을 바꾸는 길을 가장 앞에 둔다. '다른 계정으로 로그인'은 조치 콘솔의 계정 전환
 * 흐름(로그아웃 뒤 계정 선택을 명시하는 accountSwitch)을 그대로 쓴다.
 */
export default function DeniedPage() {
  const name = userName()
  const authHost = new URL(env.kcUrl).host
  return (
    <div className="cs-app">
      <header className="cs-top">
        <span className="cs-brand">
          <span className="cs-wordmark"><span className="rx">Re</span>plix</span>
          <span className="cs-brand-sep" aria-hidden="true" />
          <span className="cs-brand-name">운영 콘솔</span>
        </span>
        <div className="cs-account">
          <span className="cs-operator">{name}</span>
          <button type="button" className="btn-logout" onClick={() => logout()}>로그아웃</button>
        </div>
      </header>
      <main className="cs-denied">
        <section className="cs-denied-card" aria-labelledby="denied-title">
          <h1 id="denied-title">이 계정에는 콘솔 권한이 없습니다</h1>
          <p>
            콘솔은 관리자 역할이 있는 계정만 열 수 있습니다. 같은 브라우저에서 작품 탐색(replix.tv)이나 익스텐션에
            다른 계정으로 로그인해 두었다면, 콘솔도 그 계정으로 자동 로그인됩니다.
          </p>
          <div className="cs-denied-account">
            <span>로그인한 계정</span>
            <b>{name}</b>
            <code>{env.environment} · {authHost}</code>
          </div>
          <div className="cs-roles">
            <table>
              <caption className="sr-only">필요한 역할(하나 이상)</caption>
              <tbody>
                {ROLES.map(([what, roles]) => (
                  <tr key={what}><th scope="row">{what}</th><td>{roles}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="cs-denied-actions">
            <button type="button" className="btn-primary-solid" onClick={() => logout()}>다른 계정으로 로그인</button>
            <span>역할은 팀 관리자에게 요청하세요.</span>
          </div>
        </section>
      </main>
    </div>
  )
}
