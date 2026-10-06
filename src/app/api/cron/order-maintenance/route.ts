import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { MaintenanceService } from "@/services/maintenance/maintenance-service"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const maintenanceService = new MaintenanceService()

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET

  // Sin secreto configurado no exponemos el endpoint.
  if (!secret) {
    return false
  }

  // Vercel Cron envía automáticamente `Authorization: Bearer <CRON_SECRET>`.
  const expected = Buffer.from(`Bearer ${secret}`)
  const received = Buffer.from(request.headers.get("authorization") ?? "")

  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  )
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ message: "No autorizado" }, { status: 401 })
  }

  try {
    const summary = await maintenanceService.run()
    return NextResponse.json({ success: true, ...summary }, { status: 200 })
  } catch (error) {
    console.error("[Cron:order-maintenance]", error)
    return NextResponse.json(
      { success: false, message: "Error en el mantenimiento de órdenes" },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  return handle(request)
}
