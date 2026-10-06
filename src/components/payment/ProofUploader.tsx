"use client"

import { useEffect, useId, useRef, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Loader2,
  UploadCloud,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { formatBytes } from "./payment-format"

const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
] as const
const ALLOWED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".pdf"] as const
const ACCEPT = [...ALLOWED_MIME, ...ALLOWED_EXTENSIONS].join(",")
const UPLOAD_TIMEOUT_MS = 90_000

function validateProofFile(file: File): string | null {
  if (file.size === 0) {
    return "El archivo está vacío."
  }

  if (file.size > MAX_BYTES) {
    return `El archivo pesa ${formatBytes(file.size)} y el máximo es 10 MB.`
  }

  const name = file.name.toLowerCase()
  const mimeOk = (ALLOWED_MIME as readonly string[]).includes(file.type)
  const extensionOk = ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext))

  // Algunos navegadores no informan el MIME: en ese caso miramos la extensión.
  if (!mimeOk && !(file.type === "" && extensionOk)) {
    return "Formato no permitido. Subí una imagen (PNG, JPG, WEBP) o un PDF."
  }

  return null
}

type UploadOutcome =
  | { ok: true }
  | { ok: false; message: string; aborted?: boolean }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/** XHR en vez de fetch para poder mostrar progreso real de subida. */
function sendProof(
  xhr: XMLHttpRequest,
  externalReference: string,
  file: File,
  onProgress: (percent: number) => void
): Promise<UploadOutcome> {
  return new Promise((resolve) => {
    const formData = new FormData()
    formData.append("external_reference", externalReference)
    formData.append("file", file)

    xhr.open("POST", "/api/payment/transfer-proof")
    xhr.timeout = UPLOAD_TIMEOUT_MS

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.round((event.loaded / event.total) * 100))
      }
    }

    xhr.onload = () => {
      let payload: unknown = null
      try {
        payload = JSON.parse(xhr.responseText)
      } catch {
        payload = null
      }

      const success =
        xhr.status >= 200 &&
        xhr.status < 300 &&
        isRecord(payload) &&
        payload.success === true

      if (success) {
        resolve({ ok: true })
        return
      }

      const serverMessage =
        isRecord(payload) && typeof payload.message === "string"
          ? payload.message
          : null

      resolve({
        ok: false,
        message:
          serverMessage ??
          (xhr.status === 413
            ? "El archivo es demasiado grande para enviarlo. Probá con uno más liviano."
            : "No se pudo subir el comprobante. Intentá de nuevo."),
      })
    }

    xhr.onerror = () =>
      resolve({
        ok: false,
        message:
          "No pudimos conectarnos. Revisá tu conexión e intentá de nuevo.",
      })
    xhr.ontimeout = () =>
      resolve({
        ok: false,
        message: "La subida tardó demasiado. Intentá de nuevo.",
      })
    xhr.onabort = () => resolve({ ok: false, message: "", aborted: true })

    xhr.send(formData)
  })
}

interface ProofUploaderProps {
  externalReference: string
  /** Se llama cuando el servidor confirmó la subida (para refrescar el estado). */
  onUploaded: () => void
  /** Texto del botón de envío. */
  submitLabel?: string
}

