'use client'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'

interface DataPoint {
  date:     string
  likes:    number
  comments: number
  shares:   number
  reach:    number
}

export function EngagementChart({ data }: { data: DataPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center">
        <p className="text-sm text-[#555]">No data for this period</p>
      </div>
    )
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: '#555' }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#555' }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <Tooltip
            contentStyle={{
              background:   '#141414',
              border:       '1px solid #333',
              borderRadius: '8px',
              fontSize:     '12px',
            }}
            labelStyle={{ color: '#888' }}
            itemStyle={{ color: '#d8d8d8' }}
          />
          <Legend
            wrapperStyle={{ fontSize: '11px', paddingTop: '12px', color: '#555' }}
          />
          <Line type="monotone" dataKey="reach"    stroke="#444"    strokeWidth={1.5} dot={false} name="Reach" />
          <Line type="monotone" dataKey="likes"    stroke="#d8d8d8" strokeWidth={1.5} dot={false} name="Likes" />
          <Line type="monotone" dataKey="comments" stroke="#60a5fa" strokeWidth={1.5} dot={false} name="Comments" />
          <Line type="monotone" dataKey="shares"   stroke="#34d399" strokeWidth={1.5} dot={false} name="Shares" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
