"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMinor } from "@/lib/money";
import { monthLabel, shiftMonth, shortMonthLabel } from "@/lib/dates";
import { monthlyTrend } from "@/lib/finance";
import type { CurrencyCode, Transaction } from "@/lib/types";

/** Two series only. Colour is not extended per category. */
const SERIES = ["var(--series-1)", "var(--bar-muted)"];

interface FlowTooltipProps {
  active?: boolean;
  payload?: { payload?: FlowPoint }[];
  currency: CurrencyCode;
}

interface FlowPoint {
  month: string;
  income: number;
  expense: number;
  net: number;
}

/**
 * Custom tooltip because the reference shows the month, both figures and the
 * net together. Recharts' default tooltip cannot render the net difference, and
 * splitting it across formatter entries would put a non-existent third series
 * in the legend.
 */
function FlowTooltip({ active, payload, currency }: FlowTooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: 8,
        padding: "6px 8px",
        fontSize: 12,
      }}
    >
      <p style={{ color: "var(--text)", fontWeight: 500, margin: 0 }}>{monthLabel(point.month)}</p>
      <dl style={{ margin: "4px 0 0", display: "grid", gap: 2 }}>
        {(
          [
            ["Inflow", point.income, SERIES[0]],
            ["Outflow", point.expense, SERIES[1]],
          ] as const
        ).map(([label, value, colour]) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 4, background: colour }} />
            <dt style={{ color: "var(--text-muted)", margin: 0 }}>{label}</dt>
            <dd className="tnum" style={{ margin: "0 0 0 auto", paddingLeft: 10, fontWeight: 500 }}>
              {formatMinor(value, currency)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="tnum" style={{ margin: "5px 0 0", paddingTop: 4, borderTop: "1px solid var(--line)", color: "var(--text-muted)" }}>
        Net {formatMinor(point.net, currency, { signed: true })}
      </p>
    </div>
  );
}

export interface InflowsOutflowsProps {
  transactions: Transaction[];
  /** The `YYYY-MM` the twelve-month window ends on. */
  month: string;
  currency: CurrencyCode;
}

/**
 * Inflows and outflows — a grouped monthly bar comparison.
 *
 * Transfers are excluded from both series: they move money between the user's
 * own accounts and are not income or spending, so counting them here would
 * overstate activity. `monthlyTrend` already applies that rule through
 * `rangeTotals`, so this component adds no arithmetic of its own.
 *
 * Deliberately secondary to the balance chart: shorter than it, lower contrast,
 * and with no fill gradients or 3D treatment.
 */
export function InflowsOutflows({ transactions, month, currency }: InflowsOutflowsProps) {
  const data = monthlyTrend(
    transactions,
    Array.from({ length: 12 }, (_, i) => shiftMonth(month, i - 11)),
  ).map((point) => ({ ...point, tick: shortMonthLabel(point.month), net: point.income - point.expense }));

  const hasActivity = data.some((d) => d.income !== 0 || d.expense !== 0);
  const hasBoth = data.some((d) => d.income !== 0) && data.some((d) => d.expense !== 0);

  return (
    <section aria-labelledby="inflows-heading" className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)]">
      <div className="mb-4">
        <h2 id="inflows-heading" className="text-[18px] font-semibold tracking-[-0.01em]">
          Inflows and outflows
        </h2>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          Monthly income and expenses, {monthLabel(shiftMonth(month, -11))} to {monthLabel(month)}. Transfers are
          excluded from both series.
        </p>
      </div>

      {!hasActivity ? (
        <div className="grid h-[180px] w-full place-items-center rounded-[10px] border border-[var(--line)] bg-[var(--surface)] px-6 text-center text-[13px] text-[var(--text-faint)]">
          No income or expense records in this range yet. The chart fills in once you save transactions.
        </div>
      ) : (
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barGap={2}>
              <CartesianGrid stroke="var(--gridline)" vertical={false} />
              <XAxis
                dataKey="tick"
                tick={{ fontSize: 11, fill: "var(--text-faint)" }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={14}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--text-faint)" }}
                width={58}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => formatMinor(v, currency, { compact: true, symbol: true })}
              />
              <Tooltip
                cursor={{ fill: "var(--surface-sunken)" }}
                content={<FlowTooltip currency={currency} />}
              />
              <Legend
                verticalAlign="top"
                align="right"
                height={24}
                iconType="circle"
                iconSize={7}
                formatter={(value) => <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{value}</span>}
              />
              <Bar
                dataKey="income"
                name="Inflow"
                fill={SERIES[0]}
                radius={[4, 4, 0, 0]}
                maxBarSize={22}
                isAnimationActive={false}
              />
              <Bar
                dataKey="expense"
                name="Outflow"
                fill={SERIES[1]}
                radius={[4, 4, 0, 0]}
                maxBarSize={22}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* With only one kind of activity, say so rather than leaving an empty half. */}
      {hasActivity && !hasBoth ? (
        <p className="mt-2 text-[11px] text-[var(--text-faint)]">
          Only one kind of activity is recorded in this range, so the paired bar has nothing to compare against.
        </p>
      ) : null}
    </section>
  );
}