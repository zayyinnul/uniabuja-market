import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import OrderChat from './OrderChat'

function MyOrders({ user, onBack }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [retryingOrder, setRetryingOrder] = useState(null)
  const [cancellingOrder, setCancellingOrder] = useState(null)

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

  const retryPayment = async (order) => {
    if (order.payment_status === 'paid') {
      setMessage('This order has already been paid for.')
      return
    }

    if (
      order.status === 'cancelled' ||
      order.payment_status === 'cancelled'
    ) {
      setMessage('This order has been cancelled.')
      return
    }

    setRetryingOrder(order.id)
    setMessage('')

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        throw new Error(
          'Your session has expired. Please log in again.'
        )
      }

      const paymentInitUrl =
        window.location.hostname === 'localhost'
          ? 'http://127.0.0.1:8787/api/payments/initialize'
          : '/api/payments/initialize'

      const response = await fetch(paymentInitUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          order_id: order.id,
        }),
      })

      const paymentData = await response.json()

      if (!response.ok || !paymentData.success) {
        throw new Error(
          paymentData.message ||
            paymentData.error ||
            'Could not initialize payment.'
        )
      }

      if (!paymentData.authorization_url) {
        throw new Error(
          'Payment link was not returned.'
        )
      }

      window.location.href =
        paymentData.authorization_url
    } catch (error) {
      console.error('Retry payment error:', error)

      setMessage(
        error.message ||
          'Could not start payment. Please try again.'
      )

      setRetryingOrder(null)
    }
  }

  const cancelOrder = async (order) => {
    if (order.payment_status === 'paid') {
      setMessage('Paid orders cannot be cancelled.')
      return
    }

    if (
      order.status === 'cancelled' ||
      order.payment_status === 'cancelled'
    ) {
      setMessage('This order is already cancelled.')
      return
    }

    const confirmed = window.confirm(
      `Cancel order #${order.id.slice(
        0,
        8
      )}?\n\nThis will cancel the unpaid order and cannot be undone.`
    )

    if (!confirmed) {
      return
    }

    setCancellingOrder(order.id)
    setMessage('')

    try {
      const { data, error } =
        await supabase.rpc('cancel_my_order', {
          p_order_id: order.id,
        })

      if (error) {
        throw new Error(error.message)
      }

      if (data !== true) {
        throw new Error(
          'The order could not be cancelled.'
        )
      }

      setMessage(
        `Order #${order.id.slice(
          0,
          8
        )} has been cancelled successfully.`
      )

      await loadOrders()
    } catch (error) {
      console.error('Cancel order error:', error)

      setMessage(
        error.message ||
          'Could not cancel this order. Please try again.'
      )
    } finally {
      setCancellingOrder(null)
    }
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

              const canCancel =
                order.payment_status !== 'paid' &&
                order.payment_status !== 'cancelled' &&
                order.status === 'pending'

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
                          : order.payment_status ===
                              'cancelled'
                            ? '#f3f4f6'
                            : '#fff7ed',
                      border:
                        order.payment_status === 'paid'
                          ? '1px solid #10b981'
                          : order.payment_status ===
                              'cancelled'
                            ? '1px solid #9ca3af'
                            : '1px solid #fb923c',
                      borderRadius: '10px',
                      padding: '12px 14px',
                      margin: '12px 0',
                      color:
                        order.payment_status === 'paid'
                          ? '#065f46'
                          : order.payment_status ===
                              'cancelled'
                            ? '#4b5563'
                            : '#9a3412',
                    }}
                  >
                    <strong>
                      {order.payment_status === 'paid'
                        ? '💳 PAYMENT CONFIRMED'
                        : order.payment_status ===
                            'cancelled'
                          ? '🚫 PAYMENT CANCELLED'
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
                        : order.payment_status ===
                            'cancelled'
                          ? 'This order has been cancelled.'
                          : 'Your payment is still pending.'}
                    </p>

                    {order.payment_status !== 'paid' &&
                      order.payment_status !==
                        'cancelled' && (
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '10px',
                            marginTop: '12px',
                          }}
                        >
                          <button
                            type="button"
                            className="primary-btn"
                            disabled={
                              retryingOrder === order.id ||
                              cancellingOrder === order.id
                            }
                            onClick={() =>
                              retryPayment(order)
                            }
                          >
                            {retryingOrder === order.id
                              ? 'Opening Payment...'
                              : '💳 Pay Now'}
                          </button>

                          {canCancel && (
                            <button
                              type="button"
                              disabled={
                                retryingOrder === order.id ||
                                cancellingOrder === order.id
                              }
                              onClick={() =>
                                cancelOrder(order)
                              }
                              style={{
                                marginTop: '0',
                                padding:
                                  '10px 16px',
                                borderRadius: '8px',
                                border:
                                  '1px solid #dc2626',
                                background:
                                  '#fff',
                                color:
                                  '#dc2626',
                                cursor:
                                  cancellingOrder ===
                                  order.id
                                    ? 'not-allowed'
                                    : 'pointer',
                                fontWeight: '600',
                                opacity:
                                  cancellingOrder ===
                                  order.id
                                    ? 0.6
                                    : 1,
                              }}
                            >
                              {cancellingOrder ===
                              order.id
                                ? 'Cancelling...'
                                : '✕ Cancel Order'}
                            </button>
                          )}
                        </div>
                      )}
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

                    {order.status ===
                      'cancelled' ? (
                      <p
                        style={{
                          marginTop: '12px',
                          color: '#6b7280',
                        }}
                      >
                        This order has been cancelled.
                      </p>
                    ) : (
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
                                  alignItems:
                                    'center',
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
                                    borderRadius:
                                      '50%',
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
                    )}
                  </div>

                  <div className="order-items">
                    {order.items.map((item) => (
                      <div
                        className="order-item"
                        key={item.id}
                      >
                        <div
                          className="order-item-image"
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
                          {item.product?.image_url ? (
                            <img
                              src={item.product.image_url}
                              alt={item.product.name}
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

                  {/* Order chat */}
                  {order.status !== 'cancelled' && (
                    <OrderChat
                      user={user}
                      orderId={order.id}
                      title={`Chat about order #${order.id.slice(
                        0,
                        8
                      )}`}
                    />
                  )}
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