'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from './lib/supabase'

export default function KennyPOS() {
  const [products, setProducts] = useState<any[]>([])
  const [cart, setCart] = useState<any[]>([])
  const [barcode, setBarcode] = useState('')
  const [showPayment, setShowPayment] = useState(false)

  const [paymentMethod, setPaymentMethod] = useState('')

  const [cashReceived, setCashReceived] = useState(0)
  const [printReceipt, setPrintReceipt] = useState(false)
  const barcodeRef = useRef<HTMLInputElement>(null)
  const cashRef = useRef<HTMLInputElement>(null)

  //useEffect(() => {
  //const interval = setInterval(() => {
  //barcodeRef.current?.focus()
  //}, 500)

  //return () => clearInterval(interval)
  //}, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
  const target = e.target as HTMLElement

if (
  (target.tagName === 'INPUT' ||
   target.tagName === 'TEXTAREA') &&
  e.key !== 'Enter' &&
  e.key !== 'Backspace' &&
  e.key !== '+' &&
  e.key !== '-' &&
  e.key !== '*' &&
  e.key !== 'Delete'
) {
  return
}

if (e.key === 'Backspace') {
  e.preventDefault()

  if (!showPayment && cart.length > 0) {
    setCart(prev => {
      const last = prev[prev.length - 1]

      if ((last.qty || 1) > 1) {
        return prev.map((item, index) =>
          index === prev.length - 1
            ? { ...item, qty: item.qty - 1 }
            : item
        )
      }

      return prev.slice(0, -1)
    })
  }

  return
}
      console.log('KEY:', e.key)
      console.log('CART =', cart.length)
    if (e.key === 'Enter') {
  e.preventDefault()

  // ยังไม่เปิด Payment
  if (!showPayment && cart.length > 0) {
    setShowPayment(true)
    return
  }

  // เงินสด
  if (
    showPayment &&
    paymentMethod === 'cash' &&
    cashReceived >= total
  ) {
    completeSale()
    return
  }

  // QR
  if (
    showPayment &&
    paymentMethod === 'transfer'
  ) {
    completeSale()
    return
  }
}

      // +
      if (e.key === '+') {
        setPrintReceipt(prev => !prev)
      }

      // *
      if (e.key === '*') {
        setShowPayment(true)
        setPaymentMethod('cash')

        setTimeout(() => {
          cashRef.current?.focus()
        }, 100)
      }
      // -
      if (e.key === '-') {
        setShowPayment(true)
        setPaymentMethod('transfer')
        setCashReceived(0)
      }

      // Delete
if (e.key === 'Delete') {
  setShowPayment(false)
}

} // ปิด handleKeyDown

window.addEventListener('keydown', handleKeyDown)

return () => {
  window.removeEventListener('keydown', handleKeyDown)
}
}, [cart, showPayment, paymentMethod, cashReceived])
  useEffect(() => {
    loadProducts()
  }, [])

  async function loadProducts() {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
      console.log('DATA:', data)
      console.log('ERROR:', error)

      if (error) {
        console.error(error)
        return
      }

      setProducts(data || [])
    } catch (err) {
      console.error(err)
    }
  }

  function addToCart(product: any) {
    if (Number(product.stock) <= 0) {
      alert('ສິນຄ້າໝົດແລ້ວ')
      return
    }
    const existing = cart.find(
      item => item.id === product.id
    )

    if (existing) {
      setCart(
        cart.map(item =>
          item.id === product.id
            ? {
              ...item,
              qty: (item.qty || 1) + 1,
            }
            : item
        )
      )
    } else {
      setCart([
        ...cart,
        {
          ...product,
          qty: 1,
        },
      ])
    }
  }
 function scanBarcode() {
  const product = products.find(
    p => p.barcode === barcode
  )

  if (!product) {
    alert('ບໍ່ພົບສິນຄ້າ')
    return
  }

  addToCart(product)

  new Audio('/beep.mp3').play()

  setBarcode('')
  barcodeRef.current?.focus()
}

