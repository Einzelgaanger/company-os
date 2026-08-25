import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronDown } from "lucide-react";
import {
  COST_OF_DELAY_BANDS,
  COST_OF_DELAY_LABEL,
  FLOW_STATE_LABEL,
  type AgingPoint,
  type CostOfDelayBand,
  type FlowState,
} from "@/lib/flow";
import { STATUS } from "@/lib/tokens";

/**
 * AgingScatter — 04_FLOW_ENGINE §4.8, 07_DESIGN_SYSTEM §7.7.
 *
 * x = working days in queue, y = cost-of-delay band, one dot per open item,
 * with dashed percentile lines from historical age at completion. This replaces
 * the four count cards because it shows the distribution, and the outliers are
 * what needs action — "12 open" cannot tell you one of them has sat three weeks.
 *
 * §7.4 says one pre-attentive channel carries the primary signal, and here it is
 * position. Colour is secondary and always paired with a distinct symbol, so the
 * chart stays readable in greyscale and under colour-vision deficiency.
 */

const BAND_Y: Record<CostOfDelayBand, number> = {
  critical: 4,
  high: 3,
  standard: 2,
  low: 1,
};

type SeriesShape = "circle" | "square" | "triangle" | "diamond" | "cross" | "star";

/**
 * Dot colour is the status set only (§7.3) — SVG presentation attributes do not
 * substitute `var()`, so the values come from the CSS mirror in `lib/tokens`.
 */
const SERIES: Array<{ states: FlowState[]; label: string; fill: string; shape: SeriesShape }> = [
  { states: ["active"], label: "Moving", fill: STATUS.moving.mark, shape: "circle" },
  { states: ["ready"], label: "Ready", fill: STATUS.ready.mark, shape: "square" },
  {
    states: ["waiting_internal", "waiting_external", "waiting_decision", "waiting_dependency"],
    label: "Waiting",
    fill: STATUS.waiting.mark,
    shape: "triangle",
  },
  { states: ["review"], label: "In review", fill: STATUS.review.mark, shape: "diamond" },
];

type Point = AgingPoint & { x: number; y: number };

function TooltipCard({ active, payload }: { active?: boolean; payload?: Array<{ payload: Point }> }) {
  const point = active ? payload?.[0]?.payload : undefined;
  if (!point) return null;
  return (
    <div className="rounded-md border border-[rgba(14,31,26,0.12)] bg-white px-2.5 py-2 shadow-sm">
      <div className="max-w-[16rem] truncate text-xs font-semibold text-[#0E1F1A]">
        {point.title}
      </div>
      <div className="mt-0.5 font-mono text-[11px] text-[#5A6B7D]">
        {point.queueAgeDays.toFixed(1)} working days in queue
      </div>
      <div className="text-[11px] text-[#5A6B7D]">
        {COST_OF_DELAY_LABEL[point.costOfDelayBand]} · {FLOW_STATE_LABEL[point.flowState]}
        {point.projectName ? ` · ${point.projectName}` : ""}
      </div>
    </div>
  );
}

