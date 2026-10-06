import { SHIPPING_COSTS } from "@/lib/consts/shipping"
import {
  extractAgencyCode,
  normalizeShippingMethod,
  shouldUseCorreoArgentino,
} from "@/lib/utils/shipping-utils"
import { ProductService } from "@/services/products/product-service"
import { OrderItem } from "@/types/order-items/order-items"
import { Order } from "@/types/order/order"
import {
  CheckoutShippingMethod,
  CorreoArgentinoAgency,
  Shipping,
  ShippingQuote,
  ShippingStatus,
} from "@/types/shipping/shipping"

type QuoteParams = {
  deliveryMethod: CheckoutShippingMethod
  destinationPostalCode: string
  items: Array<{ id?: number; quantity: number }>
}

type AgenciesParams = {
  province: string
  postalCode?: string
  city?: string
  limit?: number
}

type ImportShipmentParams = {
  order: Order
  orderItems: OrderItem[]
  shipping: Shipping
  recipientName: string
  recipientEmail: string
}

type TokenResponse = {
  token: string
  expire?: string
  expires?: string
}

type ParsedRate = {
  deliveredType?: "D" | "S"
  price: number | null
  estimatedDays: number | null
}

export type ImportShipmentResult = {
  trackingNumber: string | null
  trackingUrl: string | null
}

type TrackingEvent = {
  text: string
  status: ShippingStatus | null
}

export type TrackingResult = {
  events: TrackingEvent[]
  status: ShippingStatus | null
  lastEventText: string | null
}

// Mayor rango = estado más avanzado. Se usa para elegir el evento más reciente
// sin depender del orden en que la API devuelva el historial.
export const STATUS_RANK: Record<ShippingStatus, number> = {
  draft: 0,
  ready: 1,
  shipped: 2,
  cancelled: 3,
  delivered: 4,
}

const productService = new ProductService()

// Sin timeout, un Correo Argentino lento deja colgados el checkout y el webhook.
const REQUEST_TIMEOUT_MS = 12_000

const PROVINCE_CODES: Record<string, string> = {
  salta: "A",
  "provincia de buenos aires": "B",
  "buenos aires provincia": "B",
  "buenos aires": "B",
  "ciudad autonoma buenos aires": "C",
  "ciudad autonoma de buenos aires": "C",
  "capital federal": "C",
  caba: "C",
  "san luis": "D",
  "entre rios": "E",
  "la rioja": "F",
  "santiago del estero": "G",
  chaco: "H",
  "san juan": "J",
  catamarca: "K",
  "la pampa": "L",
  mendoza: "M",
  misiones: "N",
  formosa: "P",
  neuquen: "Q",
  "rio negro": "R",
  "santa fe": "S",
  tucuman: "T",
  chubut: "U",
  "tierra del fuego": "V",
  corrientes: "W",
  cordoba: "X",
  jujuy: "Y",
  "santa cruz": "Z",
}

export class CorreoArgentinoService {
  private static tokenCache:
    | {
        token: string
        expiresAt: number
      }
    | null = null

  private readonly apiUrl: string
  private readonly username?: string
  private readonly password?: string
  private readonly customerId?: string
  private readonly originPostalCode?: string

  constructor() {
    this.apiUrl =
      process.env.CORREO_ARGENTINO_API_URL ||
      (process.env.NODE_ENV === "production"
        ? "https://api.correoargentino.com.ar/micorreo/v1"
        : "https://apitest.correoargentino.com.ar/micorreo/v1")

    this.username = process.env.CORREO_ARGENTINO_USER
    this.password = process.env.CORREO_ARGENTINO_PASSWORD
    this.customerId = process.env.CORREO_ARGENTINO_CUSTOMER_ID
    this.originPostalCode =
      process.env.CORREO_ARGENTINO_SENDER_ZIP_CODE ||
      process.env.CORREO_ARGENTINO_ORIGIN_POSTAL_CODE
  }

