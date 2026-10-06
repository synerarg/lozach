"use client"

import { useMemo, useState } from "react"
import { Download, Mail, Search, SearchX, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Subscriber } from "@/repositories/subscribers/subscribers-repository"
import {
  dayKey,
  formatDate,
  pluralize,
} from "@/components/dashboard/format"

const PAGE_SIZE = 25

interface SubscribersTableClientProps {
  subscribers: Subscriber[]
}

/** Escapa una celda CSV y neutraliza fórmulas (=, +, -, @) para Excel/Sheets. */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}

function buildCsv(rows: Subscriber[]): string {
  const lines = [
    ["email", "fecha_alta"].map(csvCell).join(","),
    ...rows.map((row) =>
      [row.email, dayKey(row.created_at)].map(csvCell).join(",")
    ),
  ]
  return `﻿${lines.join("\r\n")}`
}

export function SubscribersTableClient({
  subscribers,
}: SubscribersTableClientProps) {
  const [query, setQuery] = useState("")
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase()
    const sorted = [...subscribers].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    return text
      ? sorted.filter((subscriber) => subscriber.email.toLowerCase().includes(text))
      : sorted
  }, [subscribers, query])

  const shown = filtered.slice(0, visibleCount)
  const isFiltered = query.trim() !== ""

  const handleExport = () => {
    if (filtered.length === 0) {
      toast.error("No hay suscriptores para exportar.")
      return
    }

    const blob = new Blob([buildCsv(filtered)], {
      type: "text/csv;charset=utf-8",
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `suscriptores-lozach-${dayKey(new Date())}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    toast.success(
      `Se exportaron ${filtered.length} ${pluralize(filtered.length, "suscriptor", "suscriptores")}.`
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow">
      <div className="flex flex-col gap-3 border-b p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div>
          <h2 className="text-base font-semibold">Suscriptores</h2>
          <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
            {filtered.length} {pluralize(filtered.length, "suscriptor", "suscriptores")}
            {isFiltered ? ` de ${subscribers.length}` : ""}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative sm:w-64">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setVisibleCount(PAGE_SIZE)
              }}
              placeholder="Buscar por email"
              aria-label="Buscar suscriptores por email"
              className="pl-9 pr-9"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Borrar búsqueda"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleExport}
            disabled={filtered.length === 0}
          >
            <Download aria-hidden="true" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {subscribers.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-14 text-center">
          <div className="mb-3 rounded-full bg-muted p-3 text-muted-foreground">
            <Mail className="h-6 w-6" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium">Todavía no hay suscriptores</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Cuando alguien se suscriba desde la tienda, aparece acá.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-14 text-center">
          <div className="mb-3 rounded-full bg-muted p-3 text-muted-foreground">
            <SearchX className="h-6 w-6" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium">Sin resultados</p>
          <p className="mt-1 text-sm text-muted-foreground">
            No hay suscriptores que coincidan con “{query.trim()}”.
          </p>
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Email</TableHead>
                <TableHead className="pr-4 text-right">Fecha de alta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((subscriber) => (
                <TableRow key={subscriber.id}>
                  <TableCell className="max-w-[220px] truncate pl-4 font-medium sm:max-w-none">
                    {subscriber.email}
                  </TableCell>
                  <TableCell className="whitespace-nowrap pr-4 text-right text-muted-foreground">
                    {formatDate(subscriber.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filtered.length > shown.length && (
            <div className="flex flex-col items-center justify-between gap-2 border-t p-3 sm:flex-row sm:px-4">
              <p className="text-xs text-muted-foreground">
                Mostrando {shown.length} de {filtered.length}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
              >
                Mostrar más
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
