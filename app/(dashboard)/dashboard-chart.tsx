"use client";

import { useMemo } from "react";

type Day = { date: string; ok: number; error: number };

export function QueriesByDayChart({ data }: { data: Day[] }) {
  const max = useMemo(() => {
    return Math.max(1, ...data.map((d) => d.ok + d.error));
  }, [data]);

  const width = 720;
  const height = 220;
  const padding = { top: 12, right: 12, bottom: 30, left: 30 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const barW = (plotW / data.length) * 0.55;
  const groupW = plotW / data.length;

  const niceMax = niceCeil(max);
  const ticks = 4;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-56 w-full"
      preserveAspectRatio="none"
      aria-label="Queries by day"
    >
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const value = (niceMax / ticks) * i;
        const y = padding.top + plotH - (value / niceMax) * plotH;
        return (
          <g key={i}>
            <line
              x1={padding.left}
              x2={padding.left + plotW}
              y1={y}
              y2={y}
              stroke="currentColor"
              strokeOpacity={0.1}
            />
            <text
              x={padding.left - 6}
              y={y + 3}
              fontSize={10}
              textAnchor="end"
              fill="currentColor"
              fillOpacity={0.6}
            >
              {Math.round(value)}
            </text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const total = d.ok + d.error;
        const cx = padding.left + groupW * i + groupW / 2 - barW / 2;
        const totalH = (total / niceMax) * plotH;
        const errH = (d.error / niceMax) * plotH;
        const okH = totalH - errH;
        const okY = padding.top + plotH - okH;
        const errY = padding.top + plotH - totalH;
        const label = d.date.slice(5);
        return (
          <g key={d.date}>
            {errH > 0 && (
              <rect
                x={cx}
                y={errY}
                width={barW}
                height={errH}
                className="fill-destructive"
                rx={1}
              >
                <title>{`${d.date}: ${d.error} errors`}</title>
              </rect>
            )}
            {okH > 0 && (
              <rect
                x={cx}
                y={okY}
                width={barW}
                height={okH}
                className="fill-primary"
                rx={1}
              >
                <title>{`${d.date}: ${d.ok} ok`}</title>
              </rect>
            )}
            <text
              x={cx + barW / 2}
              y={padding.top + plotH + 16}
              fontSize={10}
              textAnchor="middle"
              fill="currentColor"
              fillOpacity={0.65}
            >
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function niceCeil(v: number): number {
  if (v <= 1) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / pow;
  let nice: number;
  if (norm <= 1) nice = 1;
  else if (norm <= 2) nice = 2;
  else if (norm <= 5) nice = 5;
  else nice = 10;
  return nice * pow;
}
