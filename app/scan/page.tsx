'use client'

import { useEffect, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { supabase } from '../lib/supabase'

export default function ScanPage() {
  const [barcode, setBarcode] = useState('')
  const [product, setProduct] = useState<any>(null)
  const [lastScan, setLastScan] = useState('')

  useEffect(() => {
    const scanner = new Html5Qrcode('reader')

    async function startScanner() {
      try {
        const devices =
          await Html5Qrcode.getCameras()

        if (!devices.length) return

        await scanner.start(
          devices[0].id,
          {
            fps: 10,
            qrbox: 250,
          },
          async (decodedText) => {
            if (decodedText === lastScan)
              return

            setLastScan(decodedText)
            setBarcode(decodedText)

            const { data, error } =
              await supabase
                .from('products')
                .select('*')
                .eq('barcode', decodedText)
                .single()

            if (!error) {
              setProduct(data)
            }
          },
          () => {}
        )
      } catch (err) {
        console.error(err)
      }
    }

    startScanner()

    return () => {
      scanner
        .stop()
        .then(() => scanner.clear())
        .catch(() => {})
    }
  }, [lastScan])

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">
          📷 ສະແກນບາໂຄດ
        </h1>

        <div
          id="reader"
          className="bg-white rounded-xl overflow-hidden"
        />

        <div className="mt-6 bg-slate-800 p-4 rounded-xl">
          <p className="text-gray-400">
            Barcode
          </p>

          <p className="text-green-400 text-2xl font-bold mt-2 break-all">
            {barcode ||
              'ລໍຖ້າການສະແກນ...'}
          </p>
        </div>

        {product && (
          <div className="mt-6 bg-green-900 p-4 rounded-xl">
            <h2 className="text-2xl font-bold">
              {product.name}
            </h2>

            <p className="mt-2">
              💰 ລາຄາ:{' '}
              {Number(
                product.selling_price
              ).toLocaleString()}{' '}
              ກີບ
            </p>

            <p>
              📦 ຄົງເຫຼືອ:{' '}
              {product.stock}
            </p>

            <p>
              🔢 Barcode:{' '}
              {product.barcode}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}