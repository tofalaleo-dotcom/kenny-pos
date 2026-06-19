'use client'

export default function ReceiptPage() {
  return (
    <div className="max-w-md mx-auto p-6 bg-white text-black min-h-screen">
      <h1 className="text-2xl font-bold text-center mb-4">
        🧾 Receipt
      </h1>

      <div className="mb-2">
        Receipt: {new URLSearchParams(window.location.search).get('receipt')}
      </div>

      <div className="mb-6">
        Thank you for your purchase
      </div>

      <button
        onClick={() => window.print()}
        className="w-full bg-blue-600 text-white py-3 rounded"
      >
        🖨️ Print Receipt
      </button>
    </div>
  )
}