  async quoteShipping(params: QuoteParams): Promise<ShippingQuote> {
    const deliveredType = params.deliveryMethod === "branch" ? "S" : "D"

    if (!this.isQuoteConfigured()) {
      return await this.getFallbackQuote(deliveredType, params.items)
    }

    try {
      const dimensions = await this.getPackageDimensions(params.items)
      const payload = {
        customerId: this.customerId,
        postalCodeOrigin: this.originPostalCode,
        postalCodeDestination: params.destinationPostalCode,
        deliveredType,
        dimensions,
      }

      const response = await this.request<unknown>("/rates", {
        method: "POST",
        body: payload,
      })

      const rates = this.extractCollection(response)
        .map((item) => this.parseRate(item))
        .filter((rate): rate is ParsedRate => Boolean(rate))

      const rate =
        rates.find((item) => item.deliveredType === deliveredType) || rates[0]

      if (!rate || rate.price === null) {
        return await this.getFallbackQuote(deliveredType, params.items)
      }

      const weightKg = payload.dimensions.weight / 1000

      return {
        cost: normalizeQuoteCost(rate.price),
        estimatedDays: rate.estimatedDays,
        provider: "Correo Argentino",
        weightKg,
        source: "api",
        deliveredType,
      }
    } catch (error) {
      console.error("[CorreoArgentino:quoteShipping]", error)
      return await this.getFallbackQuote(deliveredType, params.items)
    }
  }

  async getAgencies(params: AgenciesParams): Promise<CorreoArgentinoAgency[]> {
    if (!this.isAgencyConfigured()) {
      throw new Error(
        "Falta CORREO_ARGENTINO_CUSTOMER_ID para consultar sucursales."
      )
    }

    const provinceCode = this.getProvinceCode(params.province)

    if (!provinceCode) {
      throw new Error("No pudimos mapear la provincia al código de MiCorreo.")
    }

    const query = new URLSearchParams({
      customerId: this.customerId as string,
      provinceCode,
      services: "pickup_availability",
    })

    const response = await this.request<unknown>(`/agencies?${query}`, {
      method: "GET",
    })

    const agencies = this.extractCollection(response)
      .map((agency) => this.parseAgency(agency))
      .filter((agency): agency is CorreoArgentinoAgency => Boolean(agency))
    const filteredAgencies = this.filterAgencies(agencies, params)
    const rankedAgencies = this.rankAgencies(filteredAgencies, params)

    if (typeof params.limit === "number" && params.limit > 0) {
      return rankedAgencies.slice(0, params.limit)
    }

    return rankedAgencies
  }

  async importShipment(
    params: ImportShipmentParams
  ): Promise<ImportShipmentResult | null> {
    const shippingMethod = normalizeShippingMethod(params.shipping.shipping_method)

    if (!shouldUseCorreoArgentino(params.shipping.shipping_method)) {
      return null
    }

    this.assertImportConfiguration()

    const provinceCode = this.getProvinceCode(params.shipping.state)

    if (!provinceCode) {
      throw new Error(
        `No pudimos mapear la provincia "${params.shipping.state}" a MiCorreo.`
      )
    }

    const sender = this.getSenderConfig()
    const recipientAddress = splitStreetAddress(params.shipping.address)
    const { weight, height, width, length } = await this.getPackageDimensions(
      params.orderItems.map((item) => ({
        id: item.product_id ?? undefined,
        quantity: item.quantity,
      }))
    )

    const payload = {
      customerId: this.customerId,
      extOrderId: params.order.id,
      orderNumber:
        params.order.external_reference?.slice(-12) || params.order.id.slice(0, 8),
      sender: {
        name: sender.name,
        phone: sender.phone,
        cellPhone: sender.cellPhone,
        email: sender.email,
        originAddress: {
          streetName: sender.street,
          streetNumber: sender.streetNumber,
          floor: sender.floor,
          apartment: sender.department,
          city: sender.city,
          provinceCode: sender.provinceCode,
          postalCode: sender.zipCode,
        },
      },
      recipient: {
        name: params.recipientName,
        phone: params.shipping.phone,
        cellPhone: params.shipping.phone,
        email: params.recipientEmail,
      },
      shipping: {
        deliveryType: shippingMethod === "branch" ? "S" : "D",
        agency:
          shippingMethod === "branch"
            ? extractAgencyCode(params.shipping.details)
            : null,
        address: {
          streetName: recipientAddress.streetName,
          streetNumber: recipientAddress.streetNumber,
          floor: "",
          apartment: "",
          city: params.shipping.city,
          provinceCode,
          postalCode: String(params.shipping.postal_code),
        },
        productType: "CP",
        weight,
        declaredValue: Number(params.order.subtotal.toFixed(2)),
        height,
        length,
        width,
      },
    }

    if (shippingMethod === "branch" && !payload.shipping.agency) {
      throw new Error(
        "La orden de sucursal no tiene el código de agencia necesario para importar el envío."
      )
    }

    try {
      const response = await this.request<unknown>("/shipping/import", {
        method: "POST",
        body: payload,
      })
      return this.parseImportResult(response)
    } catch (error) {
      const message = getErrorMessage(error)
      if (message.toLowerCase().includes("ya fue importada")) {
        return null
      }

      throw error
    }
  }

