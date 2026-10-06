import type { ComponentProps, ReactNode } from "react"
import Link from "next/link"
import {
  CheckCircle2,
  Clock,
  Info,
  Loader2,
  XCircle,
  type LucideIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { SUPPORT_EMAIL } from "@/lib/config/site"
import { cn } from "@/lib/utils"

export type ShellTone = "success" | "pending" | "danger" | "info" | "loading"

const TONE_STYLES: Record<
  ShellTone,
  { wrapper: string; icon: string; Icon: LucideIcon }
> = {
  success: {
    wrapper: "bg-emerald-50 ring-emerald-100",
    icon: "text-emerald-600",
    Icon: CheckCircle2,
  },
  pending: {
    wrapper: "bg-amber-50 ring-amber-100",
    icon: "text-amber-600",
    Icon: Clock,
  },
  danger: {
    wrapper: "bg-red-50 ring-red-100",
    icon: "text-red-600",
    Icon: XCircle,
  },
  info: {
    wrapper: "bg-neutral-100 ring-neutral-200",
    icon: "text-neutral-700",
    Icon: Info,
  },
  loading: {
    wrapper: "bg-neutral-100 ring-neutral-200",
    icon: "text-neutral-700",
    Icon: Loader2,
  },
}

export interface PaymentStatusShellProps {
  tone: ShellTone
  title: string
  /** Texto corto de apoyo bajo el título. */
  description?: ReactNode
  /** Reemplaza el ícono del estado (usar un ícono de lucide con className heredado). */
  icon?: ReactNode
  /** Resumen del pedido (monto, N° de pedido, etc.). */
  summary?: ReactNode
  /** Contenido principal entre el resumen y las acciones. */
  children?: ReactNode
  /** Botones / links. Se apilan en mobile. */
  actions?: ReactNode
  /** Texto que leen los lectores de pantalla cuando cambia el estado. Por defecto, el título. */
  announce?: string
  /** Ancho máximo del contenedor. */
  size?: "md" | "lg"
  /** Oculta el pie de soporte (por ejemplo, en el estado de carga). */
  hideSupport?: boolean
}

/**
 * Layout común de las pantallas de pago (success / pending / failure): ícono de
 * estado, título, descripción, resumen, acciones y pie con soporte.
 */
export function PaymentStatusShell({
  tone,
  title,
  description,
  icon,
  summary,
  children,
  actions,
  announce,
  size = "md",
  hideSupport = false,
}: PaymentStatusShellProps) {
  const styles = TONE_STYLES[tone]
  const Icon = styles.Icon

  return (
    <main
      className="min-h-screen bg-neutral-50 px-4 py-24"
      aria-busy={tone === "loading"}
    >
      <div
        className={cn(
          "mx-auto w-full",
          size === "lg" ? "max-w-2xl" : "max-w-md"
        )}
      >
        <Card className="overflow-hidden rounded-xl border-neutral-200 bg-white text-neutral-900 shadow-sm">
          <p role="status" aria-live="polite" className="sr-only">
            {announce ?? title}
          </p>

          <div className="px-5 pb-6 pt-8 text-center sm:px-8">
            <div
              aria-hidden="true"
              className={cn(
                "mx-auto flex h-16 w-16 items-center justify-center rounded-full ring-8",
                styles.wrapper
              )}
            >
              {icon ?? (
                <Icon
                  className={cn(
                    "h-8 w-8",
                    styles.icon,
                    tone === "loading" && "animate-spin motion-reduce:animate-none"
                  )}
                />
              )}
            </div>
            <h1 className="mt-5 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
              {title}
            </h1>
            {description && (
              <div className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-neutral-600 sm:text-base">
                {description}
              </div>
            )}
          </div>

          {summary && <div className="px-5 pb-6 sm:px-8">{summary}</div>}

          {children && (
            <div className="space-y-6 px-5 pb-6 sm:px-8">{children}</div>
          )}

          {actions && (
            <div className="flex flex-col gap-3 px-5 pb-6 sm:flex-row sm:flex-wrap sm:justify-center sm:px-8">
              {actions}
            </div>
          )}

          {!hideSupport && (
            <footer className="border-t border-neutral-200 bg-neutral-50 px-5 py-4 text-center text-xs text-neutral-600 sm:px-8">
              ¿Necesitás ayuda? Escribinos a{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="font-medium text-neutral-900 underline underline-offset-2 hover:text-neutral-700"
              >
                {SUPPORT_EMAIL}
              </a>
            </footer>
          )}
        </Card>
      </div>
    </main>
  )
}

/** Skeleton accesible para el `fallback` de Suspense y el estado "verificando". */
export function PaymentLoadingShell({
  label = "Cargando…",
}: {
  label?: string
}) {
  return (
    <PaymentStatusShell
      tone="loading"
      title={label}
      description="Un momento, estamos consultando el estado de tu pedido."
      hideSupport
    >
      <div className="space-y-3" aria-hidden="true">
        <Skeleton className="h-4 w-2/3 mx-auto" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-11 w-full rounded-md" />
      </div>
    </PaymentStatusShell>
  )
}

const PRIMARY_BUTTON =
  "h-11 w-full bg-black text-white hover:bg-neutral-800 sm:w-auto sm:min-w-44"
const SECONDARY_BUTTON = "h-11 w-full sm:w-auto sm:min-w-44"

type ShellLinkProps = {
  href: string
  variant?: "primary" | "secondary"
  icon?: ReactNode
  children: ReactNode
} & Omit<ComponentProps<typeof Link>, "href" | "className" | "children">

/** Botón-link con el estilo estándar de las pantallas de pago (target táctil de 44px). */
export function ShellLink({
  href,
  variant = "primary",
  icon,
  children,
  ...rest
}: ShellLinkProps) {
  return (
    <Button
      asChild
      variant={variant === "primary" ? "default" : "outline"}
      className={variant === "primary" ? PRIMARY_BUTTON : SECONDARY_BUTTON}
    >
      <Link href={href} {...rest}>
        {icon}
        {children}
      </Link>
    </Button>
  )
}

type ShellButtonProps = {
  variant?: "primary" | "secondary"
  icon?: ReactNode
} & Omit<ComponentProps<typeof Button>, "variant" | "className" | "asChild">

export function ShellButton({
  variant = "primary",
  icon,
  children,
  ...rest
}: ShellButtonProps) {
  return (
    <Button
      type="button"
      variant={variant === "primary" ? "default" : "outline"}
      className={variant === "primary" ? PRIMARY_BUTTON : SECONDARY_BUTTON}
      {...rest}
    >
      {icon}
      {children}
    </Button>
  )
}

/** Link de soporte con asunto prellenado (usa la constante, no un mail hardcodeado). */
export function ShellSupportLink({
  subject,
  children = "Escribir a soporte",
}: {
  subject?: string
  children?: ReactNode
}) {
  const href = subject
    ? `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`
    : `mailto:${SUPPORT_EMAIL}`

  return (
    <Button asChild variant="outline" className={SECONDARY_BUTTON}>
      <a href={href}>{children}</a>
    </Button>
  )
}
