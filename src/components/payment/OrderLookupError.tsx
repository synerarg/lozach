import { LogIn, Package, RefreshCw, Search } from "lucide-react"

import {
  PaymentStatusShell,
  ShellButton,
  ShellLink,
} from "./PaymentStatusShell"
import type { SnapshotError } from "./useOrderSnapshot"

interface OrderLookupErrorProps {
  /** `null` = la URL no trae referencia de pedido. */
  error: SnapshotError | null
  loginHref: string
  onRetry?: () => void
}

/** Errores al buscar la orden: sin sesión, no encontrada, fallo del servidor o link incompleto. */
export function OrderLookupError({
  error,
  loginHref,
  onRetry,
}: OrderLookupErrorProps) {
  if (error?.kind === "auth") {
    return (
      <PaymentStatusShell
        tone="info"
        title="Iniciá sesión para ver tu pedido"
        description="Por seguridad, solo podés ver tus pedidos desde tu cuenta. Si ya pagaste, tu compra no se pierde: entrá y la vas a encontrar en Mis pedidos."
        actions={
          <>
            <ShellLink href={loginHref} icon={<LogIn />}>
              Iniciar sesión
            </ShellLink>
            <ShellLink href="/" variant="secondary">
              Volver al inicio
            </ShellLink>
          </>
        }
      />
    )
  }

  if (error?.kind === "not_found") {
    return (
      <PaymentStatusShell
        tone="info"
        title="No encontramos este pedido"
        description="Revisá que el link sea el correcto y que hayas iniciado sesión con la cuenta con la que compraste. También podés buscarlo en Mis pedidos."
        actions={
          <>
            <ShellLink href="/profile/my-orders" icon={<Package />}>
              Ver mis pedidos
            </ShellLink>
            <ShellLink href="/" variant="secondary">
              Volver al inicio
            </ShellLink>
          </>
        }
      />
    )
  }

  if (error?.kind === "failed") {
    return (
      <PaymentStatusShell
        tone="danger"
        title="No pudimos verificar tu pedido"
        description="Hubo un problema al consultar el estado. Si ya pagaste, quedate tranquilo: el pago se registra igual y te avisamos por mail."
        actions={
          <>
            {onRetry && (
              <ShellButton onClick={onRetry} icon={<RefreshCw />}>
                Reintentar
              </ShellButton>
            )}
            <ShellLink
              href="/profile/my-orders"
              variant="secondary"
              icon={<Package />}
            >
              Ver mis pedidos
            </ShellLink>
          </>
        }
      />
    )
  }

  return (
    <PaymentStatusShell
      tone="info"
      icon={<Search className="h-8 w-8 text-neutral-700" />}
      title="Falta la referencia del pedido"
      description="Este link está incompleto. Podés encontrar el estado de tus compras en Mis pedidos."
      actions={
        <>
          <ShellLink href="/profile/my-orders" icon={<Package />}>
            Ver mis pedidos
          </ShellLink>
          <ShellLink href="/" variant="secondary">
            Volver al inicio
          </ShellLink>
        </>
      }
    />
  )
}
