"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { CheckCircle2, MailX, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { unsubscribeFromNewsletter } from "@/controllers/newsletter/newsletter-controller"

export function UnsubscribeClient({
  email,
  token,
}: {
  email: string
  token: string
}) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{
    success: boolean
    message: string
  } | null>(null)

  const hasParams = Boolean(email && token)

  const handleUnsubscribe = () => {
    startTransition(async () => {
      setResult(await unsubscribeFromNewsletter(email, token))
    })
  }

  return (
    <Card className="w-full max-w-md text-center">
      <CardHeader>
        <div
          className={`mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full ${
            result?.success
              ? "bg-green-100"
              : hasParams
                ? "bg-gray-100"
                : "bg-amber-100"
          }`}
        >
          {result?.success ? (
            <CheckCircle2 className="h-7 w-7 text-green-600" />
          ) : hasParams ? (
            <MailX className="h-7 w-7 text-gray-700" />
          ) : (
            <TriangleAlert className="h-7 w-7 text-amber-600" />
          )}
        </div>
        <CardTitle className="text-2xl">
          {result?.success ? "Te diste de baja" : "Darme de baja del newsletter"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {!hasParams ? (
          <p className="text-gray-600">
            Este enlace no es válido. Usá el link que figura al pie de nuestros
            mails o escribinos y te damos de baja a mano.
          </p>
        ) : result ? (
          <p className={result.success ? "text-gray-600" : "text-red-600"}>
            {result.message}
          </p>
        ) : (
          <>
            <p className="text-gray-600">
              Vas a dejar de recibir novedades y ofertas en{" "}
              <strong className="break-all">{email}</strong>. Los mails de tus
              compras te van a seguir llegando.
            </p>
            <Button
              onClick={handleUnsubscribe}
              disabled={isPending}
              className="w-full bg-black text-white hover:bg-black/90"
            >
              {isPending ? "Procesando..." : "Confirmar baja"}
            </Button>
          </>
        )}
        <Button asChild variant="outline" className="w-full">
          <Link href="/">Volver a la tienda</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
