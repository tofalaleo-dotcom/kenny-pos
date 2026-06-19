'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function StockPage() {
  const [products, setProducts] = useState<any[]>([])
  const [qty, setQty] = useState<{ [key: string]: number }>({})

  useEffect(() => {
    loadProducts()
  }, [])

  async function loadProducts() {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('name')

    if (error) {
      console.error(error)
      return
    }

    setProducts(data || [])
  }

  async function addStock(product: any) {
    const amount = Number(qty[product.id] || 0)

    if (amount <= 0) {
      alert('ໃສ່ຈຳນວນກ່ອນ')
      return
    }

    const { error } = await supabase
      .from('products')
      .update({
        stock: Number(product.stock) + amount,
      })
      .eq('id', product.id)

    if (error) {
      alert('ເກີດຂໍ້ຜິດພາດ')
      return
    }

    // ล้างช่องกรอกหลังเพิ่มสต๊อก
    setQty((prev) => ({
      ...prev,
      [product.id]: 0,
    }))

    await loadProducts()

    alert('ເພີ່ມ Stock ສຳເລັດ')
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-5xl mx-auto">

        <h1 className="text-4xl font-bold mb-6">
          📦 ເພີ່ມ Stock
        </h1>

        <div className="space-y-4">
          {products.map((product) => (
            <div
              key={product.id}
              className="bg-gray-900 p-4 rounded-xl"
            >
              <div className="text-xl font-bold">
                {product.name}
              </div>

              <div className="mt-2">
                ຄົງເຫຼືອ:
                <span className="text-green-400 font-bold ml-2">
                  {product.stock}
                </span>
              </div>

              <input
                type="number"
                value={qty[product.id] || ''}
                placeholder="ເພີ່ມຈຳນວນ"
                className="w-full mt-3 p-3 rounded bg-gray-800"
                onChange={(e) =>
                  setQty({
                    ...qty,
                    [product.id]: Number(e.target.value),
                  })
                }
              />

              <button
                onClick={() => addStock(product)}
                className="mt-3 bg-green-600 hover:bg-green-700 px-4 py-3 rounded-lg"
              >
                ➕ ເພີ່ມ Stock
              </button>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}