"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Copy } from "lucide-react"

import { cn } from "@/lib/utils"

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      window.isSecureContext
    ) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Permiso denegado o contexto no seguro: probamos el fallback.
  }

  try {
    const textarea = document.createElement("textarea")
    textarea.value = text
    textarea.setAttribute("readonly", "")
    textarea.style.position = "fixed"
    textarea.style.top = "0"
    textarea.style.left = "0"
    textarea.style.opacity = "0"
    document.body.appendChild(textarea)
    textarea.select()
    textarea.setSelectionRange(0, text.length)
    const ok = document.execCommand("copy")
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}

type CopyStatus = "idle" | "copied" | "error"

interface CopyButtonProps {
  /** Valor que se copia al portapapeles. */
  value: string
  /** Nombre del dato, para el aria-label y el aviso a lectores de pantalla ("alias", "CBU/CVU", "monto"). */
  label: string
  className?: string
}

export function CopyButton({ value, label, className }: CopyButtonProps) {
  const [status, setStatus] = useState<CopyStatus>("idle")
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    []
  )

  const handleCopy = async () => {
    const ok = await copyToClipboard(value)
    setStatus(ok ? "copied" : "error")

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setStatus("idle"), 2500)
  }

  return (
    <>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={`Copiar ${label}`}
        className={cn(
          "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors sm:min-h-9",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-1",
          status === "copied"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : status === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-100",
          className
        )}
      >
        {status === "copied" ? (
          <Check className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Copy className="h-4 w-4" aria-hidden="true" />
        )}
        <span aria-hidden="true">
          {status === "copied"
            ? "Copiado"
            : status === "error"
              ? "Copialo a mano"
              : "Copiar"}
        </span>
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {status === "copied"
          ? `${label} copiado`
          : status === "error"
            ? `No se pudo copiar ${label}. Copialo manualmente.`
            : ""}
      </span>
    </>
  )
}
