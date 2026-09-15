import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

function MyOrders({ user, onBack }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadOrders()
  }, [])

  const loadOrders = async () => {
    setLoading(true)
    setMessage('')

    try {
      const { data: orderData, error: ordersError } =
        await supabase
          .from('orders')
          .select(`
            id,
            customer_id,
            total_amount,
            status,
            payment_status,
            delivery_address,
            phone,
            created_at,
            updated_at
          `)
          .eq('customer_id', user.id)
          .order('created_at', { ascending: false })

      if (ordersError) {
        throw new Error(ordersError.message)
      }

      if (!orderData || orderData.length === 0) {
        setOrders([])
        setLoading(false)
        return
      }

      const orderIds = orderData.map((order) => order.id)

      const { data: itemData, error: itemsError } =
        await supabase
          .from('order_items')
          .select(`
            id,
            order_id,
            product_id,
            quantity,
            unit_price,
            created_at
          `)
          .in('order_id', orderIds)
          .order('created_at', { ascending: true })

      if (itemsError) {
        throw new Error(itemsError.message)
      }

      const productIds = [
        ...new Set(
          (itemData || []).map((item) => item.product_id)
        ),
      ]

      let products = []

      if (productIds.length > 0) {
        const { data: productData, error: productsError } =
          await supabase
            .from('products')
            .select(`
              id,
              name,
              image_url,
              category
            `)
            .in('id', productIds)

        if (productsError) {
          throw new Error(productsError.message)
        }

        products = productData || []
      }

      const { data: vendorStatuses, error: statusError } =
        await supabase.rpc('get_my_order_statuses')

      if (statusError) {
        throw new Error(statusError.message)
      }

      const statusMap = {}

      ;(vendorStatuses || []).forEach((item) => {
        statusMap[item.order_id] = item.status
      })

      const productsMap = {}

      products.forEach((product) => {
        productsMap[product.id] = product
      })

      const itemsMap = {}

      ;(itemData || []).forEach((item) => {
        if (!itemsMap[item.order_id]) {
          itemsMap[item.order_id] = []
        }

        itemsMap[item.order_id].push({
          ...item,
          product: productsMap[item.product_id] || null,
        })
      })

      const completeOrders = orderData.map((order) => ({
        ...order,
        status:
          statusMap[order.id] ||
          order.status ||
          'pending',
        items: itemsMap[order.id] || [],
      }))

      setOrders(completeOrders)
    } catch (error) {
      console.error('My Orders error:', error)

      setMessage(
        error.message ||
        'Could not load your orders.'
      )
    }

    setLoading(false)
  }

  const formatDate = (date) => {
    return new Date(date).toLocaleString()
  }

  const formatStatus = (status) => {
    if (!status) {
      return 'Unknown'
    }

    return status
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (letter) =>
        letter.toUpperCase()
      )
  }

  const deliverySteps = [
    {
      key: 'pending',
      label: 'Order placed',
      icon: '📝',
    },
    {
      key: 'accepted',
      label: 'Accepted',
      icon: '✅',
    },
    {
      key: 'processing',
      label: 'Processing',
      icon: '⚙️',
    },
    {
      key: 'ready',
      label: 'Ready',
      icon: '📦',
    },
    {
      key: 'out_for_delivery',
      label: 'Out for delivery',
      icon: '🚚',
    },
    {
      key: 'delivered',
      label: 'Delivered',
      icon: '🎉',
    },
  ]

  const getStatusIndex = (status) => {
    return deliverySteps.findIndex(
      (step) => step.key === status
    )
  }

  if (loading) {
    return (
      <div className="loading-page">
        <h2>UniAbuja Market</h2>
        <p>Loading your orders...</p>
      </div>
    )
  }

  return (
    <div className="orders-page">
      <nav className="navbar">
        <div className="logo">UniAbuja Market</div>

        <button
          type="button"
          className="back-button"
          onClick={onBack}
        >
          ← Back to Dashboard
        </button>
      </nav>

      <main className="orders-container">
        <div className="orders-header">
          <p className="welcome-small">MY ORDERS</p>

          <h1>Your orders</h1>

          <p>
            View and track your UniAbuja Market purchases.
          </p>
        </div>

        {message && (
          <div className="auth-message">
            {message}
          </div>
        )}

        {orders.length === 0 ? (
          <div className="market-message">
            <div className="empty-cart-icon">
              📦
            </div>

            <h3>No orders yet</h3>

            <p>
              Your completed orders will appear here.
            </p>

            <button
              type="button"
              className="primary-btn"
              onClick={onBack}
            >
              Back to Dashboard
            </button>
          </div>
        ) : (
          <div className="orders-list">
            {orders.map((order) => {
              const currentStatusIndex =
                getStatusIndex(order.status)

              return (
                <div
                  className="order-card"
                  key={order.id}
                >
                  <div className="order-card-header">
                    <div>
                      <span className="order-label">
                        ORDER
                      </span>

                      <h2>
                        #{order.id.slice(0, 8)}
                      </h2>

                      <p>
                        {formatDate(order.created_at)}
                      </p>
                    </div>

                    <span
                      className={`order-status status-${order.status}`}
                    >
                      {formatStatus(order.status)}
                    </span>
                  </div>

                  {/* Payment status */}
                  <div
                    style={{
                      background:
                        order.payment_status === 'paid'
                          ? '#ecfdf5'
                          : '#fff7ed',
                      border:
                        order.payment_status === 'paid'
                          ? '1px solid #10b981'
                          : '1px solid #fb923c',
                      borderRadius: '10px',
                      padding: '12px 14px',
                      margin: '12px 0',
                      color:
                        order.payment_status === 'paid'
                          ? '#065f46'
                          : '#9a3412',
                    }}
                  >
                    <strong>
                      {order.payment_status === 'paid'
                        ? '💳 PAYMENT CONFIRMED'
                        : `💳 ${formatStatus(
                            order.payment_status
                          )}`}
                    </strong>

                    <p
                      style={{
                        margin: '5px 0 0',
                      }}
                    >
                      {order.payment_status === 'paid'
                        ? 'Your payment has been successfully confirmed.'
                        : 'Your payment is being processed.'}
                    </p>
                  </div>

                  {/* Delivery progress */}
                  <div
                    style={{
                      margin: '18px 0',
                      padding: '16px',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                    }}
                  >
                    <strong>
                      🚚 Delivery progress
                    </strong>

                    <div
                      style={{
                        marginTop: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                      }}
                    >
                      {deliverySteps.map(
                        (step, index) => {
                          const completed =
                            currentStatusIndex >=
                            index

                          const current =
                            currentStatusIndex ===
                            index

                          return (
                            <div
                              key={step.key}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                fontWeight: current
                                  ? '700'
                                  : '400',
                                color: completed
                                  ? '#065f46'
                                  : '#64748b',
                              }}
                            >
                              <div
                                style={{
                                  width: '34px',
                                  height: '34px',
                                  minWidth: '34px',
                                  borderRadius: '50%',
                                  display: 'flex',
                                  alignItems:
                                    'center',
                                  justifyContent:
                                    'center',
                                  background:
                                    completed
                                      ? '#d1fae5'
                                      : '#e2e8f0',
                                  border:
                                    current
                                      ? '2px solid #10b981'
                                      : '1px solid #cbd5e1',
                                }}
                              >
                                {completed
                                  ? step.icon
                                  : '○'}
                              </div>

                              <span>
                                {step.label}
                                {current
                                  ? ' — Current'
                                  : ''}
                              </span>
                            </div>
                          )
                        }
                      )}
                    </div>
                  </div>

                  <div className="order-items">
                    {order.items.map((item) => (
                      <div
                        className="order-item"
                        key={item.id}
                      >
                        <div className="order-item-image">
                          {item.product?.image_url ? (
                            <img
                              src={item.product.image_url}
                              alt={item.product.name}
                            />
                          ) : (
                            <span>🛍️</span>
                          )}
                        </div>

                        <div className="order-item-info">
                          <h3>
                            {item.product?.name ||
                              'Product unavailable'}
                          </h3>

                          {item.product?.category && (
                            <span>
                              {item.product.category}
                            </span>
                          )}

                          <p>
                            Quantity: {item.quantity}
                          </p>
                        </div>

                        <strong>
                          ₦
                          {(
                            Number(item.unit_price) *
                            item.quantity
                          ).toLocaleString()}
                        </strong>
                      </div>
                    ))}
                  </div>

                  <div className="order-delivery">
                    <div>
                      <strong>
                        Delivery location
                      </strong>

                      <p>
                        {order.delivery_address}
                      </p>
                    </div>

                    <div>
                      <strong>Phone</strong>

                      <p>{order.phone}</p>
                    </div>
                  </div>

                  <div className="order-card-footer">
                    <span>
                      {order.items.length}{' '}
                      {order.items.length === 1
                        ? 'item'
                        : 'items'}
                    </span>

                    <div>
                      <span>Total</span>

                      <strong>
                        ₦
                        {Number(
                          order.total_amount
                        ).toLocaleString()}
                      </strong>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}

export default MyOrders