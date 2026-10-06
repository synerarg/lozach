import { createClient } from "@/lib/supabase/server"
import { createClient as createAdminClient } from "@/lib/supabase/admin-client"
import { StorageException } from "@/exceptions/storage/storage-exceptions"
import { detectFileType } from "@/lib/security/file-signature"

const PAYMENT_PROOFS_BUCKET = "payment-proofs"

/** Extrae la ruta dentro del bucket desde una ruta cruda o una URL pública/firmada. */
export function extractPaymentProofPath(pathOrUrl: string): string | null {
  if (!/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl.replace(/^\/+/, "") || null
  }

  const match = pathOrUrl.match(
    /\/storage\/v1\/object\/(?:public|sign|authenticated)\/payment-proofs\/([^?#]+)/
  )

  return match ? decodeURIComponent(match[1]) : null
}

export class StorageService {
  async uploadProductImages(
    productId: number,
    files: File[]
  ): Promise<{ image_url: string | null; images_urls: string[] }> {
    try {
      const supabase = await createClient()

      // Crear carpeta con el ID del producto (raíz del bucket)
      const folderPath = `${productId}`

      let image_url: string | null = null
      const images_urls: string[] = []

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const fileExt = file.name.split(".").pop()
        const fileName = `${Date.now()}-${i}.${fileExt}`
        const filePath = `${folderPath}/${fileName}`

        console.log("[StorageService] uploading", {
          bucket: "products-images",
          filePath,
          name: file.name,
          type: file.type,
          size: file.size,
        })

        // Convertir File a ArrayBuffer para el servidor
        const arrayBuffer = await file.arrayBuffer()
        const fileBuffer = Buffer.from(arrayBuffer)

        // Subir archivo
        const { data, error } = await supabase.storage
          .from("products-images")
          .upload(filePath, fileBuffer, {
            upsert: true,
            contentType: file.type || "image/jpeg",
            cacheControl: "3600",
          })

        if (error) {
          console.error(
            `[StorageService] Error uploading file ${i + 1}:`,
            error
          )
          throw new StorageException(
            `Error al subir imagen ${i + 1} (${file.name}): ${error.message}`,
            `Error al subir la imagen ${file.name}`
          )
        }

        if (!data) {
          console.error(`[StorageService] No data returned for file ${i + 1}`)
          throw new StorageException(
            `No se recibieron datos al subir imagen ${i + 1} (${file.name})`,
            `Error al subir la imagen ${file.name}`
          )
        }

        // Obtener URL pública
        const { data: publicData } = supabase.storage
          .from("products-images")
          .getPublicUrl(data.path)

        const publicUrl = publicData.publicUrl

        console.log("[StorageService] uploaded ok", {
          path: data.path,
          publicUrl,
        })

        // La primera imagen es la imagen principal
        if (i === 0) {
          image_url = publicUrl
        } else {
          images_urls.push(publicUrl)
        }

        // Pequeño delay para evitar colisiones de nombres con timestamp
        if (i < files.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 10))
        }
      }

      return { image_url, images_urls }
    } catch (error) {
      console.error("[StorageService] upload error", error)
      if (error instanceof StorageException) {
        throw error
      }
      throw new StorageException(
        "Error interno al subir imágenes",
        "Error al subir las imágenes"
      )
    }
  }

  async uploadPaymentProof(
    orderId: string,
    file: File
  ): Promise<{ proof_url: string; storage_path: string }> {
    try {
      // El bucket es privado: se sube con service role (la identidad y la
      // pertenencia de la orden ya fueron validadas en PaymentService).
      const supabase = createAdminClient()

      const arrayBuffer = await file.arrayBuffer()
      const fileBuffer = Buffer.from(arrayBuffer)

      // No confiamos en file.type ni en la extensión: se detecta por contenido.
      const detected = detectFileType(new Uint8Array(arrayBuffer.slice(0, 16)))

      if (!detected) {
        throw new StorageException(
          "Tipo de archivo de comprobante no permitido",
          "Formato no permitido. Subí una imagen (PNG, JPG, WEBP) o un PDF."
        )
      }

      const filePath = `${orderId}/${Date.now()}.${detected.ext}`

      const { data, error } = await supabase.storage
        .from(PAYMENT_PROOFS_BUCKET)
        .upload(filePath, fileBuffer, {
          upsert: false,
          contentType: detected.mime,
          cacheControl: "3600",
        })

      if (error) {
        console.error("[StorageService] payment-proof upload error", error)
        throw new StorageException(
          `Error al subir comprobante: ${error.message}`,
          "Error al subir el comprobante"
        )
      }

      if (!data) {
        throw new StorageException(
          "No se recibió respuesta al subir el comprobante",
          "Error al subir el comprobante"
        )
      }

      // Guardamos la RUTA (no una URL pública): se firma al mostrarla a admins.
      return {
        proof_url: data.path,
        storage_path: data.path,
      }
    } catch (error) {
      console.error("[StorageService] payment-proof upload error", error)
      if (error instanceof StorageException) {
        throw error
      }
      throw new StorageException(
        "Error interno al subir comprobante",
        "Error al subir el comprobante"
      )
    }
  }

  /**
   * Devuelve una URL firmada temporal para ver un comprobante. Acepta tanto la
   * ruta nueva (`<orderId>/<ts>.png`) como URLs públicas legadas del bucket.
   */
  async getPaymentProofSignedUrl(
    pathOrUrl: string | null | undefined,
    expiresInSeconds = 60 * 60
  ): Promise<string | null> {
    if (!pathOrUrl) {
      return null
    }

    const path = extractPaymentProofPath(pathOrUrl)

    if (!path) {
      return null
    }

    try {
      const supabase = createAdminClient()
      const { data, error } = await supabase.storage
        .from(PAYMENT_PROOFS_BUCKET)
        .createSignedUrl(path, expiresInSeconds)

      if (error || !data?.signedUrl) {
        console.error("[StorageService] signed url error", error)
        return null
      }

      return data.signedUrl
    } catch (error) {
      console.error("[StorageService] signed url error", error)
      return null
    }
  }

  async deleteProductImages(productId: number): Promise<void> {
    try {
      const supabase = await createClient()
      const folderPath = `${productId}`

      // Listar archivos en la carpeta
      const { data: files, error: listError } = await supabase.storage
        .from("products-images")
        .list(folderPath)

      if (listError) {
        throw new StorageException(
          `Error al listar archivos: ${listError.message}`,
          "Error al eliminar las imágenes"
        )
      }

      if (files && files.length > 0) {
        // Eliminar todos los archivos
        const filePaths = files.map((file) => `${folderPath}/${file.name}`)

        const { error: deleteError } = await supabase.storage
          .from("products-images")
          .remove(filePaths)

        if (deleteError) {
          throw new StorageException(
            `Error al eliminar archivos: ${deleteError.message}`,
            "Error al eliminar las imágenes"
          )
        }
      }
    } catch (error) {
      console.error("[StorageService] delete error", error)
      if (error instanceof StorageException) {
        throw error
      }
      throw new StorageException(
        "Error interno al eliminar imágenes",
        "Error al eliminar las imágenes"
      )
    }
  }
}
