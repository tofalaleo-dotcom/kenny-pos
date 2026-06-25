import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && key)
export const supabase = isSupabaseConfigured ? createClient(url, key) : null

export const databaseProductToAppProduct = (product) => ({
  id: product.id,
  barcode: product.barcode,
  name: product.name,
  price: Number(product.selling_price),
  cost: Number(product.average_cost),
  stock: Number(product.stock_quantity),
  low: Number(product.low_stock_threshold),
  unit: product.unit || 'ອັນ',
  color: '#e8efff',
})
