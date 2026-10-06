import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'

function Checkout({ user, onBack, onOrderCreated }) {
  const [cartItems, setCartItems] = useState([])
  const [zones, setZones] = useState([])

  const [selectedVendorId, setSelectedVendorId] = useState('')

  const [loading, setLoading] = useState(true)
  const [placingOrder, setPlacingOrder] = useState(false)
  const [retryingPayment, setRetryingPayment] = useState(false)
  const [message, setMessage] = useState('')

  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')

  const [selectedZoneId, setSelectedZoneId] = useState('')

  const [deliveryMethod, setDeliveryMethod] = useState('vendor')
  const [deliveryFee, setDeliveryFee] = useState(0)
  const [checkoutTotal, setCheckoutTotal] = useState(0)
  const [quoteLoading, setQuoteLoading] = useState(false)

  const [pendingOrderId, setPendingOrderId] = useState(() => {
    return (
      sessionStorage.getItem(
        'uniabuja_pending_payment_order'
      ) || ''
    )
  })

  const submittingRef = useRef(false)

  useEffect(() => {
    loadCart()
    loadDeliveryZones()
  }, [])

  /*
    Load the vendor selected from Cart.jsx.

    Cart.jsx saves:
      uniabuja_checkout_vendor_id

    This makes Checkout show only products
    belonging to that vendor.
  */
  const loadCart = async () => {
    setLoading(true)
    setMessage('')

    try {
      let vendorId = ''

      try {
        vendorId =
          sessionStorage.getItem(
            'uniabuja_checkout_vendor_id'
          ) || ''
      } catch (error) {
        console.error(
          'Could not read selected vendor:',
          error
        )
      }

      setSelectedVendorId(vendorId)

      const { data, error } = await supabase
        .from('cart_items')
        .select(`
          id,
          product_id,
          quantity,
          products (
            id,
            name,
            price,
            image_url,
            stock,
            status,
            vendor_id
          )
        `)
        .eq('customer_id', user.id)
        .order('created_at', {
          ascending: true,
        })

      if (error) {
        console.error(
          'Checkout cart loading error:',
          error
        )

        throw new Error(error.message)
      }

      let items = data || []

      /*
        Only keep products belonging to the
        vendor selected from the cart.

        If there is no selected vendor ID,
        fall back to the full cart so we don't
        unnecessarily break the existing flow.
      */
      if (vendorId) {
        items = items.filter(
          (item) =>
            item.products?.vendor_id ===
            vendorId
        )
      }

      setCartItems(items)

      /*
        If a vendor was selected but that vendor's
        products are no longer in the cart, clear
        the selection and tell the user.
      */
      if (
        vendorId &&
        items.length === 0
      ) {
        setMessage(
          'The selected store has no items in your cart.'
        )
      }
    } catch (error) {
      console.error(
        'Checkout error:',
        error
      )

      setMessage(
        error.message ||
        'Could not load your cart.'
      )
    }

    setLoading(false)
  }

  const loadDeliveryZones = async () => {
    const { data, error } = await supabase
      .from('delivery_zones')
      .select(
        'id, name, is_active'
      )
      .eq('is_active', true)
      .order('name', {
        ascending: true,
      })

    if (error) {
      console.error(
        'Delivery zones error:',
        error
      )

      setMessage(
        'Could not load delivery areas.'
      )

      return
    }

    setZones(data || [])
  }

  /*
    Check whether the saved pending payment order
    is still valid.

    If it was cancelled, paid, or no longer exists,
    clear the stale sessionStorage value so Checkout
    becomes usable again.
  */
  useEffect(() => {
    const checkPendingOrder = async () => {
      if (!pendingOrderId) return

      const { data, error } = await supabase
        .from('orders')
        .select(
          'id, status, payment_status'
        )
        .eq('id', pendingOrderId)
        .eq('customer_id', user.id)
        .maybeSingle()

      if (
        error ||
        !data ||
        data.status === 'cancelled' ||
        data.payment_status === 'cancelled' ||
        data.payment_status === 'paid'
      ) {
        sessionStorage.removeItem(
          'uniabuja_pending_payment_order'
        )

        setPendingOrderId('')
        setRetryingPayment(false)
        setPlacingOrder(false)
        submittingRef.current = false
      }
    }

    checkPendingOrder()
  }, [
    pendingOrderId,
    user.id,
  ])

  /*
    When returning from Paystack with the browser
    Back button, reset temporary payment state.
  */
  useEffect(() => {
    const handlePageShow = () => {
      submittingRef.current = false
      setPlacingOrder(false)
      setRetryingPayment(false)

      const savedOrderId =
        sessionStorage.getItem(
          'uniabuja_pending_payment_order'
        )

      if (savedOrderId) {
        setPendingOrderId(savedOrderId)
      } else {
        setPendingOrderId('')
      }
    }

    window.addEventListener(
      'pageshow',
      handlePageShow
    )

    return () => {
      window.removeEventListener(
        'pageshow',
        handlePageShow
      )
    }
  }, [])

  useEffect(() => {
    if (
      cartItems.length > 0 &&
      selectedZoneId &&
      selectedVendorId
    ) {
      loadDeliveryQuote(
        'vendor',
        selectedZoneId
      )
    }
  }, [
    cartItems,
    selectedZoneId,
    selectedVendorId,
  ])

  const getProductTotal = () => {
    return cartItems.reduce(
      (total, item) => {
        const price = Number(
          item.products?.price || 0
        )

        return (
          total +
          price * item.quantity
        )
      },
      0
    )
  }

  const loadDeliveryQuote = async (
    method,
    zoneId
  ) => {
    if (!zoneId || !selectedVendorId) {
      setDeliveryFee(0)
      setCheckoutTotal(0)
      return
    }

    setQuoteLoading(true)
    setMessage('')

    try {
      const {
        data,
        error,
      } = await supabase.rpc(
        'get_checkout_delivery_quote',
        {
          p_delivery_method: 'vendor',
          p_zone_id: zoneId,
          p_vendor_id: selectedVendorId,
        }
      )

      if (error) {
        console.error(
          'Delivery quote error:',
          error
        )

        throw new Error(
          error.message ||
          'Could not calculate delivery fee.'
        )
      }

      const quote =
        Array.isArray(data)
          ? data[0]
          : data

      if (!quote) {
        throw new Error(
          'Could not calculate the checkout total.'
        )
      }

      setDeliveryFee(
        Number(
          quote.delivery_fee || 0
        )
      )

      setCheckoutTotal(
        Number(
          quote.total_amount || 0
        )
      )
    } catch (error) {
      console.error(
        'Checkout delivery quote error:',
        error
      )

      setDeliveryFee(0)
      setCheckoutTotal(0)

      setMessage(
        error.message ||
        'Could not calculate delivery fee.'
      )
    }

    setQuoteLoading(false)
  }

  const handleZoneChange = (e) => {
    if (
      placingOrder ||
      retryingPayment
    ) {
      return
    }

    const zoneId = e.target.value

    setSelectedZoneId(zoneId)
    setDeliveryFee(0)
    setCheckoutTotal(0)
    setMessage('')
  }

  const handleDeliveryMethodChange = (
    method
  ) => {
    if (
      placingOrder ||
      retryingPayment
    ) {
      return
    }

    setMessage('')
    setDeliveryMethod('vendor')
  }

  const getPaymentApiUrl = () => {
    const isLocal =
      window.location.hostname ===
        'localhost' ||
      window.location.hostname ===
        '127.0.0.1'

    return isLocal
      ? 'http://127.0.0.1:8787/api/payments/initialize'
      : 'https://uniabuja-market.mammanabideen.workers.dev/api/payments/initialize'
  }

  const initializePayment = async (
    orderId
  ) => {
    const {
      data: sessionData,
      error: sessionError
    } =
      await supabase.auth.getSession()

    if (sessionError) {
      throw new Error(
        sessionError.message ||
        'Could not get your login session.'
      )
    }

    const accessToken =
      sessionData?.session?.access_token

    if (!accessToken) {
      throw new Error(
        'Your login session has expired. Please log in again.'
      )
    }

    const paymentApiUrl =
      getPaymentApiUrl()

    console.log(
      'Initializing payment through:',
      paymentApiUrl
    )

    const response =
      await fetch(
        paymentApiUrl,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',

            Authorization:
              `Bearer ${accessToken}`,
          },

          body: JSON.stringify({
            order_id: orderId,
          }),
        }
      )

    const responseText =
      await response.text()

    let paymentData = null

    try {
      paymentData =
        responseText
          ? JSON.parse(
              responseText
            )
          : null
    } catch (parseError) {
      console.error(
        'Payment response was not valid JSON:',
        responseText
      )

      throw new Error(
        'The payment server returned an invalid response.'
      )
    }

    if (
      !response.ok ||
      !paymentData?.success
    ) {
      throw new Error(
        paymentData?.message ||
        'Could not initialize payment.'
      )
    }

    if (
      !paymentData.authorization_url
    ) {
      throw new Error(
        'Paystack did not return a payment link.'
      )
    }

    console.log(
      'Payment initialized:',
      paymentData.reference
    )

    /*
      Keep the order ID temporarily so if the user
      backs out of Paystack, they can retry the same order.
    */
    sessionStorage.setItem(
      'uniabuja_pending_payment_order',
      orderId
    )

    setPendingOrderId(orderId)

    window.location.href =
      paymentData.authorization_url
  }

  const handlePlaceOrder = async (e) => {
    e.preventDefault()

    if (submittingRef.current) {
      return
    }

    /*
      If an unpaid order already exists from a previous
      Paystack attempt, retry that payment instead of
      creating another order.
    */
    if (pendingOrderId) {
      setRetryingPayment(true)
      setMessage('')

      try {
        await initializePayment(
          pendingOrderId
        )
      } catch (error) {
        console.error(
          'Retry payment error:',
          error
        )

        setRetryingPayment(false)

        setMessage(
          error.message ||
          'Could not restart payment.'
        )
      }

      return
    }

    if (!fullName.trim()) {
      setMessage(
        'Please enter your full name.'
      )
      return
    }

    if (!phone.trim()) {
      setMessage(
        'Please enter your phone number.'
      )
      return
    }

    if (!deliveryAddress.trim()) {
      setMessage(
        'Please enter your delivery address.'
      )
      return
    }

    if (!selectedZoneId) {
      setMessage(
        'Please select your delivery area.'
      )
      return
    }

    if (!selectedVendorId) {
      setMessage(
        'Could not identify the selected store. Please return to your cart and try again.'
      )
      return
    }

    if (cartItems.length === 0) {
      setMessage(
        'Your cart is empty.'
      )
      return
    }

    if (quoteLoading) {
      setMessage(
        'Please wait while we calculate delivery.'
      )
      return
    }

    if (checkoutTotal <= 0) {
      setMessage(
        'Could not calculate the checkout total. Please try again.'
      )
      return
    }

    submittingRef.current = true
    setPlacingOrder(true)
    setMessage('Creating your order...')

    try {
      const {
        data: orderId,
        error: orderError,
      } = await supabase.rpc(
        'create_market_order',
        {
          p_delivery_address:
            deliveryAddress.trim(),

          p_phone:
            phone.trim(),

          p_delivery_method:
            'vendor',

          p_zone_id:
            selectedZoneId,
        }
      )

      if (orderError) {
        console.error(
          'Create market order error:',
          orderError
        )

        throw new Error(
          orderError.message ||
          'Could not place your order.'
        )
      }

      console.log(
        'Order created:',
        orderId
      )

      await initializePayment(
        orderId
      )
    } catch (error) {
      console.error(
        'Place order/payment error:',
        error
      )

      submittingRef.current = false
      setPlacingOrder(false)

      setMessage(
        error.message ||
        'Something went wrong while starting payment.'
      )
    }
  }

  const handleBack = () => {
    submittingRef.current = false
    setPlacingOrder(false)
    setRetryingPayment(false)

    onBack()
  }

  const handleRetryPayment = async () => {
    if (
      !pendingOrderId ||
      retryingPayment ||
      placingOrder
    ) {
      return
    }

    setRetryingPayment(true)
    setMessage('Opening secure payment...')

    try {
      await initializePayment(
        pendingOrderId
      )
    } catch (error) {
      console.error(
        'Retry payment error:',
        error
      )

      setRetryingPayment(false)

      setMessage(
        error.message ||
        'Could not restart payment.'
      )
    }
  }

  const formatMoney = (amount) => {
    return `₦${Number(amount || 0).toLocaleString(
      'en-NG'
    )}`
  }

  if (loading) {
    return (
      <div className="loading-page">

        <h2>
          UniAbuja Market
        </h2>

        <div
          style={{
            width: '34px',
            height: '34px',
            border: '4px solid #e5e7eb',
            borderTop:
              '4px solid #16a34a',
            borderRadius: '50%',
            animation:
              'checkoutSpin 0.8s linear infinite',
            margin: '16px auto',
          }}
        />

        <p>
          Loading your checkout...
        </p>

        <style>
          {`
            @keyframes checkoutSpin {
              from {
                transform: rotate(0deg);
              }

              to {
                transform: rotate(360deg);
              }
            }
          `}
        </style>

      </div>
    )
  }

  const productTotal =
    getProductTotal()

  return (
    <div className="checkout-page">

      <nav className="navbar">

        <div className="logo">
          UniAbuja Market
        </div>

        <button
          type="button"
          className="back-button"
          onClick={handleBack}
          disabled={
            placingOrder ||
            retryingPayment
          }
        >
          ← Back to Cart
        </button>

      </nav>

      <main className="checkout-container">

        {/* HEADER */}

        <div className="checkout-header">

          <p
            className="welcome-small"
            style={{
              marginBottom: '6px',
            }}
          >
            CHECKOUT
          </p>

          <h1>
            Complete your order
          </h1>

          <p>
            Enter your delivery details carefully
            before proceeding to secure payment.
          </p>

        </div>


        {/* SELECTED STORE */}

        {selectedVendorId &&
          cartItems.length > 0 && (
            <div
              style={{
                marginBottom: '18px',
                padding: '12px 14px',
                border:
                  '1px solid #bbf7d0',
                background:
                  '#f0fdf4',
                borderRadius: '10px',
              }}
            >
              <strong
                style={{
                  color: '#166534',
                }}
              >
                Store checkout
              </strong>

              <p
                style={{
                  margin:
                    '4px 0 0',
                  fontSize: '13px',
                  color: '#4b5563',
                }}
              >
                You are checking out only the
                products from the selected store.
              </p>
            </div>
          )}


        {/* GENERAL MESSAGE */}

        {message && (
          <div
            className="auth-message"
            style={{
              marginBottom: '18px',
              lineHeight: '1.5',
            }}
          >
            {message}
          </div>
        )}


        {/* PENDING PAYMENT */}

        {pendingOrderId && (
          <div
            className="market-message"
            style={{
              marginBottom: '20px',
              border:
                '1px solid #f0c36d',
              background:
                '#fff8e6',
              textAlign: 'left',
            }}
          >

            <h3>
              Payment not completed
            </h3>

            <p>
              You already have an order waiting for
              payment. Continue that payment instead
              of creating another order.
            </p>

            <button
              type="button"
              className="primary-btn"
              onClick={
                handleRetryPayment
              }
              disabled={
                retryingPayment ||
                placingOrder
              }
              style={{
                marginTop: '10px',
              }}
            >
              {retryingPayment
                ? 'Opening payment...'
                : 'Retry Payment'}
            </button>

          </div>
        )}


        {cartItems.length === 0 ? (

          <div className="market-message">

            <div className="empty-cart-icon">
              🛒
            </div>

            <h3>
              No products from this store
            </h3>

            <p>
              The selected store no longer has
              products in your cart.
            </p>

            <button
              type="button"
              className="primary-btn"
              onClick={handleBack}
            >
              Back to Cart
            </button>

          </div>

        ) : (

          <div className="checkout-layout">

            {/* ORDER SUMMARY */}

            <section className="checkout-card">

              <div
                style={{
                  display: 'flex',
                  justifyContent:
                    'space-between',
                  alignItems:
                    'center',
                  gap: '12px',
                  marginBottom:
                    '18px',
                }}
              >

                <div>

                  <p
                    style={{
                      margin: 0,
                      fontSize: '12px',
                      fontWeight: 800,
                      color: '#16a34a',
                      letterSpacing:
                        '0.08em',
                    }}
                  >
                    STEP 1
                  </p>

                  <h2
                    style={{
                      marginTop: '4px',
                      marginBottom: 0,
                    }}
                  >
                    Order summary
                  </h2>

                </div>

                <span
                  style={{
                    background:
                      '#f3f4f6',
                    padding:
                      '6px 10px',
                    borderRadius:
                      '999px',
                    fontSize:
                      '12px',
                    fontWeight: 700,
                    whiteSpace:
                      'nowrap',
                  }}
                >
                  {cartItems.length}{' '}
                  {cartItems.length === 1
                    ? 'item'
                    : 'items'}
                </span>

              </div>


              <div className="checkout-items">

                {cartItems.map(
                  (item) => (

                    <div
                      className="checkout-item"
                      key={item.id}
                      style={{
                        alignItems:
                          'center',
                      }}
                    >

                      <div
                        className="checkout-item-image"
                        style={{
                          width: '88px',
                          height: '88px',
                          minWidth: '88px',
                          maxWidth: '88px',
                          minHeight: '88px',
                          maxHeight: '88px',
                          flex:
                            '0 0 88px',
                          overflow:
                            'hidden',
                          borderRadius:
                            '12px',
                          display:
                            'flex',
                          alignItems:
                            'center',
                          justifyContent:
                            'center',
                          boxSizing:
                            'border-box',
                          background:
                            '#f3f4f6',
                        }}
                      >

                        {item.products?.image_url ? (

                          <img
                            src={
                              item.products
                                .image_url
                            }
                            alt={
                              item.products
                                .name
                            }
                            style={{
                              width:
                                '100%',
                              height:
                                '100%',
                              minWidth:
                                '100%',
                              minHeight:
                                '100%',
                              maxWidth:
                                '100%',
                              maxHeight:
                                '100%',
                              objectFit:
                                'cover',
                              display:
                                'block',
                            }}
                          />

                        ) : (

                          <span
                            style={{
                              fontSize:
                                '26px',
                            }}
                          >
                            🛍️
                          </span>

                        )}

                      </div>


                      <div
                        className="checkout-item-info"
                        style={{
                          minWidth: 0,
                        }}
                      >

                        <h3>
                          {item.products?.name ||
                            'Product unavailable'}
                        </h3>

                        <p>
                          Quantity:{' '}
                          {item.quantity}
                        </p>

                        <p
                          style={{
                            fontWeight: 700,
                            marginTop:
                              '3px',
                          }}
                        >
                          {formatMoney(
                            item.products?.price
                          )}{' '}
                          each
                        </p>

                      </div>


                      <strong
                        style={{
                          whiteSpace:
                            'nowrap',
                        }}
                      >
                        {formatMoney(
                          Number(
                            item.products?.price ||
                              0
                          ) *
                            item.quantity
                        )}
                      </strong>

                    </div>

                  )
                )}

              </div>


              {/* TOTAL BREAKDOWN */}

              <div
                style={{
                  marginTop: '20px',
                  paddingTop: '16px',
                  borderTop:
                    '1px solid #e5e7eb',
                }}
              >

                <div
                  className="checkout-total"
                >

                  <span>
                    Products
                  </span>

                  <strong>
                    {formatMoney(
                      productTotal
                    )}
                  </strong>

                </div>


                <div
                  className="checkout-total"
                  style={{
                    marginTop: '8px',
                  }}
                >

                  <span>
                    Delivery
                  </span>

                  <strong>
                    {!selectedZoneId
                      ? 'Select area'
                      : quoteLoading
                      ? 'Calculating...'
                      : deliveryFee ===
                        0
                      ? '🎉 Free delivery'
                      : formatMoney(
                          deliveryFee
                        )}
                  </strong>

                </div>


                <div
                  style={{
                    marginTop:
                      '14px',
                    paddingTop:
                      '14px',
                    borderTop:
                      '2px solid #111827',
                    display: 'flex',
                    alignItems:
                      'center',
                    justifyContent:
                      'space-between',
                    gap: '15px',
                  }}
                >

                  <div>

                    <span
                      style={{
                        display:
                          'block',
                        fontSize:
                          '12px',
                        fontWeight:
                          800,
                        color:
                          '#6b7280',
                        textTransform:
                          'uppercase',
                        letterSpacing:
                          '0.05em',
                      }}
                    >
                      Total to pay
                    </span>

                    <strong
                      style={{
                        display:
                          'block',
                        marginTop:
                          '3px',
                        fontSize:
                          '24px',
                        color:
                          '#111827',
                      }}
                    >
                      {formatMoney(
                        checkoutTotal
                      )}
                    </strong>

                  </div>

                  <span
                    style={{
                      background:
                        '#dcfce7',
                      color:
                        '#166534',
                      padding:
                        '7px 10px',
                      borderRadius:
                        '999px',
                      fontSize:
                        '11px',
                      fontWeight:
                        800,
                      whiteSpace:
                        'nowrap',
                    }}
                  >
                    SECURE PAYMENT
                  </span>

                </div>

              </div>

            </section>


            {/* DELIVERY DETAILS */}

            <section className="checkout-card">

              <div
                style={{
                  marginBottom:
                    '20px',
                }}
              >

                <p
                  style={{
                    margin: 0,
                    fontSize: '12px',
                    fontWeight: 800,
                    color: '#16a34a',
                    letterSpacing:
                      '0.08em',
                  }}
                >
                  STEP 2
                </p>

                <h2
                  style={{
                    marginTop:
                      '4px',
                    marginBottom:
                      '5px',
                  }}
                >
                  Delivery details
                </h2>

                <p
                  style={{
                    margin: 0,
                    color:
                      '#6b7280',
                    fontSize:
                      '14px',
                    lineHeight:
                      '1.5',
                  }}
                >
                  Enter clear details so your order
                  reaches the correct person and place.
                </p>

              </div>


              <form
                onSubmit={
                  handlePlaceOrder
                }
              >

                {/* FULL NAME */}

                <label
                  style={{
                    display:
                      'block',
                    fontWeight:
                      800,
                    color:
                      '#111827',
                    marginBottom:
                      '7px',
                  }}
                >
                  Full name

                  <span
                    style={{
                      color:
                        '#dc2626',
                    }}
                  >
                    {' '}*
                  </span>

                </label>

                <input
                  type="text"
                  placeholder="Enter your full name"
                  value={fullName}
                  onChange={(e) =>
                    setFullName(
                      e.target.value
                    )
                  }
                  required
                  disabled={
                    placingOrder ||
                    retryingPayment ||
                    Boolean(
                      pendingOrderId
                    )
                  }
                  autoComplete="name"
                  style={{
                    width:
                      '100%',
                    boxSizing:
                      'border-box',
                    fontSize:
                      '16px',
                    fontWeight:
                      600,
                    color:
                      '#111827',
                    background:
                      '#fff',
                    border:
                      '2px solid #d1d5db',
                    borderRadius:
                      '10px',
                    padding:
                      '13px 14px',
                    marginBottom:
                      '5px',
                    outline:
                      'none',
                  }}
                />

                <p
                  style={{
                    margin:
                      '0 0 17px',
                    color:
                      '#6b7280',
                    fontSize:
                      '12px',
                  }}
                >
                  Name of the person receiving the order.
                </p>


                {/* PHONE */}

                <label
                  style={{
                    display:
                      'block',
                    fontWeight:
                      800,
                    color:
                      '#111827',
                    marginBottom:
                      '7px',
                  }}
                >
                  Phone number

                  <span
                    style={{
                      color:
                        '#dc2626',
                    }}
                  >
                    {' '}*
                  </span>

                </label>

                <input
                  type="tel"
                  placeholder="e.g. 08012345678"
                  value={phone}
                  onChange={(e) =>
                    setPhone(
                      e.target.value
                    )
                  }
                  required
                  disabled={
                    placingOrder ||
                    retryingPayment ||
                    Boolean(
                      pendingOrderId
                    )
                  }
                  autoComplete="tel"
                  inputMode="tel"
                  style={{
                    width:
                      '100%',
                    boxSizing:
                      'border-box',
                    fontSize:
                      '16px',
                    fontWeight:
                      600,
                    color:
                      '#111827',
                    background:
                      '#fff',
                    border:
                      '2px solid #d1d5db',
                    borderRadius:
                      '10px',
                    padding:
                      '13px 14px',
                    marginBottom:
                      '5px',
                    outline:
                      'none',
                  }}
                />

                <p
                  style={{
                    margin:
                      '0 0 17px',
                    color:
                      '#6b7280',
                    fontSize:
                      '12px',
                  }}
                >
                  Use a number the delivery person can reach.
                </p>


                {/* DELIVERY AREA */}

                <label
                  style={{
                    display:
                      'block',
                    fontWeight:
                      800,
                    color:
                      '#111827',
                    marginBottom:
                      '7px',
                  }}
                >
                  Delivery area

                  <span
                    style={{
                      color:
                        '#dc2626',
                    }}
                  >
                    {' '}*
                  </span>

                </label>

                <select
                  value={
                    selectedZoneId
                  }
                  onChange={
                    handleZoneChange
                  }
                  required
                  disabled={
                    placingOrder ||
                    retryingPayment ||
                    Boolean(
                      pendingOrderId
                    ) ||
                    zones.length === 0
                  }
                  style={{
                    width:
                      '100%',
                    boxSizing:
                      'border-box',
                    fontSize:
                      '16px',
                    fontWeight:
                      600,
                    color:
                      '#111827',
                    background:
                      '#fff',
                    border:
                      '2px solid #d1d5db',
                    borderRadius:
                      '10px',
                    padding:
                      '13px 14px',
                    marginBottom:
                      '5px',
                    outline:
                      'none',
                  }}
                >

                  <option value="">
                    Select your delivery area
                  </option>

                  {zones.map(
                    (zone) => (
                      <option
                        key={zone.id}
                        value={zone.id}
                      >
                        {zone.name}
                      </option>
                    )
                  )}

                </select>

                <p
                  style={{
                    margin:
                      '0 0 17px',
                    color:
                      '#6b7280',
                    fontSize:
                      '12px',
                  }}
                >
                  Your delivery fee is calculated from this area.
                </p>


                {/* DELIVERY ADDRESS */}

                <label
                  style={{
                    display:
                      'block',
                    fontWeight:
                      800,
                    color:
                      '#111827',
                    marginBottom:
                      '7px',
                  }}
                >
                  Delivery address

                  <span
                    style={{
                      color:
                        '#dc2626',
                    }}
                  >
                    {' '}*
                  </span>

                </label>

                <textarea
                  placeholder="Enter your full delivery address"
                  value={
                    deliveryAddress
                  }
                  onChange={(e) =>
                    setDeliveryAddress(
                      e.target.value
                    )
                  }
                  rows="5"
                  required
                  disabled={
                    placingOrder ||
                    retryingPayment ||
                    Boolean(
                      pendingOrderId
                    )
                  }
                  autoComplete="street-address"
                  style={{
                    width:
                      '100%',
                    boxSizing:
                      'border-box',
                    fontSize:
                      '16px',
                    fontWeight:
                      600,
                    lineHeight:
                      '1.5',
                    color:
                      '#111827',
                    background:
                      '#fff',
                    border:
                      '2px solid #d1d5db',
                    borderRadius:
                      '10px',
                    padding:
                      '13px 14px',
                    marginBottom:
                      '7px',
                    outline:
                      'none',
                    resize:
                      'vertical',
                  }}
                />

                <div
                  style={{
                    background:
                      '#f9fafb',
                    border:
                      '1px solid #e5e7eb',
                    borderRadius:
                      '10px',
                    padding:
                      '10px 12px',
                    marginBottom:
                      '20px',
                  }}
                >

                  <p
                    style={{
                      margin: 0,
                      fontSize:
                        '12px',
                      lineHeight:
                        '1.5',
                      fontWeight:
                        600,
                      color:
                        '#4b5563',
                    }}
                  >
                    💡 Be specific. Example:
                    “Male Hostel B, Block 3,
                    Room 214, near the main staircase.”
                  </p>

                </div>


                {/* DELIVERY METHOD */}

                <label
                  style={{
                    display:
                      'block',
                    fontWeight:
                      800,
                    color:
                      '#111827',
                    marginBottom:
                      '8px',
                  }}
                >
                  Delivery method
                </label>

                <button
                  type="button"
                  onClick={() =>
                    handleDeliveryMethodChange(
                      'vendor'
                    )
                  }
                  disabled={
                    placingOrder ||
                    retryingPayment ||
                    Boolean(
                      pendingOrderId
                    ) ||
                    !selectedZoneId
                  }
                  style={{
                    width:
                      '100%',
                    padding:
                      '15px',
                    textAlign:
                      'left',
                    border:
                      deliveryMethod ===
                      'vendor'
                        ? '2px solid #16a34a'
                        : '2px solid #d1d5db',
                    borderRadius:
                      '12px',
                    background:
                      deliveryMethod ===
                      'vendor'
                        ? '#f0fdf4'
                        : '#fff',
                    cursor:
                      selectedZoneId
                        ? 'pointer'
                        : 'not-allowed',
                    marginBottom:
                      '20px',
                  }}
                >

                  <strong
                    style={{
                      display:
                        'block',
                      color:
                        '#111827',
                      fontSize:
                        '15px',
                    }}
                  >
                    🏪 Vendor delivery
                  </strong>

                  <span
                    style={{
                      display:
                        'block',
                      marginTop:
                        '4px',
                      color:
                        '#4b5563',
                      fontSize:
                        '13px',
                    }}
                  >
                    Delivered by the vendor.
                  </span>

                  <strong
                    style={{
                      display:
                        'block',
                      marginTop:
                        '7px',
                      color:
                        '#166534',
                    }}
                  >
                    {!selectedZoneId
                      ? 'Select area first'
                      : quoteLoading
                      ? 'Calculating delivery...'
                      : deliveryFee ===
                        0
                      ? '🎉 Free delivery'
                      : formatMoney(
                          deliveryFee
                        )}
                  </strong>

                </button>


                {/* FINAL TOTAL */}

                <div
                  style={{
                    background:
                      '#111827',
                    color:
                      '#fff',
                    borderRadius:
                      '12px',
                    padding:
                      '16px',
                    marginBottom:
                      '12px',
                  }}
                >

                  <div
                    style={{
                      display:
                        'flex',
                      alignItems:
                        'center',
                      justifyContent:
                        'space-between',
                      gap:
                        '12px',
                    }}
                  >

                    <div>

                      <span
                        style={{
                          display:
                            'block',
                          fontSize:
                            '11px',
                          fontWeight:
                            800,
                          color:
                            '#d1d5db',
                          textTransform:
                            'uppercase',
                          letterSpacing:
                            '0.05em',
                        }}
                      >
                        Amount to pay
                      </span>

                      <strong
                        style={{
                          display:
                            'block',
                          marginTop:
                            '3px',
                          fontSize:
                            '24px',
                        }}
                      >
                        {formatMoney(
                          checkoutTotal
                        )}
                      </strong>

                    </div>

                    <span
                      style={{
                        fontSize:
                          '12px',
                        fontWeight:
                          800,
                        color:
                          '#86efac',
                      }}
                    >
                      PAYSTACK
                    </span>

                  </div>

                </div>


                {!pendingOrderId && (
                  <button
                    type="submit"
                    className="primary-btn"
                    disabled={
                      placingOrder ||
                      retryingPayment ||
                      quoteLoading ||
                      !selectedZoneId ||
                      checkoutTotal <= 0
                    }
                    style={{
                      width:
                        '100%',
                      minHeight:
                        '52px',
                      fontSize:
                        '16px',
                      fontWeight:
                        800,
                    }}
                  >
                    {placingOrder
                      ? 'Preparing secure payment...'
                      : quoteLoading
                      ? 'Calculating delivery...'
                      : !selectedZoneId
                      ? 'Select delivery area'
                      : `Proceed to Payment • ${formatMoney(
                          checkoutTotal
                        )}`}
                  </button>
                )}


                {!pendingOrderId && (
                  <p
                    style={{
                      margin:
                        '10px 0 0',
                      textAlign:
                        'center',
                      color:
                        '#6b7280',
                      fontSize:
                        '12px',
                      lineHeight:
                        '1.5',
                    }}
                  >
                    You will be redirected to Paystack
                    to complete your payment securely.
                  </p>
                )}

              </form>

            </section>

          </div>

        )}

      </main>

    </div>
  )
}

export default Checkout