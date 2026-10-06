"use client"

import { useEffect, useMemo, useState } from "react"
import { Timer } from "lucide-react"

import { cn } from "@/lib/utils"

import { formatCountdown, formatDateTime } from "./payment-format"

const CRITICAL_MS = 5 * 60 * 1000

type Level = "ok" | "critical" | "expired"

/**
 * Cuenta regresiva hasta el vencimiento REAL de la orden (`expiresAt` del
 * servidor), así no se reinicia al recargar la página.
 */
export function TransferCountdown({ expiresAt }: { expiresAt: string }) {
  const deadline = useMemo(() => new Date(expiresAt).getTime(), [expiresAt])
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  if (Number.isNaN(deadline)) return null

  const remaining = Math.max(0, deadline - now)
  const level: Level =
    remaining === 0 ? "expired" : remaining < CRITICAL_MS ? "critical" : "ok"
  const absolute = formatDateTime(expiresAt)

  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 text-center",
        level === "expired" && "border-red-200 bg-red-50 text-red-800",
        level === "critical" && "border-amber-300 bg-amber-50 text-amber-900",
        level === "ok" && "border-neutral-200 bg-neutral-50 text-neutral-800"
      )}
    >
      <p className="flex items-center justify-center gap-1.5 text-xs font-medium uppercase tracking-wide">
        <Timer className="h-3.5 w-3.5" aria-hidden="true" />
        Tiempo para enviar el comprobante
      </p>
      {/* role=timer no anuncia cada segundo; los cambios de nivel se anuncian aparte. */}
      <p
        role="timer"
        className="mt-1 font-mono text-3xl font-bold tabular-nums"
      >
        {formatCountdown(remaining)}
      </p>
      <p className="mt-1 text-xs">
        {level === "expired"
          ? "El plazo venció. Si ya transferiste, subí el comprobante igual y lo revisamos. Si no, el pedido puede cancelarse automáticamente."
          : absolute
            ? `Vence el ${absolute}. Si no recibimos el comprobante a tiempo, el pedido se cancela.`
            : "Si no recibimos el comprobante a tiempo, el pedido se cancela."}
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {level === "critical"
          ? "Quedan menos de cinco minutos para enviar el comprobante."
          : level === "expired"
            ? "El plazo para enviar el comprobante venció."
            : ""}
      </p>
    </div>
  )
}
