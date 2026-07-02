import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { databaseProductToAppProduct, isSupabaseConfigured, supabase } from './supabase'

const money = (value) => new Intl.NumberFormat('lo-LA').format(value) + ' ₭'
const laoWeekdays = ['ວັນອາທິດ', 'ວັນຈັນ', 'ວັນອັງຄານ', 'ວັນພຸດ', 'ວັນພະຫັດ', 'ວັນສຸກ', 'ວັນເສົາ']
const laoMonths = ['ມັງກອນ', 'ກຸມພາ', 'ມີນາ', 'ເມສາ', 'ພຶດສະພາ', 'ມິຖຸນາ', 'ກໍລະກົດ', 'ສິງຫາ', 'ກັນຍາ', 'ຕຸລາ', 'ພະຈິກ', 'ທັນວາ']

function PosApp({ user, role = 'worker', onOwnerHome }) {
  const [products, setProducts] = useState([])
  const [productsLoading, setProductsLoading] = useState(true)
  const [cart, setCart] = useState([])
  const [lastAddedId, setLastAddedId] = useState(null)
  const [search, setSearch] = useState('')
  const [active, setActive] = useState('sale')
  const [holds, setHolds] = useState([])
  const [cash, setCash] = useState('')
  const [notice, setNotice] = useState('')
  const [newBarcode, setNewBarcode] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [showStockIn, setShowStockIn] = useState(false)
  const [showAddProduct, setShowAddProduct] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [adjustingProduct, setAdjustingProduct] = useState(null)
  const [showPayment, setShowPayment] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [printReceipt, setPrintReceipt] = useState(true)
  const [cameraMode, setCameraMode] = useState(false)
  const [posCameraMode, setPosCameraMode] = useState(false)
  const videoRef = useRef(null)
  const posVideoRef = useRef(null)
  const streamRef = useRef(null)
  const posStreamRef = useRef(null)
  const scanLoopRef = useRef(0)
  const posScanLoopRef = useRef(0)
  const lastCameraScanRef = useRef({ code: '', at: 0 })
  const scannerBufferRef = useRef({ text: '', at: 0 })
  const total = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.qty, 0), [cart])
  const profit = useMemo(() => cart.reduce((sum, item) => sum + (item.price - item.cost) * item.qty, 0), [cart])
  const change = Math.max(0, Number(cash || 0) - total)
  const lowItems = products.filter((p) => p.stock >= 1 && p.stock <= 5)
  const outItems = products.filter((p) => p.stock <= 0)
  const alertCount = lowItems.length + outItems.length
  const canManage = role === 'owner' || role === 'admin'
  const todayLabel = useMemo(() => {
    const now = new Date()
    return `${laoWeekdays[now.getDay()]}, ${now.getDate()} ${laoMonths[now.getMonth()]} ${now.getFullYear()}`
  }, [])

  useEffect(() => {
    if (!supabase) {
      setProductsLoading(false)
      return
    }
    const loadProducts = async () => {
      let { data, error } = await supabase.from('products').select('*').eq('is_active', true).order('name')
      if (error) {
        const fallback = await supabase.from('products').select('*').order('name')
        data = fallback.data
        error = fallback.error
      }
      if (error) {
        setProducts([])
        setNotice('ໂຫຼດສິນຄ້າຈາກ Supabase ບໍ່ໄດ້: ' + error.message)
      } else {
        setProducts((data || []).map(databaseProductToAppProduct))
      }
      setProductsLoading(false)
    }
    loadProducts()
    const channel = supabase.channel('products-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, loadProducts)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  useEffect(() => {
    if (!supabase) return
    const channel = supabase.channel('customer-display')
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') channel.send({ type: 'broadcast', event: 'cart', payload: { cart, total, cash: Number(cash || 0), change } })
    })
    return () => supabase.removeChannel(channel)
  }, [cart, total, cash, change])

  useEffect(() => () => { stopBarcodeCamera(); stopPosCameraScanner() }, [])

  useEffect(() => {
    if (!showPayment) return
    const onKeyDown = (event) => {
      if (event.key === '*') { event.preventDefault(); setPaymentMethod('cash') }
      if (event.key === '-') { event.preventDefault(); setPaymentMethod('transfer') }
      if (event.key === '+') { event.preventDefault(); setPrintReceipt((value) => !value) }
      if (event.key === 'Enter') { event.preventDefault(); checkout() }
      if (event.key === 'Escape') { event.preventDefault(); setShowPayment(false) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showPayment, cart, cash, paymentMethod, printReceipt])

  useEffect(() => {
    const onKeyDown = (event) => {
      const tag = event.target?.tagName
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      if (showPayment || showAddProduct || showStockIn || isTyping) return
      if (active !== 'sale') return
      if (event.key === 'Enter' && cart.length) {
        event.preventDefault()
        setShowPayment(true)
      }
      if (event.key === 'Backspace' && cart.length) {
        event.preventDefault()
        undoLastCartItem()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active, cart, showPayment, showAddProduct, showStockIn, lastAddedId])

  const openManualProduct = (barcode = '') => {
    setNewBarcode(barcode)
    setShowAddProduct(true)
    setShowNew(false)
  }

  const stopBarcodeCamera = () => {
    if (scanLoopRef.current) cancelAnimationFrame(scanLoopRef.current)
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    scanLoopRef.current = 0
    setCameraMode(false)
  }

  const stopPosCameraScanner = () => {
    if (posScanLoopRef.current) cancelAnimationFrame(posScanLoopRef.current)
    posStreamRef.current?.getTracks().forEach((track) => track.stop())
    posStreamRef.current = null
    posScanLoopRef.current = 0
    setPosCameraMode(false)
  }

  const startPosCameraScanner = async () => {
    if (!('BarcodeDetector' in window)) {
      setNotice('Browser ນີ້ຍັງບໍ່ຮອງຮັບການສະແກນ Barcode ດ້ວຍກ້ອງ')
      return
    }
    try {
      const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'qr_code'] })
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      posStreamRef.current = stream
      setPosCameraMode(true)
      setTimeout(() => {
        if (!posVideoRef.current) return
        posVideoRef.current.srcObject = stream
        posVideoRef.current.play()
        const tick = async () => {
          if (!posVideoRef.current || posVideoRef.current.readyState < 2) {
            posScanLoopRef.current = requestAnimationFrame(tick)
            return
          }
          const codes = await detector.detect(posVideoRef.current).catch(() => [])
          if (codes.length) {
            const code = codes[0].rawValue
            const now = Date.now()
            const last = lastCameraScanRef.current
            if (code !== last.code || now - last.at > 1600) {
              lastCameraScanRef.current = { code, at: now }
              scan(code)
            }
          }
          posScanLoopRef.current = requestAnimationFrame(tick)
        }
        tick()
      }, 0)
    } catch {
      setNotice('ເປີດກ້ອງສະແກນບໍ່ໄດ້. ກະລຸນາອະນຸຍາດ Camera.')
    }
  }

  const startBarcodeCamera = async () => {
    if (!('BarcodeDetector' in window)) {
      setNotice('Browser ນີ້ຍັງບໍ່ຮອງຮັບການສະແກນດ້ວຍກ້ອງ. ໃຫ້ໃຊ້ເຄື່ອງສະແກນ ຫຼື ພິມ Barcode ແທນ.')
      return
    }
    try {
      const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'qr_code'] })
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      setCameraMode(true)
      setTimeout(() => {
        if (!videoRef.current) return
        videoRef.current.srcObject = stream
        videoRef.current.play()
        const tick = async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) {
            scanLoopRef.current = requestAnimationFrame(tick)
            return
          }
          const codes = await detector.detect(videoRef.current).catch(() => [])
          if (codes.length) {
            setNewBarcode(codes[0].rawValue)
            stopBarcodeCamera()
            setNotice('ສະແກນ Barcode ໄດ້ແລ້ວ')
            return
          }
          scanLoopRef.current = requestAnimationFrame(tick)
        }
        tick()
      }, 0)
    } catch {
      setNotice('ເປີດກ້ອງບໍ່ໄດ້. ກະລຸນາອະນຸຍາດ Camera ຫຼື ພິມ Barcode ແທນ.')
    }
  }

  const addProduct = (product) => {
    if (product.stock < 1) return setNotice('ສິນຄ້ານີ້ໝົດສະຕັອກແລ້ວ')
    setLastAddedId(product.id)
    setCart((current) => {
      const found = current.find((item) => item.id === product.id)
      return found ? current.map((item) => item.id === product.id ? { ...item, qty: Math.min(item.qty + 1, product.stock) } : item) : [...current, { ...product, qty: 1 }]
    })
  }

  const scan = (code = search.trim()) => {
    if (!code) return
    const product = products.find((p) => p.barcode === code)
    if (product) { addProduct(product); setSearch(''); setNotice('ເພີ່ມ “' + product.name + '” ແລ້ວ') }
    else { openManualProduct(code) }
  }

  useEffect(() => {
    const onKeyDown = (event) => {
      if (active !== 'sale' || showPayment || showAddProduct || showStockIn || showNew || editingProduct || adjustingProduct) return
      const tag = event.target?.tagName
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      if (isTyping) return

      const now = Date.now()
      const buffer = scannerBufferRef.current
      if (now - buffer.at > 120) buffer.text = ''
      buffer.at = now

      if (event.key === 'Enter') {
        const code = buffer.text.trim()
        buffer.text = ''
        if (code.length >= 4) {
          event.preventDefault()
          event.stopImmediatePropagation?.()
          scan(code)
        }
        return
      }

      if (event.key.length === 1 && /^[0-9A-Za-z\-_.]+$/.test(event.key)) {
        buffer.text += event.key
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [active, showPayment, showAddProduct, showStockIn, showNew, editingProduct, adjustingProduct, products])

  const changeQty = (id, amount) => setCart((current) => current.flatMap((item) => {
    if (item.id !== id) return [item]
    const qty = item.qty + amount
    return qty > 0 ? [{ ...item, qty }] : []
  }))

  const undoLastCartItem = () => {
    setCart((current) => {
      if (!current.length) return current
      const targetId = current.some((item) => item.id === lastAddedId) ? lastAddedId : current[current.length - 1].id
      const target = current.find((item) => item.id === targetId)
      if (target) setNotice(`ຍ້ອນກັບລາຍການ: ${target.name}`)
      const next = current.flatMap((item) => {
        if (item.id !== targetId) return [item]
        return item.qty > 1 ? [{ ...item, qty: item.qty - 1 }] : []
      })
      setLastAddedId(next.length ? next[next.length - 1].id : null)
      return next
    })
  }

  const holdOrder = () => {
    if (!cart.length) return
    setHolds((items) => [...items, { id: Date.now(), label: `ບິນ #${items.length + 1}`, cart, total }])
    setCart([]); setCash(''); setNotice('ພັກບິນແລ້ວ')
  }

  const recall = (hold) => { setCart(hold.cart); setHolds((items) => items.filter((item) => item.id !== hold.id)); setActive('sale'); setNotice('ເອີ້ນບິນກັບຄືນແລ້ວ') }

  const deleteProduct = async (product) => {
    if (!window.confirm(`ຢືນຢັນຢຸດຂາຍ/ລຶບ “${product.name}” ອອກຈາກໜ້າຂາຍບໍ?`)) return
    if (!supabase || typeof product.id !== 'string') {
      setProducts((items) => items.filter((item) => item.id !== product.id))
      return setNotice('ລຶບສິນຄ້າອອກຈາກໜ້າຂາຍແລ້ວ')
    }
    let { error } = await supabase.from('products').update({ is_active: false }).eq('id', product.id)
    if (error) ({ error } = await supabase.from('products').delete().eq('id', product.id))
    if (error) return setNotice('ລຶບສິນຄ້າບໍ່ສຳເລັດ: ' + error.message)
    setProducts((items) => items.filter((item) => item.id !== product.id))
    setCart((items) => items.filter((item) => item.id !== product.id))
    setNotice('ລຶບອອກຈາກໜ້າຂາຍແລ້ວ: ' + product.name)
  }

  const saveNewProduct = async (event) => {
    event.preventDefault()
    if (!supabase || !user) return setNotice('ກະລຸນາເຊື່ອມ Supabase ແລະ login ກ່ອນບັນທຶກສິນຄ້າ')
    const form = new FormData(event.currentTarget)
    const barcode = String(form.get('barcode') || '').trim()
    const name = String(form.get('name') || '').trim()
    const cost = Number(form.get('cost'))
    const price = Number(form.get('price'))
    const stock = Number(form.get('stock') || 0)
    const unit = String(form.get('unit') || 'ອັນ').trim() || 'ອັນ'
    if (!barcode) return setNotice('ກະລຸນາສະແກນ ຫຼື ປ້ອນ Barcode')
    if (products.some((p) => p.barcode === barcode)) return setNotice('Barcode ນີ້ມີຢູ່ແລ້ວ ບໍ່ສາມາດບັນທຶກຊ້ຳໄດ້')
    if (!name) return setNotice('ກະລຸນາໃສ່ຊື່ສິນຄ້າ')
    if (cost < 0 || price <= 0 || stock < 0) return setNotice('ກະລຸນາກວດລາຄາ ແລະ ຈຳນວນໃຫ້ຖືກຕ້ອງ')
    if (price < cost && !window.confirm('ລາຄາຂາຍຕ່ຳກວ່າຕົ້ນທຶນ. ຕ້ອງການບັນທຶກຕໍ່ບໍ?')) return
    const payload = {
      barcode,
      name,
      unit,
      selling_price: price,
      average_cost: cost,
      stock_quantity: stock,
      low_stock_threshold: 5,
      store_id: user?.id,
    }
    const { data, error } = await supabase.from('products').insert(payload).select('*').single()
    if (error) return setNotice('ບັນທຶກສິນຄ້າບໍ່ສຳເລັດ: ' + error.message)
    const product = databaseProductToAppProduct(data)
    if (stock > 0) await supabase.from('inventory_transactions').insert({ product_id: data.id, created_by: user.id, transaction_type: 'stock_in', quantity_change: stock, unit_cost: cost, reason: 'ເພີ່ມສິນຄ້າໃໝ່' })
    setProducts((items) => [...items, product].sort((a, b) => a.name.localeCompare(b.name, 'lo')))
    setShowAddProduct(false)
    setShowNew(false)
    setNewBarcode('')
    setSearch('')
    stopBarcodeCamera()
    setNotice('ເພີ່ມສິນຄ້າໃໝ່ສຳເລັດ: ' + product.name)
  }

  const checkout = async () => {
    if (!cart.length) return
    if (paymentMethod === 'cash' && Number(cash || 0) < total) return setNotice('ເງິນສົດທີ່ຮັບຍັງບໍ່ພໍ')
    if (supabase && user) {
      const orderPayload = {
        store_id: user.id, cashier_id: user.id, status: 'completed', total,
        payment_amount: paymentMethod === 'cash' ? Number(cash || total) : total,
        change_amount: paymentMethod === 'cash' ? change : 0,
        payment_method: paymentMethod,
        print_receipt: printReceipt,
      }
      let { data: order, error: orderError } = await supabase.from('orders').insert(orderPayload).select('id').single()
      if (orderError) {
        const { payment_method, print_receipt, ...fallbackPayload } = orderPayload
        ;({ data: order, error: orderError } = await supabase.from('orders').insert(fallbackPayload).select('id').single())
      }
      if (orderError) return setNotice('ບັນທຶກບິນບໍ່ສຳເລັດ: ' + orderError.message)
      const { error: itemError } = await supabase.from('order_items').insert(cart.map((item) => ({
        order_id: order.id, product_id: typeof item.id === 'string' ? item.id : null, product_name: item.name,
        quantity: item.qty, unit_price: item.price, cost_at_sale: item.cost,
      })))
      if (itemError) return setNotice('ບັນທຶກລາຍການບໍ່ສຳເລັດ: ' + itemError.message)
      await Promise.all(cart.filter((item) => typeof item.id === 'string').map((item) => supabase.from('products').update({ stock_quantity: Math.max(0, item.stock - item.qty) }).eq('id', item.id)))
    }
    setProducts((all) => all.map((p) => { const line = cart.find((c) => c.id === p.id); return line ? { ...p, stock: p.stock - line.qty } : p }))
    setCart([]); setCash(''); setShowPayment(false); setNotice(`ຊຳລະເງິນສຳເລັດ (${paymentMethod === 'cash' ? 'ເງິນສົດ' : 'ເງິນໂອນ'}) — ກຳໄລຂັ້ນຕົ້ນ ` + money(profit))
  }

  const stockIn = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const product = products.find((item) => String(item.id) === form.get('productId'))
    const quantity = Number(form.get('quantity'))
    const purchaseCost = Number(form.get('cost'))
    if (!product || quantity <= 0 || purchaseCost < 0) return
    const newStock = product.stock + quantity
    const newAverageCost = ((product.stock * product.cost) + (quantity * purchaseCost)) / newStock
    if (supabase && typeof product.id === 'string') {
      const { error } = await supabase.from('products').update({ stock_quantity: newStock, average_cost: newAverageCost }).eq('id', product.id)
      if (error) return setNotice('ເພີ່ມສະຕັອກບໍ່ສຳເລັດ: ' + error.message)
      await supabase.from('inventory_transactions').insert({ product_id: product.id, created_by: user.id, transaction_type: 'stock_in', quantity_change: quantity, unit_cost: purchaseCost, reason: 'ຮັບສິນຄ້າເຂົ້າ' })
    }
    setProducts((items) => items.map((item) => item.id === product.id ? { ...item, stock: newStock, cost: newAverageCost } : item))
    setShowStockIn(false); setNotice(`ເພີ່ມ ${product.name} ${quantity} ${product.unit} ແລ້ວ`)
  }

  const saveProductEdit = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const product = editingProduct
    if (!product) return
    const name = String(form.get('name') || '').trim()
    const barcode = String(form.get('barcode') || '').trim()
    const unit = String(form.get('unit') || 'ອັນ').trim() || 'ອັນ'
    const cost = Number(form.get('cost'))
    const price = Number(form.get('price'))
    const stock = Number(form.get('stock'))
    if (!barcode || !name) return setNotice('ກະລຸນາໃສ່ Barcode ແລະ ຊື່ສິນຄ້າ')
    if (products.some((p) => p.id !== product.id && p.barcode === barcode)) return setNotice('Barcode ນີ້ຊ້ຳກັບສິນຄ້າອື່ນ')
    if (cost < 0 || price <= 0 || stock < 0) return setNotice('ກະລຸນາກວດລາຄາ ແລະ ຈຳນວນໃຫ້ຖືກຕ້ອງ')
    if (price < cost && !window.confirm('ລາຄາຂາຍຕ່ຳກວ່າຕົ້ນທຶນ. ຕ້ອງການບັນທຶກຕໍ່ບໍ?')) return
    const updates = { barcode, name, unit, selling_price: price, average_cost: cost, stock_quantity: stock }
    if (supabase && typeof product.id === 'string') {
      const { error } = await supabase.from('products').update(updates).eq('id', product.id)
      if (error) return setNotice('ແກ້ໄຂສິນຄ້າບໍ່ສຳເລັດ: ' + error.message)
    }
    setProducts((items) => items.map((item) => item.id === product.id ? { ...item, barcode, name, unit, price, cost, stock } : item))
    setEditingProduct(null)
    setNotice('ແກ້ໄຂສິນຄ້າແລ້ວ: ' + name)
  }

  const removeStock = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const product = adjustingProduct
    if (!product) return
    const quantity = Number(form.get('quantity'))
    const reason = String(form.get('reason') || 'ປັບລົດສະຕັອກ').trim()
    if (quantity <= 0) return setNotice('ກະລຸນາໃສ່ຈຳນວນທີ່ຈະລົບ')
    if (quantity > product.stock && !window.confirm('ຈຳນວນທີ່ລົບຫຼາຍກວ່າສະຕັອກທີ່ມີ. ຕ້ອງການໃຫ້ສະຕັອກເປັນ 0 ບໍ?')) return
    const newStock = Math.max(0, product.stock - quantity)
    if (supabase && typeof product.id === 'string') {
      const { error } = await supabase.from('products').update({ stock_quantity: newStock }).eq('id', product.id)
      if (error) return setNotice('ລົບສະຕັອກບໍ່ສຳເລັດ: ' + error.message)
      await supabase.from('inventory_transactions').insert({ product_id: product.id, created_by: user.id, transaction_type: 'adjustment', quantity_change: -Math.min(quantity, product.stock), unit_cost: product.cost, reason })
    }
    setProducts((items) => items.map((item) => item.id === product.id ? { ...item, stock: newStock } : item))
    setAdjustingProduct(null)
    setNotice(`ລົບສະຕັອກ ${product.name} ແລ້ວ`)
  }

  const filtered = products.filter((p) => p.name.includes(search) || p.barcode.includes(search))

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">K</span><div><strong>kennyXpay</strong><small>POS ອັດສະລິຍະ</small></div></div>
      <nav>
        {canManage && <button className="nav" onClick={onOwnerHome}><span>⌂</span>ໜ້າ Owner</button>}
        {(canManage ? [['sale','▣','ໜ້າຂາຍ'],['products','◫','ສິນຄ້າ & ສະຕັອກ'],['reports','◔','ລາຍງານ'],['cash','▤','ປິດຍອດເງິນສົດ']] : [['sale','▣','ໜ້າຂາຍ']]).map(([id, icon, label]) => <button key={id} className={active === id ? 'nav active' : 'nav'} onClick={() => setActive(id)}><span>{icon}</span>{label}{id === 'products' && alertCount > 0 && <b>{alertCount}</b>}</button>)}
      </nav>
      <div className="sidebar-foot"><span className="dot"/> ລະບົບພ້ອມໃຊ້ງານ</div>
    </aside>
    <main>
      <header><div><p className="eyebrow">{todayLabel} {isSupabaseConfigured ? '· Supabase ພ້ອມ' : '· ໂໝດທົດລອງ'}</p><h1>{active === 'sale' ? 'ໜ້າຂາຍສິນຄ້າ' : active === 'products' ? 'ສິນຄ້າ & ສະຕັອກ' : active === 'reports' ? 'ພາບລວມກຳໄລ' : 'ປິດຍອດເງິນສົດ'}</h1></div><div className="user"><span>ພ</span><div><strong>{user?.email || 'ພະນັກງານ'}</strong><button className="signout" onClick={() => supabase?.auth.signOut()}>ອອກຈາກລະບົບ</button></div></div></header>
      {notice && <div className="toast">✓ {notice}<button onClick={() => setNotice('')}>×</button></div>}
      {active === 'sale' && <section className="sale-page">
        <div className="catalog">
          <div className="stock-alerts">
            <div className={outItems.length > 0 ? 'alert out' : 'alert out muted'}><span>0</span><div><strong>ສິນຄ້າໝົດແລ້ວ (stock 0)</strong><small>{outItems.length > 0 ? `${outItems.map((p) => p.name).join(', ')} ໝົດແລ້ວ` : 'ບໍ່ມີສິນຄ້າໝົດ'}</small></div></div>
            <div className={lowItems.length > 0 ? 'alert low' : 'alert low muted'}><span>!</span><div><strong>ສິນຄ້າໃກ້ຈະໝົດ (stock 1-5)</strong><small>{lowItems.length > 0 ? `${lowItems.map((p) => `${p.name} (${p.stock})`).join(', ')} ເຫຼືອ 1-5` : 'ບໍ່ມີສິນຄ້າໃກ້ຈະໝົດ'}</small></div></div>
          </div>
          <div className="search"><span>⌕</span><input autoFocus placeholder="ສະແກນ Barcode ຫຼື ຄົ້ນຫາສິນຄ້າ..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && scan()} /><button onClick={() => scan()}>ສະແກນ</button><button className={posCameraMode ? 'camera-on' : ''} onClick={posCameraMode ? stopPosCameraScanner : startPosCameraScanner}>{posCameraMode ? 'ປິດກ້ອງ' : 'ເປີດກ້ອງ'}</button></div>
          {posCameraMode && <div className="pos-scanner"><video ref={posVideoRef} muted playsInline /><small>ກຳລັງສະແກນດ້ວຍກ້ອງ... ພົບ Barcode ແລ້ວຈະເພີ່ມເຂົ້າຕະກ້າອັດຕະໂນມັດ</small></div>}
          <div className="catalog-head"><div><strong>ສິນຄ້າຍອດນິຍົມ</strong><small>{filtered.length} ລາຍການ</small></div>{canManage && <div className="head-actions"><button className="stock-shortcut" onClick={() => openManualProduct()}>+ ເພີ່ມສິນຄ້າໃໝ່</button><button className="stock-shortcut" onClick={() => setShowStockIn(true)}>+ ຮັບສະຕັອກ</button></div>}</div>
          <div className="sale-shortcuts"><span><b>Enter</b> ຊຳລະເງິນ</span><span><b>Backspace</b> ຍ້ອນກັບລາຍການຫຼ້າສຸດ</span></div>
          <div className="product-grid">{productsLoading ? <div className="empty products-empty"><span>⌛</span><p>ກຳລັງໂຫຼດສິນຄ້າຈາກ Supabase...</p></div> : filtered.length === 0 ? <div className="empty products-empty"><span>+</span><p>ຍັງບໍ່ມີສິນຄ້າໃນ Supabase</p><small>ກົດ “+ ເພີ່ມສິນຄ້າໃໝ່” ເພື່ອເພີ່ມຂໍ້ມູນຈິງ</small></div> : filtered.map((p) => <button className="product" key={p.id} onClick={() => addProduct(p)}><span className="product-icon" style={{background:p.color}}>▣</span><strong>{p.name}</strong><small>{p.stock} {p.unit} ເຫຼືອ</small><b>{money(p.price)}</b></button>)}</div>
        </div>
        <aside className="cart"><div className="cart-title"><div><span className="cart-dot">●</span><strong>ລາຍການຂາຍ</strong></div><small>{cart.length} ລາຍການ</small></div>
          <div className="cart-items">{cart.length === 0 ? <div className="empty"><span>⌑</span><p>ຍັງບໍ່ມີລາຍການ</p><small>ສະແກນ ຫຼື ເລືອກສິນຄ້າເພື່ອເລີ່ມຂາຍ</small></div> : cart.map((item) => <div className="line" key={item.id}><div className="line-top"><strong>{item.name}</strong><button onClick={() => changeQty(item.id, -item.qty)}>×</button></div><small>{money(item.price)} / {item.unit}</small><div className="line-bottom"><div className="qty"><button onClick={() => changeQty(item.id,-1)}>−</button><b>{item.qty}</b><button onClick={() => changeQty(item.id,1)}>+</button></div><strong>{money(item.price * item.qty)}</strong></div></div>)}</div>
          <div className="cart-footer"><div className="sum"><span>ລວມທັງໝົດ</span><strong>{money(total)}</strong></div><div className="cart-actions"><button className="hold" onClick={holdOrder}>♧ ພັກບິນ</button><button className="pay" onClick={() => cart.length && setShowPayment(true)}>ຊຳລະເງິນ <span>→</span></button></div></div>
        </aside>
      </section>}
      {canManage && active === 'products' && <section className="page-card"><div className="section-top"><div><h2>ສິນຄ້າໃນສາງ</h2><p>ຈັດການສະຕັອກ ແລະ ຕົ້ນທຶນສະເລ່ຍ</p></div><div className="head-actions"><button className="stock-shortcut" onClick={() => openManualProduct()}>+ ເພີ່ມສິນຄ້າໃໝ່</button><button className="primary" onClick={() => setShowStockIn(true)}>+ ຮັບສິນຄ້າເຂົ້າ</button></div></div><table><thead><tr><th>ສິນຄ້າ</th><th>Barcode</th><th>ສະຕັອກ</th><th>ຕົ້ນທຶນສະເລ່ຍ</th><th>ລາຄາຂາຍ</th><th>ສະຖານະ</th><th>ຈັດການ</th></tr></thead><tbody>{products.map(p => <tr key={p.id}><td><strong>{p.name}</strong></td><td>{p.barcode}</td><td>{p.stock} {p.unit}</td><td>{money(p.cost)}</td><td>{money(p.price)}</td><td><span className={p.stock <= 0 ? 'status out' : p.stock <= 5 ? 'status low' : 'status'}>{p.stock <= 0 ? 'ໝົດ' : p.stock <= 5 ? 'ໃກ້ຈະໝົດ' : 'ປົກກະຕິ'}</span></td><td><div className="row-actions"><button onClick={() => setEditingProduct(p)}>ແກ້ໄຂ</button><button onClick={() => setAdjustingProduct(p)}>ລົບສະຕັອກ</button><button className="danger-link" onClick={() => deleteProduct(p)}>ຢຸດຂາຍ</button></div></td></tr>)}</tbody></table></section>}
      {active === 'reports' && <section className="report-grid"><div className="metric"><small>ຍອດຂາຍມື້ນີ້</small><strong>1,245,000 ₭</strong><span>↑ 12.5% ຈາກມື້ວານ</span></div><div className="metric"><small>ກຳໄລຂັ້ນຕົ້ນ</small><strong>382,500 ₭</strong><span>30.7% ຂອງຍອດຂາຍ</span></div><div className="metric"><small>ຈຳນວນບິນ</small><strong>58 ບິນ</strong><span>ສະເລ່ຍ 21,466 ₭ / ບິນ</span></div><div className="page-card report"><h2>ສະຫຼຸບກຳໄລ</h2><p>ລາຍງານນີ້ຄິດໄລ່ຈາກຕົ້ນທຶນສະເລ່ຍຂອງສິນຄ້າ.</p><div className="bar-chart">{[48,68,42,80,58,92,73].map((n,i)=><i key={i} style={{height:n+'%'}}/> )}</div></div></section>}
      {active === 'cash' && <section className="page-card cash-close"><h2>ປິດຍອດກະເງິນ</h2><p>ບັນທຶກເງິນສົດເພື່ອກວດສອບສ່ວນຕ່າງ.</p><div className="drawer"><label>ເງິນທອນເລີ່ມຕົ້ນ<input placeholder="0 ₭" /></label><label>ເງິນສົດທີ່ນັບໄດ້<input placeholder="0 ₭" /></label><button className="primary">ບັນທຶກປິດຍອດ</button></div></section>}
    </main>
    {holds.length > 0 && <div className="hold-dock"><strong>ບິນທີ່ພັກໄວ້ ({holds.length})</strong>{holds.map(h => <button key={h.id} onClick={() => recall(h)}>{h.label} · {money(h.total)} ↗</button>)}</div>}
    {showAddProduct && <div className="modal-backdrop"><form className="modal product-modal" onSubmit={saveNewProduct}><button type="button" className="close" onClick={() => { stopBarcodeCamera(); setShowAddProduct(false) }}>×</button><span className="modal-icon">+</span><h2>ເພີ່ມສິນຄ້າໃໝ່</h2><p>ໃຫ້ພະນັກງານເພີ່ມສິນຄ້າເອງໄດ້ ໂດຍບໍ່ຕ້ອງແກ້ Code.</p><label>Barcode<div className="barcode-row"><input name="barcode" value={newBarcode} onChange={(e) => setNewBarcode(e.target.value.trim())} placeholder="ສະແກນ ຫຼື ພິມ Barcode" required autoFocus /><button type="button" onClick={cameraMode ? stopBarcodeCamera : startBarcodeCamera}>{cameraMode ? 'ປິດກ້ອງ' : 'ເປີດກ້ອງ'}</button></div></label>{cameraMode && <video className="scanner-video" ref={videoRef} muted playsInline />}<label>ຊື່ສິນຄ້າ<input name="name" required /></label><div className="form-row"><label>ຕົ້ນທຶນ<input name="cost" type="number" min="0" step="1" required /></label><label>ລາຄາຂາຍ<input name="price" type="number" min="1" step="1" required /></label></div><div className="form-row"><label>ຈຳນວນເລີ່ມຕົ້ນ<input name="stock" type="number" min="0" step="1" defaultValue="0" /></label><label>ຫົວໜ່ວຍ<input name="unit" defaultValue="ອັນ" /></label></div><div className="validation-note"><strong>ການກວດກ່ອນບັນທຶກ</strong><span>ຫ້າມ Barcode ຊ້ຳ, ລາຄາຕ້ອງຖືກຕ້ອງ, ແລະຈະເຕືອນຖ້າລາຄາຂາຍຕ່ຳກວ່າຕົ້ນທຶນ.</span></div><button className="primary wide">ບັນທຶກສິນຄ້າ</button></form></div>}
    {showPayment && <div className="modal-backdrop"><div className="modal payment-modal"><button type="button" className="close" onClick={() => setShowPayment(false)}>×</button><span className="modal-icon">₭</span><h2>ຊຳລະເງິນ</h2><p>ເລືອກວິທີຈ່າຍ ແລະ ກົດ Enter ເພື່ອຢືນຢັນ.</p><div className="payment-choice"><button className={paymentMethod === 'cash' ? 'selected' : ''} onClick={() => setPaymentMethod('cash')}><b>*</b><span>ເງິນສົດ</span></button><button className={paymentMethod === 'transfer' ? 'selected' : ''} onClick={() => { setPaymentMethod('transfer'); setCash(String(total)) }}><b>-</b><span>ເງິນໂອນ</span></button></div>{paymentMethod === 'cash' && <label>ຮັບເງິນສົດ<input inputMode="numeric" autoFocus placeholder="0" value={cash} onChange={(e) => setCash(e.target.value.replace(/\D/g,''))}/></label>}{paymentMethod === 'transfer' && <div className="transfer-qr"><img src="/payment-qr.png" alt="QR Code ສຳລັບໂອນເງິນ" /><strong>ສະແກນ QR ເພື່ອໂອນເງິນ</strong><small>ກວດສອບຍອດເງິນກ່ອນກົດຢືນຢັນ</small></div>}<div className="payment-summary"><span>ລວມ</span><strong>{money(total)}</strong></div>{paymentMethod === 'cash' && <div className="payment-summary change-row"><span>ເງິນທອນ</span><strong>{money(change)}</strong></div>}<button className={printReceipt ? 'receipt-toggle on' : 'receipt-toggle'} onClick={() => setPrintReceipt((value) => !value)}><b>+</b>{printReceipt ? 'ຮັບບິນ' : 'ບໍ່ຮັບບິນ'}</button><div className="shortcut-help"><span>* ເງິນສົດ</span><span>- ເງິນໂອນ</span><span>+ ສະຫຼັບບິນ</span><span>Enter ຢືນຢັນ</span></div><button className="primary wide" onClick={checkout}>ຢືນຢັນຮັບເງິນ</button></div></div>}
    {showStockIn && <div className="modal-backdrop"><form className="modal" onSubmit={stockIn}><button type="button" className="close" onClick={() => setShowStockIn(false)}>×</button><span className="modal-icon">↓</span><h2>ຮັບສິນຄ້າເຂົ້າ</h2><p>ລະບົບຈະຄິດຕົ້ນທຶນສະເລ່ຍໃໝ່ອັດຕະໂນມັດ.</p><label>ເລືອກສິນຄ້າ<select name="productId" required defaultValue={products[0]?.id ?? ''}>{products.length === 0 && <option value="">ຍັງບໍ່ມີສິນຄ້າ</option>}{products.map((p) => <option key={p.id} value={p.id}>{p.name} (ເຫຼືອ {p.stock})</option>)}</select></label><label>ຈຳນວນຮັບເຂົ້າ<input name="quantity" type="number" min="1" step="1" required autoFocus /></label><label>ລາຄາຊື້ຕໍ່ໜ່ວຍ<input name="cost" type="number" min="0" required /></label><button className="primary wide">ບັນທຶກສະຕັອກ</button></form></div>}
    {editingProduct && <div className="modal-backdrop"><form className="modal product-modal" onSubmit={saveProductEdit}><button type="button" className="close" onClick={() => setEditingProduct(null)}>×</button><span className="modal-icon">✎</span><h2>ແກ້ໄຂສິນຄ້າ</h2><p>ປ່ຽນຊື່, Barcode, ລາຄາ ຫຼື ຈຳນວນສະຕັອກ.</p><label>Barcode<input name="barcode" defaultValue={editingProduct.barcode} required autoFocus /></label><label>ຊື່ສິນຄ້າ<input name="name" defaultValue={editingProduct.name} required /></label><div className="form-row"><label>ຕົ້ນທຶນ<input name="cost" type="number" min="0" step="1" defaultValue={editingProduct.cost} required /></label><label>ລາຄາຂາຍ<input name="price" type="number" min="1" step="1" defaultValue={editingProduct.price} required /></label></div><div className="form-row"><label>ຈຳນວນສະຕັອກ<input name="stock" type="number" min="0" step="1" defaultValue={editingProduct.stock} required /></label><label>ຫົວໜ່ວຍ<input name="unit" defaultValue={editingProduct.unit} /></label></div><button className="primary wide">ບັນທຶກການແກ້ໄຂ</button></form></div>}
    {adjustingProduct && <div className="modal-backdrop"><form className="modal" onSubmit={removeStock}><button type="button" className="close" onClick={() => setAdjustingProduct(null)}>×</button><span className="modal-icon">−</span><h2>ລົບສະຕັອກ</h2><p>{adjustingProduct.name} ເຫຼືອ {adjustingProduct.stock} {adjustingProduct.unit}</p><label>ຈຳນວນທີ່ຈະລົບ<input name="quantity" type="number" min="1" step="1" required autoFocus /></label><label>ເຫດຜົນ<input name="reason" placeholder="ເສຍຫາຍ / ນັບຜິດ / ສິນຄ້າຫາຍ" /></label><button className="primary wide">ບັນທຶກລົບສະຕັອກ</button></form></div>}
  </div>
}

