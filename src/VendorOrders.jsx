import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

function VendorOrders({ user, onBack }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [updatingOrder, setUpdatingOrder] = useState(null)

  useEffect(() => {
    loadVendorOrders()
  }, [])

  const loadVendorOrders = async () => {
    setLoading(true)
    setMessage('')

    try {
      const { data, error } = await supabase.rpc(
        'get_vendor_orders'
      )

      if (error) {
        console.error('Vendor orders error:', error)
        throw new Error(error.message)
      }

      const { data: vendorOrderData, error: vendorError } =
        await supabase
          .from('vendor_orders')
          .select(`
            id,
            order_id,
            vendor_id,
            status,
            subtotal,
            created_at,
            updated_at
          `)
          .eq('vendor_id', user.id)
          .order('created_at', { ascending: false })

      if (vendorError) {
        console.error(
          'Vendor status loading error:',
          vendorError
        )
        throw new Error(vendorError.message)
      }

      const statusMap = {}

      ;(vendorOrderData || []).forEach((vendorOrder) => {
        statusMap[vendorOrder.order_id] = vendorOrder
      })

      const groupedOrders = {}

      ;(data || []).forEach((item) => {
        if (!groupedOrders[item.order_id]) {
          const vendorOrder = statusMap[item.order_id]

          groupedOrders[item.order_id] = {
            order_id: item.order_id,
            customer_id: item.customer_id,
            total_amount: item.total_amount,
            order_status:
              vendorOrder?.status ||
              item.order_status ||
              'pending',
            payment_status:
              item.payment_status || 'unpaid',
            delivery_address: item.delivery_address,
            phone: item.phone,
            order_created_at: item.order_created_at,
            vendor_order_id: vendorOrder?.id || null,
            items: [],
          }
        }

        groupedOrders[item.order_id].items.push({
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
        })
      })

      setOrders(Object.values(groupedOrders))
    } catch (error) {
      console.error('Load vendor orders error:', error)

      setMessage(
        error.message ||
        'Could not load your incoming orders.'
      )
    }

    setLoading(false)
  }

  const updateStatus = async (order) => {
    if (!order.vendor_order_id) {
      setMessage(
        'Vendor order record not found for this order.'
      )
      return
    }

    const statusFlow = [
      'pending',
      'accepted',
      'processing',
      'ready',
      'out_for_delivery',
      'delivered',
    ]

    const currentIndex = statusFlow.indexOf(
      order.order_status
    )

    if (
      currentIndex === -1 ||
      currentIndex >= statusFlow.length - 1
    ) {
      return
    }

    const nextStatus = statusFlow[currentIndex + 1]

    setUpdatingOrder(order.order_id)
    setMessage('')

    try {
      const { error } = await supabase
        .from('vendor_orders')
        .update({
          status: nextStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.vendor_order_id)
        .eq('vendor_id', user.id)

      if (error) {
        console.error(
          'Vendor status update error:',
          error
        )
        throw new Error(error.message)
      }

      setOrders((currentOrders) =>
        currentOrders.map((currentOrder) =>
          currentOrder.order_id === order.order_id
            ? {
                ...currentOrder,
                order_status: nextStatus,
              }
            : currentOrder
        )
      )
    } catch (error) {
      console.error('Update status error:', error)

      setMessage(
        error.message ||
        'Could not update the order status.'
      )
    }

    setUpdatingOrder(null)
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

  const getVendorTotal = (order) => {
    return order.items.reduce((total, item) => {
      return (
        total +
        Number(item.unit_price) * item.quantity
      )
    }, 0)
  }

  const getNextStatus = (status) => {
    const statusFlow = [
      'pending',
      'accepted',
      'processing',
      'ready',
      'out_for_delivery',
      'delivered',
    ]

    const currentIndex = statusFlow.indexOf(status)

    if (
      currentIndex === -1 ||
      currentIndex >= statusFlow.length - 1
    ) {
      return null
    }

    return statusFlow[currentIndex + 1]
  }

  if (loading) {
    return (
      <div className="loading-page">
        <h2>UniAbuja Market</h2>
        <p>Loading incoming orders...</p>
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
          <p className="welcome-small">
            VENDOR ORDERS
          </p>

          <h1>Incoming orders</h1>

          <p>
            Orders containing products from your store.
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

            <h3>No incoming orders yet</h3>

            <p>
              Orders for your products will appear here.
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
              const nextStatus = getNextStatus(
                order.order_status
              )

              return (
                <div
                  className="order-card"
                  key={order.order_id}
                >
                  <div className="order-card-header">
                    <div>
                      <span className="order-label">
                        ORDER
                      </span>

                      <h2>
                        #{order.order_id.slice(0, 8)}
                      </h2>

                      <p>
                        {formatDate(
                          order.order_created_at
                        )}
                      </p>
                    </div>

                    <span
                      className={`order-status status-${order.order_status}`}
                    >
                      {formatStatus(
                        order.order_status
                      )}
                    </span>
                  </div>

                  {order.payment_status === 'paid' && (
                    <div
                      style={{
                        background: '#ecfdf5',
                        border: '1px solid #10b981',
                        borderRadius: '10px',
                        padding: '12px 14px',
                        margin: '12px 0',
                        color: '#065f46',
                      }}
                    >
                      <strong>
                        🟢 PAYMENT RECEIVED
                      </strong>

                      <p
                        style={{
                          margin: '5px 0 0',
                        }}
                      >
                        Customer payment has been
                        confirmed. You can process
                        this order.
                      </p>
                    </div>
                  )}

                  <div className="order-items">
                    {order.items.map((item) => (
                      <div
                        className="order-item"
                        key={item.product_id}
                      >
                        <div className="order-item-image">
                          🛍️
                        </div>

                        <div className="order-item-info">
                          <h3>
                            {item.product_name}
                          </h3>

                          <p>
                            Quantity: {item.quantity}
                          </p>

                          <p>
                            Unit price: ₦
                            {Number(
                              item.unit_price
                            ).toLocaleString()}
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
                      <strong>Payment</strong>

                      <p>
                        {order.payment_status ===
                        'paid'
                          ? '💳 Paid'
                          : `💳 ${formatStatus(
                              order.payment_status
                            )}`}
                      </p>
                    </div>

                    <div>
                      <strong>Customer</strong>

                      <p>
                        Customer #
                        {order.customer_id.slice(
                          0,
                          8
                        )}
                      </p>
                    </div>

                    <div>
                      <strong>Phone</strong>

                      <p>{order.phone}</p>
                    </div>

                    <div>
                      <strong>
                        Delivery location
                      </strong>

                      <p>
                        {order.delivery_address}
                      </p>
                    </div>
                  </div>

                  <div className="order-card-footer">
                    <span>
                      {order.items.length}{' '}
                      {order.items.length === 1
                        ? 'product'
                        : 'products'}
                    </span>

                    <div>
                      <span>Your total</span>

                      <strong>
                        ₦
                        {getVendorTotal(
                          order
                        ).toLocaleString()}
                      </strong>
                    </div>
                  </div>

                  {nextStatus && (
                    <button
                      type="button"
                      className="primary-btn"
                      disabled={
                        updatingOrder ===
                        order.order_id
                      }
                      onClick={() =>
                        updateStatus(order)
                      }
                    >
                      {updatingOrder ===
                      order.order_id
                        ? 'Updating...'
                        : `Mark as ${formatStatus(
                            nextStatus
                          )}`}
                    </button>
                  )}

                  {order.order_status ===
                    'delivered' && (
                    <p className="order-complete">
                      ✅ This order has been delivered.
                    </p>
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

export default VendorOrders