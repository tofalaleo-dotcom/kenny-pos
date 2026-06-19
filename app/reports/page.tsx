'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function ReportsPage() {
  const [products, setProducts] = useState<any[]>([])
  const [totalSales, setTotalSales] = useState(0)
  const [totalProfit, setTotalProfit] = useState(0)

  useEffect(() => {
    loadReport()
  }, [])

  async function loadReport() {
    const { data } = await supabase
      .from('products')
      .select('*')

    const items = data || []

    setProducts(items)

    let sales = 0
    let profit = 0

    items.forEach((p) => {
      const sold = Number(p.sold_qty || 0)

      sales += sold * Number(p.selling_price)

      profit +=
        sold *
        (Number(p.selling_price) -
          Number(p.cost_price || 0))
    })

    setTotalSales(sales)
    setTotalProfit(profit)
  }

const emptyStock = products.filter(
  (p) => Number(p.stock || 0) <= 0
)

const lowStock = products.filter(
  (p) =>
    Number(p.stock || 0) > 0 &&
    Number(p.stock || 0) <= 5
)
  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <h1 className="text-4xl font-bold mb-6">
        📊 ລາຍງານ
        <a
  href="/reports"
  className="inline-block bg-blue-600 px-4 py-2 rounded mt-4"
>
  📊 ເບິ່ງລາຍງານ
</a>
      </h1>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-800 p-5 rounded-xl">
          <h2>ຍອດຂາຍລວມ</h2>
          <div className="text-3xl text-green-400 font-bold">
            {totalSales.toLocaleString()} ກີບ
          </div>
        </div>

        <div className="bg-gray-800 p-5 rounded-xl">
          <h2>ກຳໄລລວມ</h2>
          <div className="text-3xl text-yellow-400 font-bold">
            {totalProfit.toLocaleString()} ກີບ
          </div>
        </div>
      </div>
<div className="bg-red-950 p-5 rounded-xl mb-6">
  <h2 className="text-2xl font-bold mb-4 text-red-400">
    🚫 ສິນຄ້າໝົດ
  </h2>

  {emptyStock.length === 0 ? (
    <div>ບໍ່ມີສິນຄ້າໝົດ</div>
  ) : (
    emptyStock.map((item) => (
      <div key={item.id} className="mb-2">
{item.name} (0 ອັນ)
      </div>
    ))
  )}
</div>
      <div className="bg-gray-900 p-5 rounded-xl mb-6">
        <h2 className="text-2xl font-bold mb-4">
          ⚠️ ສິນຄ້າໃກ້ໝົດ
        </h2>

        {lowStock.length === 0 ? (
          <div>ບໍ່ມີສິນຄ້າໃກ້ໝົດ</div>
        ) : (
          lowStock.map((item) => (
            <div key={item.id} className="mb-2">
            {item.name} ({item.stock} ອັນ)
              <span
                className={
                  Number(item.stock) <= 0
                    ? 'text-red-500 font-bold'
                    : 'text-yellow-400 font-bold'
                }
              >
                {item.stock}
              </span>{' '}
              ອັນ
            </div>
          ))
        )}
      </div>

      <div className="bg-gray-900 p-5 rounded-xl">
        <h2 className="text-2xl font-bold mb-4">
          📦 ລາຍການສິນຄ້າ
        </h2>

        {products.map((item) => (
          <div
            key={item.id}
            className="border-b border-gray-700 py-3"
          >
            <div className="font-bold">
              {item.name}
            </div>

            <div className="text-gray-400">
              ຕົ້ນທຶນ: {item.cost_price}
            </div>

            <div className="text-green-400">
              ລາຄາຂາຍ: {item.selling_price}
            </div>

            <div className="text-yellow-400">
              ກຳໄລຕໍ່ຊິ້ນ:{' '}
              {Number(item.selling_price) -
                Number(item.cost_price || 0)}
            </div>

            <div>
              ຄົງເຫຼືອ:{' '}
              <span
                className={
                  Number(item.stock) <= 0
                    ? 'text-red-500 font-bold'
                    : Number(item.stock) <= 5
                    ? 'text-yellow-400 font-bold'
                    : 'text-green-400 font-bold'
                }
              >
                {item.stock}
              </span>{' '}
              ອັນ
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}