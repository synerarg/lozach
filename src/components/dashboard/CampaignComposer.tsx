"use client"

import { ReactNode, useId, useMemo, useState } from "react"
import {
  CircleAlert,
  CircleCheck,
  Eye,
  ImageIcon,
  Loader2,
  MailCheck,
  Search,
  Send,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { Product } from "@/types/products/types"
import { CampaignInput, CampaignResult } from "@/types/email/email"
import {
  sendCampaignTest,
  sendCampaignToSubscribers,
} from "@/controllers/admin/admin-campaign-controller"
import { FormTextarea } from "@/components/dashboard/FormTextarea"
import { ConfirmActionDialog } from "@/components/dashboard/ConfirmActionDialog"
import { formatCurrency, pluralize } from "@/components/dashboard/format"

const MAX_PRODUCTS = 4

interface CampaignComposerProps {
  subscriberCount: number
  products: Product[]
}

interface FormState {
  subject: string
  preheader: string
  headline: string
  body: string
  imageUrl: string
  ctaLabel: string
  ctaUrl: string
  productIds: number[]
}

const EMPTY_FORM: FormState = {
  subject: "",
  preheader: "",
  headline: "",
  body: "",
  imageUrl: "",
  ctaLabel: "",
  ctaUrl: "",
  productIds: [],
}

type FieldErrors = Partial<Record<keyof FormState | "cta", string>>

type SendKind = "test" | "send"

type ResultState =
  | { status: "success"; kind: SendKind; data: CampaignResult }
  | { status: "error"; kind: SendKind; message: string }
  | null

function isHttpsUrl(value: string): boolean {
  if (!value.startsWith("https://")) return false
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {}
  const subject = form.subject.trim()
  const headline = form.headline.trim()
  const body = form.body.trim()
  const imageUrl = form.imageUrl.trim()
  const ctaLabel = form.ctaLabel.trim()
  const ctaUrl = form.ctaUrl.trim()

  if (subject.length < 3) errors.subject = "El asunto es muy corto (mínimo 3 caracteres)."
  if (headline.length < 3) errors.headline = "El título es muy corto (mínimo 3 caracteres)."
  if (body.length < 10) errors.body = "Escribí un mensaje un poco más largo (mínimo 10 caracteres)."
  if (imageUrl && !isHttpsUrl(imageUrl)) {
    errors.imageUrl = "La URL de la imagen tiene que empezar con https://"
  }
  if (ctaUrl && !isHttpsUrl(ctaUrl)) {
    errors.ctaUrl = "La URL del botón tiene que empezar con https://"
  }
  if ((ctaLabel && !ctaUrl) || (!ctaLabel && ctaUrl)) {
    errors.cta = "El botón necesita texto y enlace, o ninguno de los dos."
  }

  return errors
}

function toInput(form: FormState): CampaignInput {
  const optional = (value: string) => value.trim() || undefined

  return {
    subject: form.subject.trim(),
    preheader: optional(form.preheader),
    headline: form.headline.trim(),
    body: form.body.trim(),
    imageUrl: optional(form.imageUrl),
    ctaLabel: optional(form.ctaLabel),
    ctaUrl: optional(form.ctaUrl),
    productIds: form.productIds.length > 0 ? form.productIds : undefined,
  }
}

export function CampaignComposer({
  subscriberCount,
  products,
}: CampaignComposerProps) {
  const uid = useId()
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [showErrors, setShowErrors] = useState(false)
  const [busy, setBusy] = useState<SendKind | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [result, setResult] = useState<ResultState>(null)
  const [productQuery, setProductQuery] = useState("")

  const errors = useMemo(() => validate(form), [form])
  const hasErrors = Object.keys(errors).length > 0
  const visibleErrors: FieldErrors = showErrors ? errors : {}

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products]
  )
  const selectedProducts = form.productIds
    .map((id) => productsById.get(id))
    .filter((product): product is Product => Boolean(product))

  const filteredProducts = useMemo(() => {
    const query = productQuery.trim().toLowerCase()
    if (!query) return products
    return products.filter((product) =>
      product.name.toLowerCase().includes(query)
    )
  }, [products, productQuery])

  const toggleProduct = (id: number, checked: boolean) => {
    setForm((prev) => {
      if (checked) {
        if (prev.productIds.includes(id) || prev.productIds.length >= MAX_PRODUCTS) {
          return prev
        }
        return { ...prev, productIds: [...prev.productIds, id] }
      }
      return { ...prev, productIds: prev.productIds.filter((item) => item !== id) }
    })
  }

  const send = async (kind: SendKind): Promise<boolean> => {
    setBusy(kind)
    setResult(null)
    try {
      const input = toInput(form)
      const response =
        kind === "test"
          ? await sendCampaignTest(input)
          : await sendCampaignToSubscribers(input)

      if (response.success && response.data) {
        const data = response.data
        setResult({ status: "success", kind, data })
        if (kind === "test") {
          toast.success("Te mandamos la prueba a tu mail. Revisá la bandeja de entrada.")
        } else if (data.failed > 0) {
          toast.warning(
            `Se enviaron ${data.sent} de ${data.total}. Fallaron ${data.failed}.`
          )
        } else {
          toast.success(
            `Campaña enviada a ${data.sent} ${pluralize(data.sent, "suscriptor", "suscriptores")}.`
          )
        }
        return true
      }

      const message =
        response.message || "No se pudo enviar la campaña. Probá de nuevo."
      setResult({ status: "error", kind, message })
      toast.error(message)
      return false
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Error inesperado al enviar la campaña."
      setResult({ status: "error", kind, message })
      toast.error(message)
      return false
    } finally {
      setBusy(null)
    }
  }

  const guard = (): boolean => {
    if (hasErrors) {
      setShowErrors(true)
      toast.error("Revisá los campos marcados antes de enviar.")
      return false
    }
    return true
  }

  const handleTest = () => {
    if (guard()) void send("test")
  }

  const handleOpenConfirm = () => {
    if (guard()) setConfirmOpen(true)
  }

  const handleConfirmSend = async () => {
    await send("send")
    setConfirmOpen(false)
  }

  const isBusy = busy !== null
  const noSubscribers = subscriberCount === 0

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        {/* Contenido */}
        <fieldset className="space-y-4 rounded-xl border bg-card p-4 shadow sm:p-5" disabled={isBusy}>
          <legend className="sr-only">Contenido de la campaña</legend>
          <h3 className="text-sm font-semibold">Contenido</h3>

          <Field
            id={`${uid}-subject`}
            label="Asunto"
            required
            error={visibleErrors.subject}
            counter={`${form.subject.length}/120`}
          >
            <Input
              id={`${uid}-subject`}
              value={form.subject}
              maxLength={120}
              onChange={(event) => update("subject", event.target.value)}
              placeholder="Ej: Llegó la nueva colección"
              aria-invalid={Boolean(visibleErrors.subject)}
            />
          </Field>

          <Field
            id={`${uid}-preheader`}
            label="Preheader"
            hint="Texto corto que se ve junto al asunto en la bandeja de entrada."
            counter={`${form.preheader.length}/160`}
          >
            <Input
              id={`${uid}-preheader`}
              value={form.preheader}
              maxLength={160}
              onChange={(event) => update("preheader", event.target.value)}
              placeholder="Opcional"
            />
          </Field>

          <Field
            id={`${uid}-headline`}
            label="Título"
            required
            error={visibleErrors.headline}
            counter={`${form.headline.length}/120`}
          >
            <Input
              id={`${uid}-headline`}
              value={form.headline}
              maxLength={120}
              onChange={(event) => update("headline", event.target.value)}
              placeholder="El título grande del mail"
              aria-invalid={Boolean(visibleErrors.headline)}
            />
          </Field>

          <Field
            id={`${uid}-body`}
            label="Mensaje"
            required
            hint="Separá los párrafos con una línea en blanco."
            error={visibleErrors.body}
            counter={`${form.body.length}/5000`}
          >
            <FormTextarea
              id={`${uid}-body`}
              value={form.body}
              maxLength={5000}
              rows={7}
              onChange={(event) => update("body", event.target.value)}
              placeholder={"Hola!\n\nContales a tus clientes qué hay de nuevo…"}
              aria-invalid={Boolean(visibleErrors.body)}
            />
          </Field>
        </fieldset>

        {/* Imagen y botón */}
        <fieldset className="space-y-4 rounded-xl border bg-card p-4 shadow sm:p-5" disabled={isBusy}>
          <legend className="sr-only">Imagen y botón</legend>
          <h3 className="text-sm font-semibold">Imagen y botón (opcionales)</h3>

          <Field
            id={`${uid}-image`}
            label="Imagen"
            hint="URL pública que empiece con https://"
            error={visibleErrors.imageUrl}
          >
            <Input
              id={`${uid}-image`}
              type="url"
              value={form.imageUrl}
              onChange={(event) => update("imageUrl", event.target.value)}
              placeholder="https://…"
              aria-invalid={Boolean(visibleErrors.imageUrl)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id={`${uid}-cta-label`}
              label="Texto del botón"
              error={visibleErrors.cta}
              counter={`${form.ctaLabel.length}/40`}
            >
              <Input
                id={`${uid}-cta-label`}
                value={form.ctaLabel}
                maxLength={40}
                onChange={(event) => update("ctaLabel", event.target.value)}
                placeholder="Ej: Ver novedades"
                aria-invalid={Boolean(visibleErrors.cta)}
              />
            </Field>
            <Field
              id={`${uid}-cta-url`}
              label="Enlace del botón"
              error={visibleErrors.ctaUrl}
            >
              <Input
                id={`${uid}-cta-url`}
                type="url"
                value={form.ctaUrl}
                onChange={(event) => update("ctaUrl", event.target.value)}
                placeholder="https://…"
                aria-invalid={Boolean(visibleErrors.ctaUrl || visibleErrors.cta)}
              />
            </Field>
          </div>
        </fieldset>

        {/* Productos */}
        <fieldset className="space-y-3 rounded-xl border bg-card p-4 shadow sm:p-5" disabled={isBusy}>
          <legend className="sr-only">Productos destacados</legend>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Productos destacados</h3>
            <span
              className="text-xs text-muted-foreground tabular-nums"
              aria-live="polite"
            >
              {form.productIds.length}/{MAX_PRODUCTS} elegidos
            </span>
          </div>

          {products.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              Todavía no hay productos cargados en el catálogo.
            </p>
          ) : (
            <>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  type="search"
                  value={productQuery}
                  onChange={(event) => setProductQuery(event.target.value)}
                  placeholder="Buscar producto"
                  aria-label="Buscar producto para destacar"
                  className="pl-9"
                />
              </div>

              <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
                {filteredProducts.map((product) => {
                  const checked = form.productIds.includes(product.id)
                  const limitReached =
                    !checked && form.productIds.length >= MAX_PRODUCTS
                  const checkboxId = `${uid}-product-${product.id}`

                  return (
                    <li key={product.id}>
                      <label
                        htmlFor={checkboxId}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 p-2.5 transition-colors hover:bg-muted/50",
                          limitReached && "cursor-not-allowed opacity-50 hover:bg-transparent"
                        )}
                      >
                        <Checkbox
                          id={checkboxId}
                          checked={checked}
                          disabled={limitReached}
                          onCheckedChange={(value) =>
                            toggleProduct(product.id, value === true)
                          }
                        />
                        <ProductThumb url={product.image_url} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {product.name}
                          </span>
                          <span className="block text-xs text-muted-foreground tabular-nums">
                            {formatCurrency(product.price)}
                          </span>
                        </span>
                      </label>
                    </li>
                  )
                })}
                {filteredProducts.length === 0 && (
                  <li className="p-4 text-center text-sm text-muted-foreground">
                    No hay productos que coincidan con la búsqueda.
                  </li>
                )}
              </ul>
            </>
          )}
        </fieldset>

        {/* Envío */}
        <div className="space-y-3 rounded-xl border bg-card p-4 shadow sm:p-5">
          <p className="text-xs text-muted-foreground">
            Cada mail incluye un link de baja automático. Antes de mandarla a
            todos, enviate una prueba para ver cómo queda.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              disabled={isBusy}
              onClick={handleTest}
            >
              {busy === "test" ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <MailCheck aria-hidden="true" />
              )}
              {busy === "test" ? "Enviando prueba…" : "Enviar prueba a mi mail"}
            </Button>
            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={isBusy || noSubscribers}
              onClick={handleOpenConfirm}
            >
              {busy === "send" ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Send aria-hidden="true" />
              )}
              {busy === "send"
                ? "Enviando…"
                : `Enviar a ${subscriberCount} ${pluralize(subscriberCount, "suscriptor", "suscriptores")}`}
            </Button>
          </div>
          {noSubscribers && (
            <p className="text-xs text-muted-foreground">
              Todavía no hay suscriptores: podés enviarte pruebas, pero el envío
              masivo se habilita cuando haya al menos uno.
            </p>
          )}

          <div aria-live="polite" role="status">
            {result?.status === "success" && (
              <ResultPanel kind={result.kind} data={result.data} />
            )}
            {result?.status === "error" && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-medium">
                    {result.kind === "test"
                      ? "No se pudo enviar la prueba"
                      : "No se pudo enviar la campaña"}
                  </p>
                  <p className="text-xs">{result.message}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Vista previa */}
      <div className="xl:sticky xl:top-4 xl:self-start">
        <EmailPreview form={form} selectedProducts={selectedProducts} />
      </div>

      <ConfirmActionDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="¿Enviar la campaña a todos los suscriptores?"
        description={
          <span className="block space-y-2">
            <span className="block">
              Asunto: <strong className="text-foreground">{form.subject.trim()}</strong>
            </span>
            <span className="block">
              Se va a enviar a{" "}
              <strong className="text-foreground">
                {subscriberCount} {pluralize(subscriberCount, "suscriptor", "suscriptores")}
              </strong>
              . Esta acción no se puede deshacer.
            </span>
          </span>
        }
        confirmLabel={`Sí, enviar a ${subscriberCount}`}
        busy={busy === "send"}
        onConfirm={handleConfirmSend}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------

