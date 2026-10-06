"use client"

import { useCallback, useEffect, useState } from "react"

import {
  verifyPaymentStatus,
  type OrderPaymentSnapshot,
} from "@/controllers/payment/payment-controller"

export type SnapshotErrorKind = "auth" | "not_found" | "failed"

export interface SnapshotError {
  kind: SnapshotErrorKind
  message: string
}

export type SnapshotState =
  | { phase: "missing_reference" }
  | { phase: "loading" }
  | { phase: "ready"; snapshot: OrderPaymentSnapshot }
  | { phase: "error"; error: SnapshotError }

export interface UseOrderSnapshotOptions {
  /** Si devuelve true, se vuelve a consultar siguiendo `delaysMs`. Debe ser una función estable (de módulo). */
  shouldPoll: (snapshot: OrderPaymentSnapshot) => boolean
  /** Espera (ms) antes de cada reintento. Al agotarse se deja de consultar. Debe ser una constante estable. */
  delaysMs: readonly number[]
}

export interface UseOrderSnapshotResult {
  state: SnapshotState
  /** Hay consultas programadas (el estado todavía puede cambiar solo). */
  isPolling: boolean
  /** Se agotaron los reintentos y el pago sigue sin resolverse. */
  exhausted: boolean
  /** Vuelve a consultar ahora y reinicia el polling. */
  refresh: () => void
}

const GENERIC_ERROR = "No pudimos verificar el estado de tu pedido."

/**
 * Consulta el estado de la orden (server action `verifyPaymentStatus`, que exige
 * ser el dueño) y hace polling con backoff mientras el pago no esté resuelto.
 */
export function useOrderSnapshot(
  externalReference: string | null,
  { shouldPoll, delaysMs }: UseOrderSnapshotOptions
): UseOrderSnapshotResult {
  const [state, setState] = useState<SnapshotState>(
    externalReference ? { phase: "loading" } : { phase: "missing_reference" }
  )
  const [isPolling, setIsPolling] = useState(false)
  const [exhausted, setExhausted] = useState(false)
  const [runId, setRunId] = useState(0)

  useEffect(() => {
    if (!externalReference) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let attempt = 0
    let hasSnapshot = false

    const scheduleNext = (): boolean => {
      if (attempt >= delaysMs.length) return false
      const delay = delaysMs[attempt]
      attempt += 1
      timer = setTimeout(() => {
        void check()
      }, delay)
      return true
    }

    const check = async () => {
      let result: Awaited<ReturnType<typeof verifyPaymentStatus>> | null = null
      try {
        result = await verifyPaymentStatus(externalReference)
      } catch {
        result = null
      }

      if (cancelled) return

      if (result?.success && result.data) {
        const snapshot = result.data
        hasSnapshot = true
        setState({ phase: "ready", snapshot })

        if (shouldPoll(snapshot)) {
          const scheduled = scheduleNext()
          setIsPolling(scheduled)
          setExhausted(!scheduled)
        } else {
          setIsPolling(false)
          setExhausted(false)
        }
        return
      }

      const statusCode = result?.statusCode
      const message = result?.message || GENERIC_ERROR

      if (statusCode === 401) {
        setState({ phase: "error", error: { kind: "auth", message } })
        setIsPolling(false)
        return
      }

      if (statusCode === 403 || statusCode === 404) {
        setState({ phase: "error", error: { kind: "not_found", message } })
        setIsPolling(false)
        return
      }

      // Falla transitoria (red, 500): si ya había datos los conservamos y
      // seguimos intentando; si no, mostramos el error con "Reintentar".
      setState((prev) =>
        prev.phase === "ready"
          ? prev
          : { phase: "error", error: { kind: "failed", message } }
      )
      setIsPolling(hasSnapshot ? scheduleNext() : false)
    }

    void check()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [externalReference, runId, shouldPoll, delaysMs])

  const refresh = useCallback(() => {
    setState((prev) => (prev.phase === "ready" ? prev : { phase: "loading" }))
    setExhausted(false)
    setIsPolling(true)
    setRunId((value) => value + 1)
  }, [])

  return { state, isPolling, exhausted, refresh }
}
