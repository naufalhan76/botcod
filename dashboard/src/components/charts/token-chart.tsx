'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { TokenByModel } from '@/types'

interface TokenChartProps {
  data: TokenByModel[]
}

export function TokenChart({ data }: TokenChartProps) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <CartesianGrid stroke="#334155" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="model"
            stroke="#94a3b8"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            minTickGap={16}
          />
          <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: '#0f172a', fillOpacity: 0.45 }}
            contentStyle={{
              background: '#020617',
              border: '1px solid #334155',
              borderRadius: '0.75rem',
              color: '#e2e8f0',
            }}
            labelStyle={{ color: '#f8fafc' }}
          />
          <Legend wrapperStyle={{ color: '#cbd5e1', fontSize: 12 }} />
          <Bar
            dataKey="promptTokens"
            name="Prompt tokens"
            stackId="tokens"
            fill="#38bdf8"
            radius={[0, 0, 4, 4]}
            animationDuration={250}
          />
          <Bar
            dataKey="completionTokens"
            name="Completion tokens"
            stackId="tokens"
            fill="#0284c7"
            radius={[4, 4, 0, 0]}
            animationDuration={250}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