interface FieldProps {
  id: string
  label: string
  children: ReactNode
  required?: boolean
  hint?: string
  error?: string
  counter?: string
}

function Field({ id, label, children, required, hint, error, counter }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>
          {label}
          {required && <span className="ml-0.5 text-red-600">*</span>}
        </Label>
        {counter && (
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {counter}
          </span>
        )}
      </div>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p className="text-xs text-red-700 dark:text-red-300" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function ProductThumb({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false)

  if (!url || failed) {
    return (
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground"
        aria-hidden="true"
      >
        <ImageIcon className="h-4 w-4" />
      </span>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-10 w-10 shrink-0 rounded-md border object-cover"
    />
  )
}

function ResultPanel({ kind, data }: { kind: SendKind; data: CampaignResult }) {
  const partial = data.failed > 0

  return (
    <div
      className={cn(
        "rounded-lg border p-3 text-sm",
        partial
          ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
          : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100"
      )}
    >
      <p className="flex items-center gap-2 font-medium">
        {partial ? (
          <CircleAlert className="h-4 w-4" aria-hidden="true" />
        ) : (
          <CircleCheck className="h-4 w-4" aria-hidden="true" />
        )}
        {kind === "test"
          ? "Prueba enviada a tu mail"
          : partial
            ? "Campaña enviada con errores"
            : "Campaña enviada"}
      </p>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md bg-background/70 p-2">
          <dd className="text-lg font-bold tabular-nums">{data.sent}</dd>
          <dt className="text-[11px] opacity-80">Enviados</dt>
        </div>
        <div className="rounded-md bg-background/70 p-2">
          <dd className="text-lg font-bold tabular-nums">{data.failed}</dd>
          <dt className="text-[11px] opacity-80">Fallidos</dt>
        </div>
        <div className="rounded-md bg-background/70 p-2">
          <dd className="text-lg font-bold tabular-nums">{data.total}</dd>
          <dt className="text-[11px] opacity-80">Total</dt>
        </div>
      </dl>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Vista previa (aproximada, no es el HTML final)
// ---------------------------------------------------------------------------

function EmailPreview({
  form,
  selectedProducts,
}: {
  form: FormState
  selectedProducts: Product[]
}) {
  const paragraphs = form.body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
  const imageUrl = form.imageUrl.trim()
  const ctaLabel = form.ctaLabel.trim()
  const showImage = isHttpsUrl(imageUrl)

  return (
    <section
      aria-label="Vista previa del mail"
      className="overflow-hidden rounded-xl border bg-card shadow"
    >
      <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5 text-xs font-medium text-muted-foreground">
        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
        Vista previa aproximada
      </div>

      <div className="space-y-1 border-b px-4 py-3">
        <p className="truncate text-sm font-semibold">
          {form.subject.trim() || (
            <span className="font-normal text-muted-foreground">Asunto del mail</span>
          )}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {form.preheader.trim() || "El preheader aparece acá"}
        </p>
      </div>

      <div className="bg-neutral-100 p-3 dark:bg-neutral-900 sm:p-4">
        <div className="mx-auto max-w-[480px] overflow-hidden rounded-lg bg-white text-neutral-900 shadow-sm">
          <div className="border-b px-5 py-4 text-center text-sm font-semibold uppercase tracking-[0.3em]">
            Lozach
          </div>

          {showImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt=""
              className="max-h-56 w-full object-cover"
              onError={(event) => {
                event.currentTarget.style.display = "none"
              }}
            />
          )}

          <div className="space-y-3 px-5 py-5">
            <h4 className="text-xl font-semibold leading-tight">
              {form.headline.trim() || (
                <span className="text-neutral-400">Título del mail</span>
              )}
            </h4>
            {paragraphs.length > 0 ? (
              paragraphs.map((paragraph, index) => (
                <p
                  key={index}
                  className="whitespace-pre-line text-sm leading-relaxed text-neutral-700"
                >
                  {paragraph}
                </p>
              ))
            ) : (
              <p className="text-sm text-neutral-400">
                El mensaje va a aparecer acá.
              </p>
            )}

            {ctaLabel && (
              <div className="pt-1">
                <span className="inline-block rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white">
                  {ctaLabel}
                </span>
              </div>
            )}
          </div>

          {selectedProducts.length > 0 && (
            <div className="grid grid-cols-2 gap-3 border-t px-5 py-4">
              {selectedProducts.map((product) => (
                <div key={product.id} className="space-y-1.5">
                  <div className="aspect-[3/4] overflow-hidden rounded-md bg-neutral-100">
                    {product.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.image_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-neutral-400">
                        <ImageIcon className="h-6 w-6" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                  <p className="truncate text-xs font-medium">{product.name}</p>
                  <p className="text-xs text-neutral-600 tabular-nums">
                    {formatCurrency(product.price)}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="border-t bg-neutral-50 px-5 py-3 text-center text-[11px] text-neutral-500">
            Recibís este mail porque te suscribiste al newsletter de Lozach.
            <br />
            <span className="underline">Darme de baja</span>
          </div>
        </div>
      </div>
    </section>
  )
}
