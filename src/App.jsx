import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { databaseProductToAppProduct, isSupabaseConfigured, supabase } from './supabase'

const OWNER_EMAILS = ['tofalaleo@gmail.com']
const MAX_OWNER_ACCOUNTS = 5
const normalizeEmail = (email) => String(email || '').trim().toLowerCase()
const isOwnerEmail = (email) => OWNER_EMAILS.includes(normalizeEmail(email))
const isOwnerUser = (user, profile) => isOwnerEmail(user?.email || profile?.email) || profile?.role === 'owner'
const safeProfile = (profile) => {
  if (!profile) return profile
  if (isOwnerEmail(profile.email)) return { ...profile, role: 'owner', status: 'active' }
  return profile
}
const authErrorMessage = (message = '') => {
  const text = String(message).toLowerCase()
  if (text.includes('invalid login') || text.includes('invalid credentials')) return 'Email ຫຼື Password ບໍ່ຖືກ. ກະລຸນາກວດ password ໃໝ່.'
  if (text.includes('email not confirmed')) return 'Email ນີ້ຍັງບໍ່ confirm. ກະລຸນາເປີດ email ແລ້ວກົດ confirm/reset password.'
  if (text.includes('user already registered') || text.includes('already registered')) return 'Email ນີ້ມີບັນຊີແລ້ວ. ກະລຸນາກົດ “ມີບັນຊີແລ້ວ? ເຂົ້າລະບົບ”.'
  return message || 'ເຂົ້າລະບົບບໍ່ໄດ້. ກະລຸນາລອງໃໝ່.'
}

const money = (value) => new Intl.NumberFormat('lo-LA').format(value) + ' ₭'
const laoWeekdays = ['ວັນອາທິດ', 'ວັນຈັນ', 'ວັນອັງຄານ', 'ວັນພຸດ', 'ວັນພະຫັດ', 'ວັນສຸກ', 'ວັນເສົາ']
const laoMonths = ['ມັງກອນ', 'ກຸມພາ', 'ມີນາ', 'ເມສາ', 'ພຶດສະພາ', 'ມິຖຸນາ', 'ກໍລະກົດ', 'ສິງຫາ', 'ກັນຍາ', 'ຕຸລາ', 'ພະຈິກ', 'ທັນວາ']
const APP_BUILD = 'stock-search-20260716'