  async getTracking(params: {
    trackingNumber: string
  }): Promise<TrackingResult | null> {
    if (!this.isAgencyConfigured() || !params.trackingNumber) {
      return null
    }

    const query = new URLSearchParams({
      customerId: this.customerId as string,
      trackingNumber: params.trackingNumber,
    })

    try {
      const response = await this.request<unknown>(
        `/shipping/tracking?${query}`,
        { method: "GET" }
      )

      const events = this.parseTrackingEvents(response)

      let status: ShippingStatus | null = null
      let lastEventText: string | null = null

      for (const event of events) {
        if (!event.status) {
          continue
        }
        if (status === null || STATUS_RANK[event.status] > STATUS_RANK[status]) {
          status = event.status
          lastEventText = event.text
        }
      }

      if (!lastEventText && events.length > 0) {
        lastEventText = events[events.length - 1].text
      }

      return { events, status, lastEventText }
    } catch (error) {
      console.error("[CorreoArgentino:getTracking]", error)
      return null
    }
  }

  private parseImportResult(response: unknown): ImportShipmentResult {
    const root = getRecord(response) || {}
    // El contrato de respuesta de /shipping/import no está verificado, así que
    // buscamos el tracking tanto en la raíz como en contenedores anidados comunes.
    const candidates: Record<string, unknown>[] = [
      root,
      getRecord(root.order) || {},
      getRecord(root.shipping) || {},
      getRecord(root.data) || {},
      getRecord(root.result) || {},
    ]

    let trackingNumber: string | null = null
    let trackingUrl: string | null = null

    for (const record of candidates) {
      if (!trackingNumber) {
        trackingNumber =
          getString(
            record.trackingNumber ||
              record.tracking ||
              record.trackingId ||
              record.trackingCode ||
              record.shippingId ||
              record.shipmentId
          ) || null
      }

      if (!trackingUrl) {
        trackingUrl =
          getHttpsUrl(
            record.trackingUrl || record.url || record.labelUrl
          ) || null
      }
    }

    return { trackingNumber, trackingUrl }
  }

  private parseTrackingEvents(response: unknown): TrackingEvent[] {
    const collection = this.extractTrackingCollection(response)

    return collection
      .map((raw) => {
        const text = extractTrackingEventText(raw)
        return { text, status: mapTrackingTextToStatus(text) }
      })
      .filter((event) => Boolean(event.text))
  }

  private extractTrackingCollection(response: unknown): unknown[] {
    if (Array.isArray(response)) {
      return response
    }

    if (!response || typeof response !== "object") {
      return []
    }

    const record = response as Record<string, unknown>
    const collectionKeys = [
      "events",
      "tracking",
      "trackingHistory",
      "history",
      "movements",
      "results",
      "data",
      "items",
    ]

    for (const key of collectionKeys) {
      if (Array.isArray(record[key])) {
        return record[key] as unknown[]
      }
    }

    // La API puede devolver un único evento como objeto plano.
    if (extractTrackingEventText(record)) {
      return [record]
    }

    return []
  }

