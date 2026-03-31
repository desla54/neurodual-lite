import type { ReactNode } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { CustomTooltip } from '@neurodual/ui';
import { SafeResponsiveContainer } from '../charts/safe-responsive-container';

export function SynergyRoundChart({
  data,
  trackLabel,
  nbackLabel,
  roundLabel,
  emptyLabel,
}: {
  data: { round: string; track?: number; nback?: number }[];
  trackLabel: string;
  nbackLabel: string;
  roundLabel: string;
  emptyLabel?: string;
}): ReactNode {
  const hasData = data.some((point) => point.track !== undefined || point.nback !== undefined);

  return (
    <div className="w-full rounded-[22px] border border-border/50 bg-card/85 p-3 shadow-[0_24px_70px_-36px_hsl(var(--glass-shadow)/0.45)] backdrop-blur-2xl">
      <div className="mb-2 flex items-center justify-center gap-4">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-4 rounded-full bg-[hsl(var(--woven-blue))]" />
          <span className="text-[11px] font-medium text-muted-foreground">{trackLabel}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-4 rounded-full bg-[hsl(var(--woven-cyan))]" />
          <span className="text-[11px] font-medium text-muted-foreground">{nbackLabel}</span>
        </div>
      </div>
      <div className="relative h-32 w-full">
        {!hasData && emptyLabel && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <span className="text-xs text-muted-foreground/60">{emptyLabel}</span>
          </div>
        )}
        <SafeResponsiveContainer>
          <LineChart
            accessibilityLayer={false}
            data={data}
            margin={{ top: 8, right: 12, left: 6, bottom: 4 }}
          >
            <CartesianGrid
              vertical={false}
              strokeDasharray="3 3"
              stroke="var(--border)"
              opacity={0.4}
            />
            <XAxis
              dataKey="round"
              tickLine={false}
              axisLine={{ stroke: 'var(--border)', opacity: 0.6 }}
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              tickFormatter={(value: string) => `${roundLabel} ${value}`}
            />
            <YAxis
              width={30}
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickLine={false}
              axisLine={{ stroke: 'var(--border)', opacity: 0.6 }}
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              tickFormatter={(value: number) => `${value}%`}
            />
            <Tooltip
              cursor={false}
              content={
                <CustomTooltip
                  valueFormatter={(value: number) => `${value}%`}
                  labelFormatter={(label: string) => `${roundLabel} ${label}`}
                />
              }
            />
            <Line
              isAnimationActive={false}
              type="monotone"
              dataKey="track"
              name={trackLabel}
              stroke="hsl(var(--woven-blue))"
              strokeWidth={2}
              dot={{ r: 3, fill: 'hsl(var(--woven-blue))', strokeWidth: 0 }}
              activeDot={{ r: 4.5, fill: 'hsl(var(--woven-blue))', strokeWidth: 0 }}
            />
            <Line
              isAnimationActive={false}
              type="monotone"
              dataKey="nback"
              name={nbackLabel}
              stroke="hsl(var(--woven-cyan))"
              strokeWidth={2}
              dot={{ r: 3, fill: 'hsl(var(--woven-cyan))', strokeWidth: 0 }}
              activeDot={{ r: 4.5, fill: 'hsl(var(--woven-cyan))', strokeWidth: 0 }}
            />
          </LineChart>
        </SafeResponsiveContainer>
      </div>
    </div>
  );
}