function PosApp({ user, role = 'worker', onOwnerHome }) {
  const [products, setProducts] = useState([])
  const [productsLoading, setProductsLoading] = useState(true)
  const [reportOrders, setReportOrders] = useState([])
  const [monthlyReports, setMonthlyReports] = useState([])
  const [reportsLoading, setReportsLoading] = useState(false)
  const [cart, setCart] = useState([])
  const [lastAddedId, setLastAddedId] = useState(null)
  const [search, setSearch] = useState('')
  const [stockSearch, setStockSearch] = useState('')
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
  const [showReceiptPopup, setShowReceiptPopup] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [printReceipt, setPrintReceipt] = useState(true)
  const [isCheckingOut, setIsCheckingOut] = useState(false)
  const [cameraMode, setCameraMode] = useState(false)
  const [posCameraMode, setPosCameraMode] = useState(false)
  const videoRef = useRef(null)
  const posVideoRef = useRef(null)
  const cashInputRef = useRef(null)
  const streamRef = useRef(null)
  const posStreamRef = useRef(null)
  const scanLoopRef = useRef(0)
  const posScanLoopRef = useRef(0)
  const lastCameraScanRef = useRef({ code: '', at: 0 })
  const scannerBufferRef = useRef({ text: '', at: 0 })
  const total = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.qty, 0), [cart])
  const profit = useMemo(() => cart.reduce((sum, item) => sum + (item.price - item.cost) * item.qty, 0), [cart])
  const change = Math.max(0, Number(cash || 0) - total)
  const currentMonthReport = useMemo(() => {
    const sales = reportOrders.reduce((sum, order) => sum + Number(order.total || 0), 0)
    const cost = reportOrders.reduce((sum, order) => sum + (order.order_items || []).reduce((itemSum, item) => itemSum + Number(item.quantity || 0) * Number(item.cost_at_sale || 0), 0), 0)
    return { sales, cost, profit: sales - cost, orders: reportOrders.length }
  }, [reportOrders])
  const lowItems = products.filter((p) => p.stock >= 1 && p.stock <= 5)
  const outItems = products.filter((p) => p.stock <= 0)
  const alertCount = lowItems.length + outItems.length
  const canManage = role === 'owner'
  const todayLabel = useMemo(() => {
    const now = new Date()
    return `${laoWeekdays[now.getDay()]}, ${now.getDate()} ${laoMonths[now.getMonth()]} ${now.getFullYear()}`
  }, [])

  useEffect(() => {
    if (!canManage && active !== 'sale') setActive('sale')
    if (!canManage) {
      setShowAddProduct(false)
      setShowStockIn(false)
      setEditingProduct(null)
      setAdjustingProduct(null)
      setShowNew(false)
    }
  }, [active, canManage])

  const loadProducts = async () => {
    if (!supabase) {
      setProductsLoading(false)
      return []
    }
    let { data, error } = await supabase.from('products').select('*').eq('is_active', true).order('name')
    if (error) {
      const fallback = await supabase.from('products').select('*').order('name')
      data = fallback.data
      error = fallback.error
    }
    if (error) {
      setProducts([])
      setProductsLoading(false)
      setNotice('ໂຫຼດສິນຄ້າຈາກ Supabase ບໍ່ໄດ້: ' + error.message)
      return []
    }
    const nextProducts = (data || []).map(databaseProductToAppProduct)
    setProducts(nextProducts)
    setProductsLoading(false)
    return nextProducts
  }

  const loadReports = async () => {
    if (!supabase) return
    setReportsLoading(true)
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()
    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('status', 'completed')
      .gte('created_at', start)
      .lt('created_at', end)
      .order('created_at', { ascending: false })
    if (ordersError) setNotice('ໂຫຼດລາຍງານເດືອນນີ້ບໍ່ໄດ້: ' + ordersError.message)
    setReportOrders(ordersData || [])

    const { data: archiveData, error: archiveError } = await supabase
      .from('monthly_reports')
      .select('*')
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .limit(24)
    if (!archiveError) setMonthlyReports(archiveData || [])
    setReportsLoading(false)
  }

  const closePreviousMonth = async () => {
    if (!supabase) return setNotice('Supabase ຍັງບໍ່ພ້ອມ')
    const now = new Date()
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const year = previousMonth.getFullYear()
    const month = previousMonth.getMonth() + 1
    if (!window.confirm(`ປິດເດືອນ ${month}/${year} ບໍ? ລະບົບຈະເກັບ archive ກຳໄລແລ້ວລຶບບິນເດືອນເກົ່າ, ແຕ່ stock ຈະບໍ່ຖືກລຶບ.`)) return
    setReportsLoading(true)
    const { error } = await supabase.rpc('close_sales_month', { p_year: year, p_month: month, p_delete_sales: true })
    setReportsLoading(false)
    if (error) return setNotice('ປິດເດືອນບໍ່ສຳເລັດ: ' + error.message + ' — ກະລຸນາ Run supabase-monthly-archive.sql ກ່ອນ')
    setNotice(`ປິດເດືອນ ${month}/${year} ສຳເລັດ — stock ຍັງຢູ່ຄືເກົ່າ`)
    await loadReports()
  }

  useEffect(() => {
    if (!supabase) {
      setProductsLoading(false)
      return
    }
    loadProducts()
    const channel = supabase.channel('products-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, loadProducts)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  useEffect(() => {
    if (active === 'reports') loadReports()
  }, [active])

  useEffect(() => {
    const payload = { cart, total, cash: Number(cash || 0), change, paymentOpen: showPayment, paymentMethod }
    localStorage.setItem('kennyxpay-current-sale', JSON.stringify(payload))
    if ('BroadcastChannel' in window) {
      const broadcast = new BroadcastChannel('kennyxpay-customer-display')
      broadcast.postMessage(payload)
      broadcast.close()
    }
    if (!supabase) return
    const channel = supabase.channel('customer-display')
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') channel.send({ type: 'broadcast', event: 'cart', payload })
    })
    return () => supabase.removeChannel(channel)
  }, [cart, total, cash, change, showPayment, paymentMethod])

  useEffect(() => {
    if (!cart.length) setShowReceiptPopup(false)
  }, [cart.length])

  useEffect(() => {
    if (showPayment) setShowReceiptPopup(false)
  }, [showPayment])

  useEffect(() => () => { stopBarcodeCamera(); stopPosCameraScanner() }, [])

  useEffect(() => {
    if (!showPayment) return
    setTimeout(() => {
      if (paymentMethod === 'cash') cashInputRef.current?.focus()
    }, 50)
    const onKeyDown = (event) => {
      const tag = event.target?.tagName
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      if (event.key === '*') { event.preventDefault(); setPaymentMethod('cash'); setTimeout(() => cashInputRef.current?.focus(), 50) }
      if (event.key === '-') { event.preventDefault(); setPaymentMethod('transfer'); setCash(String(total)) }
      if (event.key === '+') { event.preventDefault(); setPrintReceipt((value) => !value) }
      if (event.key === 'Enter') { event.preventDefault(); confirmPayment() }
      if (event.key === 'Escape') { event.preventDefault(); setShowPayment(false) }
      if (isTyping && !['Enter', 'Escape', '*', '-', '+'].includes(event.key)) return
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showPayment, cart, cash, paymentMethod, printReceipt])

  const openPaymentPopup = () => {
    if (!cart.length) return
    setPaymentMethod('cash')
    setShowReceiptPopup(false)
    setShowPayment(true)
  }

  useEffect(() => {
    const onKeyDown = (event) => {
      const tag = event.target?.tagName
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      if (showPayment || showAddProduct || showStockIn || isTyping) return
      if (active !== 'sale') return
      if (event.key === 'Enter' && cart.length) {
        event.preventDefault()
        openPaymentPopup()
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
    if (!canManage) {
      setNotice('ບໍ່ພົບ Barcode ນີ້. ກະລຸນາໃຫ້ owner/admin ເພີ່ມສິນຄ້າກ່ອນ.')
      return
    }
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
    setActive('sale')
    setShowReceiptPopup(true)
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
    else if (canManage) { openManualProduct(code) }
    else { setSearch(''); setNotice('ບໍ່ພົບ Barcode ນີ້ — ໃຫ້ owner/admin ເພີ່ມສິນຄ້າກ່ອນ') }
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
    setCart([]); setCash(''); setShowReceiptPopup(false); setNotice('ພັກບິນແລ້ວ')
  }

  const recall = (hold) => { setCart(hold.cart); setShowReceiptPopup(true); setHolds((items) => items.filter((item) => item.id !== hold.id)); setActive('sale'); setNotice('ເອີ້ນບິນກັບຄືນແລ້ວ') }

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
    if (!canManage) return setNotice('worker ບໍ່ມີສິດເພີ່ມສິນຄ້າ')
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
    if (stock > 0) {
      const { error: txError } = await supabase.from('inventory_transactions').insert({ product_id: data.id, created_by: user.id, transaction_type: 'stock_in', quantity_change: stock, unit_cost: cost, reason: 'ເພີ່ມສິນຄ້າໃໝ່' })
      if (txError) setNotice('ສິນຄ້າຖືກບັນທຶກແລ້ວ ແຕ່ບັນທຶກປະຫວັດສະຕັອກບໍ່ໄດ້: ' + txError.message)
    }
    await loadProducts()
    setShowAddProduct(false)
    setShowNew(false)
    setNewBarcode('')
    setSearch('')
    stopBarcodeCamera()
    setNotice('ເພີ່ມສິນຄ້າໃໝ່ສຳເລັດ: ' + product.name)
  }

  const checkout = async (paidOverride) => {
    if (!cart.length || isCheckingOut) return
    const paidAmount = paymentMethod === 'cash' ? Number((paidOverride ?? cash) || 0) : total
    const paidChange = Math.max(0, paidAmount - total)
    if (paymentMethod === 'cash' && paidAmount < total) return setNotice('ເງິນສົດທີ່ຮັບຍັງບໍ່ພໍ')
    setIsCheckingOut(true)
    setShowReceiptPopup(false)
    try {
      if (supabase && user) {
        const orderPayload = {
          store_id: user.id, cashier_id: user.id, status: 'completed', total,
          payment_amount: paymentMethod === 'cash' ? paidAmount : total,
          change_amount: paymentMethod === 'cash' ? paidChange : 0,
          payment_method: paymentMethod,
          print_receipt: printReceipt,
        }
        let { data: order, error: orderError } = await supabase.from('orders').insert(orderPayload).select('id').single()
        if (orderError) {
          const { payment_method, print_receipt, ...fallbackPayload } = orderPayload
          ;({ data: order, error: orderError } = await supabase.from('orders').insert(fallbackPayload).select('id').single())
        }
        if (orderError) {
          setNotice('ບັນທຶກບິນບໍ່ສຳເລັດ: ' + orderError.message)
          return
        }
        const { error: itemError } = await supabase.from('order_items').insert(cart.map((item) => ({
          order_id: order.id, product_id: typeof item.id === 'string' ? item.id : null, product_name: item.name,
          quantity: item.qty, unit_price: item.price, cost_at_sale: item.cost,
        })))
        if (itemError) {
          setNotice('ບັນທຶກລາຍການບໍ່ສຳເລັດ: ' + itemError.message + ' — ກະລຸນາ run supabase-checkout-rls-fix.sql')
          return
        }
        const stockResults = await Promise.all(cart.filter((item) => typeof item.id === 'string').map((item) => supabase.from('products').update({ stock_quantity: Math.max(0, item.stock - item.qty) }).eq('id', item.id)))
        const stockError = stockResults.find((result) => result.error)?.error
        if (stockError) setNotice('ບິນສຳເລັດ ແຕ່ຫັກສະຕັອກບາງລາຍການບໍ່ໄດ້: ' + stockError.message)
      }
      setProducts((all) => all.map((p) => { const line = cart.find((c) => c.id === p.id); return line ? { ...p, stock: p.stock - line.qty } : p }))
      setCart([])
      setCash('')
      setShowPayment(false)
      setShowReceiptPopup(false)
      setNotice(`ຊຳລະເງິນສຳເລັດ (${paymentMethod === 'cash' ? 'ເງິນສົດ' : 'ເງິນໂອນ'}) — ກຳໄລຂັ້ນຕົ້ນ ` + money(profit))
    } finally {
      setIsCheckingOut(false)
    }
  }

  const confirmPayment = () => {
    if (!cart.length) return
    if (paymentMethod === 'cash') {
      const paidAmount = Number(cash || 0)
      if (paidAmount <= 0) return setNotice('ກະລຸນາໃສ່ເງິນສົດທີ່ຮັບກ່ອນ')
      return checkout(paidAmount)
    }
    setCash(String(total))
    return checkout(total)
  }

  const stockIn = async (event) => {
    event.preventDefault()
    if (!canManage) return setNotice('worker ບໍ່ມີສິດຮັບສະຕັອກ')
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
      const { error: txError } = await supabase.from('inventory_transactions').insert({ product_id: product.id, created_by: user.id, transaction_type: 'stock_in', quantity_change: quantity, unit_cost: purchaseCost, reason: 'ຮັບສິນຄ້າເຂົ້າ' })
      if (txError) return setNotice('ສະຕັອກຖືກອັບເດດແລ້ວ ແຕ່ບັນທຶກປະຫວັດບໍ່ໄດ້: ' + txError.message)
    }
    await loadProducts()
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
    await loadProducts()
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
      const { error: txError } = await supabase.from('inventory_transactions').insert({ product_id: product.id, created_by: user.id, transaction_type: 'adjustment', quantity_change: -Math.min(quantity, product.stock), unit_cost: product.cost, reason })
      if (txError) return setNotice('ສະຕັອກຖືກອັບເດດແລ້ວ ແຕ່ບັນທຶກປະຫວັດບໍ່ໄດ້: ' + txError.message)
    }
    await loadProducts()
    setAdjustingProduct(null)
    setNotice(`ລົບສະຕັອກ ${product.name} ແລ້ວ`)
  }

  const filtered = products.filter((p) => p.name.includes(search) || p.barcode.includes(search))
  const stockQuery = stockSearch.trim().toLowerCase()
  const stockFiltered = stockQuery
    ? products.filter((p) => String(p.name || '').toLowerCase().includes(stockQuery) || String(p.barcode || '').toLowerCase().includes(stockQuery))
    : products
  const runStockSearch = () => {
    const query = stockSearch.trim()
    if (!query) {
      setNotice('ພິມຊື່ສິນຄ້າ ຫຼື ສະແກນ Barcode ກ່ອນ')
      return
    }
    setNotice(`ພົບ ${stockFiltered.length} ລາຍການສຳລັບ “${query}”`)
  }

  return <div className={showPayment ? 'app-shell payment-open' : 'app-shell'}>
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">K</span><div><strong>kennyXpay</strong><small>POS ອັດສະລິຍະ</small></div></div>
      <nav>
        {canManage && <button className="nav" onClick={onOwnerHome}><span>⌂</span>ໜ້າ Owner</button>}
        {(canManage ? [['sale','▣','ໜ້າຂາຍ'],['products','◫','ສິນຄ້າ & ສະຕັອກ'],['reports','◔','ລາຍງານ'],['cash','▤','ປິດຍອດເງິນສົດ']] : [['sale','▣','ໜ້າຂາຍ']]).map(([id, icon, label]) => <button key={id} className={active === id ? 'nav active' : 'nav'} onClick={() => setActive(id)}><span>{icon}</span>{label}{id === 'products' && alertCount > 0 && <b>{alertCount}</b>}</button>)}
      </nav>
      <div className="sidebar-foot"><span className="dot"/> ລະບົບພ້ອມໃຊ້ງານ</div>
    </aside>
    <main>
      <header><div><p className="eyebrow">{todayLabel} {isSupabaseConfigured ? '· Supabase ພ້ອມ' : '· ໂໝດທົດລອງ'} · {APP_BUILD}</p><h1>{active === 'sale' ? 'ໜ້າຂາຍສິນຄ້າ' : active === 'products' ? 'ສິນຄ້າ & ສະຕັອກ' : active === 'reports' ? 'ພາບລວມກຳໄລ' : 'ປິດຍອດເງິນສົດ'}</h1></div><div className="user"><span>ພ</span><div><strong>{user?.email || 'ພະນັກງານ'}</strong><button className="signout" onClick={() => supabase?.auth.signOut()}>ອອກຈາກລະບົບ</button></div></div></header>
      {notice && <div className="toast">✓ {notice}<button onClick={() => setNotice('')}>×</button></div>}
      {active === 'sale' && <section className="sale-page">
        <div className="catalog">
          <div className="stock-alerts">
            <div className={outItems.length > 0 ? 'alert out' : 'alert out muted'}><span>0</span><div><strong>ສິນຄ້າໝົດແລ້ວ (stock 0)</strong><small>{outItems.length > 0 ? `${outItems.map((p) => p.name).join(', ')} ໝົດແລ້ວ` : 'ບໍ່ມີສິນຄ້າໝົດ'}</small></div></div>
            <div className={lowItems.length > 0 ? 'alert low' : 'alert low muted'}><span>!</span><div><strong>ສິນຄ້າໃກ້ຈະໝົດ (stock 1-5)</strong><small>{lowItems.length > 0 ? `${lowItems.map((p) => `${p.name} (${p.stock})`).join(', ')} ເຫຼືອ 1-5` : 'ບໍ່ມີສິນຄ້າໃກ້ຈະໝົດ'}</small></div></div>
          </div>
          <div className="search"><span>⌕</span><input autoFocus placeholder="ສະແກນ Barcode ຫຼື ຄົ້ນຫາສິນຄ້າ..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && scan()} /><button onClick={() => scan()}>ສະແກນ</button><button className={posCameraMode ? 'camera-on' : ''} onClick={posCameraMode ? stopPosCameraScanner : startPosCameraScanner}>{posCameraMode ? 'ປິດກ້ອງ' : 'ເປີດກ້ອງ'}</button></div>
          {posCameraMode && <div className="pos-scanner"><video ref={posVideoRef} muted playsInline /><small>ກຳລັງສະແກນດ້ວຍກ້ອງ... ພົບ Barcode ແລ້ວຈະເພີ່ມເຂົ້າຕະກ້າອັດຕະໂນມັດ</small></div>}
          <div className="catalog-head"><div><strong>ສິນຄ້າຍອດນິຍົມ</strong><small>{filtered.length} ລາຍການ</small></div></div>
          <div className="sale-shortcuts"><span><b>Enter</b> ຊຳລະເງິນ</span><span><b>Backspace</b> ຍ້ອນກັບລາຍການຫຼ້າສຸດ</span></div>
          <div className="product-grid">{productsLoading ? <div className="empty products-empty"><span>⌛</span><p>ກຳລັງໂຫຼດສິນຄ້າຈາກ Supabase...</p></div> : filtered.length === 0 ? <div className="empty products-empty"><span>⌕</span><p>ບໍ່ພົບສິນຄ້າ</p><small>{canManage ? 'ໄປໜ້າ “ສິນຄ້າ & ສະຕັອກ” ເພື່ອເພີ່ມສິນຄ້າໃໝ່' : 'ກະລຸນາໃຫ້ owner/admin ເພີ່ມສິນຄ້າກ່ອນ'}</small></div> : filtered.map((p) => <button className="product" key={p.id} onClick={() => addProduct(p)}><span className="product-icon" style={{background:p.color}}>▣</span><strong>{p.name}</strong><small>{p.stock} {p.unit} ເຫຼືອ</small><b>{money(p.price)}</b></button>)}</div>
        </div>
        {!showPayment && <aside className={showReceiptPopup ? 'cart receipt-popup' : 'cart'}><div className="cart-title"><div><span className="cart-dot">●</span><strong>ລາຍການຂາຍ</strong></div><div className="cart-title-actions"><small>{cart.length} ລາຍການ</small>{showReceiptPopup && <button className="cart-close" type="button" onClick={() => setShowReceiptPopup(false)}>×</button>}</div></div>
          <div className="cart-items">{cart.length === 0 ? <div className="empty"><span>⌑</span><p>ຍັງບໍ່ມີລາຍການ</p><small>ສະແກນ ຫຼື ເລືອກສິນຄ້າເພື່ອເລີ່ມຂາຍ</small></div> : cart.map((item) => <div className="line" key={item.id}><div className="line-top"><strong>{item.name}</strong><button onClick={() => changeQty(item.id, -item.qty)}>×</button></div><small>{money(item.price)} / {item.unit}</small><div className="line-bottom"><div className="qty"><button onClick={() => changeQty(item.id,-1)}>−</button><b>{item.qty}</b><button onClick={() => changeQty(item.id,1)}>+</button></div><strong>{money(item.price * item.qty)}</strong></div></div>)}</div>
          <div className="cart-footer"><div className="sum"><span>ລວມທັງໝົດ</span><strong>{money(total)}</strong></div><div className="cart-actions"><button className="hold" onClick={holdOrder}>♧ ພັກບິນ</button><button className="pay" onClick={openPaymentPopup}>ຊຳລະເງິນ <span>→</span></button></div></div>
        </aside>}
      </section>}
      {canManage && active === 'products' && <section className="page-card"><div className="section-top"><div><h2>ສິນຄ້າໃນສາງ</h2><p>ຈັດການສະຕັອກ ແລະ ຕົ້ນທຶນສະເລ່ຍ</p></div><div className="head-actions"><button className="stock-shortcut" onClick={() => openManualProduct()}>+ ເພີ່ມສິນຄ້າໃໝ່</button><button className="primary" onClick={() => setShowStockIn(true)}>+ ຮັບສິນຄ້າເຂົ້າ</button></div></div><div className="search stock-search"><span>⌕</span><input autoFocus value={stockSearch} onChange={(e) => setStockSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') runStockSearch() }} placeholder="ສະແກນ Barcode ຫຼື ພິມຊື່ສິນຄ້າເພື່ອຄົ້ນຫາ..." /><button onClick={runStockSearch}>ຄົ້ນຫາ</button><button className="soft-btn" onClick={() => { setStockSearch(''); setNotice('ລ້າງການຄົ້ນຫາແລ້ວ') }}>ລ້າງ</button></div><p className="stock-search-note">ໃຊ້ເຄື່ອງສະແກນໄດ້ເລີຍ: ກົດໃສ່ຊ່ອງນີ້ 1 ຄັ້ງ ແລ້ວສະແກນ / ຫຼືພິມຊື່ສິນຄ້າ.</p><table><thead><tr><th>ສິນຄ້າ</th><th>Barcode</th><th>ສະຕັອກ</th><th>ຕົ້ນທຶນສະເລ່ຍ</th><th>ລາຄາຂາຍ</th><th>ສະຖານະ</th><th>ຈັດການ</th></tr></thead><tbody>{stockFiltered.length === 0 ? <tr><td className="empty-row" colSpan="7">ບໍ່ພົບສິນຄ້າທີ່ຄົ້ນຫາ</td></tr> : stockFiltered.map(p => <tr key={p.id}><td><strong>{p.name}</strong></td><td>{p.barcode}</td><td>{p.stock} {p.unit}</td><td>{money(p.cost)}</td><td>{money(p.price)}</td><td><span className={p.stock <= 0 ? 'status out' : p.stock <= 5 ? 'status low' : 'status'}>{p.stock <= 0 ? 'ໝົດ' : p.stock <= 5 ? 'ໃກ້ຈະໝົດ' : 'ປົກກະຕິ'}</span></td><td><div className="row-actions"><button onClick={() => setEditingProduct(p)}>ແກ້ໄຂ</button><button onClick={() => setAdjustingProduct(p)}>ລົບສະຕັອກ</button><button className="danger-link" onClick={() => deleteProduct(p)}>ຢຸດຂາຍ</button></div></td></tr>)}</tbody></table></section>}
      {canManage && active === 'reports' && <section className="report-grid">
        <div className="metric"><small>ຍອດຂາຍເດືອນນີ້</small><strong>{money(currentMonthReport.sales)}</strong><span>{currentMonthReport.orders} ບິນ</span></div>
        <div className="metric"><small>ຕົ້ນທຶນເດືອນນີ້</small><strong>{money(currentMonthReport.cost)}</strong><span>ຄິດຈາກ cost_at_sale</span></div>
        <div className="metric"><small>ກຳໄລເດືອນນີ້</small><strong>{money(currentMonthReport.profit)}</strong><span>{currentMonthReport.sales > 0 ? `${Math.round((currentMonthReport.profit / currentMonthReport.sales) * 100)}%` : '0%'} ຂອງຍອດຂາຍ</span></div>
        <div className="page-card report">
          <div className="section-top"><div><h2>Archive ກຳໄລລາຍເດືອນ</h2><p>ເກັບຍອດຂາຍ, ຕົ້ນທຶນ ແລະ ກຳໄລໄວ້ກ່ອນ clear ບິນເກົ່າ. Stock ບໍ່ຖືກລຶບ.</p></div><button className="primary" disabled={reportsLoading} onClick={closePreviousMonth}>{reportsLoading ? 'ກຳລັງປິດ...' : 'ປິດເດືອນທີ່ແລ້ວ'}</button></div>
          <div className="archive-list">{monthlyReports.length === 0 ? <div className="empty archive-empty"><span>▤</span><p>ຍັງບໍ່ມີ archive</p><small>Run supabase-monthly-archive.sql ແລ້ວກົດ “ປິດເດືອນທີ່ແລ້ວ”.</small></div> : monthlyReports.map((report) => <div className="archive-row" key={report.id}><div><strong>{report.month}/{report.year}</strong><small>{report.orders_count} ບິນ · {Number(report.items_count || 0)} ຊິ້ນ</small></div><div><span>ຂາຍ</span><b>{money(Number(report.total_sales || 0))}</b></div><div><span>ຕົ້ນທຶນ</span><b>{money(Number(report.total_cost || 0))}</b></div><div><span>ກຳໄລ</span><b className="profit">{money(Number(report.gross_profit || 0))}</b></div></div>)}</div>
        </div>
      </section>}
      {canManage && active === 'cash' && <section className="page-card cash-close"><h2>ປິດຍອດກະເງິນ</h2><p>ບັນທຶກເງິນສົດເພື່ອກວດສອບສ່ວນຕ່າງ.</p><div className="drawer"><label>ເງິນທອນເລີ່ມຕົ້ນ<input placeholder="0 ₭" /></label><label>ເງິນສົດທີ່ນັບໄດ້<input placeholder="0 ₭" /></label><button className="primary">ບັນທຶກປິດຍອດ</button></div></section>}
    </main>
    {holds.length > 0 && <div className="hold-dock"><strong>ບິນທີ່ພັກໄວ້ ({holds.length})</strong>{holds.map(h => <button key={h.id} onClick={() => recall(h)}>{h.label} · {money(h.total)} ↗</button>)}</div>}
    {canManage && showAddProduct && <div className="modal-backdrop"><form className="modal product-modal" onSubmit={saveNewProduct}><button type="button" className="close" onClick={() => { stopBarcodeCamera(); setShowAddProduct(false) }}>×</button><span className="modal-icon">+</span><h2>ເພີ່ມສິນຄ້າໃໝ່</h2><p>ສຳລັບ owner/admin ເທົ່ານັ້ນ.</p><label>Barcode<div className="barcode-row"><input name="barcode" value={newBarcode} onChange={(e) => setNewBarcode(e.target.value.trim())} placeholder="ສະແກນ ຫຼື ພິມ Barcode" required autoFocus /><button type="button" onClick={cameraMode ? stopBarcodeCamera : startBarcodeCamera}>{cameraMode ? 'ປິດກ້ອງ' : 'ເປີດກ້ອງ'}</button></div></label>{cameraMode && <video className="scanner-video" ref={videoRef} muted playsInline />}<label>ຊື່ສິນຄ້າ<input name="name" required /></label><div className="form-row"><label>ຕົ້ນທຶນ<input name="cost" type="number" min="0" step="1" required /></label><label>ລາຄາຂາຍ<input name="price" type="number" min="1" step="1" required /></label></div><div className="form-row"><label>ຈຳນວນເລີ່ມຕົ້ນ<input name="stock" type="number" min="0" step="1" defaultValue="0" /></label><label>ຫົວໜ່ວຍ<input name="unit" defaultValue="ອັນ" /></label></div><div className="validation-note"><strong>ການກວດກ່ອນບັນທຶກ</strong><span>ຫ້າມ Barcode ຊ້ຳ, ລາຄາຕ້ອງຖືກຕ້ອງ, ແລະຈະເຕືອນຖ້າລາຄາຂາຍຕ່ຳກວ່າຕົ້ນທຶນ.</span></div><button className="primary wide">ບັນທຶກສິນຄ້າ</button></form></div>}
    {showPayment && <div className="modal-backdrop"><div className="modal payment-modal" tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); confirmPayment() } }}><button type="button" className="close" onClick={() => setShowPayment(false)}>×</button><span className="modal-icon">₭</span><h2>ຊຳລະເງິນ</h2><p>ເລືອກວິທີຈ່າຍ ແລະ ກົດ Enter ເພື່ອຢືນຢັນ.</p><div className="payment-choice"><button type="button" className={paymentMethod === 'cash' ? 'selected' : ''} onClick={() => { setPaymentMethod('cash'); setTimeout(() => cashInputRef.current?.focus(), 50) }}><b>*</b><span>ເງິນສົດ</span></button><button type="button" className={paymentMethod === 'transfer' ? 'selected' : ''} onClick={() => { setPaymentMethod('transfer'); setCash(String(total)) }}><b>-</b><span>ເງິນໂອນ</span></button></div>{paymentMethod === 'cash' && <label>ຮັບເງິນສົດ<input ref={cashInputRef} inputMode="numeric" autoFocus placeholder="0" value={cash} onChange={(e) => setCash(e.target.value.replace(/\D/g,''))} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); confirmPayment() } }}/></label>}{paymentMethod === 'transfer' && <div className="transfer-qr"><img src={`${import.meta.env.BASE_URL}payment-qr.png`} alt="QR Code ສຳລັບໂອນເງິນ" /><strong>ສະແກນ QR ເພື່ອໂອນເງິນ</strong><small>ກວດສອບຍອດເງິນກ່ອນກົດຢືນຢັນ</small></div>}<div className="payment-summary"><span>ລວມ</span><strong>{money(total)}</strong></div>{paymentMethod === 'cash' && <div className="payment-summary change-row"><span>ເງິນທອນ</span><strong>{money(change)}</strong></div>}<button type="button" className={printReceipt ? 'receipt-toggle on' : 'receipt-toggle'} onClick={() => setPrintReceipt((value) => !value)}><b>+</b>{printReceipt ? 'ຮັບບິນ' : 'ບໍ່ຮັບບິນ'}</button><div className="shortcut-help"><span>* ເງິນສົດ</span><span>- ເງິນໂອນ</span><span>+ ສະຫຼັບບິນ</span><span>Enter ຢືນຢັນ</span></div><button type="button" className="primary wide" disabled={isCheckingOut || (paymentMethod === 'cash' && Number(cash || 0) <= 0)} onClick={confirmPayment}>{isCheckingOut ? 'ກຳລັງບັນທຶກ...' : 'ຢືນຢັນຮັບເງິນ'}</button></div></div>}
    {canManage && showStockIn && <div className="modal-backdrop"><form className="modal" onSubmit={stockIn}><button type="button" className="close" onClick={() => setShowStockIn(false)}>×</button><span className="modal-icon">↓</span><h2>ຮັບສິນຄ້າເຂົ້າ</h2><p>ສຳລັບ owner/admin ເທົ່ານັ້ນ. ລະບົບຈະຄິດຕົ້ນທຶນສະເລ່ຍໃໝ່.</p><label>ເລືອກສິນຄ້າ<select name="productId" required defaultValue={products[0]?.id ?? ''}>{products.length === 0 && <option value="">ຍັງບໍ່ມີສິນຄ້າ</option>}{products.map((p) => <option key={p.id} value={p.id}>{p.name} (ເຫຼືອ {p.stock})</option>)}</select></label><label>ຈຳນວນຮັບເຂົ້າ<input name="quantity" type="number" min="1" step="1" required autoFocus /></label><label>ລາຄາຊື້ຕໍ່ໜ່ວຍ<input name="cost" type="number" min="0" required /></label><button className="primary wide">ບັນທຶກສະຕັອກ</button></form></div>}
    {canManage && editingProduct && <div className="modal-backdrop"><form className="modal product-modal" onSubmit={saveProductEdit}><button type="button" className="close" onClick={() => setEditingProduct(null)}>×</button><span className="modal-icon">✎</span><h2>ແກ້ໄຂສິນຄ້າ</h2><p>ປ່ຽນຊື່, Barcode, ລາຄາ ຫຼື ຈຳນວນສະຕັອກ.</p><label>Barcode<input name="barcode" defaultValue={editingProduct.barcode} required autoFocus /></label><label>ຊື່ສິນຄ້າ<input name="name" defaultValue={editingProduct.name} required /></label><div className="form-row"><label>ຕົ້ນທຶນ<input name="cost" type="number" min="0" step="1" defaultValue={editingProduct.cost} required /></label><label>ລາຄາຂາຍ<input name="price" type="number" min="1" step="1" defaultValue={editingProduct.price} required /></label></div><div className="form-row"><label>ຈຳນວນສະຕັອກ<input name="stock" type="number" min="0" step="1" defaultValue={editingProduct.stock} required /></label><label>ຫົວໜ່ວຍ<input name="unit" defaultValue={editingProduct.unit} /></label></div><button className="primary wide">ບັນທຶກການແກ້ໄຂ</button></form></div>}
    {canManage && adjustingProduct && <div className="modal-backdrop"><form className="modal" onSubmit={removeStock}><button type="button" className="close" onClick={() => setAdjustingProduct(null)}>×</button><span className="modal-icon">−</span><h2>ລົບສະຕັອກ</h2><p>{adjustingProduct.name} ເຫຼືອ {adjustingProduct.stock} {adjustingProduct.unit}</p><label>ຈຳນວນທີ່ຈະລົບ<input name="quantity" type="number" min="1" step="1" required autoFocus /></label><label>ເຫດຜົນ<input name="reason" placeholder="ເສຍຫາຍ / ນັບຜິດ / ສິນຄ້າຫາຍ" /></label><button className="primary wide">ບັນທຶກລົບສະຕັອກ</button></form></div>}
  </div>
}