export function AgingScatter({
  items,
  percentiles,
  sampleSize,
  onSelect,
}: {
  items: AgingPoint[];
  percentiles: { p50: number; p85: number; p95: number } | null;
  sampleSize: number;
  onSelect?: (id: string) => void;
}) {
  const [tableOpen, setTableOpen] = useState(false);

  const series = useMemo(
    () =>
      SERIES.map((s) => ({
        ...s,
        data: items
          .filter((i) => s.states.includes(i.flowState))
          .map<Point>((i) => ({ ...i, x: i.queueAgeDays, y: BAND_Y[i.costOfDelayBand] })),
      })).filter((s) => s.data.length > 0),
    [items],
  );

  const maxAge = Math.max(4, ...items.map((i) => i.queueAgeDays), percentiles?.p95 ?? 0);

  return (
    <div className="space-y-2">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
            <CartesianGrid stroke="rgba(14,31,26,0.08)" />
            <XAxis
              type="number"
              dataKey="x"
              domain={[0, Math.ceil(maxAge * 1.1)]}
              tick={{ fontSize: 11, fill: "#5A6B7D", fontFamily: "IBM Plex Mono" }}
              stroke="rgba(14,31,26,0.2)"
              label={{
                value: "Working days in queue",
                position: "insideBottom",
                offset: -14,
                style: { fontSize: 11, fill: "#5A6B7D" },
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={[0.5, 4.5]}
              ticks={[1, 2, 3, 4]}
              width={68}
              tick={{ fontSize: 11, fill: "#5A6B7D" }}
              stroke="rgba(14,31,26,0.2)"
              tickFormatter={(value: number) =>
                COST_OF_DELAY_LABEL[
                  (COST_OF_DELAY_BANDS.find((b) => BAND_Y[b] === value) ?? "standard") as CostOfDelayBand
                ]
              }
            />
            {percentiles && (
              <>
                <ReferenceLine
                  x={percentiles.p50}
                  stroke="#5A6B7D"
                  strokeDasharray="4 4"
                  label={{ value: "p50", position: "top", style: { fontSize: 10, fill: "#5A6B7D" } }}
                />
                <ReferenceLine
                  x={percentiles.p85}
                  stroke={STATUS.waiting.ink}
                  strokeDasharray="4 4"
                  label={{
                    value: "p85",
                    position: "top",
                    style: { fontSize: 10, fill: STATUS.waiting.ink },
                  }}
                />
                <ReferenceLine
                  x={percentiles.p95}
                  stroke={STATUS.attention.ink}
                  strokeDasharray="4 4"
                  label={{
                    value: "p95",
                    position: "top",
                    style: { fontSize: 10, fill: STATUS.attention.ink },
                  }}
                />
              </>
            )}
            <Tooltip content={<TooltipCard />} />
            <Legend
              verticalAlign="top"
              height={24}
              iconSize={9}
              wrapperStyle={{ fontSize: 11, color: "#5A6B7D" }}
            />
            {series.map((s) => (
              <Scatter
                key={s.label}
                name={s.label}
                data={s.data}
                fill={s.fill}
                shape={s.shape}
                onClick={(point: unknown) => {
                  const id = (point as { id?: string; payload?: { id?: string } }).payload?.id
                    ?? (point as { id?: string }).id;
                  if (id && onSelect) onSelect(id);
                }}
                cursor={onSelect ? "pointer" : undefined}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[11px] font-medium text-[#5A6B7D]">
        Each dot is one open item, placed by how long it has been in the queue. Anything right of
        the p85 line is older than most work ever gets — start there.
        {percentiles
          ? ` Percentiles from ${sampleSize} completed items.`
          : ` Percentile lines appear once ${5 - sampleSize} more items complete.`}
      </p>

      {/* §7.11 — every chart carries its figures in an accessible table. */}
      <details
        open={tableOpen}
        onToggle={(e) => setTableOpen((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary className="flex cursor-pointer items-center gap-1 text-[11px] font-semibold text-[#5A6B7D]">
          <ChevronDown className="h-3 w-3" /> Show the figures
        </summary>
        <table className="mt-2 w-full text-left text-[11px]">
          <thead className="text-[#5A6B7D]">
            <tr>
              <th className="py-1 pr-2 font-semibold">Item</th>
              <th className="py-1 pr-2 font-semibold">Cost of delay</th>
              <th className="py-1 pr-2 font-semibold">State</th>
              <th className="py-1 font-semibold">Working days in queue</th>
            </tr>
          </thead>
          <tbody className="text-[#0E1F1A]">
            {items.map((item) => (
              <tr key={item.id} className="border-t border-[rgba(14,31,26,0.06)]">
                <td className="py-1 pr-2">{item.title}</td>
                <td className="py-1 pr-2">{COST_OF_DELAY_LABEL[item.costOfDelayBand]}</td>
                <td className="py-1 pr-2">{FLOW_STATE_LABEL[item.flowState]}</td>
                <td className="py-1 font-mono">{item.queueAgeDays.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
