import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'

function Checkout({ user, onBack, onOrderCreated }) {
  const [cartItems, setCartItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [placingOrder, setPlacingOrder] = useState(false)
  const [message, setMessage] = useState('')

  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')

  const submittingRef = useRef(false)

  useEffect(() => {
    loadCart()
  }, [])

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
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Checkout cart loading error:', error)
        throw new Error(error.message)
      }

      setCartItems(data || [])
    } catch (error) {
      console.error('Checkout error:', error)

      setMessage(
        error.message || 'Could not load your cart.'
      )
    }

    setLoading(false)
  }

  const getTotal = () => {
    return cartItems.reduce((total, item) => {
      const price = Number(item.products?.price || 0)

      return total + price * item.quantity
    }, 0)
  }

  const handlePlaceOrder = async (e) => {
    e.preventDefault()

    if (submittingRef.current) {
      return
    }

    if (!fullName.trim()) {
      setMessage('Please enter your full name.')
      return
    }

    if (!phone.trim()) {
      setMessage('Please enter your phone number.')
      return
    }

    if (!deliveryAddress.trim()) {
      setMessage('Please enter your delivery address.')
      return
    }

    if (cartItems.length === 0) {
      setMessage('Your cart is empty.')
      return
    }

    submittingRef.current = true
    setPlacingOrder(true)
    setMessage('')

    try {
      // Create the order securely in Supabase
      const { data: orderId, error: orderError } =
        await supabase.rpc('create_market_order', {
          p_delivery_address: deliveryAddress.trim(),
          p_phone: phone.trim(),
        })

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

      console.log('Order created:', orderId)

      // Get the current Supabase login session
      const {
        data: sessionData,
        error: sessionError,
      } = await supabase.auth.getSession()

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

      // Local development uses the local Worker.
      // Production uses the Cloudflare Worker on the same domain.
      const paymentApiUrl =
        window.location.hostname === 'localhost'
          ? 'http://127.0.0.1:8787/api/payments/initialize'
          : '/api/payments/initialize'

      console.log(
        'Initializing payment through:',
        paymentApiUrl
      )

      const response = await fetch(paymentApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          order_id: orderId,
        }),
      })

      // Read the response safely so an empty Worker response
      // doesn't produce "Unexpected end of JSON input".
      const responseText = await response.text()

      let paymentData = null

      try {
        paymentData = responseText
          ? JSON.parse(responseText)
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

      if (!response.ok || !paymentData?.success) {
        throw new Error(
          paymentData?.message ||
          'Could not initialize payment.'
        )
      }

      if (!paymentData.authorization_url) {
        throw new Error(
          'Paystack did not return a payment link.'
        )
      }

      console.log(
        'Payment initialized:',
        paymentData.reference
      )

      // Send the customer to Paystack
      window.location.href =
        paymentData.authorization_url

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

  return (
    <div className="checkout-page">
      <nav className="navbar">
        <div className="logo">
          UniAbuja Market
        </div>

        <button
          type="button"
          className="back-button"
          onClick={onBack}
          disabled={placingOrder}
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
              onClick={onBack}
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
                {cartItems.map((item) => (
                  <div
                    className="checkout-item"
                    key={item.id}
                  >
                    <div className="checkout-item-image">
                      {item.products?.image_url ? (
                        <img
                          src={item.products.image_url}
                          alt={item.products.name}
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
                        Quantity: {item.quantity}
                      </p>
                    </div>

                    <strong>
                      ₦
                      {(
                        Number(item.products?.price || 0) *
                        item.quantity
                      ).toLocaleString()}
                    </strong>
                  </div>
                ))}
              </div>

              <div className="checkout-total">
                <span>
                  Total
                </span>

                <strong>
                  ₦
                  {getTotal().toLocaleString()}
                </strong>
              </div>
            </section>

            {/* DELIVERY DETAILS */}
            <section className="checkout-card">
              <h2>
                Delivery details
              </h2>

              <form onSubmit={handlePlaceOrder}>

                <label>
                  Full name
                </label>

                <input
                  type="text"
                  placeholder="Enter your full name"
                  value={fullName}
                  onChange={(e) =>
                    setFullName(e.target.value)
                  }
                  required
                  disabled={placingOrder}
                />

                <label>
                  Phone number
                </label>

                <input
                  type="tel"
                  placeholder="e.g. 08012345678"
                  value={phone}
                  onChange={(e) =>
                    setPhone(e.target.value)
                  }
                  required
                  disabled={placingOrder}
                />

                <label>
                  Delivery address
                </label>

                <textarea
                  placeholder="Enter your delivery location"
                  value={deliveryAddress}
                  onChange={(e) =>
                    setDeliveryAddress(e.target.value)
                  }
                  rows="4"
                  required
                  disabled={placingOrder}
                />

                <button
                  type="submit"
                  className="primary-btn"
                  disabled={placingOrder}
                >
                  {placingOrder
                    ? 'Preparing payment...'
                    : 'Proceed to Payment'}
                </button>

              </form>
            </section>

          </div>
        )}
      </main>
    </div>
  )
}

export default Checkout