import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'

function Checkout({ user, onBack, onOrderCreated }) {
  const [cartItems, setCartItems] = useState([])
  const [zones, setZones] = useState([])

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
    return sessionStorage.getItem(
      'uniabuja_pending_payment_order'
    ) || ''
  })

  const submittingRef = useRef(false)

  useEffect(() => {
    loadCart()
    loadDeliveryZones()
  }, [])

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
        .select('id, status, payment_status')
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
  }, [pendingOrderId, user.id])

  /*
    When returning from Paystack with the browser Back button,
    the browser may restore the old React state instead of
    reloading the page.

    Reset the temporary payment state and re-check the
    saved pending order.
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
      selectedZoneId
    ) {
      loadDeliveryQuote(
        'vendor',
        selectedZoneId
      )
    }
  }, [
    cartItems,
    selectedZoneId,
  ])

  const loadCart = async () => {
    setLoading(true)
    setMessage('')

    try {
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
            status
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

      setCartItems(data || [])
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
    if (!zoneId) {
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

  const getPaymentApiUrl = () => {
    const isLocal =
      window.location.hostname ===
        'localhost' ||
      window.location.hostname ===
        '127.0.0.1'

    return isLocal
      ? 'http://127.0.0.1:8787/api/payments/initialize'
      : '/api/payments/initialize'
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
    setMessage('')

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
    /*
      Clear only the temporary checkout payment state.
      The actual order remains safely in the database.
    */
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
  }

  if (loading) {
    return (
      <div className="loading-page">
        <h2>
          UniAbuja Market
        </h2>

        <p>
          Loading checkout...
        </p>
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

        <div className="checkout-header">

          <p className="welcome-small">
            CHECKOUT
          </p>

          <h1>
            Complete your order
          </h1>

          <p>
            Enter your delivery details to continue to payment.
          </p>

        </div>

        {message && (
          <div className="auth-message">
            {message}
          </div>
        )}

        {pendingOrderId && (
          <div
            className="market-message"
            style={{
              marginBottom: '20px',
            }}
          >
            <h3>
              Payment not completed
            </h3>

            <p>
              You left the payment page before completing payment.
              You can retry the same payment or go back to your cart.
            </p>

            <div
              style={{
                display: 'flex',
                gap: '10px',
                flexWrap: 'wrap',
                justifyContent: 'center',
              }}
            >
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
              >
                {retryingPayment
                  ? 'Opening payment...'
                  : 'Retry Payment'}
              </button>

              <button
                type="button"
                className="back-button"
                onClick={
                  handleBack
                }
                disabled={
                  retryingPayment ||
                  placingOrder
                }
              >
                ← Back to Cart
              </button>
            </div>
          </div>
        )}

        {cartItems.length === 0 ? (

          <div className="market-message">

            <div className="empty-cart-icon">
              🛒
            </div>

            <h3>
              Your cart is empty
            </h3>

            <p>
              Add some products before checking out.
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

              <h2>
                Order summary
              </h2>

              <div className="checkout-items">

                {cartItems.map(
                  (item) => (

                    <div
                      className="checkout-item"
                      key={item.id}
                    >

                      <div
                        className="checkout-item-image"
                        style={{
                          width: '100px',
                          height: '100px',
                          minWidth: '100px',
                          maxWidth: '100px',
                          minHeight: '100px',
                          maxHeight: '100px',
                          flex: '0 0 100px',
                          overflow: 'hidden',
                          borderRadius: '10px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxSizing: 'border-box',
                        }}
                      >

                        {item.products?.image_url ? (

                          <img
                            src={
                              item.products.image_url
                            }
                            alt={
                              item.products.name
                            }
                            style={{
                              width: '100%',
                              height: '100%',
                              minWidth: '100%',
                              minHeight: '100%',
                              maxWidth: '100%',
                              maxHeight: '100%',
                              objectFit: 'cover',
                              display: 'block',
                            }}
                          />

                        ) : (

                          <span>
                            🛍️
                          </span>

                        )}

                      </div>

                      <div className="checkout-item-info">

                        <h3>
                          {item.products?.name ||
                            'Product unavailable'}
                        </h3>

                        <p>
                          Quantity: {
                            item.quantity
                          }
                        </p>

                      </div>

                      <strong>
                        ₦
                        {(
                          Number(
                            item.products?.price ||
                              0
                          ) *
                          item.quantity
                        ).toLocaleString()}
                      </strong>

                    </div>

                  )
                )}

              </div>

              <div className="checkout-total">

                <span>
                  Products
                </span>

                <strong>
                  ₦
                  {productTotal.toLocaleString()}
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
                    : deliveryFee === 0
                    ? '🎉 Free delivery'
                    : `₦${deliveryFee.toLocaleString()}`}
                </strong>

              </div>

              <div
                className="checkout-total"
                style={{
                  marginTop: '8px',
                  paddingTop: '12px',
                  borderTop:
                    '1px solid #ddd',
                }}
              >

                <span>
                  <strong>
                    Total
                  </strong>
                </span>

                <strong>
                  ₦
                  {checkoutTotal.toLocaleString()}
                </strong>

              </div>

            </section>


            {/* DELIVERY DETAILS */}

            <section className="checkout-card">

              <h2>
                Delivery details
              </h2>

              <form
                onSubmit={
                  handlePlaceOrder
                }
              >

                <label>
                  Full name
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
                    Boolean(pendingOrderId)
                  }
                />


                <label>
                  Phone number
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
                    Boolean(pendingOrderId)
                  }
                />


                <label>
                  Delivery area
                </label>

                <select
                  value={selectedZoneId}
                  onChange={
                    handleZoneChange
                  }
                  required
                  disabled={
                    placingOrder ||
                    retryingPayment ||
                    Boolean(pendingOrderId) ||
                    zones.length === 0
                  }
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border:
                      '1px solid #ddd',
                    marginBottom: '16px',
                    background: '#fff',
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


                <label>
                  Delivery address
                </label>

                <textarea
                  placeholder="Enter your full delivery address"
                  value={deliveryAddress}
                  onChange={(e) =>
                    setDeliveryAddress(
                      e.target.value
                    )
                  }
                  rows="4"
                  required
                  disabled={
                    placingOrder ||
                    retryingPayment ||
                    Boolean(pendingOrderId)
                  }
                />


                <label>
                  Delivery method
                </label>

                <div
                  style={{
                    display: 'grid',
                    gap: '10px',
                    marginBottom: '20px',
                  }}
                >

                  {/* VENDOR DELIVERY */}

                  <button
                    type="button"
                    onClick={() => {
                      setMessage('')
                      setDeliveryMethod('vendor')
                    }}
                    disabled={
                      placingOrder ||
                      retryingPayment ||
                      Boolean(pendingOrderId) ||
                      !selectedZoneId
                    }
                    style={{
                      padding: '14px',
                      textAlign: 'left',
                      border:
                        '2px solid #111',
                      borderRadius: '10px',
                      background:
                        '#f5f5f5',
                      cursor:
                        selectedZoneId
                          ? 'pointer'
                          : 'not-allowed',
                    }}
                  >

                    <strong>
                      🏪 Vendor delivery
                    </strong>

                    <br />

                    <span>
                      Delivered by the vendor
                    </span>

                    <br />

                    <strong>
                      {!selectedZoneId
                        ? 'Select area'
                        : quoteLoading
                        ? 'Calculating...'
                        : deliveryFee === 0
                        ? '🎉 Free delivery'
                        : `₦${deliveryFee.toLocaleString()}`}
                    </strong>

                  </button>

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
                  >
                    {placingOrder
                      ? 'Preparing payment...'
                      : quoteLoading
                      ? 'Calculating delivery...'
                      : !selectedZoneId
                      ? 'Select delivery area'
                      : 'Proceed to Payment'}
                  </button>
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