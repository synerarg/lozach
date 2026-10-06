import { SubscribersService } from "@/services/subscribers/subscribers-service"
import { requireAdminUser } from "@/lib/auth/session"
import { Subscriber } from "@/repositories/subscribers/subscribers-repository"
import { ApiResponse } from "@/types/base/types"

const subscribersService = new SubscribersService()

async function verifyAdminRole() {
  return await requireAdminUser()
}

export async function getAllSubscribersAction(): Promise<
  ApiResponse<Subscriber[]>
> {
  try {
    await verifyAdminRole()
    const subscribers = await subscribersService.getAllSubscribers()
    return {
      status: 200,
      data: subscribers,
      message: "Suscriptores obtenidos exitosamente",
    }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Error desconocido"
    return {
      status: 500,
      error: errorMessage,
    }
  }
}