function CustomerDisplay() {
  const [sale, setSale] = useState({ cart: [], total: 0, cash: 0, change: 0 })

  useEffect(() => {
    if (!supabase) return
    const channel = supabase.channel('customer-display')
      .on('broadcast', { event: 'cart' }, ({ payload }) => setSale(payload))
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  return <main className="customer-display">
    <div className="display-brand"><span className="brand-mark">K</span><strong>kennyXpay</strong><small>ຂໍຂອບໃຈທີ່ອຸດໜູນ</small></div>
    <section className="display-card"><div className="display-heading"><span>ລາຍການສິນຄ້າ</span><span>ລວມ</span></div>{sale.cart.length ? sale.cart.map((item) => <div className="display-line" key={item.id}><span>{item.name} <b>× {item.qty}</b></span><strong>{money(item.price * item.qty)}</strong></div>) : <div className="display-empty">ກຳລັງລໍຖ້າລາຍການສິນຄ້າ...</div>}<div className="display-total"><span>ຍອດລວມສຸດທິ</span><strong>{money(sale.total)}</strong></div>{sale.cash > 0 && <div className="display-change"><span>ເງິນທອນ</span><strong>{money(sale.change)}</strong></div>}</section>
  </main>
}

function OwnerDashboard({ user, onOpenPos }) {
  const [products, setProducts] = useState([])
  const [orders, setOrders] = useState([])
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [ownerNotice, setOwnerNotice] = useState('')
  const todayStart = useMemo(() => {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    return date.toISOString()
  }, [])

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    const loadOwnerData = async () => {
      const productResult = await supabase.from('products').select('*').order('name')
      const orderResult = await supabase.from('orders').select('*').gte('created_at', todayStart).order('created_at', { ascending: false })
      const profileResult = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
      setProducts((productResult.data || []).map(databaseProductToAppProduct))
      setOrders(orderResult.data || [])
      setProfiles(profileResult.data || [])
      setLoading(false)
    }
    loadOwnerData()
  }, [todayStart])

  const lowItems = products.filter((p) => p.stock >= 1 && p.stock <= 5)
  const outItems = products.filter((p) => p.stock <= 0)
  const todaySales = orders.reduce((sum, order) => sum + Number(order.total || 0), 0)
  const pendingProfiles = profiles.filter((profile) => (profile.status || 'pending') === 'pending' && profile.email !== user?.email)
  const activeProfiles = profiles.filter((profile) => (profile.status || 'pending') !== 'pending')

  const updateProfileAccess = async (profile, updates) => {
    if (!supabase) return
    setOwnerNotice('')
    const next = { ...updates, updated_at: new Date().toISOString() }
    const { error } = await supabase.from('profiles').update(next).eq('id', profile.id)
    if (error) return setOwnerNotice('ອັບເດດ user ບໍ່ສຳເລັດ: ' + error.message)
    setProfiles((items) => items.map((item) => item.id === profile.id ? { ...item, ...next } : item))
    setOwnerNotice('ອັບເດດ user ສຳເລັດ: ' + (profile.email || 'user'))
  }

  return <main className="owner-page">
    <section className="owner-hero">
      <div><span className="brand-mark">K</span><p className="eyebrow">Owner Dashboard</p><h1>ສະຫຼຸບຮ້ານ kennyXpay</h1><small>{user?.email}</small></div>
      <div className="owner-actions"><button className="primary" onClick={onOpenPos}>ເຂົ້າໜ້າ POS</button><button className="signout" onClick={() => supabase?.auth.signOut()}>ອອກຈາກລະບົບ</button></div>
    </section>
    {loading ? <div className="page-card">ກຳລັງໂຫຼດຂໍ້ມູນ...</div> : <>
      <section className="owner-metrics">
        <div className="metric"><small>ຍອດຂາຍມື້ນີ້</small><strong>{money(todaySales)}</strong><span>{orders.length} ບິນ</span></div>
        <div className="metric"><small>ສິນຄ້າໝົດ</small><strong>{outItems.length}</strong><span>stock 0</span></div>
        <div className="metric"><small>ໃກ້ຈະໝົດ</small><strong>{lowItems.length}</strong><span>stock 1-5</span></div>
      </section>
      <section className="stock-alerts owner-alerts">
        <div className={outItems.length ? 'alert out' : 'alert out muted'}><span>0</span><div><strong>ສິນຄ້າໝົດແລ້ວ</strong><small>{outItems.length ? outItems.map((p) => p.name).join(', ') : 'ບໍ່ມີ'}</small></div></div>
        <div className={lowItems.length ? 'alert low' : 'alert low muted'}><span>!</span><div><strong>ສິນຄ້າໃກ້ຈະໝົດ</strong><small>{lowItems.length ? lowItems.map((p) => `${p.name} (${p.stock})`).join(', ') : 'ບໍ່ມີ'}</small></div></div>
      </section>
      <section className="page-card user-access-card">
        <div className="section-top"><div><h2>ສິດເຂົ້າໃຊ້ງານ</h2><p>Owner ອະນຸມັດບັນຊີໃໝ່ ແລະ ກຳນົດ role: admin / worker.</p></div><strong className="pending-pill">{pendingProfiles.length} ລໍອະນຸມັດ</strong></div>
        {ownerNotice && <div className="auth-message">{ownerNotice}</div>}
        <div className="user-list">
          {pendingProfiles.length === 0 && <p className="muted-text">ບໍ່ມີຄົນລໍອະນຸມັດ</p>}
          {pendingProfiles.map((profile) => <div className="user-row pending" key={profile.id}><div><strong>{profile.email || 'ບໍ່ມີ email'}</strong><small>ສະຖານະ: ລໍອະນຸມັດ</small></div><div className="row-actions"><button onClick={() => updateProfileAccess(profile, { role: 'worker', status: 'active' })}>ອະນຸມັດ worker</button><button onClick={() => updateProfileAccess(profile, { role: 'admin', status: 'active' })}>ອະນຸມັດ admin</button><button className="danger-link" onClick={() => updateProfileAccess(profile, { status: 'blocked' })}>ປະຕິເສດ</button></div></div>)}
          {activeProfiles.map((profile) => <div className="user-row" key={profile.id}><div><strong>{profile.email || 'ບໍ່ມີ email'}</strong><small>Role: {profile.role} · Status: {profile.status || 'pending'}</small></div><div className="row-actions"><button onClick={() => updateProfileAccess(profile, { role: 'worker', status: 'active' })}>worker</button><button onClick={() => updateProfileAccess(profile, { role: 'admin', status: 'active' })}>admin</button>{profile.email !== user?.email && <button className="danger-link" onClick={() => updateProfileAccess(profile, { status: 'blocked' })}>block</button>}</div></div>)}
        </div>
      </section>
      <section className="page-card">
        <h2>ບິນລ່າສຸດມື້ນີ້</h2>
        <div className="owner-orders">{orders.slice(0, 8).map((order) => <div key={order.id}><span>{new Date(order.created_at).toLocaleTimeString('lo-LA', { hour: '2-digit', minute: '2-digit' })}</span><strong>{money(order.total)}</strong><small>{order.payment_method === 'transfer' ? 'ເງິນໂອນ' : 'ເງິນສົດ'}</small></div>)}{orders.length === 0 && <p className="muted-text">ຍັງບໍ່ມີບິນມື້ນີ້</p>}</div>
      </section>
    </>}
  </main>
}

function AuthScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState('login')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    if (!supabase) return setMessage('ບໍ່ພົບການຕັ້ງຄ່າ Supabase')
    setBusy(true); setMessage('')
    const result = mode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password })
    if (!result.error && mode === 'signup' && result.data?.user) {
      await supabase.from('profiles').upsert({ id: result.data.user.id, email, role: 'worker', status: 'pending' }, { onConflict: 'id' })
    }
    setBusy(false)
    if (result.error) setMessage(result.error.message)
    else if (mode === 'signup') setMessage('ສົ່ງຄຳຂໍເຂົ້າໃຊ້ແລ້ວ. ກະລຸນາລໍຖ້າ owner ອະນຸມັດ.')
  }

  return <main className="auth-page"><section className="auth-card"><div className="auth-logo"><span className="brand-mark">K</span><div><strong>kennyXpay</strong><small>POS ອັດສະລິຍະ</small></div></div><h1>{mode === 'login' ? 'ເຂົ້າໃຊ້ງານ' : 'ສ້າງບັນຊີພະນັກງານ'}</h1><p>ໃຊ້ email ແລະ password ຈາກ Supabase Authentication</p><form onSubmit={submit}><label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></label><label>Password<input type="password" minLength="6" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>{message && <div className="auth-message">{message}</div>}<button className="primary wide" disabled={busy}>{busy ? 'ກຳລັງດຳເນີນການ...' : mode === 'login' ? 'ເຂົ້າລະບົບ' : 'ສ້າງບັນຊີ'}</button></form><button className="switch-auth" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage('') }}>{mode === 'login' ? 'ຍັງບໍ່ມີບັນຊີ? ສ້າງບັນຊີ' : 'ມີບັນຊີແລ້ວ? ເຂົ້າລະບົບ'}</button></section></main>
}

