"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMinor } from "@/lib/money";
import type { CurrencyCode } from "@/lib/types";

const TOOLTIP = {
  fontSize: 12,
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: "6px 8px",
} as const;

/** Two colours, two accounts. The palette is not extended to invent a third line. */
const SERIES = ["var(--series-1)", "var(--series-2)"];

export interface BalanceChartProps {
  /** One row per period. `label` is the axis tick; `s0`, `s1`, ... are the lines. */
  data: Record<string, string | number>[];
  /** One entry per plotted line, in the same order as the `s0`, `s1` slots. */
  accounts: { id: string; name: string }[];
  currency: CurrencyCode;
}

/**
 * Balance over time — one line per account, with the closing balance shown in a
 * coloured pill at the end of each line.
 *
 * The legend names the real accounts rather than "Series 1" / "Series 2", so
 * the reader is never left guessing which line is which. Each account is its own
 * series, so the chart never implies that a total line is an account line.
 *
 * The pill is drawn as SVG inside the chart so it cannot be clipped by the
 * container. Its width is estimated from the text length; measuring text during
 * render would cost a layout pass on every frame.
 */
export function BalanceChart({ data, accounts, currency }: BalanceChartProps) {
  const lastIndex = data.length - 1;

  // Reserve exactly the room the widest end-of-line pill needs, so large
  // balances are never clipped. Matches the width estimate used to draw it.
  const widest = accounts.reduce((max, _account, slot) => {
    const value = Number(data[lastIndex]?.[`s${slot}`] ?? 0);
    return Math.max(max, formatMinor(value, currency, { symbol: true }).length);
  }, 0);
  const rightMargin = Math.max(60, Math.ceil(widest * 6.4 + 18 + 14));

  const empty = data.every((row) => accounts.every((_, slot) => Number(row[`s${slot}`] ?? 0) === 0));
  if (data.length === 0 || accounts.length === 0 || empty) {
    return (
      <div className="grid h-[260px] w-full place-items-center text-[13px] text-[var(--text-faint)]">
        {accounts.length === 0 ? "Add an account to see its balance here." : "The line starts with your first transaction."}
      </div>
    );
  }

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: rightMargin, bottom: 4, left: 0 }}>
          {/* Faint fill under each line, as in the Untitled UI reference. */}
          <defs>
            {accounts.map((account, slot) => (
              <linearGradient key={account.id} id={`bal-fill-${slot}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SERIES[slot % SERIES.length]} stopOpacity={0.14} />
                <stop offset="100%" stopColor={SERIES[slot % SERIES.length]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          {/* Light dotted horizontals only: they guide the eye without drawing edges. */}
          <CartesianGrid stroke="var(--gridline)" strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--text-faint)" }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={18}
            tickMargin={8}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--text-faint)" }}
            width={58}
            padding={{ top: 8, bottom: 8 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => formatMinor(v, currency, { compact: true, symbol: true })}
          />
          <Tooltip
            formatter={(value, name) => [
              formatMinor(Number(value), currency, { symbol: true }),
              accounts[Number(String(name).replace("s", ""))]?.name ?? String(name),
            ]}
            contentStyle={TOOLTIP}
            labelStyle={{ color: "var(--text)", fontWeight: 500 }}
            cursor={{ stroke: "var(--text-faint)", strokeDasharray: "3 3" }}
          />
          <Legend
            verticalAlign="top"
            align="right"
            height={24}
            iconType="plainline"
            iconSize={14}
            formatter={(value) => (
              <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{value}</span>
            )}
          />
          {accounts.map((account, slot) => (
            <Area
              key={account.id}
              fill={`url(#bal-fill-${slot})`}
              type="monotone"
              dataKey={`s${slot}`}
              name={account.name}
              stroke={SERIES[slot % SERIES.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              isAnimationActive={false}
            >
              <LabelList
                dataKey={`s${slot}`}
                content={(props) => {
                  const { x, y, value, index } = props as {
                    x?: number;
                    y?: number;
                    value?: number;
                    index?: number;
                  };
                  if (index !== lastIndex || x == null || y == null) return null;

                  const text = formatMinor(Number(value ?? 0), currency, { symbol: true });
                  const width = text.length * 6.4 + 18;
                  return (
                    <g transform={`translate(${x}, ${y})`}>
                      <rect x={10} y={-11} width={width} height={22} rx={11} fill={SERIES[slot % SERIES.length]} />
                      <text
                        x={10 + width / 2}
                        y={0}
                        dy={4}
                        textAnchor="middle"
                        fontSize={11}
                        fontWeight={600}
                        fill="#ffffff"
                      >
                        {text}
                      </text>
                    </g>
                  );
                }}
              />
            </Area>
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}