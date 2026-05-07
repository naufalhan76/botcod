'use client'

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { RequestBucket } from '@/types'

interface RequestChartProps {
  data: RequestBucket[]
}

function formatBucket(timestamp: string) {
  const date = new Date(timestamp)

  if (Number.isNaN(date.getTime())) return timestamp

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function RequestChart({ data }: RequestChartProps) {
  const chartData = data.map((bucket) => ({
    ...bucket,
    label: formatBucket(bucket.timestamp),
  }))

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <CartesianGrid stroke="#334155" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="#94a3b8"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip
            cursor={{ stroke: '#38bdf8', strokeOpacity: 0.25 }}
            contentStyle={{
              background: '#020617',
              border: '1px solid #334155',
              borderRadius: '0.75rem',
              color: '#e2e8f0',
            }}
            labelStyle={{ color: '#f8fafc' }}
          />
          <Line
            type="monotone"
            dataKey="count"
            name="Requests"
            stroke="#38bdf8"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4, fill: '#38bdf8', stroke: '#0f172a', strokeWidth: 2 }}
            animationDuration={250}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
