"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { ArrowRight, Loader2, ShoppingBag } from "lucide-react"
import { toast } from "sonner"

import {
  createBankTransferOrder,
  createCashStoreOrder,
  createPreference,
} from "@/controllers/payment/payment-controller"
import { useCart } from "@/context/CartContext"
import { actionErrorHandler } from "@/lib/handlers/actionErrorHandler"
import { PaymentSchema } from "@/lib/validations/payment-schema"
import {
  BANK_TRANSFER_DISCOUNT_PERCENT_LABEL,
  BANK_TRANSFER_PAYMENT_TYPE,
  CASH_STORE_DISCOUNT_PERCENT_LABEL,
  CASH_STORE_PAYMENT_TYPE,
  MERCADO_PAGO_PAYMENT_TYPE,
  TRANSFER_PAYMENT_WINDOW_MS,
  calculateBankTransferDiscount,
  calculateCashStoreDiscount,
} from "@/lib/utils/payment-utils"
import { ARGENTINA_PROVINCES } from "@/lib/consts/shipping"
import { Address } from "@/types/address/address"
import { AppActionException } from "@/types/exceptions"
import {
  CheckoutShippingMethod,
  CorreoArgentinoAgency,
  ShippingQuote,
} from "@/types/shipping/shipping"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type CheckoutForm = {
  identifier: string
  address: string
  details: string
  postal_code: string
  city: string
  state: string
  phone: string
  shipping_method: CheckoutShippingMethod
  agency_code?: string
  agency_name?: string
  agency_address?: string
  save_info: boolean
}

type CheckoutPaymentMethod =
  | typeof MERCADO_PAGO_PAYMENT_TYPE
  | typeof BANK_TRANSFER_PAYMENT_TYPE
  | typeof CASH_STORE_PAYMENT_TYPE

const EMPTY_FORM = {
  identifier: "",
  address: "",
  details: "",
  postal_code: "",
  city: "",
  state: "",
  phone: "",
  agency_code: "",
  agency_name: "",
  agency_address: "",
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)

const FIELD_LABELS: Record<string, string> = {
  identifier: "DNI / CUIT",
  address: "Dirección",
  details: "Detalles",
  postal_code: "Código postal",
  city: "Ciudad",
  state: "Provincia",
  phone: "Teléfono",
  agency_code: "Sucursal",
  shipping_method: "Método de entrega",
}

/** Convierte los fieldErrors del servidor en líneas legibles ("Teléfono: mensaje"). */
const flattenFieldErrors = (
  fieldErrors?: Record<string, string[]>
): string[] => {
  if (!fieldErrors) return []

  const lines: string[] = []
  for (const [field, messages] of Object.entries(fieldErrors)) {
    const label = FIELD_LABELS[field]
    for (const message of messages) {
      lines.push(label ? `${label}: ${message}` : message)
    }
  }
  return Array.from(new Set(lines))
}

const formatTransferWindow = (ms: number) => {
  const minutes = Math.max(1, Math.round(ms / 60000))
  if (minutes % 60 === 0) {
    const hours = minutes / 60
    return hours === 1 ? "1 hora" : `${hours} horas`
  }
  return `${minutes} minutos`
}

type SubmitError = { message: string; details: string[] }

const mapAddressToForm = (address: Address) => ({
  identifier: String(address.identifier),
  address: address.address,
  details: address.details || "",
  postal_code: String(address.postal_code),
  city: address.city,
  state: address.state,
  phone: address.phone,
  agency_code: "",
  agency_name: "",
  agency_address: "",
})

