import { NextRequest, NextResponse } from "next/server"
import { PaymentService } from "@/services/payment/payment-service"
import { BaseException } from "@/exceptions/base/base-exceptions"
import { detectFileType } from "@/lib/security/file-signature"

const MAX_SIZE_BYTES = 10 * 1024 * 1024

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const externalReference = formData.get("external_reference")
    const file = formData.get("file")

    if (typeof externalReference !== "string" || !externalReference.trim()) {
      return NextResponse.json(
        { success: false, message: "Referencia inválida." },
        { status: 400 }
      )
    }

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, message: "Adjuntá el comprobante." },
        { status: 400 }
      )
    }

    if (file.size === 0) {
      return NextResponse.json(
        { success: false, message: "El archivo está vacío." },
        { status: 400 }
      )
    }

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, message: "El archivo supera 10 MB." },
        { status: 400 }
      )
    }

    // El tipo declarado por el navegador no es confiable: se mira el contenido.
    const header = new Uint8Array(await file.slice(0, 16).arrayBuffer())
    if (!detectFileType(header)) {
      return NextResponse.json(
        {
          success: false,
          message: "Formato no permitido. Subí una imagen (PNG, JPG, WEBP) o un PDF.",
        },
        { status: 400 }
      )
    }

    const paymentService = new PaymentService()
    const result = await paymentService.uploadBankTransferProof(
      externalReference.trim(),
      file
    )

    return NextResponse.json({ success: true, data: result }, { status: 200 })
  } catch (error) {
    if (error instanceof BaseException) {
      return NextResponse.json(
        { success: false, message: error.userMessage },
        { status: error.statusCode || 400 }
      )
    }

    console.error("[transfer-proof:upload]", error)
    return NextResponse.json(
      { success: false, message: "Error al subir el comprobante." },
      { status: 500 }
    )
  }
}
