"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const fmtDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });

export function RevenueChart({ data, currency }: { data: { day: string; revenue: number; visitors: number }[]; currency: string }) {
  const money = (v: number) => new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(v / 100);
  return (
    <div className="h-64 w-full" role="img" aria-label={`Revenue per day, total ${money(data.reduce((s, d) => s + d.revenue, 0))}`}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8a5a3c" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#8a5a3c" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#e7e5e4" />
          <XAxis dataKey="day" tickFormatter={fmtDay} tick={{ fontSize: 11, fill: "#78716c" }} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis tickFormatter={(v) => money(v)} tick={{ fontSize: 11, fill: "#78716c" }} tickLine={false} axisLine={false} width={72} />
          <Tooltip formatter={(v) => [money(Number(v)), "Net revenue"]} labelFormatter={(l) => fmtDay(String(l))} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
          <Area isAnimationActive={false} type="monotone" dataKey="revenue" stroke="#8a5a3c" strokeWidth={2} fill="url(#rev)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BarsChart({ data, xKey, yKey, label, color = "#1c1917" }: { data: Record<string, unknown>[]; xKey: string; yKey: string; label: string; color?: string }) {
  return (
    <div className="h-56 w-full" role="img" aria-label={label}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#e7e5e4" />
          <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: "#78716c" }} tickLine={false} axisLine={false} minTickGap={16} tickFormatter={(v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? fmtDay(String(v)) : String(v))} />
          <YAxis tick={{ fontSize: 11, fill: "#78716c" }} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
          <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
          <Bar dataKey={yKey} fill={color} radius={[3, 3, 0, 0]} name={label} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