function CustomerDisplay() {
  const [sale, setSale] = useState(() => {
    try { return JSON.parse(localStorage.getItem('kennyxpay-current-sale')) || { cart: [], total: 0, cash: 0, change: 0 } }
    catch { return { cart: [], total: 0, cash: 0, change: 0 } }
  })

  useEffect(() => {
    const readSale = () => {
      try {
        const saved = JSON.parse(localStorage.getItem('kennyxpay-current-sale') || 'null')
        if (saved) setSale(saved)
      } catch {}
    }
    const onStorage = (event) => {
      if (event.key !== 'kennyxpay-current-sale' || !event.newValue) return
      try { setSale(JSON.parse(event.newValue)) } catch {}
    }
    window.addEventListener('storage', onStorage)
    const timer = window.setInterval(readSale, 700)
    const broadcast = 'BroadcastChannel' in window ? new BroadcastChannel('kennyxpay-customer-display') : null
    if (broadcast) broadcast.onmessage = (event) => setSale(event.data)
    readSale()
    if (!supabase) return () => { window.removeEventListener('storage', onStorage); window.clearInterval(timer); broadcast?.close() }
    const channel = supabase.channel('customer-display')
      .on('broadcast', { event: 'cart' }, ({ payload }) => setSale(payload))
      .subscribe()
    return () => { window.removeEventListener('storage', onStorage); window.clearInterval(timer); broadcast?.close(); supabase.removeChannel(channel) }
  }, [])

  return <main className="customer-display">
    <div className="display-brand"><span className="brand-mark">K</span><strong>kennyXpay</strong><small>ຂໍຂອບໃຈທີ່ອຸດໜູນ · {APP_BUILD}</small></div>
    <section className="display-card"><div className="display-heading"><span>ລາຍການສິນຄ້າ</span><span>ລວມ</span></div>{sale.cart.length ? sale.cart.map((item) => <div className="display-line" key={item.id}><span>{item.name} <b>× {item.qty}</b></span><strong>{money(item.price * item.qty)}</strong></div>) : <div className="display-empty">ກຳລັງລໍຖ້າລາຍການສິນຄ້າ...</div>}<div className="display-total"><span>ຍອດລວມສຸດທິ</span><strong>{money(sale.total)}</strong></div>{sale.cash > 0 && <div className="display-change"><span>ເງິນທອນ</span><strong>{money(sale.change)}</strong></div>}</section>
    {sale.paymentOpen && sale.paymentMethod === 'transfer' && <div className="customer-qr-popup"><section className="display-pay-qr popup"><img src={`${import.meta.env.BASE_URL}payment-qr.png`} alt="QR Code ສຳລັບໂອນເງິນ" /><h2>ສະແກນ QR ເພື່ອໂອນເງິນ</h2><p>ກະລຸນາໂອນຕາມຍອດນີ້</p><strong>{money(sale.total)}</strong></section></div>}
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
      let productResult = await supabase.from('products').select('*').eq('is_active', true).order('name')
      if (productResult.error) productResult = await supabase.from('products').select('*').order('name')
      const orderResult = await supabase.from('orders').select('*').gte('created_at', todayStart).order('created_at', { ascending: false })
      const profileResult = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
      setProducts((productResult.data || []).filter((product) => product.is_active !== false).map(databaseProductToAppProduct))
      setOrders(orderResult.data || [])
      const normalizedProfiles = (profileResult.data || []).map(safeProfile)
      setProfiles(normalizedProfiles)
      setLoading(false)
    }
    loadOwnerData()
  }, [todayStart, user])

  const lowItems = products.filter((p) => p.stock >= 1 && p.stock <= 5)
  const outItems = products.filter((p) => p.stock <= 0)
  const todaySales = orders.reduce((sum, order) => sum + Number(order.total || 0), 0)
  const pendingProfiles = profiles.filter((profile) => (profile.status || 'pending') === 'pending' && !isOwnerEmail(profile.email))
  const activeProfiles = profiles.filter((profile) => (profile.status || 'pending') !== 'pending')
  const ownerCount = profiles.filter((profile) => (profile.status || 'pending') === 'active' && (isOwnerEmail(profile.email) || profile.role === 'owner')).length

  const updateProfileAccess = async (profile, updates) => {
    if (!supabase) return
    setOwnerNotice('')
    const fixedOwner = isOwnerEmail(profile.email)
    if (fixedOwner && updates.role && updates.role !== 'owner') {
      return setOwnerNotice('ບໍ່ສາມາດປ່ຽນ role ຂອງ owner ຫຼັກໄດ້')
    }
    if (updates.role === 'owner' && !fixedOwner && profile.role !== 'owner' && ownerCount >= MAX_OWNER_ACCOUNTS) {
      return setOwnerNotice(`Owner ເຕັມແລ້ວ (${MAX_OWNER_ACCOUNTS} ບັນຊີ). ກະລຸນາປ່ຽນ owner ເກົ່າເປັນ worker/admin ກ່ອນ.`)
    }
    const next = { ...updates, updated_at: new Date().toISOString() }
    const { error } = await supabase.from('profiles').update(next).eq('id', profile.id)
    if (error) return setOwnerNotice('ອັບເດດ user ບໍ່ສຳເລັດ: ' + error.message)
    setProfiles((items) => items.map((item) => item.id === profile.id ? safeProfile({ ...item, ...next }) : item))
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
        <div className="section-top"><div><h2>ສິດເຂົ້າໃຊ້ງານ</h2><p>Owner ອະນຸມັດບັນຊີໃໝ່ ແລະ ກຳນົດ role: owner / admin / worker. Owner ສູງສຸດ {MAX_OWNER_ACCOUNTS} ບັນຊີ.</p></div><strong className="pending-pill">{pendingProfiles.length} ລໍອະນຸມັດ · Owner {ownerCount}/{MAX_OWNER_ACCOUNTS}</strong></div>
        {ownerNotice && <div className="auth-message">{ownerNotice}</div>}
        <div className="user-list">
          {pendingProfiles.length === 0 && <p className="muted-text">ບໍ່ມີຄົນລໍອະນຸມັດ</p>}
          {pendingProfiles.map((profile) => <div className="user-row pending" key={profile.id}><div><strong>{profile.email || 'ບໍ່ມີ email'}</strong><small>ສະຖານະ: ລໍອະນຸມັດ</small></div><div className="row-actions"><button onClick={() => updateProfileAccess(profile, { role: 'worker', status: 'active' })}>ອະນຸມັດ worker</button><button onClick={() => updateProfileAccess(profile, { role: 'admin', status: 'active' })}>ອະນຸມັດ admin</button><button disabled={ownerCount >= MAX_OWNER_ACCOUNTS} onClick={() => updateProfileAccess(profile, { role: 'owner', status: 'active' })}>ອະນຸມັດ owner</button><button className="danger-link" onClick={() => updateProfileAccess(profile, { status: 'blocked' })}>ປະຕິເສດ</button></div></div>)}
          {activeProfiles.map((profile) => {
            const ownerRow = isOwnerEmail(profile.email)
            const displayRole = ownerRow ? 'owner' : profile.role
            const canPromoteOwner = profile.role === 'owner' || ownerCount < MAX_OWNER_ACCOUNTS
            return <div className="user-row" key={profile.id}><div><strong>{profile.email || 'ບໍ່ມີ email'}</strong><small>Role: {displayRole} · Status: {profile.status || 'pending'}</small></div><div className="row-actions">{ownerRow ? <span className="owner-lock">Owner ຫຼັກ</span> : <><button onClick={() => updateProfileAccess(profile, { role: 'worker', status: 'active' })}>worker</button><button onClick={() => updateProfileAccess(profile, { role: 'admin', status: 'active' })}>admin</button><button disabled={!canPromoteOwner} onClick={() => updateProfileAccess(profile, { role: 'owner', status: 'active' })}>owner</button><button className="danger-link" onClick={() => updateProfileAccess(profile, { status: 'blocked' })}>block</button></>}</div></div>
          })}
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
    const cleanEmail = normalizeEmail(email)
    const result = mode === 'login'
      ? await supabase.auth.signInWithPassword({ email: cleanEmail, password })
      : await supabase.auth.signUp({ email: cleanEmail, password })
    if (!result.error && mode === 'signup' && result.data?.user) {
      await supabase.from('profiles').upsert({ id: result.data.user.id, email: cleanEmail, role: 'worker', status: 'pending' }, { onConflict: 'id' })
    }
    setBusy(false)
    if (result.error) setMessage(authErrorMessage(result.error.message))
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
  role: isOwnerUser(user) ? 'owner' : 'worker',
  status: isOwnerUser(user) ? 'active' : 'pending',
})

async function loadProfileForUser(user) {
  const fallback = defaultPendingProfile(user)
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
  if (!error && data) {
    if (isOwnerUser(user, data)) return { ...data, role: 'owner', status: 'active' }
    return safeProfile(data)
  }
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
  const effectiveProfile = isOwnerUser(session?.user, profile) ? { ...profile, role: 'owner', status: 'active' } : safeProfile(profile)

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
