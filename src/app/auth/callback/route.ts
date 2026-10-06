import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createClient as createAdminClient } from "@/lib/supabase/admin-client"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  // if "next" is in param, use it as the redirect URL
  const next = searchParams.get("next") ?? "/"

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const user = data.session?.user
      if (user) {
        // El perfil se crea con service role (la tabla users ya no permite
        // INSERT desde el cliente: evita que alguien se asigne role = admin).
        // El rol NUNCA se toma del cliente: queda el default (customer).
        const { error: insertError } = await createAdminClient()
          .from("users")
          .upsert(
            {
              id: user.id,
              email: user.email,
              name:
                user.user_metadata?.full_name ??
                user.user_metadata?.name ??
                "Sin nombre",
            },
            { onConflict: "id", ignoreDuplicates: true }
          )
        if (insertError) {
          console.error(
            "Error al insertar/actualizar el usuario:",
            insertError.message
          )
        }
      }

      const forwardedHost = request.headers.get("x-forwarded-host") // original origin before load balancer
      const isLocalEnv = process.env.NODE_ENV === "development"
      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`)
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`)
      } else {
        return NextResponse.redirect(`${origin}${next}`)
      }
    } else {
      console.log("Error exchanging code for session:", error.message)
    }
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
