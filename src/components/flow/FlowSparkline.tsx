import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";

/**
 * Flow debt sparkline — 07_DESIGN_SYSTEM §7.7. Twelve weekly points, one hue,
 * no axis. The current value is labelled by the card it sits in, not inside the
 * chart, so the shape carries the meaning and nothing competes with it.
 */
export function FlowSparkline({
  points,
  className,
}: {
  points: Array<{ at: string; teamDays: number }>;
  className?: string;
}) {
  if (points.length < 2) return null;
  return (
    <div className={className ?? "h-8 w-full"} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Line
            type="monotone"
            dataKey="teamDays"
            stroke="#0E1F1A"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
