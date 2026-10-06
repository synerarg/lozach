import { CorreoArgentinoService } from "@/services/shipping/correo-argentino-service"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { MAX_CART_LINES, MAX_ITEM_QUANTITY } from "@/lib/config/site"
import { getClientIp, rateLimit } from "@/lib/security/rate-limit"

const service = new CorreoArgentinoService()

const schema = z.object({
  products: z
    .array(
      z.object({
        id: z.number().optional(),
        quantity: z.number().int().positive().max(MAX_ITEM_QUANTITY),
      })
    )
    .min(1)
    .max(MAX_CART_LINES),
  postalCode: z.string().trim().regex(/^\d{4,8}$/),
})

export async function POST(request: NextRequest) {
  const limited = rateLimit(`ship-calc:${getClientIp(request)}`, {
    limit: 30,
    windowMs: 60_000,
  })

  if (!limited.ok) {
    return NextResponse.json(
      { success: false, message: "Demasiadas consultas. Probá de nuevo en un momento." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } }
    )
  }

  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Datos inválidos para cotizar el envío.",
          errors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const quote = await service.quoteShipping({
      deliveryMethod: "home",
      destinationPostalCode: parsed.data.postalCode,
      items: parsed.data.products,
    })

    return NextResponse.json(quote)
  } catch (error) {
    console.error("[shipping:calculate]", error)
    return NextResponse.json(
      {
        success: false,
        message: "No se pudo cotizar el envío.",
      },
      { status: 500 }
    )
  }
}
