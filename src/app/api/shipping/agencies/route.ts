import { CorreoArgentinoService } from "@/services/shipping/correo-argentino-service"
import { NextRequest, NextResponse } from "next/server"
import { getClientIp, rateLimit } from "@/lib/security/rate-limit"

const service = new CorreoArgentinoService()

export async function GET(request: NextRequest) {
  const limited = rateLimit(`ship-agencies:${getClientIp(request)}`, {
    limit: 40,
    windowMs: 60_000,
  })

  if (!limited.ok) {
    return NextResponse.json(
      { success: false, message: "Demasiadas consultas. Probá de nuevo en un momento." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } }
    )
  }

  try {
    const province = (request.nextUrl.searchParams.get("province")?.trim() || "").slice(0, 60)
    const postalCode =
      request.nextUrl.searchParams.get("postalCode")?.trim() || undefined
    const city = request.nextUrl.searchParams.get("city")?.trim() || undefined
    const limitParam = request.nextUrl.searchParams.get("limit")
    const parsedLimit = limitParam ? Number(limitParam) : undefined
    const limit = Number.isFinite(parsedLimit) && (parsedLimit as number) > 0
      ? Math.min(parsedLimit as number, 50)
      : 30

    if (!province) {
      return NextResponse.json(
        {
          success: false,
          message: "La provincia es requerida para listar sucursales.",
        },
        { status: 400 }
      )
    }

    const agencies = await service.getAgencies({
      province,
      postalCode,
      city,
      limit,
    })

    return NextResponse.json(agencies)
  } catch (error) {
    console.error("[shipping:agencies]", error)
    return NextResponse.json(
      {
        success: false,
        message: "No se pudieron obtener las sucursales.",
      },
      { status: 500 }
    )
  }
}
