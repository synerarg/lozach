"use server"

import { actionHandler } from "@/lib/handlers/actionHandler"
import { requireSelfOrAdmin } from "@/lib/auth/session"
import { AddressesService } from "@/services/addresses/addresses-service"

const addressesService = new AddressesService()

export const getAddress = async (userId: string) => {
  return actionHandler(async () => {
    await requireSelfOrAdmin(userId)

    const address = await addressesService.getAddress(userId)

    return address
  })
}
