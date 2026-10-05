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
  const [takingOverDelivery, setTakingOverDelivery] = useState(null)
  const [availableRiders, setAvailableRiders] = useState({})
  const [deliveryCodes, setDeliveryCodes] = useState({})
  const [openChats, setOpenChats] = useState({})
  const [activeSection, setActiveSection] = useState('paid')

  useEffect(() => {
    if (!user) {
      return
    }

    loadVendorOrders(true)
  }, [user])

  /*
   * Keep the vendor dashboard synchronized with:
   * - rider accepting/rejecting requests
   * - vendor status changes
   * - rider starting delivery
   * - delivery completion
   */
  useEffect(() => {
    if (!user) {
      return
    }

    const interval = setInterval(() => {
      loadVendorOrders(false)
    }, 5000)

    return () => clearInterval(interval)
  }, [user])

  const loadVendorOrders = async (showLoading = true) => {
    if (!user) {
      return
    }

    if (showLoading) {
      setLoading(true)
    }

    try {
      const { data, error } = await supabase.rpc(
        'get_vendor_orders'
      )

      if (error) {
        console.error('Vendor orders error:', error)
        throw new Error(error.message)
      }

      const {
        data: vendorOrderData,
        error: vendorError,
      } = await supabase
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

      const vendorOrderIds = (
        vendorOrderData || []
      ).map((item) => item.id)

      let deliveryData = []

      if (vendorOrderIds.length > 0) {
        const {
          data: deliveries,
          error: deliveryError,
        } = await supabase
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

      ;(vendorOrderData || []).forEach(
        (vendorOrder) => {
          statusMap[vendorOrder.order_id] =
            vendorOrder
        }
      )

      ;(deliveryData || []).forEach((delivery) => {
        deliveryMap[delivery.vendor_order_id] =
          delivery
      })

      const groupedOrders = {}

      ;(data || []).forEach((item) => {
        if (!groupedOrders[item.order_id]) {
          const vendorOrder =
            statusMap[item.order_id]

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
            delivery_address:
              item.delivery_address,
            phone: item.phone,
            order_created_at:
              item.order_created_at,
            vendor_order_id:
              vendorOrder?.id || null,
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
      console.error(
        'Load vendor orders error:',
        error
      )

      if (showLoading) {
        setMessage(
          error.message ||
            'Could not load your incoming orders.'
        )
      }
    } finally {
      if (showLoading) {
        setLoading(false)
      }
    }
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
        'Payment must be confirmed before looking for a rider.'
      )
      return
    }

    setFindingRiders(order.order_id)
    setMessage('')

    try {
      const { data, error } =
        await supabase.rpc(
          'get_available_delivery_riders',
          {
            p_delivery_id:
              order.delivery.id,
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
          'No active riders are currently available.'
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
    } finally {
      setFindingRiders(null)
    }
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
      const { error } =
        await supabase.rpc(
          'vendor_assign_delivery_rider',
          {
            p_delivery_id:
              order.delivery.id,
            p_rider_id:
              rider.rider_id,
          }
        )

      if (error) {
        console.error(
          'Request rider error:',
          error
        )
        throw new Error(error.message)
      }

      await loadVendorOrders(false)

      setAvailableRiders((current) => {
        const updated = { ...current }

        delete updated[order.order_id]

        return updated
      })

      setMessage(
        `Rider request sent to ${
          rider.rider_name ||
          'the selected rider'
        }.`
      )
    } catch (error) {
      console.error(
        'Request rider error:',
        error
      )

      setMessage(
        error.message ||
          'Could not send the rider request.'
      )
    } finally {
      setAssigningRider(null)
    }
  }

  /*
   * Vendor takes over delivery after a rider
   * rejects or cancels the request.
   */
  const takeOverDelivery = async (order) => {
    if (!order.delivery?.id) {
      setMessage(
        'Delivery record not found for this order.'
      )
      return
    }

    setTakingOverDelivery(order.order_id)
    setMessage('')

    try {
      const { error } =
        await supabase.rpc(
          'vendor_take_over_delivery',
          {
            p_delivery_id:
              order.delivery.id,
          }
        )

      if (error) {
        console.error(
          'Take over delivery error:',
          error
        )
        throw new Error(error.message)
      }

      setOrders((currentOrders) =>
        currentOrders.map((currentOrder) =>
          currentOrder.order_id ===
          order.order_id
            ? {
                ...currentOrder,
                delivery:
                  currentOrder.delivery
                    ? {
                        ...currentOrder.delivery,
                        delivery_method:
                          'vendor',
                        rider_id: null,
                        rider_request_status:
                          'not_requested',
                      }
                    : currentOrder.delivery,
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
        'You will deliver this order yourself.'
      )

      await loadVendorOrders(false)
    } catch (error) {
      console.error(
        'Take over delivery error:',
        error
      )

      setMessage(
        error.message ||
          'Could not take over this delivery.'
      )
    } finally {
      setTakingOverDelivery(null)
    }
  }

  /*
   * Render available riders.
   *
   * This is shared by:
   * - normal "Look for Rider" flow
   * - rider rejection/cancellation flow
   *
   * This fixes the previous issue where
   * "Look for Another Rider" successfully
   * fetched riders but had nowhere to display them.
   */
  const renderAvailableRiders = (order) => {
    const riders =
      availableRiders[order.order_id]

    if (!Array.isArray(riders)) {
      return null
    }

    return (
      <div
        style={{
          marginTop: '14px',
        }}
      >
        {riders.length === 0 ? (
          <div
            style={{
              background:
                '#fff7ed',
              border:
                '1px solid #f97316',
              borderRadius:
                '10px',
              padding:
                '12px 14px',
              color:
                '#9a3412',
            }}
          >
            <strong>
              No active riders
              available
            </strong>

            <p
              style={{
                margin:
                  '5px 0 0',
              }}
            >
              Try again later
              or deliver the
              order yourself.
            </p>
          </div>
        ) : (
          <div>
            <strong
              style={{
                display:
                  'block',
                marginBottom:
                  '8px',
              }}
            >
              Available Riders
            </strong>

            <p
              style={{
                margin:
                  '0 0 12px',
                fontSize:
                  '13px',
                color:
                  '#475569',
              }}
            >
              Contact the
              rider privately
              to discuss
              delivery price
              and terms before
              sending the
              request.
            </p>

            <div
              style={{
                display:
                  'grid',
                gap: '10px',
              }}
            >
              {riders.map(
                (rider) => (
                  <div
                    key={
                      rider.rider_id
                    }
                    style={{
                      background:
                        '#ffffff',
                      border:
                        '1px solid #e2e8f0',
                      borderRadius:
                        '10px',
                      padding:
                        '12px',
                    }}
                  >
                    <div
                      style={{
                        display:
                          'flex',
                        justifyContent:
                          'space-between',
                        alignItems:
                          'center',
                        gap:
                          '12px',
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
                                '5px 0 0',
                              fontSize:
                                '14px',
                              color:
                                '#475569',
                            }}
                          >
                            📞{' '}
                            {
                              rider.rider_phone
                            }
                          </p>
                        )}

                        <p
                          style={{
                            margin:
                              '5px 0 0',
                            fontSize:
                              '12px',
                            color:
                              '#64748b',
                          }}
                        >
                          Discuss
                          price and
                          terms
                          privately
                          before
                          requesting
                          the rider.
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
                          ? 'Sending...'
                          : 'Request Rider'}
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  /*
   * Updates the delivery row.
   *
   * This is intentionally separate from the
   * vendor_orders update because the Rider
   * Dashboard reads deliveries.status.
   */
  const updateDeliveryStatus = async (
    deliveryId,
    status
  ) => {
    if (!deliveryId) {
      return null
    }

    const {
      data,
      error,
    } = await supabase
      .from('deliveries')
      .update({
        status,
        updated_at:
          new Date().toISOString(),
      })
      .eq('id', deliveryId)
      .select(`
        id,
        status,
        rider_request_status
      `)
      .single()

    if (error) {
      console.error(
        'Delivery status update error:',
        error
      )

      throw new Error(
        `Delivery status could not be updated: ${error.message}`
      )
    }

    if (!data) {
      throw new Error(
        'The delivery status was not updated.'
      )
    }

    return data
  }

  /*
   * Updates the vendor_orders row.
   */
  const updateVendorOrderStatus = async (
    order,
    nextStatus
  ) => {
    const {
      data: updatedVendorOrder,
      error,
    } = await supabase
      .from('vendor_orders')
      .update({
        status: nextStatus,
        updated_at:
          new Date().toISOString(),
      })
      .eq('id', order.vendor_order_id)
      .eq('vendor_id', user.id)
      .select(`
        id,
        status
      `)
      .single()

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

    if (!updatedVendorOrder) {
      throw new Error(
        'The vendor order was not updated. Please refresh and try again.'
      )
    }

    return updatedVendorOrder
  }

  /*
   * Keep vendor_orders.status and deliveries.status
   * synchronized for vendor-controlled stages.
   */
  const updateVendorAndDeliveryStatus = async (
    order,
    nextStatus
  ) => {
    if (!order.vendor_order_id) {
      throw new Error(
        'Vendor order record not found for this order.'
      )
    }

    if (
      order.payment_status !== 'paid'
    ) {
      throw new Error(
        'Payment must be confirmed before this order can move forward.'
      )
    }

    /*
     * First update the vendor order.
     */
    await updateVendorOrderStatus(
      order,
      nextStatus
    )

    /*
     * Then update the delivery row.
     *
     * RiderDashboard reads this row,
     * so it must always match the
     * vendor order status.
     */
    if (order.delivery?.id) {
      try {
        await updateDeliveryStatus(
          order.delivery.id,
          nextStatus
        )
      } catch (deliveryError) {
        /*
         * The vendor order has already changed.
         * Surface the exact delivery error instead
         * of pretending everything succeeded.
         */
        throw new Error(
          `Vendor order changed to ${formatStatus(
            nextStatus
          )}, but the delivery status could not be synchronized. ${deliveryError.message}`
        )
      }
    }

    return true
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

    const currentIndex =
      statusFlow.indexOf(
        order.order_status
      )

    if (
      currentIndex === -1 ||
      currentIndex >=
        statusFlow.length - 1
    ) {
      return
    }

    const nextStatus =
      statusFlow[currentIndex + 1]

    /*
     * Delivered is completed through the
     * customer delivery PIN.
     */
    if (nextStatus === 'delivered') {
      setMessage(
        'Enter the customer delivery code to complete this delivery.'
      )
      return
    }

    setUpdatingOrder(order.order_id)
    setMessage('')

    try {
      /*
       * RIDER / VENDOR DELIVERY START
       *
       * Vendor can control:
       * pending -> accepted
       * accepted -> processing
       * processing -> ready
       *
       * For vendor self-delivery:
       * ready -> out_for_delivery
       *
       * For rider delivery:
       * the rider starts the delivery.
       */
      if (
        nextStatus ===
        'out_for_delivery'
      ) {
        if (!order.delivery?.id) {
          throw new Error(
            'Delivery record not found for this order.'
          )
        }

        if (
          order.payment_status !==
          'paid'
        ) {
          throw new Error(
            'Payment must be confirmed before delivery can start.'
          )
        }

        if (
          order.delivery
            .delivery_method ===
          'rider'
        ) {
          if (
            order.delivery
              .rider_request_status !==
            'accepted'
          ) {
            throw new Error(
              'A rider must accept the delivery request before delivery can start.'
            )
          }

          throw new Error(
            'The assigned rider must start the delivery.'
          )
        }

        /*
         * Vendor self-delivery.
         *
         * Keep vendor_orders and deliveries
         * synchronized.
         */
        await updateVendorAndDeliveryStatus(
          order,
          'out_for_delivery'
        )

        setOrders(
          (currentOrders) =>
            currentOrders.map(
              (currentOrder) =>
                currentOrder.order_id ===
                order.order_id
                  ? {
                      ...currentOrder,
                      order_status:
                        'out_for_delivery',
                      delivery:
                        currentOrder.delivery
                          ? {
                              ...currentOrder.delivery,
                              status:
                                'out_for_delivery',
                            }
                          : currentOrder.delivery,
                    }
                  : currentOrder
            )
        )

        setMessage(
          'Order is now out for delivery.'
        )

        await loadVendorOrders(false)

        return
      }

      /*
       * NORMAL VENDOR STATUS FLOW
       *
       * pending -> accepted
       * accepted -> processing
       * processing -> ready
       *
       * IMPORTANT:
       * Both vendor_orders.status and
       * deliveries.status are updated.
       */
      if (
        [
          'accepted',
          'processing',
          'ready',
        ].includes(nextStatus)
      ) {
        await updateVendorAndDeliveryStatus(
          order,
          nextStatus
        )
      } else {
        await updateVendorOrderStatus(
          order,
          nextStatus
        )
      }

      /*
       * Update the visible UI immediately.
       */
      setOrders(
        (currentOrders) =>
          currentOrders.map(
            (currentOrder) =>
              currentOrder.order_id ===
              order.order_id
                ? {
                    ...currentOrder,
                    order_status:
                      nextStatus,
                    delivery:
                      currentOrder.delivery
                        ? {
                            ...currentOrder.delivery,
                            status:
                              [
                                'accepted',
                                'processing',
                                'ready',
                              ].includes(
                                nextStatus
                              )
                                ? nextStatus
                                : currentOrder
                                    .delivery
                                    .status,
                          }
                        : currentOrder.delivery,
                  }
                : currentOrder
          )
      )

      setMessage(
        `Order status updated to ${formatStatus(
          nextStatus
        )}.`
      )

      /*
       * Pull the real database state immediately.
       * This also picks up rider acceptance/rejection.
       */
      await loadVendorOrders(false)
    } catch (error) {
      console.error(
        'Update status error:',
        error
      )

      setMessage(
        error.message ||
          'Could not update the order status.'
      )
    } finally {
      setUpdatingOrder(null)
    }
  }

  const confirmDelivered = async (order) => {
    if (!order.delivery?.id) {
      setMessage(
        'Delivery record not found for this order.'
      )
      return
    }

    const code =
      deliveryCodes[
        order.order_id
      ] || ''

    if (!/^\d{4}$/.test(code)) {
      setMessage(
        'Enter the 4-digit delivery code given by the customer.'
      )
      return
    }

    setUpdatingOrder(order.order_id)
    setMessage('')

    try {
      const { error } =
        await supabase.rpc(
          'confirm_delivery_delivery',
          {
            p_delivery_id:
              order.delivery.id,
            p_delivery_code: code,
          }
        )

      if (error) {
        console.error(
          'Confirm delivery error:',
          error
        )
        throw new Error(error.message)
      }

      setOrders(
        (currentOrders) =>
          currentOrders.map(
            (currentOrder) =>
              currentOrder.order_id ===
              order.order_id
                ? {
                    ...currentOrder,
                    order_status:
                      'delivered',
                    delivery: {
                      ...currentOrder.delivery,
                      status:
                        'delivered',
                    },
                  }
                : currentOrder
          )
      )

      setDeliveryCodes(
        (currentCodes) => {
          const updated = {
            ...currentCodes,
          }

          delete updated[
            order.order_id
          ]

          return updated
        }
      )

      setMessage(
        'Delivery confirmed successfully. Order completed.'
      )

      await loadVendorOrders(false)
    } catch (error) {
      console.error(
        'Confirm delivered error:',
        error
      )

      setMessage(
        error.message ||
          'Could not confirm delivery.'
      )
    } finally {
      setUpdatingOrder(null)
    }
  }

  const formatDate = (date) => {
    return new Date(
      date
    ).toLocaleString()
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
    return order.items.reduce(
      (total, item) => {
        return (
          total +
          Number(item.unit_price) *
            item.quantity
        )
      },
      0
    )
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

    const currentIndex =
      statusFlow.indexOf(status)

    if (
      currentIndex === -1 ||
      currentIndex >=
        statusFlow.length - 1
    ) {
      return null
    }

    return statusFlow[
      currentIndex + 1
    ]
  }

  const getDeliveryAction = (order) => {
    const delivery =
      order.delivery

    if (!delivery) {
      return null
    }

    /*
     * Rider request is waiting for response.
     */
    if (
      delivery.delivery_method ===
        'rider' &&
      delivery.rider_request_status ===
        'requested'
    ) {
      return (
        <div
          style={{
            background: '#fff7ed',
            border:
              '1px solid #f97316',
            borderRadius: '10px',
            padding: '14px',
            marginTop: '12px',
            color: '#9a3412',
          }}
        >
          <strong>
            🛵 RIDER REQUEST SENT
          </strong>

          <p
            style={{
              margin: '6px 0 0',
            }}
          >
            The rider has received the
            request. Wait for the rider
            to accept or reject it.
          </p>

          <p
            style={{
              margin: '6px 0 0',
              fontSize: '13px',
            }}
          >
            Customer delivery details
            remain private until the
            rider accepts.
          </p>
        </div>
      )
    }

    /*
     * Rider has accepted.
     */
    if (
      delivery.delivery_method ===
        'rider' &&
      delivery.rider_request_status ===
        'accepted'
    ) {
      return (
        <div
          style={{
            background: '#ecfdf5',
            border:
              '1px solid #10b981',
            borderRadius: '10px',
            padding: '14px',
            marginTop: '12px',
            color: '#065f46',
          }}
        >
          <strong>
            🛵 RIDER ACCEPTED
          </strong>

          <p
            style={{
              margin: '6px 0 0',
            }}
          >
            The rider has accepted this
            delivery. Continue preparing
            the order.
          </p>

          {order.order_status ===
            'accepted' && (
            <p
              style={{
                margin: '6px 0 0',
                fontWeight: '600',
              }}
            >
              Mark the order as Processing
              when preparation begins.
            </p>
          )}

          {order.order_status ===
            'processing' && (
            <p
              style={{
                margin: '6px 0 0',
                fontWeight: '600',
              }}
            >
              Mark the order as Ready when
              it is ready for the rider.
            </p>
          )}

          {order.order_status ===
            'ready' && (
            <p
              style={{
                margin: '6px 0 0',
                fontWeight: '600',
              }}
            >
              The rider can now pick up
              the order and start delivery.
            </p>
          )}
        </div>
      )
    }

    /*
     * Previous rider request ended.
     *
     * Vendor can either:
     * 1. Deliver the order themselves.
     * 2. Look for another rider.
     *
     * IMPORTANT:
     * The available riders list is now
     * rendered below the buttons.
     */
    if (
      delivery.delivery_method ===
        'rider' &&
      delivery.rider_request_status ===
        'cancelled'
    ) {
      return (
        <div
          style={{
            background: '#fff7ed',
            border:
              '1px solid #f97316',
            borderRadius: '10px',
            padding: '14px',
            marginTop: '12px',
            color: '#9a3412',
          }}
        >
          <strong>
            🛵 RIDER REQUEST ENDED
          </strong>

          <p
            style={{
              margin: '6px 0 0',
            }}
          >
            The previous rider request
            was not accepted. You can
            deliver the order yourself or
            look for another rider.
          </p>

          {order.payment_status ===
            'paid' &&
            order.order_status !==
              'delivered' &&
            order.order_status !==
              'cancelled' &&
            ![
              'out_for_delivery',
            ].includes(
              order.order_status
            ) && (
              <>
                <div
                  style={{
                    display: 'flex',
                    gap: '8px',
                    flexWrap: 'wrap',
                    marginTop: '10px',
                  }}
                >
                  <button
                    type="button"
                    className="primary-btn"
                    disabled={
                      takingOverDelivery ===
                      order.order_id
                    }
                    onClick={() =>
                      takeOverDelivery(
                        order
                      )
                    }
                  >
                    {takingOverDelivery ===
                    order.order_id
                      ? 'Taking Over...'
                      : 'Deliver Myself'}
                  </button>

                  <button
                    type="button"
                    className="secondary-btn"
                    disabled={
                      findingRiders ===
                      order.order_id
                    }
                    onClick={() =>
                      findAvailableRiders(
                        order
                      )
                    }
                  >
                    {findingRiders ===
                    order.order_id
                      ? 'Looking for Riders...'
                      : 'Look for Another Rider'}
                  </button>
                </div>

                {renderAvailableRiders(
                  order
                )}
              </>
            )}
        </div>
      )
    }

    /*
     * Allow the vendor to look for a rider
     * while the order is still in a vendor-
     * controlled stage.
     *
     * Previously this only worked while
     * delivery.status === 'pending'.
     */
    if (
      ['pending', 'accepted', 'processing'].includes(
        delivery.status
      ) &&
      order.payment_status ===
        'paid' &&
      delivery.rider_request_status !==
        'accepted' &&
      delivery.rider_request_status !==
        'requested' &&
      delivery.rider_request_status !==
        'cancelled'
    ) {
      return (
        <div
          style={{
            background: '#f8fafc',
            border:
              '1px solid #cbd5e1',
            borderRadius: '10px',
            padding: '14px',
            marginTop: '12px',
          }}
        >
          <strong>
            🚚 DELIVERY
          </strong>

          <p
            style={{
              margin: '6px 0 12px',
            }}
          >
            You can deliver this order
            yourself, or look for a
            UniAbuja Market rider.
          </p>

          <button
            type="button"
            className="primary-btn"
            disabled={
              findingRiders ===
              order.order_id
            }
            onClick={() =>
              findAvailableRiders(
                order
              )
            }
          >
            {findingRiders ===
            order.order_id
              ? 'Looking for Riders...'
              : 'Look for Rider'}
          </button>

          {renderAvailableRiders(
            order
          )}
        </div>
      )
    }

    return null
  }

  const awaitingPaymentOrders =
    orders.filter(
      (order) =>
        order.payment_status !==
          'paid' &&
        order.order_status !==
          'cancelled'
    )

  const paidOrders =
    orders.filter(
      (order) =>
        order.payment_status ===
          'paid' &&
        order.order_status !==
          'cancelled'
    )

  const cancelledOrders =
    orders.filter(
      (order) =>
        order.order_status ===
        'cancelled'
    )

  const renderOrderCard = (order) => {
    const nextStatus =
      getNextStatus(
        order.order_status
      )

    const isUpdating =
      updatingOrder ===
      order.order_id

    const showDeliveryCode =
      order.order_status ===
      'out_for_delivery'

    const chatOpen =
      openChats[
        order.order_id
      ] === true

    return (
      <div
        key={order.order_id}
        style={{
          border:
            '1px solid #e2e8f0',
          borderRadius: '14px',
          padding: '18px',
          marginBottom: '16px',
          background: '#ffffff',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent:
              'space-between',
            alignItems:
              'flex-start',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: '17px',
              }}
            >
              Order #
              {order.order_id.slice(
                0,
                8
              )}
            </h3>

            <p
              style={{
                margin:
                  '5px 0 0',
                fontSize:
                  '13px',
                color:
                  '#64748b',
              }}
            >
              {formatDate(
                order.order_created_at
              )}
            </p>
          </div>

          <div
            style={{
              display:
                'flex',
              gap: '8px',
              flexWrap:
                'wrap',
            }}
          >
            <span
              style={{
                padding:
                  '6px 10px',
                borderRadius:
                  '999px',
                background:
                  order.payment_status ===
                  'paid'
                    ? '#dcfce7'
                    : '#fef3c7',
                color:
                  order.payment_status ===
                  'paid'
                    ? '#166534'
                    : '#92400e',
                fontSize:
                  '12px',
                fontWeight:
                  '700',
              }}
            >
              {order.payment_status ===
              'paid'
                ? 'PAYMENT RECEIVED'
                : 'AWAITING PAYMENT'}
            </span>

            <span
              style={{
                padding:
                  '6px 10px',
                borderRadius:
                  '999px',
                background:
                  '#f1f5f9',
                color:
                  '#334155',
                fontSize:
                  '12px',
                fontWeight:
                  '700',
              }}
            >
              {formatStatus(
                order.order_status
              )}
            </span>
          </div>
        </div>

        <div
          style={{
            marginTop:
              '15px',
          }}
        >
          <strong>
            Items
          </strong>

          <div
            style={{
              marginTop:
                '8px',
              display:
                'grid',
              gap:
                '7px',
            }}
          >
            {order.items.map(
              (
                item,
                index
              ) => (
                <div
                  key={`${item.product_id}-${index}`}
                  style={{
                    display:
                      'flex',
                    justifyContent:
                      'space-between',
                    gap:
                      '10px',
                    padding:
                      '8px 0',
                    borderBottom:
                      '1px solid #f1f5f9',
                  }}
                >
                  <div>
                    <strong>
                      {
                        item.product_name
                      }
                    </strong>

                    <div
                      style={{
                        fontSize:
                          '13px',
                        color:
                          '#64748b',
                      }}
                    >
                      Qty:{' '}
                      {
                        item.quantity
                      }
                    </div>
                  </div>

                  <span>
                    ₦
                    {(
                      Number(
                        item.unit_price
                      ) *
                      item.quantity
                    ).toLocaleString()}
                  </span>
                </div>
              )
            )}
          </div>
        </div>

        <div
          style={{
            display:
              'flex',
            justifyContent:
              'space-between',
            marginTop:
              '14px',
            fontWeight:
              '700',
          }}
        >
          <span>
            Vendor Total
          </span>

          <span>
            ₦
            {getVendorTotal(
              order
            ).toLocaleString()}
          </span>
        </div>

        {order.delivery_address && (
          <div
            style={{
              marginTop:
                '14px',
              padding:
                '12px',
              background:
                '#f8fafc',
              borderRadius:
                '10px',
            }}
          >
            <strong>
              Delivery Address
            </strong>

            <p
              style={{
                margin:
                  '5px 0 0',
                fontSize:
                  '14px',
              }}
            >
              {
                order.delivery_address
              }
            </p>
          </div>
        )}

        {order.delivery && (
          <div
            style={{
              marginTop:
                '12px',
              fontSize:
                '13px',
              color:
                '#475569',
            }}
          >
            Delivery method:{' '}
            <strong>
              {order.delivery
                .delivery_method ===
              'rider'
                ? 'Rider'
                : 'Vendor'}
            </strong>
          </div>
        )}

        {getDeliveryAction(
          order
        )}

        {order.payment_status ===
          'paid' &&
          order.order_status !==
            'cancelled' &&
          order.order_status !==
            'delivered' && (
            <div
              style={{
                marginTop:
                  '14px',
                display:
                  'flex',
                gap:
                  '8px',
                flexWrap:
                  'wrap',
              }}
            >
              {nextStatus &&
                nextStatus !==
                  'out_for_delivery' &&
                nextStatus !==
                  'delivered' && (
                  <button
                    type="button"
                    className="primary-btn"
                    disabled={
                      isUpdating
                    }
                    onClick={() =>
                      updateStatus(
                        order
                      )
                    }
                  >
                    {isUpdating
                      ? 'Updating...'
                      : `Mark ${formatStatus(
                          nextStatus
                        )}`}
                  </button>
                )}

              {order.order_status ===
                'ready' &&
                order.delivery
                  ?.delivery_method !==
                  'rider' && (
                  <button
                    type="button"
                    className="primary-btn"
                    disabled={
                      isUpdating
                    }
                    onClick={() =>
                      updateStatus(
                        order
                      )
                    }
                  >
                    {isUpdating
                      ? 'Starting...'
                      : 'Start Delivery'}
                  </button>
                )}
            </div>
          )}

        {showDeliveryCode &&
          order.order_status !==
            'delivered' && (
            <div
              style={{
                marginTop:
                  '14px',
                padding:
                  '14px',
                background:
                  '#f8fafc',
                border:
                  '1px solid #cbd5e1',
                borderRadius:
                  '10px',
              }}
            >
              <strong>
                Complete Delivery
              </strong>

              <p
                style={{
                  margin:
                    '6px 0 10px',
                  fontSize:
                    '13px',
                  color:
                    '#475569',
                }}
              >
                Enter the
                4-digit
                completion
                PIN given by
                the customer.
              </p>

              <div
                style={{
                  display:
                    'flex',
                  gap:
                    '8px',
                  flexWrap:
                    'wrap',
                }}
              >
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={
                    deliveryCodes[
                      order.order_id
                    ] || ''
                  }
                  onChange={(
                    event
                  ) => {
                    const value =
                      event.target.value.replace(
                        /\D/g,
                        ''
                      )

                    setDeliveryCodes(
                      (
                        currentCodes
                      ) => ({
                        ...currentCodes,
                        [order.order_id]:
                          value,
                      })
                    )
                  }}
                  placeholder="4-digit PIN"
                  style={{
                    padding:
                      '10px',
                    border:
                      '1px solid #cbd5e1',
                    borderRadius:
                      '8px',
                    width:
                      '120px',
                  }}
                />

                <button
                  type="button"
                  className="primary-btn"
                  disabled={
                    isUpdating
                  }
                  onClick={() =>
                    confirmDelivered(
                      order
                    )
                  }
                >
                  {isUpdating
                    ? 'Confirming...'
                    : 'Confirm Delivery'}
                </button>
              </div>
            </div>
          )}

        <div
          style={{
            marginTop:
              '14px',
          }}
        >
          <button
            type="button"
            className="secondary-btn"
            onClick={() =>
              setOpenChats(
                (current) => ({
                  ...current,
                  [order.order_id]:
                    !current[
                      order.order_id
                    ],
                })
              )
            }
          >
            {chatOpen
              ? 'Close Order Chat'
              : 'Open Order Chat'}
          </button>
        </div>

        {chatOpen && (
          <div
            style={{
              marginTop:
                '12px',
            }}
          >
            <OrderChat
              orderId={
                order.order_id
              }
              vendorOrderId={
                order.vendor_order_id
              }
              user={user}
            />
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div
        style={{
          padding:
            '20px',
        }}
      >
        <button
          type="button"
          onClick={onBack}
          className="secondary-btn"
        >
          ← Back
        </button>

        <p>
          Loading your
          orders...
        </p>
      </div>
    )
  }

  return (
    <div
      style={{
        padding:
          '20px',
        maxWidth:
          '1000px',
        margin:
          '0 auto',
      }}
    >
      <div
        style={{
          display:
            'flex',
          justifyContent:
            'space-between',
          alignItems:
            'center',
          gap:
            '12px',
          flexWrap:
            'wrap',
          marginBottom:
            '20px',
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
            }}
          >
            Vendor Orders
          </h2>

          <p
            style={{
              margin:
                '5px 0 0',
              color:
                '#64748b',
            }}
          >
            Manage your
            incoming
            marketplace
            orders.
          </p>
        </div>

        <button
          type="button"
          onClick={onBack}
          className="secondary-btn"
        >
          ← Back
        </button>
      </div>

      {message && (
        <div
          style={{
            marginBottom:
              '18px',
            padding:
              '12px 14px',
            borderRadius:
              '10px',
            background:
              '#eff6ff',
            border:
              '1px solid #bfdbfe',
            color:
              '#1e40af',
          }}
        >
          {message}
        </div>
      )}

      {orders.length ===
      0 ? (
        <div
          style={{
            padding:
              '30px',
            textAlign:
              'center',
            background:
              '#f8fafc',
            borderRadius:
              '12px',
          }}
        >
          <p>
            You don't
            have any
            vendor
            orders yet.
          </p>
        </div>
      ) : (
        <>
          <div
            style={{
              display:
                'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(180px, 1fr))',
              gap:
                '12px',
              marginBottom:
                '24px',
            }}
          >
            <button
              type="button"
              onClick={() =>
                setActiveSection(
                  'awaiting'
                )
              }
              style={{
                padding:
                  '18px',
                borderRadius:
                  '12px',
                border:
                  activeSection ===
                  'awaiting'
                    ? '2px solid #f59e0b'
                    : '1px solid #fde68a',
                background:
                  '#fffbeb',
                cursor:
                  'pointer',
                textAlign:
                  'left',
              }}
            >
              <div
                style={{
                  fontSize:
                    '24px',
                  marginBottom:
                    '6px',
                }}
              >
                🟡
              </div>

              <strong
                style={{
                  display:
                    'block',
                  fontSize:
                    '16px',
                  color:
                    '#92400e',
                }}
              >
                Awaiting
                Payment
              </strong>

              <span
                style={{
                  display:
                    'block',
                  marginTop:
                    '5px',
                  color:
                    '#78350f',
                  fontSize:
                    '14px',
                }}
              >
                {
                  awaitingPaymentOrders.length
                }{' '}
                order
                {awaitingPaymentOrders.length !==
                1
                  ? 's'
                  : ''}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                setActiveSection(
                  'paid'
                )
              }
              style={{
                padding:
                  '18px',
                borderRadius:
                  '12px',
                border:
                  activeSection ===
                  'paid'
                    ? '2px solid #10b981'
                    : '1px solid #bbf7d0',
                background:
                  '#f0fdf4',
                cursor:
                  'pointer',
                textAlign:
                  'left',
              }}
            >
              <div
                style={{
                  fontSize:
                    '24px',
                  marginBottom:
                    '6px',
                }}
              >
                🟢
              </div>

              <strong
                style={{
                  display:
                    'block',
                  fontSize:
                    '16px',
                  color:
                    '#166534',
                }}
              >
                Paid Orders
              </strong>

              <span
                style={{
                  display:
                    'block',
                  marginTop:
                    '5px',
                  color:
                    '#166534',
                  fontSize:
                    '14px',
                }}
              >
                {paidOrders.length}{' '}
                order
                {paidOrders.length !==
                1
                  ? 's'
                  : ''}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                setActiveSection(
                  'cancelled'
                )
              }
              style={{
                padding:
                  '18px',
                borderRadius:
                  '12px',
                border:
                  activeSection ===
                  'cancelled'
                    ? '2px solid #ef4444'
                    : '1px solid #fecaca',
                background:
                  '#fef2f2',
                cursor:
                  'pointer',
                textAlign:
                  'left',
              }}
            >
              <div
                style={{
                  fontSize:
                    '24px',
                  marginBottom:
                    '6px',
                }}
              >
                🔴
              </div>

              <strong
                style={{
                  display:
                    'block',
                  fontSize:
                    '16px',
                  color:
                    '#991b1b',
                }}
              >
                Cancelled
              </strong>

              <span
                style={{
                  display:
                    'block',
                  marginTop:
                    '5px',
                  color:
                    '#991b1b',
                  fontSize:
                    '14px',
                }}
              >
                {
                  cancelledOrders.length
                }{' '}
                order
                {cancelledOrders.length !==
                1
                  ? 's'
                  : ''}
              </span>
            </button>
          </div>

          {activeSection ===
            'awaiting' && (
            <section>
              <h3>
                🟡 Awaiting
                Payment
              </h3>

              {awaitingPaymentOrders.length ===
              0 ? (
                <div
                  style={{
                    padding:
                      '24px',
                    textAlign:
                      'center',
                    background:
                      '#f8fafc',
                    borderRadius:
                      '12px',
                    color:
                      '#64748b',
                  }}
                >
                  No orders
                  awaiting
                  payment.
                </div>
              ) : (
                awaitingPaymentOrders.map(
                  renderOrderCard
                )
              )}
            </section>
          )}

          {activeSection ===
            'paid' && (
            <section>
              <h3>
                🟢 Paid Orders
              </h3>

              {paidOrders.length ===
              0 ? (
                <div
                  style={{
                    padding:
                      '24px',
                    textAlign:
                      'center',
                    background:
                      '#f8fafc',
                    borderRadius:
                      '12px',
                    color:
                      '#64748b',
                  }}
                >
                  No paid
                  orders.
                </div>
              ) : (
                paidOrders.map(
                  renderOrderCard
                )
              )}
            </section>
          )}

          {activeSection ===
            'cancelled' && (
            <section>
              <h3>
                🔴 Cancelled
                Orders
              </h3>

              {cancelledOrders.length ===
              0 ? (
                <div
                  style={{
                    padding:
                      '24px',
                    textAlign:
                      'center',
                    background:
                      '#f8fafc',
                    borderRadius:
                      '12px',
                    color:
                      '#64748b',
                  }}
                >
                  No cancelled
                  orders.
                </div>
              ) : (
                cancelledOrders.map(
                  renderOrderCard
                )
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}

export default VendorOrders