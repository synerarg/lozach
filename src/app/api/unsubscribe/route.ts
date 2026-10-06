import { NextRequest, NextResponse } from "next/server"
import { SubscribersService } from "@/services/subscribers/subscribers-service"
import { verifyUnsubscribeToken } from "@/lib/security/unsubscribe-token"

const subscribersService = new SubscribersService()

function readParams(request: NextRequest) {
  const email = request.nextUrl.searchParams.get("email")?.trim() || ""
  const token = request.nextUrl.searchParams.get("token")?.trim() || ""
  return { email, token }
}

/** Link del mail: lleva a la página de confirmación (no da de baja con un GET). */
export async function GET(request: NextRequest) {
  const { email, token } = readParams(request)
  const url = new URL("/unsubscribe", request.nextUrl.origin)
  url.searchParams.set("email", email)
  url.searchParams.set("token", token)
  return NextResponse.redirect(url)
}

/** Baja con un clic (RFC 8058): Gmail/Yahoo hacen POST sobre el header List-Unsubscribe. */
export async function POST(request: NextRequest) {
  const { email, token } = readParams(request)

  if (!email || !token || !verifyUnsubscribeToken(email, token)) {
    return NextResponse.json({ success: false }, { status: 400 })
  }

  try {
    await subscribersService.unsubscribe(email)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Unsubscribe]", error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
