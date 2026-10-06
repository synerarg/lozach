"use client"

import { useCallback, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import type { ActionResponse } from "@/lib/handlers/actionHandler"

export type OrderActionKey =
  | "approve"
  | "reject"
  | "cash"
  | "ready"
  | "pickedUp"
  | "cancel"
  | "retry"
  | "tracking"

/**
 * Ejecuta una server action de admin: maneja el estado "en curso", muestra
 * toast de éxito/error y refresca la página al terminar bien.
 * Devuelve `true` si la acción salió bien.
 */
export function useOrderAction() {
  const router = useRouter()
  const [busy, setBusy] = useState<OrderActionKey | null>(null)

  const run = useCallback(
    async <T,>(
      key: OrderActionKey,
      call: () => Promise<ActionResponse<T>>,
      successMessage: string | ((data: T | undefined) => string),
      fallbackError: string
    ): Promise<boolean> => {
      setBusy(key)
      try {
        const result = await call()
        if (result.success) {
          toast.success(
            typeof successMessage === "function"
              ? successMessage(result.data)
              : successMessage
          )
          router.refresh()
          return true
        }
        toast.error(result.message || fallbackError)
        return false
      } catch (error) {
        toast.error(
          error instanceof Error && error.message
            ? error.message
            : "Error inesperado. Probá de nuevo."
        )
        return false
      } finally {
        setBusy(null)
      }
    },
    [router]
  )

  return { busy, run }
}