  private isQuoteConfigured(): boolean {
    return Boolean(
      this.username && this.password && this.customerId && this.originPostalCode
    )
  }

  private isAgencyConfigured(): boolean {
    return Boolean(this.username && this.password && this.customerId)
  }

  private assertImportConfiguration(): void {
    const sender = this.getSenderConfig()

    if (
      !this.username ||
      !this.password ||
      !this.customerId ||
      !sender.street ||
      !sender.streetNumber ||
      !sender.city ||
      !sender.provinceCode ||
      !sender.zipCode
    ) {
      throw new Error(
        "Falta configurar Correo Argentino completo. Revisá customerId y remitente."
      )
    }
  }

  private getSenderConfig() {
    return {
      name: process.env.CORREO_ARGENTINO_SENDER_NAME || "Lozach",
      phone: process.env.CORREO_ARGENTINO_SENDER_PHONE || "",
      cellPhone: process.env.CORREO_ARGENTINO_SENDER_CELLPHONE || "",
      email:
        process.env.CORREO_ARGENTINO_SENDER_EMAIL || "lozacharg@gmail.com",
      street: process.env.CORREO_ARGENTINO_SENDER_STREET || "",
      streetNumber: process.env.CORREO_ARGENTINO_SENDER_STREET_NUMBER || "",
      floor: process.env.CORREO_ARGENTINO_SENDER_FLOOR || "",
      department: process.env.CORREO_ARGENTINO_SENDER_DEPARTMENT || "",
      city: process.env.CORREO_ARGENTINO_SENDER_CITY || "",
      provinceCode:
        this.getProvinceCode(process.env.CORREO_ARGENTINO_SENDER_STATE || "") ||
        "",
      zipCode:
        process.env.CORREO_ARGENTINO_SENDER_ZIP_CODE ||
        process.env.CORREO_ARGENTINO_ORIGIN_POSTAL_CODE ||
        "",
    }
  }

  private async getFallbackQuote(
    deliveredType: "D" | "S",
    items: Array<{ id?: number; quantity: number }>
  ): Promise<ShippingQuote> {
    const deliveryMethod = deliveredType === "S" ? "branch" : "home"
    const metrics = await this.getPackageDimensions(items)

    return {
      cost: SHIPPING_COSTS[deliveryMethod],
      estimatedDays: deliveryMethod === "branch" ? 4 : 5,
      provider: "Correo Argentino",
      weightKg: metrics.weight / 1000,
      source: "fallback",
      deliveredType,
    }
  }

  private async getPackageDimensions(
    items: Array<{ id?: number; quantity: number }>
  ) {
    const totalItems = Math.max(
      1,
      items.reduce((sum, item) => sum + Math.min(Number(item.quantity || 0), 100), 0)
    )
    const baseWeight = Number(
      process.env.CORREO_ARGENTINO_DEFAULT_WEIGHT_GRAMS || 500
    )
    const baseHeight = Number(
      process.env.CORREO_ARGENTINO_DEFAULT_HEIGHT_CM || 10
    )
    const baseWidth = Number(
      process.env.CORREO_ARGENTINO_DEFAULT_WIDTH_CM || 20
    )
    const baseLength = Number(
      process.env.CORREO_ARGENTINO_DEFAULT_LENGTH_CM || 15
    )
    const productsById = await this.getProductsById(items)
    let totalWeight = 0
    let maxHeight = baseHeight
    let maxWidth = baseWidth
    let maxLength = baseLength

    for (const item of items) {
      const product = item.id ? productsById.get(item.id) : undefined
      const quantity = Math.max(1, Number(item.quantity || 1))
      const weight = product?.shipping_weight_grams || baseWeight
      const height = product?.shipping_height_cm || baseHeight
      const width = product?.shipping_width_cm || baseWidth
      const length = product?.shipping_length_cm || baseLength

      totalWeight += weight * quantity
      maxHeight = Math.max(maxHeight, height)
      maxWidth = Math.max(maxWidth, width)
      maxLength = Math.max(maxLength, length)
    }

    return {
      weight: Math.min(
        25000,
        Math.max(1, totalWeight || totalItems * baseWeight)
      ),
      height: Math.min(150, maxHeight + Math.max(0, totalItems - 1) * 2),
      width: Math.min(150, maxWidth),
      length: Math.min(150, maxLength + Math.max(0, totalItems - 1) * 2),
    }
  }

