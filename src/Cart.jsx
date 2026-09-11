import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

function Cart({ user, onBack, onCheckout }) {
  const [cartItems, setCartItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadCart()
  }, [])

  const loadCart = async () => {
    setLoading(true)
    setMessage('')

    const { data, error } = await supabase
      .from('cart_items')
      .select(`
        id,
        quantity,
        product_id,
        product:products (
          id,
          name,
          description,
          price,
          category,
          image_url,
          stock,
          status
        )
      `)
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Cart loading error:', error)
      setMessage('Could not load your cart.')
    } else {
      setCartItems(data || [])
    }

    setLoading(false)
  }

  const updateQuantity = async (item, newQuantity) => {
    if (newQuantity < 1) {
      removeItem(item)
      return
    }

    if (newQuantity > item.product.stock) {
      setMessage(
        'You cannot add more than the available stock.'
      )
      return
    }

    setUpdating(item.id)
    setMessage('')

    const { error } = await supabase
      .from('cart_items')
      .update({
        quantity: newQuantity,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id)
      .eq('customer_id', user.id)

    if (error) {
      console.error(
        'Quantity update error:',
        error
      )
      setMessage('Could not update quantity.')
    } else {
      setCartItems((currentItems) =>
        currentItems.map((cartItem) =>
          cartItem.id === item.id
            ? {
                ...cartItem,
                quantity: newQuantity,
              }
            : cartItem
        )
      )
    }

    setUpdating(null)
  }

  const removeItem = async (item) => {
    setUpdating(item.id)
    setMessage('')

    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('id', item.id)
      .eq('customer_id', user.id)

    if (error) {
      console.error(
        'Remove cart item error:',
        error
      )
      setMessage(
        'Could not remove item from your cart.'
      )
    } else {
      setCartItems((currentItems) =>
        currentItems.filter(
          (cartItem) => cartItem.id !== item.id
        )
      )
    }

    setUpdating(null)
  }

  const getItemTotal = (item) => {
    return (
      Number(item.product.price) *
      item.quantity
    )
  }

  const cartTotal = cartItems.reduce(
    (total, item) =>
      total + getItemTotal(item),
    0
  )

  const totalItems = cartItems.reduce(
    (total, item) =>
      total + item.quantity,
    0
  )

  return (
    <div className="cart-page">

      <nav className="navbar">

        <div className="logo">
          UniAbuja Market
        </div>

        <button
          type="button"
          className="back-button"
          onClick={onBack}
        >
          ← Back to Market
        </button>

      </nav>

      <main className="cart-container">

        <div className="cart-header">

          <p className="welcome-small">
            YOUR SHOPPING CART
          </p>

          <h1>
            My Cart
          </h1>

          <p>
            Review your items before checkout.
          </p>

        </div>

        {message && (
          <div className="auth-message">
            {message}
          </div>
        )}

        {loading ? (

          <div className="market-message">

            <h3>
              Loading your cart...
            </h3>

          </div>

        ) : cartItems.length === 0 ? (

          <div className="market-message">

            <div className="empty-cart-icon">
              🛒
            </div>

            <h3>
              Your cart is empty
            </h3>

            <p>
              Add some products from the market
              to get started.
            </p>

            <button
              type="button"
              className="primary-btn"
              onClick={onBack}
            >
              Continue Shopping
            </button>

          </div>

        ) : (

          <div className="cart-layout">

            <div className="cart-items">

              {cartItems.map((item) => (

                <div
                  className="cart-item"
                  key={item.id}
                >

                  <div className="cart-item-image">

                    {item.product?.image_url ? (

                      <img
                        src={item.product.image_url}
                        alt={item.product.name}
                      />

                    ) : (

                      <span>
                        🛍️
                      </span>

                    )}

                  </div>

                  <div className="cart-item-info">

                    <span className="product-category">
                      {item.product?.category}
                    </span>

                    <h3>
                      {item.product?.name}
                    </h3>

                    <p>
                      ₦
                      {Number(
                        item.product?.price || 0
                      ).toLocaleString()}
                    </p>

                    <div className="quantity-controls">

                      <button
                        type="button"
                        disabled={
                          updating === item.id
                        }
                        onClick={() =>
                          updateQuantity(
                            item,
                            item.quantity - 1
                          )
                        }
                      >
                        −
                      </button>

                      <span>
                        {item.quantity}
                      </span>

                      <button
                        type="button"
                        disabled={
                          updating === item.id ||
                          item.quantity >=
                            item.product?.stock
                        }
                        onClick={() =>
                          updateQuantity(
                            item,
                            item.quantity + 1
                          )
                        }
                      >
                        +
                      </button>

                    </div>

                    <button
                      type="button"
                      className="remove-btn"
                      disabled={
                        updating === item.id
                      }
                      onClick={() =>
                        removeItem(item)
                      }
                    >
                      {updating === item.id
                        ? 'Removing...'
                        : 'Remove'}
                    </button>

                  </div>

                  <div className="cart-item-total">

                    <strong>
                      ₦
                      {getItemTotal(
                        item
                      ).toLocaleString()}
                    </strong>

                  </div>

                </div>

              ))}

            </div>

            <aside className="cart-summary">

              <h2>
                Order Summary
              </h2>

              <div className="summary-row">

                <span>
                  Items
                </span>

                <span>
                  {totalItems}
                </span>

              </div>

              <div className="summary-row">

                <span>
                  Subtotal
                </span>

                <strong>
                  ₦
                  {cartTotal.toLocaleString()}
                </strong>

              </div>

              <div className="summary-row">

                <span>
                  Delivery
                </span>

                <span>
                  Calculated at checkout
                </span>

              </div>

              <div className="summary-total">

                <span>
                  Total
                </span>

                <strong>
                  ₦
                  {cartTotal.toLocaleString()}
                </strong>

              </div>

              <button
                type="button"
                className="primary-btn checkout-btn"
                onClick={onCheckout}
              >
                Proceed to Checkout
              </button>

            </aside>

          </div>

        )}

      </main>

    </div>
  )
}

export default Cart