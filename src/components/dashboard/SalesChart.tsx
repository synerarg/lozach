"use client"

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { formatCurrency, formatShortDate } from "@/components/dashboard/format"

export interface SalesChartPoint {
  /** "YYYY-MM-DD" (hora argentina). */
  day: string
  total: number
  orders: number
}

const chartConfig = {
  total: {
    label: "Ventas",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig

interface SalesChartProps {
  data: SalesChartPoint[]
  summary: string
}

function parseDay(day: string): Date {
  // Mediodía UTC: evita que el huso horario corra el día al formatear.
  return new Date(`${day}T12:00:00Z`)
}

export function SalesChart({ data, summary }: SalesChartProps) {
  return (
    <ChartContainer
      config={chartConfig}
      className="aspect-auto h-[220px] w-full sm:h-[260px]"
      role="img"
      aria-label={summary}
    >
      <BarChart data={data} margin={{ left: 4, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={28}
          tickFormatter={(value: string) => formatShortDate(parseDay(value))}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const point = payload?.[0]?.payload as SalesChartPoint | undefined
                return point ? formatShortDate(parseDay(point.day)) : null
              }}
              formatter={(value, _name, item) => {
                const point = item.payload as SalesChartPoint | undefined
                return (
                  <div className="flex w-full items-center justify-between gap-4">
                    <span className="text-muted-foreground">
                      {point?.orders ?? 0}{" "}
                      {point?.orders === 1 ? "orden" : "órdenes"}
                    </span>
                    <span className="font-mono font-medium tabular-nums text-foreground">
                      {formatCurrency(Number(value))}
                    </span>
                  </div>
                )
              }}
            />
          }
        />
        <Bar
          dataKey="total"
          name="Ventas"
          fill="var(--color-total)"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ChartContainer>
  )
}