  private async getProductsById(items: Array<{ id?: number }>) {
    const ids = Array.from(
      new Set(
        items
          .map((item) => item.id)
          .filter((id): id is number => typeof id === "number")
      )
    )

    if (ids.length === 0) {
      return new Map()
    }

    try {
      const products = await productService.getProductsByIds(ids)
      return new Map(products.map((product) => [product.id, product]))
    } catch (error) {
      console.error("[CorreoArgentino:getProductsById]", error)
      return new Map()
    }
  }

  private parseRate(rawRate: unknown): ParsedRate | null {
    if (!rawRate || typeof rawRate !== "object") {
      return null
    }

    const rate = rawRate as Record<string, unknown>
    const deliveredType = getString(rate.deliveredType || rate.deliveryType)
      .toUpperCase()
      .slice(0, 1)
    const price = getNumber(
      rate.price ||
        rate.totalPrice ||
        rate.total ||
        rate.amount ||
        rate.rate ||
        rate.value
    )
    const estimatedDays = getNumber(
      rate.deliveryTimeMax ||
        rate.deliveryTimeMin ||
        rate.estimatedDays ||
        rate.days
    )

    return {
      deliveredType:
        deliveredType === "D" || deliveredType === "S" ? deliveredType : undefined,
      price,
      estimatedDays,
    }
  }

  private extractCollection(response: unknown): unknown[] {
    if (Array.isArray(response)) {
      return response
    }

    if (!response || typeof response !== "object") {
      return []
    }

    const record = response as Record<string, unknown>
    const collectionKeys = ["rates", "agencies", "data", "items", "results"]

    for (const key of collectionKeys) {
      if (Array.isArray(record[key])) {
        return record[key] as unknown[]
      }
    }

    return []
  }

  private parseAgency(rawAgency: unknown): CorreoArgentinoAgency | null {
    if (!rawAgency || typeof rawAgency !== "object") {
      return null
    }

    const agency = rawAgency as Record<string, unknown>
    const location = getRecord(agency.location) || {}
    const address =
      getRecord(location.address) ||
      getRecord(agency.address) ||
      getRecord(agency.domicile) ||
      {}

    const fullAddressText = getString(
      agency.fullAddress ||
        agency.fullDescription ||
        agency.formattedAddress ||
        agency.addressDescription
    )
    const postalCode =
      getString(
        address.postalCode ||
          address.zipCode ||
          address.cp ||
          address.cpa ||
          address.codigoPostal ||
          address.codPostal ||
          location.postalCode ||
          location.zipCode ||
          location.codigoPostal ||
          agency.postalCode ||
          agency.zipCode ||
          agency.cp ||
          agency.cpa ||
          agency.codigoPostal ||
          agency.codPostal
      ) ||
      extractPostalCodeFromText(fullAddressText) ||
      ""

    const street = [
      getString(
        address.streetName ||
          address.street ||
          address.calle ||
          agency.streetName ||
          agency.street ||
          agency.calle
      ),
      getString(
        address.streetNumber ||
          address.number ||
          address.altura ||
          agency.streetNumber ||
          agency.number ||
          agency.altura
      ),
    ]
      .filter(Boolean)
      .join(" ")
    const code = getString(
      agency.code ||
        agency.agencyCode ||
        agency.branchCode ||
        agency.officeCode ||
        agency.id
    )

    return {
      code,
      name:
        getString(
          agency.name ||
            agency.agencyName ||
            agency.branchName ||
            agency.officeName ||
            agency.description
        ) || "Sucursal Correo Argentino",
      address:
        street ||
        getString(agency.address || location.address || agency.domicile) ||
        "Dirección no informada",
      city:
        getString(
          address.city ||
            address.locality ||
            address.localidad ||
            location.city ||
            location.locality ||
            agency.city ||
            agency.locality ||
            agency.localidad
        ) ||
        "",
      province:
        getString(
          address.province ||
            location.province ||
            agency.province ||
            agency.provinceName
        ) ||
        "",
      postalCode: String(postalCode),
      phone: getString(agency.phone || agency.telephone || agency.tel) || null,
    }
  }