function AccessStatusScreen({ profile }) {
  const blocked = profile?.status === 'blocked'
  return <main className="auth-page"><section className="auth-card"><div className="auth-logo"><span className="brand-mark">K</span><div><strong>kennyXpay</strong><small>ກວດສອບສິດເຂົ້າໃຊ້</small></div></div><h1>{blocked ? 'ບັນຊີຖືກປິດໃຊ້ງານ' : 'ລໍຖ້າ owner ອະນຸມັດ'}</h1><p>{blocked ? 'ກະລຸນາຕິດຕໍ່ owner ຂອງຮ້ານ.' : 'ບັນຊີນີ້ສະໝັກແລ້ວ ແຕ່ຍັງບໍ່ມີສິດເຂົ້າ POS. Owner ຕ້ອງອະນຸມັດແລະເລືອກ role ກ່ອນ.'}</p><button className="primary wide" onClick={() => supabase?.auth.signOut()}>ອອກຈາກລະບົບ</button></section></main>
}

const defaultPendingProfile = (user) => ({
  id: user.id,
  email: user.email,
  role: user.email === 'tofalaleo@gmail.com' ? 'owner' : 'worker',
  status: user.email === 'tofalaleo@gmail.com' ? 'active' : 'pending',
})

async function loadProfileForUser(user) {
  const fallback = defaultPendingProfile(user)
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
  if (!error && data) return data
  if (fallback.role === 'owner') return fallback

  const { data: created } = await supabase
    .from('profiles')
    .upsert(fallback, { onConflict: 'id' })
    .select('*')
    .single()

  return created || fallback
}

