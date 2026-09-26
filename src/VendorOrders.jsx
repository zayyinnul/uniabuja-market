import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import OrderChat from './OrderChat'

function VendorOrders({ user, onBack }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [updatingOrder, setUpdatingOrder] = useState(null)
  const [findingRiders, setFindingRiders] = useState(null)
  const [assigningRider, setAssigningRider] = useState(null)
  const [availableRiders, setAvailableRiders] = useState({})

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

      const vendorOrderIds = (vendorOrderData || []).map(
        (item) => item.id
      )

      let deliveryData = []

      if (vendorOrderIds.length > 0) {
        const { data: deliveries, error: deliveryError } =
          await supabase
            .from('deliveries')
            .select(`
              id,
              vendor_order_id,
              delivery_method,
              rider_id,
              delivery_fee,
              status,
              rider_request_status,
              zone_id,
              created_at,
              updated_at
            `)
            .in('vendor_order_id', vendorOrderIds)

        if (deliveryError) {
          console.error(
            'Delivery loading error:',
            deliveryError
          )
          throw new Error(deliveryError.message)
        }

        deliveryData = deliveries || []
      }

      const statusMap = {}
      const deliveryMap = {}

      ;(vendorOrderData || []).forEach((vendorOrder) => {
        statusMap[vendorOrder.order_id] = vendorOrder
      })

      ;(deliveryData || []).forEach((delivery) => {
        deliveryMap[delivery.vendor_order_id] = delivery
      })

      const groupedOrders = {}

      ;(data || []).forEach((item) => {
        if (!groupedOrders[item.order_id]) {
          const vendorOrder = statusMap[item.order_id]
          const delivery = vendorOrder
            ? deliveryMap[vendorOrder.id] || null
            : null

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
            order_created_at: item.order_created_at,
            vendor_order_id: vendorOrder?.id || null,
            delivery,
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

  const findAvailableRiders = async (order) => {
    if (!order.delivery?.id) {
      setMessage(
        'Delivery record not found for this order.'
      )
      return
    }

    if (order.payment_status !== 'paid') {
      setMessage(
        'Payment must be confirmed before selecting a rider.'
      )
      return
    }

    setFindingRiders(order.order_id)
    setMessage('')

    try {
      const { data, error } = await supabase.rpc(
        'get_available_delivery_riders',
        {
          p_delivery_id: order.delivery.id,
        }
      )

      if (error) {
        console.error(
          'Available riders error:',
          error
        )
        throw new Error(error.message)
      }

      const riders = data || []

      setAvailableRiders((current) => ({
        ...current,
        [order.order_id]: riders,
      }))

      if (riders.length === 0) {
        setMessage(
          'No approved riders are currently available for this delivery zone.'
        )
      }
    } catch (error) {
      console.error(
        'Find available riders error:',
        error
      )

      setMessage(
        error.message ||
          'Could not find available riders.'
      )
    }

    setFindingRiders(null)
  }

  const assignRider = async (order, rider) => {
    if (!order.delivery?.id) {
      setMessage(
        'Delivery record not found for this order.'
      )
      return
    }

    if (!rider?.rider_id) {
      setMessage('Invalid rider selected.')
      return
    }

    setAssigningRider(order.order_id)
    setMessage('')

    try {
      const { error } = await supabase.rpc(
        'vendor_assign_delivery_rider',
        {
          p_delivery_id: order.delivery.id,
          p_rider_id: rider.rider_id,
        }
      )

      if (error) {
        console.error(
          'Assign rider error:',
          error
        )
        throw new Error(error.message)
      }

      setOrders((currentOrders) =>
        currentOrders.map((currentOrder) =>
          currentOrder.order_id === order.order_id
            ? {
                ...currentOrder,
                delivery: {
                  ...currentOrder.delivery,
                  rider_id: rider.rider_id,
                  rider_request_status: 'assigned',
                  status: 'assigned',
                },
              }
            : currentOrder
        )
      )

      setAvailableRiders((current) => {
        const updated = { ...current }
        delete updated[order.order_id]
        return updated
      })

      setMessage(
        `${rider.rider_name || 'Rider'} has been assigned to this delivery.`
      )
    } catch (error) {
      console.error(
        'Assign rider error:',
        error
      )

      setMessage(
        error.message ||
          'Could not assign this rider.'
      )
    }

    setAssigningRider(null)
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

        if (
          error.message?.includes(
            'Vendor order cannot advance until the parent order is paid'
          )
        ) {
          throw new Error(
            'Payment required: This order has not been paid for yet. You can accept it once payment is confirmed.'
          )
        }

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

  const getDeliveryAction = (order) => {
    const delivery = order.delivery

    if (!delivery) {
      return null
    }

    if (
      delivery.rider_id &&
      delivery.status === 'assigned'
    ) {
      return (
        <div
          style={{
            background: '#ecfdf5',
            border: '1px solid #10b981',
            borderRadius: '10px',
            padding: '12px 14px',
            marginTop: '12px',
            color: '#065f46',
          }}
        >
          <strong>🛵 RIDER ASSIGNED</strong>

          <p
            style={{
              margin: '5px 0 0',
            }}
          >
            A rider has been assigned to this
            delivery. You can continue processing
            the order.
          </p>
        </div>
      )
    }

    if (
      delivery.rider_request_status === 'assigned' &&
      delivery.rider_id
    ) {
      return (
        <div
          style={{
            background: '#ecfdf5',
            border: '1px solid #10b981',
            borderRadius: '10px',
            padding: '12px 14px',
            marginTop: '12px',
            color: '#065f46',
          }}
        >
          <strong>🛵 RIDER ASSIGNED</strong>

          <p
            style={{
              margin: '5px 0 0',
            }}
          >
            A rider has been assigned to this
            delivery. You can continue processing
            the order.
          </p>
        </div>
      )
    }

    if (
      delivery.delivery_method === 'vendor' &&
      delivery.status === 'pending' &&
      order.payment_status === 'paid'
    ) {
      const riders =
        availableRiders[order.order_id]

      return (
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: '10px',
            padding: '14px',
            marginTop: '12px',
          }}
        >
          <strong>🚚 DELIVERY</strong>

          <p
            style={{
              margin: '6px 0 12px',
            }}
          >
            You can deliver this order yourself,
            or select an available rider to deliver
            it for you.
          </p>

          <button
            type="button"
            className="primary-btn"
            disabled={
              findingRiders === order.order_id
            }
            onClick={() =>
              findAvailableRiders(order)
            }
          >
            {findingRiders === order.order_id
              ? 'Finding Riders...'
              : 'Find Available Riders'}
          </button>

          {Array.isArray(riders) && (
            <div
              style={{
                marginTop: '14px',
              }}
            >
              {riders.length === 0 ? (
                <div
                  style={{
                    background: '#fff7ed',
                    border: '1px solid #f97316',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    color: '#9a3412',
                  }}
                >
                  <strong>
                    No riders available
                  </strong>

                  <p
                    style={{
                      margin: '5px 0 0',
                    }}
                  >
                    There are currently no approved
                    riders available for this delivery
                    zone.
                  </p>
                </div>
              ) : (
                <div>
                  <strong
                    style={{
                      display: 'block',
                      marginBottom: '10px',
                    }}
                  >
                    Available Riders
                  </strong>

                  <div
                    style={{
                      display: 'grid',
                      gap: '10px',
                    }}
                  >
                    {riders.map((rider) => (
                      <div
                        key={rider.rider_id}
                        style={{
                          background: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '10px',
                          padding: '12px',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent:
                              'space-between',
                            alignItems: 'center',
                            gap: '12px',
                          }}
                        >
                          <div>
                            <strong>
                              🛵{' '}
                              {rider.rider_name ||
                                'Available Rider'}
                            </strong>

                            {rider.rider_phone && (
                              <p
                                style={{
                                  margin:
                                    '4px 0 0',
                                  fontSize: '13px',
                                  color: '#64748b',
                                }}
                              >
                                {rider.rider_phone}
                              </p>
                            )}

                            <p
                              style={{
                                margin:
                                  '4px 0 0',
                                fontWeight: '600',
                              }}
                            >
                              Rider fee: ₦
                              {Number(
                                rider.rider_fee || 0
                              ).toLocaleString()}
                            </p>
                          </div>

                          <button
                            type="button"
                            className="primary-btn"
                            disabled={
                              assigningRider ===
                              order.order_id
                            }
                            onClick={() =>
                              assignRider(
                                order,
                                rider
                              )
                            }
                          >
                            {assigningRider ===
                            order.order_id
                              ? 'Assigning...'
                              : 'Select Rider'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )
    }

    return null
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

                  {getDeliveryAction(order)}

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

                  {order.order_status !== 'cancelled' &&
                    order.vendor_order_id && (
                      <OrderChat
                        user={user}
                        orderId={order.order_id}
                        title={`Chat about order #${order.order_id.slice(
                          0,
                          8
                        )}`}
                      />
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