export function ProofUploader({
  externalReference,
  onUploaded,
  submitLabel = "Enviar comprobante",
}: ProofUploaderProps) {
  const inputId = useId()
  const errorId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const xhrRef = useRef<XMLHttpRequest | null>(null)
  const isUploadingRef = useRef(false)

  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploaded, setUploaded] = useState(false)

  useEffect(
    () => () => {
      xhrRef.current?.abort()
    },
    []
  )

  const selectFile = (candidate: File | null) => {
    setError(null)

    if (!candidate) {
      setFile(null)
      return
    }

    const validationError = validateProofFile(candidate)
    if (validationError) {
      setFile(null)
      setError(validationError)
      if (inputRef.current) inputRef.current.value = ""
      return
    }

    setFile(candidate)
  }

  const clearFile = () => {
    setFile(null)
    setError(null)
    if (inputRef.current) inputRef.current.value = ""
  }

  const handleDrop = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault()
    setIsDragging(false)
    if (isUploading) return
    selectFile(event.dataTransfer.files?.[0] ?? null)
  }

  const handleSubmit = async () => {
    if (isUploadingRef.current) return
    if (!file) {
      setError("Adjuntá el comprobante antes de enviarlo.")
      return
    }

    isUploadingRef.current = true
    setIsUploading(true)
    setProgress(0)
    setError(null)

    const xhr = new XMLHttpRequest()
    xhrRef.current = xhr

    const outcome = await sendProof(xhr, externalReference, file, setProgress)

    xhrRef.current = null
    isUploadingRef.current = false

    if (outcome.ok) {
      setIsUploading(false)
      setUploaded(true)
      toast.success("¡Comprobante recibido! Te avisamos por mail cuando lo revisemos.")
      onUploaded()
      return
    }

    setIsUploading(false)
    if (!outcome.aborted) {
      setError(outcome.message)
      toast.error(outcome.message)
    }
  }

  if (uploaded) {
    return (
      <div
        role="status"
        className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
      >
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-medium">¡Comprobante recibido!</p>
          <p className="text-emerald-800">
            Estamos actualizando el estado de tu pedido.
          </p>
        </div>
      </div>
    )
  }

  const FileIcon = file?.type.startsWith("image/") ? ImageIcon : FileText

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPT}
        className="sr-only peer"
        disabled={isUploading}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
      />

      {file ? (
        <div className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-neutral-700">
            <FileIcon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-neutral-900">
              {file.name}
            </p>
            <p className="text-xs text-neutral-600">{formatBytes(file.size)}</p>
          </div>
          {!isUploading && (
            <>
              <label
                htmlFor={inputId}
                className="inline-flex min-h-11 cursor-pointer items-center rounded-md px-3 text-sm font-medium text-neutral-900 underline underline-offset-2 hover:bg-neutral-100"
              >
                Cambiar
              </label>
              <button
                type="button"
                onClick={clearFile}
                aria-label="Quitar archivo"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      ) : (
        <label
          htmlFor={inputId}
          onDragOver={(event) => {
            event.preventDefault()
            if (!isUploading) setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={cn(
            "flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors",
            "peer-focus-visible:ring-2 peer-focus-visible:ring-neutral-900 peer-focus-visible:ring-offset-2",
            isDragging
              ? "border-neutral-900 bg-neutral-100"
              : "border-neutral-300 bg-neutral-50 hover:border-neutral-500 hover:bg-neutral-100"
          )}
        >
          <UploadCloud className="h-7 w-7 text-neutral-700" aria-hidden="true" />
          <span className="text-sm font-medium text-neutral-900">
            Arrastrá el comprobante acá o tocá para elegirlo
          </span>
          <span className="text-xs text-neutral-600">
            PNG, JPG, WEBP o PDF · hasta 10 MB
          </span>
        </label>
      )}

      {isUploading && (
        <div className="space-y-1.5">
          <div
            role="progressbar"
            aria-label="Subiendo comprobante"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            className="h-2 w-full overflow-hidden rounded-full bg-neutral-200"
          >
            <div
              className="h-full rounded-full bg-neutral-900 transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-neutral-600" aria-live="polite">
            {progress < 100
              ? `Subiendo… ${progress}%`
              : "Procesando el comprobante…"}
          </p>
        </div>
      )}

      {error && (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}

      <Button
        type="button"
        onClick={handleSubmit}
        disabled={!file || isUploading}
        className="h-11 w-full bg-black text-white hover:bg-neutral-800"
      >
        {isUploading ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            Enviando…
          </>
        ) : (
          submitLabel
        )}
      </Button>

      <p className="text-xs text-neutral-600">
        Si tu foto está en formato HEIC (iPhone), mandá una captura de pantalla
        del comprobante.
      </p>
    </div>
  )
}
