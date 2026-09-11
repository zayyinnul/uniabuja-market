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

    // Prevent accidental double submission
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
      const { data: orderId, error } = await supabase.rpc(
        'create_market_order',
        {
          p_delivery_address: deliveryAddress.trim(),
          p_phone: phone.trim(),
        }
      )

      if (error) {
        console.error(
          'Create market order error:',
          error
        )

        throw new Error(
          error.message || 'Could not place your order.'
        )
      }

      console.log('Order created:', orderId)

      onOrderCreated(orderId)

    } catch (error) {
      console.error('Place order error:', error)

      // Allow another attempt if the order failed
      submittingRef.current = false

      setMessage(
        error.message ||
        'Something went wrong while placing your order.'
      )

      setPlacingOrder(false)
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
            Enter your delivery details to place your order.
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
                    ? 'Placing order...'
                    : 'Place Order'}
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