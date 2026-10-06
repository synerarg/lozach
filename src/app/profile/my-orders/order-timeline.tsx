import { Check } from "lucide-react"

import type { TimelineStep } from "@/lib/utils/order-stage"
import { cn } from "@/lib/utils"

const STATE_TEXT: Record<TimelineStep["state"], string> = {
  done: "completado",
  current: "en curso",
  upcoming: "pendiente",
}

/**
 * Línea de tiempo del pedido: horizontal desde `sm`, vertical y compacta en mobile.
 */
export function OrderTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol
      aria-label="Progreso del pedido"
      className="flex flex-col sm:flex-row"
    >
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1

        return (
          <li
            key={step.key}
            aria-current={step.state === "current" ? "step" : undefined}
            className="relative flex gap-3 pb-5 last:pb-0 sm:flex-1 sm:flex-col sm:items-center sm:gap-2 sm:pb-0 sm:text-center"
          >
            {!isLast && (
              <>
                {/* Conector vertical (mobile) */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute bottom-0 left-[11px] top-6 w-0.5 sm:hidden",
                    step.state === "done" ? "bg-neutral-900" : "bg-neutral-200"
                  )}
                />
                {/* Conector horizontal (desktop): del centro de este paso al del siguiente */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute left-1/2 top-[11px] hidden h-0.5 w-full sm:block",
                    step.state === "done" ? "bg-neutral-900" : "bg-neutral-200"
                  )}
                />
              </>
            )}

            <span
              aria-hidden="true"
              className={cn(
                "relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
                step.state === "done" &&
                  "border-neutral-900 bg-neutral-900 text-white",
                step.state === "current" && "border-neutral-900 bg-white",
                step.state === "upcoming" && "border-neutral-300 bg-white"
              )}
            >
              {step.state === "done" && <Check className="h-3.5 w-3.5" />}
              {step.state === "current" && (
                <span className="h-2 w-2 animate-pulse rounded-full bg-neutral-900 motion-reduce:animate-none" />
              )}
            </span>

            <span
              className={cn(
                "text-sm leading-6 sm:leading-snug",
                step.state === "upcoming"
                  ? "text-neutral-500"
                  : "font-medium text-neutral-900"
              )}
            >
              {step.label}
              <span className="sr-only"> ({STATE_TEXT[step.state]})</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