function updateQty(
    id: number,
    qty: number
  ) {
    setCart(
      cart.map(item =>
        item.id === id
          ? {
            ...item,
            qty: Math.max(1, qty),
          }
          : item
      )
    )
  }

  function removeItem(id: number) {
    setCart(
      cart.filter(item => item.id !== id)
    )
  }

  function clearCart() {
    setCart([])
  }

  const total = cart.reduce(
    (sum, item) =>
      sum +
      Number(item.selling_price) *
      (item.qty || 1),
    0
  )
  const changeAmount = cashReceived - total

  async function completeSale() {
    if (cart.length === 0) {
      alert('ບໍ່ມີສິນຄ້າໃນລາຍການ')
      return
    }

    for (const item of cart) {
      await supabase
        .from('products')
        .update({
          stock:
            Number(item.stock || 0) -
            (item.qty || 1),

          sold_qty:
            Number(item.sold_qty || 0) +
            (item.qty || 1),
        })
        .eq('id', item.id)
    }

    const receiptNumber = `R-${Date.now()}`

    const { data: saleData, error: saleError } =
      await supabase
        .from('sales')
        .insert({
          receipt_number: receiptNumber,
          total_amount: total,
          discount: 0,
          final_amount: total,
          payment_method: paymentMethod,
          cash_received: total,
          change_amount: 0,
        })
        .select()
        .single()
    if (saleData) {
      for (const item of cart) {
        await supabase.from('sale_items').insert({
          sale_id: saleData.id,
          product_id: item.id,
          quantity: item.qty || 1,
          selling_price: item.selling_price,
          cost_at_sale: item.cost_price || 0,
        })
      }
    }
    if (printReceipt) {
      window.open(
        `/receipt?receipt=${receiptNumber}`,
        '_blank'
      )
    }
    //alert('ຂາຍສຳເລັດແລ້ວ')

    setShowPayment(false)
    setPaymentMethod('')
    setCashReceived(0)


    clearCart()
    loadProducts()
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-7xl mx-auto">

        <h1 className="text-4xl font-bold text-center mb-2">
          🛒 ລະບົບຂາຍໜ້າຮ້ານ
        </h1>

        <p className="text-center text-gray-400 mb-8">
          Kenny POS
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          <div className="lg:col-span-2">

            <h2 className="text-2xl font-bold mb-4">
              📦 ລາຍການສິນຄ້າ
            </h2>
            <div className="flex gap-2 mb-4">
              <input
                ref={barcodeRef}
                type="text"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                  }
                }}
                value={barcode}
                placeholder="Scan barcode..."
                onChange={(e) => {
                  const value = e.target.value

                  setBarcode(value)

                  if (value.length >= 8) {
                    const product = products.find(
                      p => p.barcode === value
                    )

                    if (product) {
                      addToCart(product)
                      setBarcode('')
                      barcodeRef.current?.focus()
                    }
                  }
                }}
                className="flex-1 bg-white text-black px-3 py-2 rounded border"
              />

              <button
                onClick={scanBarcode}
                className="bg-blue-600 px-4 py-2 rounded"
              >
                Scan
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">

              {products.map(product => (
                <button
                  key={product.id}
                  disabled={
                    Number(product.stock) <= 0
                  }
                  onClick={() =>
                    addToCart(product)
                  }
                  className={`rounded-xl p-4 text-left ${Number(product.stock) <= 0
                    ? 'bg-gray-700 opacity-50 cursor-not-allowed'
                    : 'bg-gray-800 hover:bg-gray-700'
                    }`}
                >
                  <h3 className="font-bold text-lg">
                    {product.name}
                  </h3>

                  <p className="text-gray-400">
                    {product.category}
                  </p>

                  <p className="text-green-400 font-bold mt-2">
                    {Number(
                      product.selling_price
                    ).toLocaleString()} ກີບ
                  </p>

                  <p>
                    ຄົງເຫຼືອ:{' '}
                    {product.stock}
                  </p>
                </button>
              ))}

            </div>
          </div>

          <div className="bg-gray-900 rounded-xl p-4">

            <h2 className="text-2xl font-bold mb-4">
              🧾 ລາຍການຂາຍ
            </h2>

            <div className="space-y-2">

              {cart.map(item => (
                <div
                  key={item.id}
                  className="bg-gray-800 p-3 rounded"
                >
                  <div className="font-bold">
                    {item.name} x{item.qty || 1}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() =>
                        updateQty(
                          item.id,
                          (item.qty || 1) - 1
                        )
                      }
                      className="bg-gray-700 px-3 py-1 rounded"
                    >
                      -
                    </button>

                    <input
                      type="number"
                      min="1"
                      value={item.qty || 1}
                      onChange={(e) =>
                        updateQty(
                          item.id,
                          Number(e.target.value)
                        )
                      }
                      className="w-16 bg-white text-black text-center px-2 py-1 rounded border border-gray-300"
                    />

                    <button
                      onClick={() =>
                        updateQty(
                          item.id,
                          (item.qty || 1) + 1
                        )
                      }
                      className="bg-green-600 px-3 py-1 rounded"
                    >
                      +
                    </button>
                  </div>
                  <div className="text-green-400 mt-2">
                    {Number(item.selling_price).toLocaleString()}
                    {' × '}
                    {item.qty || 1}
                    {' = '}
                    {(
                      Number(item.selling_price) *
                      (item.qty || 1)
                    ).toLocaleString()}
                    ກີບ
                  </div>
                  <button
                    onClick={() =>
                      removeItem(item.id)
                    }
                    className="bg-red-600 px-3 py-1 rounded mt-2"
                  >
                    ລົບ
                  </button>
                </div>
              ))}

            </div>

            <div className="border-t border-gray-700 mt-4 pt-4">

              <div className="text-2xl font-bold">
                ລວມທັງໝົດ
              </div>

              <div className="text-3xl text-green-400 font-bold mt-2">
                {total.toLocaleString()} ກີບ
              </div>

              <button
                onClick={() => setShowPayment(true)}
                className="w-full mt-4 bg-green-600 hover:bg-green-700 py-3 rounded-lg"
              >
                💰 ຢືນຢັນການຂາຍ
              </button>

              <button
                onClick={clearCart}
                className="w-full mt-2 bg-red-600 hover:bg-red-700 py-3 rounded-lg"
              >
                🗑️ ລ້າງລາຍການ
              </button>

            </div>

          </div>

        </div>
      </div>
      {showPayment && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center">
          <div className="bg-white text-black p-8 rounded-2xl w-[500px] shadow-2xl">

            <h2 className="text-2xl font-bold mb-4">
              ເລືອກວິທີຊຳລະເງິນ
            </h2>

            <label className="flex items-center gap-3 mb-4 bg-gray-100 p-4 rounded-xl border-2 border-gray-200 cursor-pointer hover:bg-gray-200">
              <input
                type="checkbox"
                checked={printReceipt}
                onChange={(e) => setPrintReceipt(e.target.checked)}
                className="w-6 h-6"
              />

              <div>
                <div className="font-bold text-lg text-black">
                  🖨️ Print Bill
                </div>

                <div className="text-sm text-gray-500">
                  Print receipt after payment
                </div>
              </div>
            </label>

            <button
              onClick={() => setPaymentMethod('cash')}
              className="w-full bg-green-600 text-white py-3 rounded mb-2"
            >
              💵 ເງິນສົດ
            </button>

            <button
              onClick={() => setPaymentMethod('transfer')}
              className="w-full bg-blue-600 text-white py-3 rounded mb-2"
            >
              📱 QR / ໂອນ
            </button>

            {paymentMethod === 'cash' && (
              <div className="mt-4">
                <input
                  ref={cashRef}
                  type="text"
                  value={Number.isNaN(cashReceived) ? '' : cashReceived}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      completeSale()
                      new Audio('/beep.mp3').play()
                    }
                  }}


                  onChange={(e) =>
                    setCashReceived(
                      e.target.value === ''
                        ? 0
                        : Number(e.target.value)
                    )
                  }
                  placeholder="ຈຳນວນເງິນຮັບ"
                  className="w-full border p-2 rounded"
                />

                <div className="mt-2 font-bold">
                  ເງິນທອນ: {changeAmount.toLocaleString()} ກີບ
                </div>

                <button
                  onClick={async () => {
                    await completeSale()
                  }}
                  className="w-full mt-3 bg-green-700 text-white py-3 rounded"
                >
                  ✅ ຢືນຢັນຮັບເງິນ
                </button>
              </div>
            )}

            {paymentMethod === 'transfer' && (
              <div className="mt-4">
                <div className="text-center font-bold mb-3">
                  ຍອດຊຳລະ: {total.toLocaleString()} ກີບ
                </div>

                <img
                  src="/qr.png"
                  alt="QR Payment"
                  width={220}
                  height={220}
                  className="mx-auto mb-4 rounded"
                />

                <button
                  onClick={async () => {
                    await completeSale()
                  }}
                  className="w-full bg-green-700 text-white py-3 rounded"
                >
                  ✅ ຢືນຢັນໄດ້ຮັບເງິນ
                </button>
              </div>
            )}

            <button
              onClick={() => setShowPayment(false)}
              className="w-full bg-red-600 text-white py-3 rounded mt-3"
            >
              ❌ ຍົກເລີກ
            </button>
          </div>
        </div>
      )}
    </div>
  )
}