  private filterAgencies(
    agencies: CorreoArgentinoAgency[],
    params: AgenciesParams
  ): CorreoArgentinoAgency[] {
    const postalCode = getNumericPostalCode(params.postalCode || "")
    const city = normalizeText(params.city || "")
    let candidates = agencies

    if (postalCode.length >= 2) {
      candidates = this.filterByPostalCodeProximity(candidates, postalCode)
    }

    if (city) {
      const cityMatches = candidates.filter((agency) => {
        const agencyCity = normalizeText(agency.city)
        const agencyAddress = normalizeText(agency.address)

        return agencyCity.includes(city) || agencyAddress.includes(city)
      })

      if (cityMatches.length > 0) {
        candidates = cityMatches
      }
    }

    return candidates.filter((agency) => agency.code)
  }

  private filterByPostalCodeProximity(
    agencies: CorreoArgentinoAgency[],
    postalCode: string
  ): CorreoArgentinoAgency[] {
    const minPrefixLength = 2

    for (
      let prefixLength = postalCode.length;
      prefixLength >= minPrefixLength;
      prefixLength--
    ) {
      const prefix = postalCode.slice(0, prefixLength)
      const matches = agencies.filter((agency) =>
        getNumericPostalCode(agency.postalCode).startsWith(prefix)
      )

      if (matches.length > 0) {
        return matches
      }
    }

    return agencies
  }

  private rankAgencies(
    agencies: CorreoArgentinoAgency[],
    params: AgenciesParams
  ): CorreoArgentinoAgency[] {
    const postalCode = getNumericPostalCode(params.postalCode || "")
    const city = normalizeText(params.city || "")

    return [...agencies].sort((left, right) => {
      return (
        this.getAgencyScore(right, postalCode, city) -
        this.getAgencyScore(left, postalCode, city)
      )
    })
  }

  private getAgencyScore(
    agency: CorreoArgentinoAgency,
    postalCode: string,
    city: string
  ): number {
    let score = 0

    if (postalCode) {
      const agencyPostalCode = getNumericPostalCode(agency.postalCode)

      if (agencyPostalCode === postalCode) {
        score += 6
      } else if (agencyPostalCode.startsWith(postalCode.slice(0, 3))) {
        score += 3
      } else if (agencyPostalCode.startsWith(postalCode.slice(0, 2))) {
        score += 1
      }
    }

    const agencyCity = normalizeText(agency.city)
    if (city && agencyCity.includes(city)) {
      score += 2
    }

    if (agency.phone) {
      score += 1
    }

    return score
  }

  private getProvinceCode(province: string): string | null {
    return PROVINCE_CODES[normalizeText(province)] || null
  }

