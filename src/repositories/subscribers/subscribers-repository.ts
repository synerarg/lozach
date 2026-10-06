import { SubscriberCreationException } from "@/exceptions/subscribers/subscribers-exceptions"
import { createClient as createAdminClient } from "@/lib/supabase/admin-client"

export interface Subscriber {
  id: string
  created_at: string
  email: string
}

export type CreateSubscriberResult = "created" | "already_subscribed"

export class SubscribersRepository {
  async getAllSubscribers(): Promise<Subscriber[]> {
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from("subscribers")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      throw new Error(error.message)
    }

    return (data as Subscriber[]) || []
  }

  async createSubscriber(email: string): Promise<CreateSubscriberResult> {
    const supabase = createAdminClient()

    const { error } = await supabase.from("subscribers").insert({
      email: email.trim().toLowerCase(),
    })

    if (error) {
      // 23505 = unique_violation: ya estaba suscripto, no es un error para el usuario.
      if (error.code === "23505") {
        return "already_subscribed"
      }
      throw new SubscriberCreationException(error.message)
    }

    return "created"
  }

  async deleteSubscriberByEmail(email: string): Promise<void> {
    const supabase = createAdminClient()

    const { error } = await supabase
      .from("subscribers")
      .delete()
      .ilike("email", email.trim())

    if (error) {
      throw new Error(error.message)
    }
  }
}
