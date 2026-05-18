'use client'

import { useEffect, useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import type { GscQuery, GscTrendPoint } from '@/services/seo/gsc-client'

interface GscData {
  propertyUrl: string
  queries: GscQuery[]
  trend: GscTrendPoint[]
}

interface Props {
  workspaceId: string
}

export function GscAnalytics({ workspaceId }: Props) {
  const [data, setData] = useState<GscData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/seo/gsc-data?workspaceId=${workspaceId}`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load GSC data')
        return r.json() as Promise<GscData>
      })
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [workspaceId])

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-4 w-40 rounded bg-background-tertiary animate-pulse" />
        <div className="h-48 rounded-lg bg-background-tertiary animate-pulse" />
      </div>
    )
  }

  if (error) {
    return <p className="font-sans text-sm text-status-error">{error}</p>
  }

  if (!data) return null

  const formatDate = (d: string) => {
    const date = new Date(d)
    return `${date.getDate()}/${date.getMonth() + 1}`
  }

  return (
    <div className="space-y-6">
      <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
        Search Performance — Last 30 Days
      </p>

      {data.trend.length > 0 ? (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data.trend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#222222" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fontSize: 11, fill: '#555555', fontFamily: 'var(--font-geist-mono)' }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#555555', fontFamily: 'var(--font-geist-mono)' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#141414',
                border: '1px solid #222',
                borderRadius: 8,
                fontSize: 12,
                fontFamily: 'var(--font-geist-mono)',
                color: '#e2e2e2',
              }}
              labelFormatter={(d: unknown) => formatDate(String(d))}
            />
            <Line
              type="monotone"
              dataKey="clicks"
              stroke="#4ade80"
              strokeWidth={1.5}
              dot={false}
              name="Clicks"
            />
            <Line
              type="monotone"
              dataKey="impressions"
              stroke="#60a5fa"
              strokeWidth={1.5}
              dot={false}
              name="Impressions"
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <p className="font-sans text-sm text-text-tertiary">
          No trend data yet — GSC has a 3-day lag.
        </p>
      )}

      {data.queries.length > 0 && (
        <div className="space-y-2">
          <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
            Top Queries (90 days)
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-background-border">
                  {['Query', 'Clicks', 'Impressions', 'CTR', 'Position'].map((h) => (
                    <th
                      key={h}
                      className="pb-2 font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.08em] pr-4 last:pr-0"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.queries.map((row) => (
                  <tr
                    key={row.query}
                    className="border-b border-background-border/50 hover:bg-background-hover/30 transition-colors"
                  >
                    <td className="py-2.5 pr-4 font-sans text-sm text-text-primary max-w-xs truncate">
                      {row.query}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-sm text-text-secondary">{row.clicks}</td>
                    <td className="py-2.5 pr-4 font-mono text-sm text-text-secondary">{row.impressions}</td>
                    <td className="py-2.5 pr-4 font-mono text-sm text-text-secondary">{row.ctr}%</td>
                    <td className="py-2.5 font-mono text-sm text-text-secondary">{row.position}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
