import type {
  ActiveOrder,
  KitchenTicket,
  KitchenPrintRequest,
  PosTable,
  PayOrderRequest,
  PayOrderResult,
  Product,
  ProductCategory,
} from '../../domain/pos/types'
import type {
  AccountingCashDetail,
  AccountingDeliverySalesSummary,
  AccountingMovementType,
  AccountingPaymentAccount,
  AccountingSummary,
  AccountingSyncResult,
  ManualAccountingMovement,
  UpdateAccountingMovement,
} from '../../domain/accounting/types'
import { resolveServiceUrl } from './serviceUrl'

let accessToken: string | null = null
const apiBaseUrl = resolveServiceUrl(
  import.meta.env.VITE_API_URL,
  'http://localhost:3001',
  import.meta.env.PROD,
)

export function setApiToken(token: string | null): void {
  accessToken = token
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init?.headers,
    },
  })

  return parseResponse<T>(response)
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null
    throw new Error(body?.message ?? `La solicitud falló (${response.status}).`)
  }
  return response.json() as Promise<T>
}

export function getTables(): Promise<PosTable[]> {
  return request<PosTable[]>('/tables')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

type LegacyCatalogProduct = Omit<Product, 'categoryId' | 'categoryName'> & {
  categoryId?: string
  categoryName?: string
}

function isCatalogProduct(value: unknown): value is Product {
  return (
    isRecord(value) &&
    typeof value.productId === 'string' &&
    typeof value.name === 'string' &&
    typeof value.price === 'number' &&
    typeof value.categoryId === 'string' &&
    typeof value.categoryName === 'string' &&
    Array.isArray(value.taxes)
  )
}

function isLegacyCatalogProduct(value: unknown): value is LegacyCatalogProduct {
  return (
    isRecord(value) &&
    typeof value.productId === 'string' &&
    typeof value.name === 'string' &&
    typeof value.price === 'number' &&
    Array.isArray(value.taxes) &&
    (value.categoryId === undefined || typeof value.categoryId === 'string') &&
    (value.categoryName === undefined || typeof value.categoryName === 'string')
  )
}

function isProductCategory(value: unknown): value is ProductCategory {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    Array.isArray(value.products) &&
    value.products.every(isCatalogProduct)
  )
}

export function normalizeProductCategories(payload: unknown): ProductCategory[] {
  if (!Array.isArray(payload)) {
    throw new Error('El servidor devolvió un catálogo con formato inválido.')
  }

  if (payload.length === 0) return []

  if (payload.every(isProductCategory)) return payload

  if (payload.every(isLegacyCatalogProduct)) {
    const categories = new Map<string, ProductCategory>()

    for (const product of payload) {
      const categoryId =
        typeof product.categoryId === 'string' ? product.categoryId : 'uncategorized'
      const categoryName =
        typeof product.categoryName === 'string' ? product.categoryName : 'Sin categoría'
      const category = categories.get(categoryId) ?? {
        id: categoryId,
        name: categoryName,
        products: [],
      }
      category.products.push({
        ...product,
        categoryId,
        categoryName,
      })
      categories.set(categoryId, category)
    }

    return Array.from(categories.values())
  }

  throw new Error(
    'El catálogo del servidor no tiene el formato esperado. Reinicia el back para cargar los cambios recientes.',
  )
}

export async function getProductCategories(): Promise<ProductCategory[]> {
  const payload = await request<unknown>('/products')
  return normalizeProductCategories(payload)
}

export async function getActiveOrder(tableId: string): Promise<ActiveOrder | null> {
  const response = await fetch(
    `${apiBaseUrl}/api/orders/${encodeURIComponent(tableId)}`,
    {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    },
  )

  if (response.status === 404) return null
  return parseResponse<ActiveOrder | null>(response)
}

export function updateOrderItemNotes(
  tableId: string,
  lineId: string,
  notes: string,
): Promise<void> {
  return request<void>(
    `/orders/${encodeURIComponent(tableId)}/items/${encodeURIComponent(lineId)}/notes`,
    {
      method: 'PATCH',
      body: JSON.stringify({ notes }),
    },
  )
}

export function removeOrderItem(tableId: string, lineId: string): Promise<void> {
  return request<void>(
    `/orders/${encodeURIComponent(tableId)}/items/${encodeURIComponent(lineId)}`,
    { method: 'DELETE' },
  )
}

export function cancelOrder(tableId: string): Promise<void> {
  return request<void>(`/orders/${encodeURIComponent(tableId)}`, { method: 'DELETE' })
}

export function payOrder(
  tableId: string,
  payment: PayOrderRequest,
): Promise<PayOrderResult> {
  return request<PayOrderResult>(
    `/orders/${encodeURIComponent(tableId)}/pay`,
    {
      method: 'POST',
      body: JSON.stringify(payment),
    },
  )
}

export function printKitchenOrder(printRequest: KitchenPrintRequest): Promise<void> {
  return request<void>(
    `/orders/${encodeURIComponent(printRequest.tableId)}/print`,
    { method: 'POST' },
  )
}

export function getKitchenTickets(station: string): Promise<KitchenTicket[]> {
  return request<KitchenTicket[]>(`/kitchen?station=${encodeURIComponent(station)}`)
}

export function setKitchenItemStatus(
  ticketId: string,
  itemId: string,
  status: 'PENDING' | 'READY',
): Promise<unknown> {
  return request(
    `/kitchen/${encodeURIComponent(ticketId)}/items/${encodeURIComponent(itemId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    },
  )
}

export function getAccountingPaymentAccounts(): Promise<AccountingPaymentAccount[]> {
  return request('/accounting/payment-accounts')
}

export function getAccountingMovementTypes(): Promise<AccountingMovementType[]> {
  return request('/accounting/movement-types')
}

export function getAccountingSummary(month: number, year: number): Promise<AccountingSummary> {
  return request(`/accounting/summary?month=${month}&year=${year}`)
}

export function getAccountingMovementDetails(
  month: number,
  year: number,
): Promise<Record<string, AccountingCashDetail>> {
  return request(`/accounting/movements?month=${month}&year=${year}`)
}

export function getAccountingDeliverySalesSummary(
  month: number,
  year: number,
): Promise<AccountingDeliverySalesSummary> {
  return request(`/accounting/delivery-sales?month=${month}&year=${year}`)
}

export function recordAccountingMovement(
  movement: ManualAccountingMovement,
): Promise<void> {
  return request('/accounting/movements', {
    method: 'POST',
    body: JSON.stringify(movement),
  })
}

export function updateAccountingMovement(
  movementId: number,
  movement: UpdateAccountingMovement,
): Promise<void> {
  return request(`/accounting/movements/${encodeURIComponent(String(movementId))}`, {
    method: 'PUT',
    body: JSON.stringify(movement),
  })
}

export function syncAccountingSales(
  startDate: string,
  endDate: string,
): Promise<AccountingSyncResult> {
  return request('/accounting/sync-unicenta', {
    method: 'POST',
    body: JSON.stringify({ startDate, endDate }),
  })
}
