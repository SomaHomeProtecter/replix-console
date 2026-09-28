import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { listIncidents } from '../api/admin'
import type { Incident } from '../api/types'

export default function IncidentPrimaryBanner() {
  const [incident, setIncident] = useState<Incident | null>(null)
  useEffect(() => { void Promise.resolve(listIncidents()).then((rows) => setIncident((rows ?? []).find((row) =>
    row.primary && !['RESOLVED', 'CANCELLED'].includes(row.status)) ?? null)).catch(() => setIncident(null)) }, [])
  if (!incident) return null
  return <div className={`incident-primary-banner severity-${incident.severity.toLowerCase()}`} role="status">
    <strong>{incident.severity} · {incident.reference}</strong><span>{incident.title}</span>
    <b>{incident.status}</b><Link to={`/feature-control/incident-mode?selected=${incident.id}`}>인시던트 열기</Link>
  </div>
}