  private async getToken(): Promise<string> {
    const cached = CorreoArgentinoService.tokenCache
    if (cached && cached.expiresAt > Date.now() + 60_000) {
      return cached.token
    }

    if (!this.username || !this.password) {
      throw new Error("Faltan CORREO_ARGENTINO_USER y CORREO_ARGENTINO_PASSWORD.")
    }

    const credentials = Buffer.from(
      `${this.username}:${this.password}`,
      "utf8"
    ).toString("base64")

    const response = await fetch(`${this.apiUrl}/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    const payload = (await response.json().catch(() => ({}))) as TokenResponse

    if (!response.ok || !payload.token) {
      throw new Error("No se pudo obtener el token de Correo Argentino.")
    }

    const expiresRaw = payload.expire || payload.expires
    const expiresAt = expiresRaw
      ? new Date(expiresRaw.replace(" ", "T")).getTime()
      : Date.now() + 14 * 60 * 1000

    CorreoArgentinoService.tokenCache = {
      token: payload.token,
      expiresAt,
    }

    return payload.token
  }

  private async request<T>(
    path: string,
    init: {
      method: "GET" | "POST"
      body?: unknown
    }
  ): Promise<T> {
    const token = await this.getToken()
    const response = await fetch(`${this.apiUrl}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    const rawText = await response.text()

    if (!response.ok) {
      throw new Error(
        rawText?.slice(0, 500) ||
          `Error de Correo Argentino (${response.status})`
      )
    }

    try {
      return (rawText ? JSON.parse(rawText) : {}) as T
    } catch {
      throw new Error("Correo Argentino devolvió una respuesta inválida.")
    }
  }
}

function getNumericPostalCode(value: string): string {
  return value.replace(/\D/g, "")
}

function extractPostalCodeFromText(value: string): string {
  if (!value) {
    return ""
  }

  const cpaMatch = value.match(/\b[A-Z]\d{4}[A-Z]{3}\b/i)
  if (cpaMatch) {
    return cpaMatch[0]
  }

  const numericMatch = value.match(/\b\d{4}\b/)
  return numericMatch ? numericMatch[0] : ""
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function extractTrackingEventText(raw: unknown): string {
  const record = getRecord(raw)
  if (!record) {
    return typeof raw === "string" ? raw.trim() : ""
  }

  const parts = [
    record.status,
    record.statusName,
    record.statusDescription,
    record.state,
    record.situation,
    record.situacion,
    record.event,
    record.evento,
    record.description,
    record.descripcion,
    record.motiveDescription,
    record.detail,
    record.detalle,
    record.motivo,
    record.title,
    record.titulo,
  ]
    .map((value) => getString(value))
    .filter(Boolean)

  return Array.from(new Set(parts)).join(" \u2014 ")
}

function mapTrackingTextToStatus(text: string): ShippingStatus | null {
  const normalized = normalizeText(text)
  if (!normalized) {
    return null
  }

  if (/(devolu|returned|cancelad|caduca|rechaz)/.test(normalized)) {
    return "cancelled"
  }

  // "No entregado", "intento de entrega fallido", "ausente" NO son una entrega
  // ni una cancelación: el paquete sigue en camino y se reintenta.
  if (
    /(no entregad|sin entregar|no se pudo entregar|no fue entregad|intento de entrega|entrega fallida|no pudo ser entregad|ausente)/.test(
      normalized
    )
  ) {
    return null
  }

  if (/(entregad|delivered)/.test(normalized)) {
    return "delivered"
  }
  if (
    /(distribuci|reparto|en camino|transit|despach|planta|clasificac)/.test(
      normalized
    )
  ) {
    return "shipped"
  }
  if (/(preimposicion|imposicion|admis|preparaci)/.test(normalized)) {
    return "ready"
  }

  return null
}

function splitStreetAddress(address: string) {
  const trimmed = address.trim()
  const match = trimmed.match(/^(.*?)(\d+[A-Za-z]?)$/)

  if (!match) {
    return {
      streetName: trimmed || "Sin calle",
      streetNumber: "S/N",
    }
  }

  return {
    streetName: match[1].trim() || trimmed,
    streetNumber: match[2].trim() || "S/N",
  }
}

function getString(value: unknown): string {
  if (typeof value === "string") {
    return value.trim()
  }

  if (typeof value === "number") {
    return String(value)
  }

  return ""
}

/** URLs que vienen de la API externa: solo https (se muestran como links en mails/dashboard). */
function getHttpsUrl(value: unknown): string {
  const url = getString(value)
  return url.startsWith("https://") ? url : ""
}

function getNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }

  if (typeof value === "string") {
    const normalized = value.replace(",", ".")
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null
}

function normalizeQuoteCost(value: number): number {
  const rounded = Math.round(value)
  return rounded <= 1 ? 0 : rounded
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return "Unknown Correo Argentino error"
}
