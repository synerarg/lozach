import { ComponentType, ReactNode } from "react"

interface DetailSectionProps {
  title: string
  icon: ComponentType<{ className?: string }>
  aside?: ReactNode
  children: ReactNode
}

export function DetailSection({
  title,
  icon: Icon,
  aside,
  children,
}: DetailSectionProps) {
  return (
    <section className="rounded-xl border bg-background p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

interface InfoRowProps {
  label: string
  children: ReactNode
}

/** Fila etiqueta / valor que se apila en mobile. */
export function InfoRow({ label, children }: InfoRowProps) {
  return (
    <div className="grid gap-0.5 text-sm sm:grid-cols-[110px_1fr] sm:gap-3">
      <dt className="text-xs text-muted-foreground sm:pt-0.5">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}