export default function CheckoutClient({
  address,
}: {
  address: Address | null
}) {
  const { cartItems, subtotal, clearCart } = useCart()
  const router = useRouter()
  const isSubmittingRef = useRef(false)

  const [method, setMethod] = useState<CheckoutShippingMethod>("home")
  const [paymentMethod, setPaymentMethod] = useState<CheckoutPaymentMethod>(
    MERCADO_PAGO_PAYMENT_TYPE
  )
  const [saveInfo, setSaveInfo] = useState(false)
  const [useSavedAddress, setUseSavedAddress] = useState(Boolean(address))
  const [isLoading, setIsLoading] = useState(false)
  const [isRedirecting, setIsRedirecting] = useState(false)
  const [submitError, setSubmitError] = useState<SubmitError | null>(null)
  const [isQuoting, setIsQuoting] = useState(false)
  const [isLoadingAgencies, setIsLoadingAgencies] = useState(false)
  const [quote, setQuote] = useState<ShippingQuote | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [agenciesError, setAgenciesError] = useState<string | null>(null)
  const [agencies, setAgencies] = useState<CorreoArgentinoAgency[]>([])

  const [formData, setFormData] = useState<CheckoutForm>({
    ...(address ? mapAddressToForm(address) : EMPTY_FORM),
    shipping_method: "home",
    save_info: false,
  })

  const quoteItems = useMemo(
    () =>
      cartItems.map((item) => ({
        id: item.id,
        quantity: item.quantity,
      })),
    [cartItems]
  )

  // Si el usuario vuelve con "Atrás" desde Mercado Pago (bfcache), el botón no
  // debe quedar trabado en "Procesando".
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        isSubmittingRef.current = false
        setIsLoading(false)
        setIsRedirecting(false)
      }
    }
    window.addEventListener("pageshow", onPageShow)
    return () => window.removeEventListener("pageshow", onPageShow)
  }, [])

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      shipping_method: method,
      save_info: saveInfo,
    }))
  }, [method, saveInfo])

  useEffect(() => {
    if (method !== "branch") {
      setAgencies([])
      setAgenciesError(null)
      setFormData((prev) => ({
        ...prev,
        agency_code: "",
        agency_name: "",
        agency_address: "",
      }))
    }
  }, [method])

  useEffect(() => {
    if (method !== "store" && paymentMethod === CASH_STORE_PAYMENT_TYPE) {
      setPaymentMethod(MERCADO_PAGO_PAYMENT_TYPE)
    }
  }, [method, paymentMethod])

  useEffect(() => {
    if (method === "store") {
      setQuote({
        cost: 0,
        estimatedDays: null,
        provider: "Correo Argentino",
        weightKg: 0,
        source: "fallback",
        deliveredType: "D",
      })
      setQuoteError(null)
      return
    }

    let destinationPostalCode = ""

    if (method === "branch") {
      if (!formData.agency_code) {
        setQuote(null)
        setQuoteError(null)
        return
      }
      const agency = agencies.find(
        (item) => item.code === formData.agency_code
      )
      destinationPostalCode =
        (agency?.postalCode || "").trim() || formData.postal_code.trim()
    } else {
      destinationPostalCode = formData.postal_code.trim()
    }

    if (!destinationPostalCode) {
      setQuote(null)
      setQuoteError(null)
      return
    }

    let cancelled = false
    const timeoutId = window.setTimeout(async () => {
      setIsQuoting(true)
      setQuoteError(null)

      try {
        const endpoint =
          method === "branch"
            ? "/api/shipping/calculate-branch"
            : "/api/shipping/calculate"
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            products: quoteItems,
            postalCode: destinationPostalCode,
          }),
        })
        const payload = await response.json()

        if (!response.ok) {
          throw new Error(payload.message || "No se pudo cotizar el envío.")
        }

        if (!cancelled) {
          setQuote(payload as ShippingQuote)
        }
      } catch (error) {
        if (!cancelled) {
          setQuote(null)
          setQuoteError(
            error instanceof Error ? error.message : "No se pudo cotizar el envío."
          )
        }
      } finally {
        if (!cancelled) {
          setIsQuoting(false)
        }
      }
    }, 300)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [
    formData.postal_code,
    formData.agency_code,
    method,
    quoteItems,
    agencies,
  ])

  useEffect(() => {
    if (method !== "branch") {
      return
    }

    if (!formData.state.trim()) {
      setAgencies([])
      setAgenciesError(null)
      return
    }

    let cancelled = false
    const timeoutId = window.setTimeout(async () => {
      setIsLoadingAgencies(true)
      setAgenciesError(null)

      try {
        const params = new URLSearchParams({
          province: formData.state.trim(),
        })

        if (formData.postal_code.trim()) {
          params.set("postalCode", formData.postal_code.trim())
        }
        if (formData.city.trim()) {
          params.set("city", formData.city.trim())
        }

        const response = await fetch(`/api/shipping/agencies?${params}`)
        const payload = await response.json()

        if (!response.ok) {
          throw new Error(
            payload.message || "No se pudieron cargar las sucursales."
          )
        }

        if (!cancelled) {
          const nextAgencies = payload as CorreoArgentinoAgency[]
          setAgencies(nextAgencies)
          if (
            formData.agency_code &&
            !nextAgencies.some((agency) => agency.code === formData.agency_code)
          ) {
            setFormData((prev) => ({
              ...prev,
              agency_code: "",
              agency_name: "",
              agency_address: "",
            }))
          }
        }
      } catch (error) {
        if (!cancelled) {
          setAgencies([])
          setAgenciesError(
            error instanceof Error
              ? error.message
              : "No se pudieron cargar las sucursales."
          )
        }
      } finally {
        if (!cancelled) {
          setIsLoadingAgencies(false)
        }
      }
    }, 300)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [formData.agency_code, formData.city, formData.postal_code, formData.state, method])

  const shippingCost = method === "store" ? 0 : quote?.cost ?? null
  const transferDiscount =
    paymentMethod === BANK_TRANSFER_PAYMENT_TYPE
      ? calculateBankTransferDiscount(subtotal)
      : 0
  const cashStoreDiscount =
    paymentMethod === CASH_STORE_PAYMENT_TYPE
      ? calculateCashStoreDiscount(subtotal)
      : 0
  const total =
    subtotal - transferDiscount - cashStoreDiscount + (shippingCost ?? 0)
  const selectedAgency = agencies.find(
    (agency) => agency.code === formData.agency_code
  )
  const getMethodCostLabel = (targetMethod: CheckoutShippingMethod) => {
    if (targetMethod === "store") {
      return "Gratis"
    }

    if (method !== targetMethod) {
      return "A calcular"
    }

    if (isQuoting) {
      return "Calculando..."
    }

    return shippingCost === null ? "A calcular" : formatCurrency(shippingCost)
  }

  const setField = (field: keyof CheckoutForm, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const useSaved = () => {
    if (!address) return
    setFormData((prev) => ({
      ...prev,
      ...mapAddressToForm(address),
      shipping_method: method,
      save_info: saveInfo,
    }))
    setUseSavedAddress(true)
  }

  const useNewAddress = () => {
    setFormData((prev) => ({
      ...prev,
      ...EMPTY_FORM,
      shipping_method: method,
      save_info: saveInfo,
    }))
    setUseSavedAddress(false)
  }

  const handleAgencyChange = (agencyCode: string) => {
    const agency = agencies.find((item) => item.code === agencyCode)
    setFormData((prev) => ({
      ...prev,
      agency_code: agency?.code || "",
      agency_name: agency?.name || "",
      agency_address: agency?.address || "",
    }))
  }

  const reportSubmitError = (message: string, details: string[] = []) => {
    setSubmitError({ message, details })
    toast.error(message)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (isSubmittingRef.current) return

    setSubmitError(null)

    if (method === "branch" && !formData.agency_code) {
      reportSubmitError("Seleccioná una sucursal de Correo Argentino.")
      return
    }
    if (method !== "store" && shippingCost === null) {
      reportSubmitError("Completá el código postal para calcular el envío.")
      return
    }
    // Es una cotización: el servidor recalcula el costo final al crear la orden.
    const finalShippingCost = shippingCost ?? 0

    isSubmittingRef.current = true
    setIsLoading(true)
    // Si ya estamos navegando (MP / pantalla de pago) el botón sigue deshabilitado.
    let isNavigating = false

    try {
      const validated = PaymentSchema.safeParse(formData)
      if (!validated.success) {
        const details = Array.from(
          new Set(validated.error.issues.map((issue) => issue.message))
        )
        reportSubmitError("Revisá los datos del formulario.", details)
        return
      }

      const paymentPayload = {
        identifier: formData.identifier,
        address: formData.address,
        details: formData.details,
        postal_code: formData.postal_code,
        city: formData.city,
        state: formData.state,
        phone: formData.phone,
        shipping_method: formData.shipping_method,
        shipping_cost: finalShippingCost,
        agency_code: formData.agency_code,
        agency_name: formData.agency_name,
        agency_address: formData.agency_address,
        save_info: formData.save_info,
        products: cartItems.map((item) => ({
          id: item.id,
          quantity: item.quantity,
          color: item.color,
          size: item.size,
        })),
      }

      if (paymentMethod === BANK_TRANSFER_PAYMENT_TYPE) {
        const order = await actionErrorHandler(async () =>
          createBankTransferOrder(paymentPayload)
        )

        if (order.success && order.data) {
          isNavigating = true
          setIsRedirecting(true)
          clearCart()
          router.push(order.data.redirect_url)
          return
        }

        reportSubmitError(order.message || "No se pudo crear el pedido.")
        return
      }

      if (paymentMethod === CASH_STORE_PAYMENT_TYPE) {
        if (method !== "store") {
          reportSubmitError("El pago en efectivo requiere retiro en tienda.")
          return
        }

        const order = await actionErrorHandler(async () =>
          createCashStoreOrder(paymentPayload)
        )

        if (order.success && order.data) {
          isNavigating = true
          setIsRedirecting(true)
          clearCart()
          router.push(order.data.redirect_url)
          return
        }

        reportSubmitError(order.message || "No se pudo crear el pedido.")
        return
      }

      const preference = await actionErrorHandler(async () =>
        createPreference(paymentPayload)
      )

      if (preference.success && preference.data) {
        isNavigating = true
        router.push(preference.data.init_point as string)
      } else {
        reportSubmitError(
          preference.message || "No se pudo crear la preferencia de pago."
        )
      }
    } catch (error) {
      if (error instanceof AppActionException) {
        if (error.statusCode === 401) {
          isNavigating = true
          toast.error("Tu sesión expiró. Iniciá sesión para continuar.")
          router.push("/login?redirect=%2Fcheckout&reason=checkout")
          return
        }

        // El servidor ya devuelve el mensaje listo para mostrar (ej. "El talle
        // elegido de X ya no está disponible"): se muestra tal cual.
        reportSubmitError(error.message, flattenFieldErrors(error.fieldErrors))
        return
      }

      console.error("[checkout] submit", error)
      reportSubmitError(
        "No pudimos procesar tu pedido. Revisá tu conexión e intentá de nuevo."
      )
    } finally {
      if (!isNavigating) {
        setIsLoading(false)
        isSubmittingRef.current = false
      }
    }
  }

  if (cartItems.length === 0 && isRedirecting) {
    return (
      <div
        role="status"
        className="min-h-screen py-24 justify-center items-center flex"
      >
        <div className="flex flex-col items-center gap-3 text-center px-4">
          <Loader2 className="h-8 w-8 animate-spin text-gray-700" />
          <p className="font-medium text-gray-900">Pedido creado</p>
          <p className="text-sm text-gray-600">
            Te llevamos a la pantalla de pago…
          </p>
        </div>
      </div>
    )
  }

  if (cartItems.length === 0) {
    return (
      <div className="min-h-screen py-24 justify-center items-center flex">
        <Card className="max-w-xl w-full mx-4 text-center">
          <CardContent className="p-8 space-y-4">
            <div className="w-20 h-20 mx-auto rounded-full bg-gray-100 flex items-center justify-center">
              <ShoppingBag className="h-10 w-10 text-black" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Tu carrito está vacío</h1>
              <p className="text-gray-600">
                Agregá productos para continuar con la compra.
              </p>
            </div>
            <Button onClick={() => (window.location.href = "/products")}>
              Ver productos
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen py-24">
      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Finalizar compra
            </h1>
            <p className="text-gray-600">
              Cotización con Correo Argentino y métodos de pago disponibles.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="grid gap-8 lg:grid-cols-2">
            <div className="space-y-6">
              {address && (
                <Card>
                  <CardHeader>
                    <CardTitle>Dirección guardada</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <p>{address.address}</p>
                    <p>
                      {address.city}, {address.state} - {address.postal_code}
                    </p>
                    <p>{address.phone}</p>
                    <div className="flex gap-3">
                      <Button type="button" onClick={useSaved} disabled={useSavedAddress}>
                        Usar esta dirección
                      </Button>
                      <Button type="button" variant="outline" onClick={useNewAddress}>
                        Cargar otra
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>Método de entrega</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <RadioGroup
                    value={method}
                    onValueChange={(value) =>
                      setMethod(value as CheckoutShippingMethod)
                    }
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="home" id="home" />
                      <Label htmlFor="home" className="flex-1 cursor-pointer">
                        A domicilio
                      </Label>
                      <span>
                        {getMethodCostLabel("home")}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="branch" id="branch" />
                      <Label htmlFor="branch" className="flex-1 cursor-pointer">
                        Retiro en sucursal Correo Argentino
                      </Label>
                      <span>
                        {getMethodCostLabel("branch")}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="store" id="store" />
                      <Label htmlFor="store" className="flex-1 cursor-pointer">
                        Retiro en tienda
                      </Label>
                      <span className="text-green-600">
                        {getMethodCostLabel("store")}
                      </span>
                    </div>
                  </RadioGroup>

                  {method === "branch" && (
                    <div className="space-y-3 border rounded-lg p-4">
                      <Label>Sucursal</Label>
                      {!formData.state.trim() ? (
                        <p className="text-sm text-gray-600">
                          Completá provincia, ciudad y código postal en Datos de
                          entrega para ver las sucursales disponibles.
                        </p>
                      ) : (
                        <>
                          <Select
                            value={formData.agency_code}
                            onValueChange={handleAgencyChange}
                            disabled={
                              isLoadingAgencies || agencies.length === 0
                            }
                          >
                            <SelectTrigger>
                              <SelectValue
                                placeholder={
                                  isLoadingAgencies
                                    ? "Cargando sucursales..."
                                    : "Seleccioná una sucursal"
                                }
                              />
                            </SelectTrigger>
                            <SelectContent
                              position="popper"
                              side="bottom"
                              sideOffset={4}
                              avoidCollisions={false}
                              className="max-h-72"
                            >
                              {agencies.map((agency) => (
                                <SelectItem
                                  key={agency.code}
                                  value={agency.code}
                                >
                                  {agency.name} - {agency.address}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {agencies.length > 0 && (
                            <p className="text-xs text-gray-500">
                              {agencies.length} sucursales disponibles para los
                              datos ingresados.
                            </p>
                          )}
                        </>
                      )}
                      {selectedAgency && (
                        <div className="text-sm text-gray-600 rounded-md bg-gray-50 p-3">
                          <p className="font-medium">{selectedAgency.name}</p>
                          <p>{selectedAgency.address}</p>
                          <p>
                            {selectedAgency.city}, {selectedAgency.province}{" "}
                            {selectedAgency.postalCode}
                          </p>
                        </div>
                      )}
                      {agenciesError && (
                        <p className="text-sm text-red-600">{agenciesError}</p>
                      )}
                    </div>
                  )}

                  {quoteError && method !== "store" && (
                    <p className="text-sm text-amber-700" role="alert">
                      {quoteError.replace(/[.\s]+$/, "")}. Revisá el código postal
                      para poder continuar.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Datos de entrega</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label htmlFor="identifier">DNI / CUIT</Label>
                      <Input
                        id="identifier"
                        value={formData.identifier}
                        onChange={(e) => setField("identifier", e.target.value)}
                        disabled={useSavedAddress}
                      />
                    </div>
                    <div>
                      <Label htmlFor="phone">Teléfono</Label>
                      <Input
                        id="phone"
                        value={formData.phone}
                        onChange={(e) => setField("phone", e.target.value)}
                        disabled={useSavedAddress}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="address">
                      Dirección {method === "store" ? "(opcional)" : ""}
                    </Label>
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) => setField("address", e.target.value)}
                      disabled={useSavedAddress}
                    />
                  </div>
                  <div>
                    <Label htmlFor="details">Detalles</Label>
                    <Input
                      id="details"
                      value={formData.details}
                      onChange={(e) => setField("details", e.target.value)}
                      disabled={useSavedAddress}
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <Label htmlFor="postal_code">Código postal</Label>
                      <Input
                        id="postal_code"
                        value={formData.postal_code}
                        onChange={(e) => setField("postal_code", e.target.value)}
                        disabled={useSavedAddress}
                      />
                    </div>
                    <div>
                      <Label htmlFor="city">Ciudad</Label>
                      <Input
                        id="city"
                        value={formData.city}
                        onChange={(e) => setField("city", e.target.value)}
                        disabled={useSavedAddress}
                      />
                    </div>
                    <div>
                      <Label htmlFor="state">Provincia</Label>
                      <Select
                        value={formData.state}
                        onValueChange={(value) => setField("state", value)}
                        disabled={useSavedAddress}
                      >
                        <SelectTrigger id="state">
                          <SelectValue placeholder="Seleccioná una provincia" />
                        </SelectTrigger>
                        <SelectContent>
                          {ARGENTINA_PROVINCES.map((province) => (
                            <SelectItem key={province} value={province}>
                              {province}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="save-info"
                      checked={saveInfo}
                      onCheckedChange={(checked) => setSaveInfo(Boolean(checked))}
                      disabled={method === "store"}
                    />
                    <Label htmlFor="save-info" className="text-sm">
                      Guardar estos datos para futuras compras
                    </Label>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Método de pago</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <RadioGroup
                    value={paymentMethod}
                    onValueChange={(value) =>
                      setPaymentMethod(value as CheckoutPaymentMethod)
                    }
                  >
                    <div className="flex items-center space-x-2 rounded-lg border p-3">
                      <RadioGroupItem
                        value={MERCADO_PAGO_PAYMENT_TYPE}
                        id="payment-mercadopago"
                      />
                      <Label
                        htmlFor="payment-mercadopago"
                        className="flex-1 cursor-pointer"
                      >
                        Mercado Pago
                      </Label>
                      <span className="text-sm text-gray-500">
                        Sin descuento
                      </span>
                    </div>
                    <div className="flex items-center space-x-2 rounded-lg border border-green-200 bg-green-50 p-3">
                      <RadioGroupItem
                        value={BANK_TRANSFER_PAYMENT_TYPE}
                        id="payment-bank-transfer"
                      />
                      <Label
                        htmlFor="payment-bank-transfer"
                        className="flex-1 cursor-pointer"
                      >
                        Transferencia bancaria
                      </Label>
                      <span className="text-sm font-medium text-green-700">
                        {BANK_TRANSFER_DISCOUNT_PERCENT_LABEL} OFF
                      </span>
                    </div>
                    <div
                      className={`flex items-center space-x-2 rounded-lg border p-3 ${
                        method === "store"
                          ? "border-green-200 bg-green-50"
                          : "border-gray-200 bg-gray-50 opacity-60"
                      }`}
                    >
                      <RadioGroupItem
                        value={CASH_STORE_PAYMENT_TYPE}
                        id="payment-cash-store"
                        disabled={method !== "store"}
                      />
                      <Label
                        htmlFor="payment-cash-store"
                        className="flex-1 cursor-pointer"
                      >
                        Efectivo en tienda (al retirar)
                      </Label>
                      <span className="text-sm font-medium text-green-700">
                        {CASH_STORE_DISCOUNT_PERCENT_LABEL} OFF
                      </span>
                    </div>
                  </RadioGroup>
                  {paymentMethod === BANK_TRANSFER_PAYMENT_TYPE && (
                    <p className="text-sm text-gray-600">
                      El descuento se aplica sobre los productos. El envío se
                      suma aparte. Tendrás{" "}
                      {formatTransferWindow(TRANSFER_PAYMENT_WINDOW_MS)} para
                      enviar el comprobante.
                    </p>
                  )}
                  {paymentMethod === CASH_STORE_PAYMENT_TYPE && (
                    <p className="text-sm text-gray-600">
                      Pagás en efectivo cuando retires el pedido en la tienda.
                      Solo disponible con retiro en tienda.
                    </p>
                  )}
                  {method !== "store" && (
                    <p className="text-xs text-gray-500">
                      El pago en efectivo solo está disponible si elegís Retiro
                      en tienda.
                    </p>
                  )}
                </CardContent>
              </Card>

            </div>

            <Card>
              <CardHeader>
                <CardTitle>Resumen del pedido</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {cartItems.map((item) => (
                  <div key={`${item.id}-${item.size}-${item.color}`} className="flex gap-4">
                    <div className="relative h-16 w-16 overflow-hidden rounded">
                      <Image
                        src={item.image_url || "/example-image.jpg"}
                        alt={item.name}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{item.name}</p>
                      <p className="text-sm text-gray-500">
                        {item.color} · {item.size} · x{item.quantity}
                      </p>
                    </div>
                    <p className="font-medium">
                      {formatCurrency(item.price * item.quantity)}
                    </p>
                  </div>
                ))}

                <div className="border-t pt-4 space-y-2">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>{formatCurrency(subtotal)}</span>
                  </div>
                  {paymentMethod === BANK_TRANSFER_PAYMENT_TYPE && (
                    <div className="flex justify-between text-green-700">
                      <span>
                        Descuento transferencia (
                        {BANK_TRANSFER_DISCOUNT_PERCENT_LABEL})
                      </span>
                      <span>-{formatCurrency(transferDiscount)}</span>
                    </div>
                  )}
                  {paymentMethod === CASH_STORE_PAYMENT_TYPE && (
                    <div className="flex justify-between text-green-700">
                      <span>
                        Descuento efectivo (
                        {CASH_STORE_DISCOUNT_PERCENT_LABEL})
                      </span>
                      <span>-{formatCurrency(cashStoreDiscount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Envío</span>
                    <span>
                      {method === "store"
                        ? "Gratis"
                        : isQuoting
                          ? "Calculando..."
                          : shippingCost === null
                            ? "A calcular"
                            : formatCurrency(shippingCost)}
                    </span>
                  </div>
                  <div className="flex justify-between text-lg font-bold border-t pt-2">
                    <span>
                      {method !== "store" && shippingCost === null
                        ? "Total parcial"
                        : "Total"}
                    </span>
                    <span>{formatCurrency(total)}</span>
                  </div>
                </div>

                {method !== "store" && (
                  <p className="text-xs text-gray-500">
                    El costo de envío es una cotización: el valor final se
                    confirma al pagar.
                  </p>
                )}

                {method !== "store" && quote && (
                  <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
                    <p>
                      {quote.provider} · {quote.weightKg.toFixed(2)} kg estimados
                    </p>
                    {quote.estimatedDays && (
                      <p>{quote.estimatedDays} días hábiles aproximados</p>
                    )}
                    {quote.source === "fallback" && (
                      <p className="text-amber-700">
                        Tarifa estimada hasta completar la configuración de MiCorreo.
                      </p>
                    )}
                  </div>
                )}

                {submitError && (
                  <div
                    role="alert"
                    className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
                  >
                    <p className="font-medium">{submitError.message}</p>
                    {submitError.details.length > 0 && (
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        {submitError.details.map((detail) => (
                          <li key={detail}>{detail}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full h-12"
                  aria-busy={isLoading}
                  disabled={
                    isLoading ||
                    isQuoting ||
                    (method !== "store" && shippingCost === null) ||
                    (method === "branch" && !formData.agency_code)
                  }
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      Procesando <Loader2 className="w-4 h-4 animate-spin" />
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      {paymentMethod === BANK_TRANSFER_PAYMENT_TYPE
                        ? "Crear pedido por transferencia"
                        : paymentMethod === CASH_STORE_PAYMENT_TYPE
                          ? "Reservar pedido para retirar"
                          : "Proceder al pago"}{" "}
                      <ArrowRight className="w-4 h-4" />
                    </span>
                  )}
                </Button>
              </CardContent>
            </Card>
          </form>
        </div>
      </div>
    </div>
  )
}