function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState({ role: 'worker', status: 'pending' })
  const [ownerPosMode, setOwnerPosMode] = useState(false)
  const [loading, setLoading] = useState(true)
  const displayMode = new URLSearchParams(window.location.search).get('display') === '1'
  const isOwnerEmail = session?.user?.email === 'tofalaleo@gmail.com'
  const effectiveProfile = isOwnerEmail ? { ...profile, role: 'owner', status: 'active' } : profile

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession()
      setSession(data.session)
      if (data.session?.user) {
        setProfile(await loadProfileForUser(data.session.user))
      }
      setLoading(false)
    }
    loadSession()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession)
      setOwnerPosMode(false)
      if (nextSession?.user) {
        setProfile(await loadProfileForUser(nextSession.user))
      } else {
        setProfile({ role: 'worker', status: 'pending' })
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  if (displayMode) return <CustomerDisplay />
  if (loading) return <div className="loading">ກຳລັງເປີດລະບົບ...</div>
  if (!session) return <AuthScreen />
  if (effectiveProfile.status !== 'active') return <AccessStatusScreen profile={effectiveProfile} />
  if (effectiveProfile.role === 'owner' && !ownerPosMode) return <OwnerDashboard user={session.user} onOpenPos={() => setOwnerPosMode(true)} />
  return <PosApp user={session.user} role={effectiveProfile.role} onOwnerHome={() => setOwnerPosMode(false)} />
}

export default App
