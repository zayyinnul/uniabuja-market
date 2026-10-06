import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

function Cart({ user, onBack, onCheckout }) {
  const [cartItems, setCartItems] = useState([])
  const [stores, setStores] = useState({})
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
          status,
          vendor_id
        )
      `)
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Cart loading error:', error)
      setMessage('Could not load your cart.')
      setLoading(false)
      return
    }

    const items = data || []
    setCartItems(items)

    // -------------------------------------------------------
    // LOAD STORE NAMES FOR THE VENDORS IN THE CART
    // -------------------------------------------------------

    const vendorIds = [
      ...new Set(
        items
          .map((item) => item.product?.vendor_id)
          .filter(Boolean)
      ),
    ]

    if (vendorIds.length > 0) {
      const { data: storeData, error: storeError } =
        await supabase
          .from('stores')
          .select(`
            owner_id,
            store_name
          `)
          .in('owner_id', vendorIds)

      if (storeError) {
        console.error(
          'Store loading error:',
          storeError
        )
      } else {
        const storeMap = {}

        ;(storeData || []).forEach((store) => {
          storeMap[store.owner_id] =
            store.store_name
        })

        setStores(storeMap)
      }
    } else {
      setStores({})
    }

    setLoading(false)
  }

  const updateQuantity = async (
    item,
    newQuantity
  ) => {
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
          (cartItem) =>
            cartItem.id !== item.id
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

  // -------------------------------------------------------
  // GROUP CART ITEMS BY VENDOR
  // -------------------------------------------------------

  const vendorGroups = cartItems.reduce(
    (groups, item) => {
      const vendorId =
        item.product?.vendor_id

      if (!vendorId) {
        return groups
      }

      if (!groups[vendorId]) {
        groups[vendorId] = []
      }

      groups[vendorId].push(item)

      return groups
    },
    {}
  )

  const vendorIds = Object.keys(vendorGroups)

  const totalItems = cartItems.reduce(
    (total, item) =>
      total + item.quantity,
    0
  )

  const cartTotal = cartItems.reduce(
    (total, item) =>
      total + getItemTotal(item),
    0
  )

  // -------------------------------------------------------
  // CHECKOUT ONE VENDOR
  // -------------------------------------------------------

  const checkoutVendor = (vendorId) => {
    if (!vendorId) {
      return
    }

    try {
      sessionStorage.setItem(
        'uniabuja_checkout_vendor_id',
        vendorId
      )
    } catch (error) {
      console.error(
        'Could not save selected vendor:',
        error
      )
    }

    onCheckout()
  }

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

              {/* ------------------------------------------------ */}
              {/* VENDOR GROUPS */}
              {/* ------------------------------------------------ */}

              {vendorIds.map((vendorId) => {

                const vendorItems =
                  vendorGroups[vendorId]

                const vendorTotal =
                  vendorItems.reduce(
                    (total, item) =>
                      total +
                      getItemTotal(item),
                    0
                  )

                const storeName =
                  stores[vendorId] ||
                  'Vendor Store'

                return (
                  <div
                    key={vendorId}
                    style={{
                      marginBottom: '24px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '14px',
                      padding: '16px',
                      background: '#ffffff',
                    }}
                  >

                    {/* VENDOR HEADER */}

                    <div
                      style={{
                        display: 'flex',
                        justifyContent:
                          'space-between',
                        alignItems: 'center',
                        gap: '12px',
                        flexWrap: 'wrap',
                        marginBottom: '16px',
                      }}
                    >

                      <div>

                        <p
                          style={{
                            margin: 0,
                            fontSize: '12px',
                            fontWeight: '700',
                            letterSpacing:
                              '0.08em',
                            opacity: 0.65,
                          }}
                        >
                          STORE
                        </p>

                        <h2
                          style={{
                            margin:
                              '4px 0 0',
                            fontSize: '20px',
                          }}
                        >
                          {storeName}
                        </h2>

                        <p
                          style={{
                            margin:
                              '4px 0 0',
                            fontSize: '13px',
                            opacity: 0.7,
                          }}
                        >
                          {vendorItems.length}{' '}
                          {vendorItems.length === 1
                            ? 'product'
                            : 'products'}
                        </p>

                      </div>

                      <button
                        type="button"
                        className="primary-btn"
                        onClick={() =>
                          checkoutVendor(
                            vendorId
                          )
                        }
                      >
                        Checkout from this store
                      </button>

                    </div>

                    {/* PRODUCTS FROM THIS VENDOR */}

                    {vendorItems.map(
                      (item) => (

                        <div
                          className="cart-item"
                          key={item.id}
                          style={{
                            marginBottom:
                              '12px',
                          }}
                        >

                          <div
                            className="cart-item-image"
                            style={{
                              width: '100px',
                              height: '100px',
                              minWidth: '100px',
                              maxWidth: '100px',
                              minHeight: '100px',
                              maxHeight: '100px',
                              flex:
                                '0 0 100px',
                              overflow:
                                'hidden',
                              borderRadius:
                                '10px',
                              display: 'flex',
                              alignItems:
                                'center',
                              justifyContent:
                                'center',
                              boxSizing:
                                'border-box',
                            }}
                          >

                            {item.product
                              ?.image_url ? (

                              <img
                                src={
                                  item
                                    .product
                                    .image_url
                                }
                                alt={
                                  item
                                    .product
                                    .name
                                }
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  minWidth: '100%',
                                  minHeight: '100%',
                                  maxWidth: '100%',
                                  maxHeight: '100%',
                                  objectFit:
                                    'cover',
                                  display:
                                    'block',
                                }}
                              />

                            ) : (

                              <span>
                                🛍️
                              </span>

                            )}

                          </div>

                          <div className="cart-item-info">

                            <span className="product-category">
                              {
                                item
                                  .product
                                  ?.category
                              }
                            </span>

                            <h3>
                              {
                                item
                                  .product
                                  ?.name
                              }
                            </h3>

                            <p>
                              ₦
                              {Number(
                                item
                                  .product
                                  ?.price ||
                                  0
                              ).toLocaleString()}
                            </p>

                            <div className="quantity-controls">

                              <button
                                type="button"
                                disabled={
                                  updating ===
                                  item.id
                                }
                                onClick={() =>
                                  updateQuantity(
                                    item,
                                    item.quantity -
                                      1
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
                                  updating ===
                                    item.id ||
                                  item.quantity >=
                                    item.product
                                      ?.stock
                                }
                                onClick={() =>
                                  updateQuantity(
                                    item,
                                    item.quantity +
                                      1
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
                                updating ===
                                item.id
                              }
                              onClick={() =>
                                removeItem(item)
                              }
                            >
                              {updating ===
                              item.id
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

                      )
                    )}

                    {/* VENDOR SUBTOTAL */}

                    <div
                      style={{
                        borderTop:
                          '1px solid #e5e7eb',
                        marginTop: '12px',
                        paddingTop: '12px',
                        display: 'flex',
                        justifyContent:
                          'space-between',
                        alignItems:
                          'center',
                        gap: '12px',
                      }}
                    >

                      <strong>
                        Store subtotal
                      </strong>

                      <strong>
                        ₦
                        {vendorTotal.toLocaleString()}
                      </strong>

                    </div>

                    <button
                      type="button"
                      className="primary-btn"
                      onClick={() =>
                        checkoutVendor(
                          vendorId
                        )
                      }
                      style={{
                        width: '100%',
                        marginTop: '14px',
                      }}
                    >
                      Checkout from {storeName}
                    </button>

                  </div>
                )
              })}

            </div>

            {/* ------------------------------------------------ */}
            {/* CART SUMMARY */}
            {/* ------------------------------------------------ */}

            <aside className="cart-summary">

              <h2>
                Cart Summary
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
                  Vendors
                </span>

                <span>
                  {vendorIds.length}
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

              <p
                style={{
                  marginTop: '14px',
                  fontSize: '13px',
                  lineHeight: '1.5',
                  opacity: 0.75,
                }}
              >
                Products from different
                stores are checked out
                separately.
              </p>

            </aside>

          </div>

        )}

      </main>

    </div>
  )
}

export default Cart