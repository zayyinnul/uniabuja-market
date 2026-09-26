import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'

export default function AdminDashboard({ user, onBack }) {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [error, setError] = useState('')
  const [updatingDelivery, setUpdatingDelivery] = useState(null)

  const [riderFee, setRiderFee] = useState('')
  const [riderAction, setRiderAction] = useState(null)
  const [riderFileUrls, setRiderFileUrls] = useState({})

  const [data, setData] = useState({
    profiles: [],
    stores: [],
    products: [],
    orders: [],
    commissions: [],
    payouts: [],
    vendorOrders: [],
    riders: [],
    riderApplications: [],
    riderRates: [],
    zones: [],
    riderPayoutAccounts: [],
  })

  const formatNaira = (value) =>
    `₦${Number(value || 0).toLocaleString('en-NG', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`

  const maskAccountNumber = (accountNumber) => {
    if (!accountNumber) return '—'

    const value = String(accountNumber)

    if (value.length <= 4) {
      return value
    }

    return `••••••${value.slice(-4)}`
  }

  const loadRiderFileUrls = async (applications) => {
    const urls = {}

    for (const application of applications) {
      if (
        !application.passport_photo_path &&
        !application.student_id_document_path
      ) {
        continue
      }

      const fileData = {}

      if (application.passport_photo_path) {
        const { data: photoData, error: photoError } =
          await supabase.storage
            .from('rider-verification')
            .createSignedUrl(application.passport_photo_path, 3600)

        if (!photoError && photoData?.signedUrl) {
          fileData.passportPhotoUrl = photoData.signedUrl
        }
      }

      if (application.student_id_document_path) {
        const { data: documentData, error: documentError } =
          await supabase.storage
            .from('rider-verification')
            .createSignedUrl(
              application.student_id_document_path,
              3600
            )

        if (!documentError && documentData?.signedUrl) {
          fileData.studentIdDocumentUrl = documentData.signedUrl
        }
      }

      urls[application.id] = fileData
    }

    setRiderFileUrls(urls)
  }

  const loadDashboard = async (isRefresh = false) => {
    try {
      setError('')

      if (isRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      const { data: adminCheck, error: adminError } =
        await supabase.rpc('is_admin')

      if (adminError) {
        throw new Error(adminError.message)
      }

      if (!adminCheck) {
        throw new Error('Admin access required.')
      }

      const [
        profilesResult,
        storesResult,
        productsResult,
        ordersResult,
        commissionsResult,
        payoutsResult,
        vendorOrdersResult,
        ridersResult,
        riderApplicationsResult,
        riderRatesResult,
        zonesResult,
        riderPayoutAccountsResult,
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, role, created_at')
          .order('created_at', { ascending: false }),

        supabase
          .from('stores')
          .select(
            'id, owner_id, store_name, description, logo_url, phone, location, status, delivery_fee, created_at'
          )
          .order('created_at', { ascending: false }),

        supabase
          .from('products')
          .select(
            'id, vendor_id, name, price, stock, status, created_at'
          )
          .order('created_at', { ascending: false }),

        supabase
          .from('orders')
          .select(
            'id, customer_id, total_amount, status, payment_status, created_at'
          )
          .order('created_at', { ascending: false }),

        supabase
          .from('vendor_commissions')
          .select(
            'id, vendor_id, vendor_order_id, order_id, sale_amount, commission_amount, vendor_amount, status, created_at'
          )
          .order('created_at', { ascending: false }),

        supabase
          .from('vendor_payouts')
          .select(
            'id, vendor_id, vendor_order_id, order_id, payout_amount, status, paystack_reference, created_at, paid_at'
          )
          .order('created_at', { ascending: false }),

        supabase
          .from('vendor_orders')
          .select(
            'id, order_id, vendor_id, status, subtotal, created_at, updated_at'
          )
          .order('created_at', { ascending: false }),

        supabase
          .from('delivery_riders')
          .select(
            'id, is_active, delivery_fee, created_at, updated_at'
          )
          .order('created_at', { ascending: false }),

        supabase
          .from('rider_applications')
          .select(
            'id, user_id, full_name, phone, date_of_birth, address, student_id_number, department, level, passport_photo_path, student_id_document_path, emergency_contact_name, emergency_contact_phone, has_vehicle, status, admin_note, created_at, updated_at'
          )
          .order('created_at', { ascending: false }),

        supabase
          .from('rider_delivery_rates')
          .select(
            'id, rider_id, zone_id, proposed_fee, approved_fee, approval_status, is_active, created_at, updated_at'
          )
          .order('created_at', { ascending: false }),

        supabase
          .from('delivery_zones')
          .select('id, name, is_active')
          .order('name', { ascending: true }),

        supabase
          .from('rider_payout_accounts')
          .select(
            'id, rider_id, account_name, bank_code, bank_name, account_number, paystack_recipient_code, is_verified, is_active, created_at, updated_at'
          )
          .order('created_at', { ascending: false }),
      ])

      const results = [
        profilesResult,
        storesResult,
        productsResult,
        ordersResult,
        commissionsResult,
        payoutsResult,
        vendorOrdersResult,
        ridersResult,
        riderApplicationsResult,
        riderRatesResult,
        zonesResult,
        riderPayoutAccountsResult,
      ]

      const failed = results.find((result) => result.error)

      if (failed) {
        throw new Error(failed.error.message)
      }

      const riderApplications =
        riderApplicationsResult.data || []

      setData({
        profiles: profilesResult.data || [],
        stores: storesResult.data || [],
        products: productsResult.data || [],
        orders: ordersResult.data || [],
        commissions: commissionsResult.data || [],
        payouts: payoutsResult.data || [],
        vendorOrders: vendorOrdersResult.data || [],
        riders: ridersResult.data || [],
        riderApplications,
        riderRates: riderRatesResult.data || [],
        zones: zonesResult.data || [],
        riderPayoutAccounts:
          riderPayoutAccountsResult.data || [],
      })

      await loadRiderFileUrls(riderApplications)

      setLastUpdated(new Date())
    } catch (err) {
      console.error('Admin dashboard error:', err)
      setError(err.message || 'Failed to load dashboard.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const reviewRiderApplication = async (
    application,
    decision
  ) => {
    let fee = 0
    let note = ''

    if (decision === 'approved') {
      const feeInput = window.prompt(
        'Enter the rider base delivery fee:',
        '0'
      )

      if (feeInput === null) {
        return
      }

      fee = Number(feeInput)

      if (!Number.isFinite(fee) || fee < 0) {
        setError('Enter a valid delivery fee.')
        return
      }

      note =
        window.prompt(
          'Optional admin note:',
          ''
        ) || ''
    } else {
      note =
        window.prompt(
          'Optional reason/note for rejection:',
          ''
        ) || ''
    }

    try {
      setRiderAction(`application-${application.id}`)
      setError('')

      const { error: reviewError } =
        await supabase.rpc(
          'review_rider_application',
          {
            p_application_id: application.id,
            p_decision: decision,
            p_admin_note: note || null,
            p_delivery_fee: fee,
          }
        )

      if (reviewError) {
        throw new Error(reviewError.message)
      }

      await loadDashboard(true)
    } catch (err) {
      console.error(
        'Rider application review error:',
        err
      )
      setError(
        err.message ||
          'Failed to review rider application.'
      )
    } finally {
      setRiderAction(null)
    }
  }

  const reviewRiderDeliveryRate = async (
    rate,
    decision
  ) => {
    try {
      setRiderAction(`rate-${rate.id}`)
      setError('')

      const { error: reviewError } =
        await supabase.rpc(
          'review_rider_delivery_rate',
          {
            p_rate_id: rate.id,
            p_decision: decision,
          }
        )

      if (reviewError) {
        throw new Error(reviewError.message)
      }

      await loadDashboard(true)
    } catch (err) {
      console.error(
        'Rider delivery rate review error:',
        err
      )
      setError(
        err.message ||
          'Failed to review rider delivery rate.'
      )
    } finally {
      setRiderAction(null)
    }
  }

  const updateDeliveryStatus = async (
    vendorOrder,
    newStatus
  ) => {
    if (
      !newStatus ||
      newStatus === vendorOrder.status
    ) {
      return
    }

    try {
      setUpdatingDelivery(vendorOrder.id)
      setError('')

      const { error: updateError } =
        await supabase
          .from('vendor_orders')
          .update({
            status: newStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('id', vendorOrder.id)

      if (updateError) {
        throw new Error(updateError.message)
      }

      await loadDashboard(true)
    } catch (err) {
      console.error(
        'Delivery status update error:',
        err
      )
      setError(
        err.message ||
          'Failed to update delivery status.'
      )
    } finally {
      setUpdatingDelivery(null)
    }
  }

  const approveRider = async (profileId) => {
    const fee = Number(riderFee)

    if (!Number.isFinite(fee) || fee < 0) {
      setError(
        'Enter a valid rider delivery fee.'
      )
      return
    }

    try {
      setRiderAction(profileId)
      setError('')

      const { error: approveError } =
        await supabase.rpc(
          'approve_delivery_rider',
          {
            p_user_id: profileId,
            p_delivery_fee: fee,
          }
        )

      if (approveError) {
        throw new Error(approveError.message)
      }

      setRiderFee('')
      await loadDashboard(true)
    } catch (err) {
      console.error(
        'Rider approval error:',
        err
      )
      setError(
        err.message ||
          'Failed to approve rider.'
      )
    } finally {
      setRiderAction(null)
    }
  }

  const updateRiderFee = async (rider) => {
    const newFee = window.prompt(
      'Enter the new delivery fee:',
      String(rider.delivery_fee ?? '')
    )

    if (newFee === null) {
      return
    }

    const fee = Number(newFee)

    if (!Number.isFinite(fee) || fee < 0) {
      setError(
        'Enter a valid rider delivery fee.'
      )
      return
    }

    try {
      setRiderAction(`fee-${rider.id}`)
      setError('')

      const { error: updateError } =
        await supabase.rpc(
          'approve_delivery_rider',
          {
            p_user_id: rider.id,
            p_delivery_fee: fee,
          }
        )

      if (updateError) {
        throw new Error(updateError.message)
      }

      await loadDashboard(true)
    } catch (err) {
      console.error(
        'Rider fee update error:',
        err
      )
      setError(
        err.message ||
          'Failed to update rider delivery fee.'
      )
    } finally {
      setRiderAction(null)
    }
  }

  const toggleRider = async (rider) => {
    try {
      setRiderAction(rider.id)
      setError('')

      const { error: statusError } =
        await supabase.rpc(
          'set_delivery_rider_status',
          {
            p_rider_id: rider.id,
            p_is_active: !rider.is_active,
          }
        )

      if (statusError) {
        throw new Error(statusError.message)
      }

      await loadDashboard(true)
    } catch (err) {
      console.error(
        'Rider status error:',
        err
      )
      setError(
        err.message ||
          'Failed to update rider status.'
      )
    } finally {
      setRiderAction(null)
    }
  }

  useEffect(() => {
    if (user) {
      loadDashboard()
    }
  }, [user])

  const stats = useMemo(() => {
    const {
      profiles,
      stores,
      products,
      orders,
      commissions,
      payouts,
    } = data

    const customers = profiles.filter(
      (profile) =>
        profile.role === 'customer'
    ).length

    const vendorOwners = new Set(
      stores
        .map((store) => store.owner_id)
        .filter(Boolean)
    )

    const paidOrders = orders.filter(
      (order) =>
        order.payment_status === 'paid'
    )

    const paidOrderValue =
      paidOrders.reduce(
        (total, order) =>
          total +
          Number(order.total_amount || 0),
        0
      )

    const platformCommission =
      commissions.reduce(
        (total, commission) =>
          total +
          Number(
            commission.commission_amount ||
              0
          ),
        0
      )

    const vendorEarnings =
      commissions.reduce(
        (total, commission) =>
          total +
          Number(
            commission.vendor_amount || 0
          ),
        0
      )

    const payoutTotal = (status) =>
      payouts
        .filter(
          (payout) =>
            payout.status === status
        )
        .reduce(
          (total, payout) =>
            total +
            Number(
              payout.payout_amount || 0
            ),
          0
        )

    return {
      customers,
      vendors: vendorOwners.size,
      products: products.length,
      orders: orders.length,
      paidOrders: paidOrders.length,
      paidOrderValue,
      platformCommission,
      vendorEarnings,
      pendingPayouts:
        payoutTotal('pending'),
      processingPayouts:
        payoutTotal('processing'),
      paidPayouts:
        payoutTotal('paid'),
    }
  }, [data])

  const orderActivity = useMemo(() => {
    const days = []

    for (let i = 6; i >= 0; i--) {
      const date = new Date()
      date.setHours(0, 0, 0, 0)
      date.setDate(
        date.getDate() - i
      )

      days.push({
        key: date.toISOString(),
        label: date.toLocaleDateString(
          'en-NG',
          {
            weekday: 'short',
          }
        ),
        count: 0,
      })
    }

    data.orders.forEach((order) => {
      const orderDate = new Date(
        order.created_at
      )

      orderDate.setHours(
        0,
        0,
        0,
        0
      )

      const matchingDay = days.find(
        (day) =>
          new Date(day.key).getTime() ===
          orderDate.getTime()
      )

      if (matchingDay) {
        matchingDay.count += 1
      }
    })

    const maximum = Math.max(
      ...days.map(
        (day) => day.count
      ),
      1
    )

    return days.map((day) => ({
      ...day,
      height: day.count
        ? Math.max(
            (day.count / maximum) *
              100,
            8
          )
        : 3,
    }))
  }, [data.orders])

  const paymentStats = useMemo(() => {
    const total = Math.max(
      data.orders.length,
      1
    )

    const paid =
      data.orders.filter(
        (order) =>
          order.payment_status ===
          'paid'
      ).length

    const pending =
      data.orders.filter(
        (order) =>
          order.payment_status ===
          'pending'
      ).length

    const unpaid =
      data.orders.filter(
        (order) =>
          order.payment_status ===
          'unpaid'
      ).length

    return [
      {
        label: 'Paid',
        count: paid,
        percent:
          (paid / total) * 100,
      },
      {
        label: 'Pending',
        count: pending,
        percent:
          (pending / total) * 100,
      },
      {
        label: 'Unpaid',
        count: unpaid,
        percent:
          (unpaid / total) * 100,
      },
    ]
  }, [data.orders])

  const deliveryStats = useMemo(() => {
    const statuses = [
      'pending',
      'accepted',
      'processing',
      'ready',
      'out_for_delivery',
      'delivered',
      'cancelled',
    ]

    return statuses.map((status) => ({
      status,
      count:
        data.vendorOrders.filter(
          (order) =>
            order.status === status
        ).length,
    }))
  }, [data.vendorOrders])

  const deliveryOrders = useMemo(() => {
    const storesByOwner = new Map()

    data.stores.forEach((store) => {
      storesByOwner.set(
        store.owner_id,
        store
      )
    })

    const profilesById = new Map()

    data.profiles.forEach((profile) => {
      profilesById.set(
        profile.id,
        profile
      )
    })

    const ordersById = new Map()

    data.orders.forEach((order) => {
      ordersById.set(
        order.id,
        order
      )
    })

    return data.vendorOrders
      .map((vendorOrder) => {
        const parentOrder =
          ordersById.get(
            vendorOrder.order_id
          )

        const store =
          storesByOwner.get(
            vendorOrder.vendor_id
          )

        const vendorProfile =
          profilesById.get(
            vendorOrder.vendor_id
          )

        return {
          ...vendorOrder,
          parentOrder,
          store,
          vendorProfile,
        }
      })
      .sort(
        (a, b) =>
          new Date(
            b.created_at
          ).getTime() -
          new Date(
            a.created_at
          ).getTime()
      )
  }, [
    data.vendorOrders,
    data.orders,
    data.stores,
    data.profiles,
  ])

  const approvedRiderIds = useMemo(
    () =>
      new Set(
        data.riders.map(
          (rider) => rider.id
        )
      ),
    [data.riders]
  )

  const availableRiderProfiles =
    useMemo(
      () =>
        data.profiles.filter(
          (profile) =>
            !approvedRiderIds.has(
              profile.id
            ) &&
            profile.role !== 'admin'
        ),
      [
        data.profiles,
        approvedRiderIds,
      ]
    )

  const pendingRiderApplications =
    useMemo(
      () =>
        data.riderApplications.filter(
          (application) =>
            application.status ===
            'pending'
        ),
      [data.riderApplications]
    )

  const pendingRiderRates = useMemo(
    () =>
      data.riderRates.filter(
        (rate) =>
          rate.approval_status ===
          'pending'
      ),
    [data.riderRates]
  )

  const profilesById = useMemo(() => {
    const map = new Map()

    data.profiles.forEach((profile) => {
      map.set(
        profile.id,
        profile
      )
    })

    return map
  }, [data.profiles])

  const zonesById = useMemo(() => {
    const map = new Map()

    data.zones.forEach((zone) => {
      map.set(
        zone.id,
        zone
      )
    })

    return map
  }, [data.zones])

  const riderPayoutAccounts = useMemo(() => {
    return data.riderPayoutAccounts
      .map((account) => ({
        ...account,
        riderProfile:
          profilesById.get(account.rider_id),
        rider:
          data.riders.find(
            (rider) =>
              rider.id === account.rider_id
          ),
      }))
      .sort((a, b) => {
        const nameA =
          a.riderProfile?.full_name || ''
        const nameB =
          b.riderProfile?.full_name || ''

        return nameA.localeCompare(nameB)
      })
  }, [
    data.riderPayoutAccounts,
    data.riders,
    profilesById,
  ])

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.loading}>
          <div style={styles.loadingMark}>
            ◈
          </div>

          <h2>
            Loading Admin Dashboard
          </h2>

          <p>
            Connecting to marketplace data...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>

        <header style={styles.header}>
          <div>
            <div style={styles.eyebrow}>
              ADMINISTRATION
            </div>

            <h1 style={styles.title}>
              Marketplace Dashboard
            </h1>

            <p style={styles.subtitle}>
              Monitor orders, vendors, products
              and platform activity.
            </p>

            {lastUpdated && (
              <p style={styles.lastUpdated}>
                Last updated:{' '}
                {lastUpdated.toLocaleTimeString(
                  'en-NG',
                  {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  }
                )}
              </p>
            )}
          </div>

          <div style={styles.headerActions}>
            <button
              type="button"
              onClick={() =>
                loadDashboard(true)
              }
              disabled={refreshing}
              style={{
                ...styles.refreshButton,
                opacity: refreshing
                  ? 0.6
                  : 1,
              }}
            >
              {refreshing
                ? 'Refreshing...'
                : '↻ Refresh'}
            </button>

            <button
              type="button"
              onClick={onBack}
              style={styles.backButton}
            >
              ← Back
            </button>
          </div>
        </header>

        {error && (
          <div style={styles.errorBox}>
            <strong>
              Dashboard Error
            </strong>

            <p>{error}</p>

            <button
              type="button"
              onClick={() =>
                loadDashboard(true)
              }
              style={styles.refreshButton}
            >
              Try Again
            </button>
          </div>
        )}

        {!error && (
          <>
            <section>
              <div
                style={styles.sectionHeading}
              >
                Overview
              </div>

              <div style={styles.statsGrid}>
                <StatCard
                  label="Customers"
                  value={
                    stats.customers
                  }
                />

                <StatCard
                  label="Vendors"
                  value={
                    stats.vendors
                  }
                />

                <StatCard
                  label="Products"
                  value={
                    stats.products
                  }
                />

                <StatCard
                  label="Orders"
                  value={
                    stats.orders
                  }
                />
              </div>
            </section>

            <section>
              <div
                style={styles.sectionHeading}
              >
                Financial Overview
              </div>

              <div style={styles.moneyGrid}>
                <MoneyCard
                  label="Paid Order Value"
                  value={formatNaira(
                    stats.paidOrderValue
                  )}
                />

                <MoneyCard
                  label="Platform Commission"
                  value={formatNaira(
                    stats.platformCommission
                  )}
                />

                <MoneyCard
                  label="Vendor Earnings"
                  value={formatNaira(
                    stats.vendorEarnings
                  )}
                />

                <MoneyCard
                  label="Paid Orders"
                  value={
                    stats.paidOrders
                  }
                />
              </div>
            </section>

            <section>
              <div
                style={styles.sectionHeading}
              >
                Analytics
              </div>

              <div style={styles.analyticsGrid}>
                <div style={styles.panel}>
                  <div
                    style={
                      styles.panelHeader
                    }
                  >
                    <div>
                      <h3
                        style={
                          styles.panelTitle
                        }
                      >
                        Order Activity
                      </h3>

                      <p
                        style={
                          styles.panelSubtitle
                        }
                      >
                        Orders over the last
                        7 days
                      </p>
                    </div>

                    <span
                      style={
                        styles.smallTag
                      }
                    >
                      7 DAYS
                    </span>
                  </div>

                  <div style={styles.chart}>
                    {orderActivity.map(
                      (day) => (
                        <div
                          key={day.key}
                          style={
                            styles.chartColumn
                          }
                        >
                          <span
                            style={
                              styles.chartValue
                            }
                          >
                            {day.count}
                          </span>

                          <div
                            style={
                              styles.chartTrack
                            }
                          >
                            <div
                              style={{
                                ...styles.chartBar,
                                height: `${day.height}%`,
                              }}
                            />
                          </div>

                          <span
                            style={
                              styles.chartLabel
                            }
                          >
                            {day.label}
                          </span>
                        </div>
                      )
                    )}
                  </div>
                </div>

                <div style={styles.panel}>
                  <div
                    style={
                      styles.panelHeader
                    }
                  >
                    <div>
                      <h3
                        style={
                          styles.panelTitle
                        }
                      >
                        Payment Status
                      </h3>

                      <p
                        style={
                          styles.panelSubtitle
                        }
                      >
                        Current order payment
                        distribution
                      </p>
                    </div>
                  </div>

                  <div
                    style={
                      styles.paymentList
                    }
                  >
                    {paymentStats.map(
                      (item) => (
                        <div
                          key={item.label}
                          style={
                            styles.paymentItem
                          }
                        >
                          <div
                            style={
                              styles.paymentTop
                            }
                          >
                            <span>
                              {item.label}
                            </span>

                            <strong>
                              {item.count}
                            </strong>
                          </div>

                          <div
                            style={
                              styles.progressTrack
                            }
                          >
                            <div
                              style={{
                                ...styles.progressBar,
                                width: `${item.percent}%`,
                              }}
                            />
                          </div>

                          <span
                            style={
                              styles.percentage
                            }
                          >
                            {item.percent.toFixed(
                              1
                            )}
                            %
                          </span>
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* RIDER APPLICATIONS */}
            <section>
              <div
                style={styles.sectionHeading}
              >
                Rider Applications
              </div>

              <div style={styles.panel}>
                <div
                  style={
                    styles.panelHeader
                  }
                >
                  <div>
                    <h3
                      style={
                        styles.panelTitle
                      }
                    >
                      Pending Rider Applications
                    </h3>

                    <p
                      style={
                        styles.panelSubtitle
                      }
                    >
                      Review users who have
                      applied to become delivery
                      riders.
                    </p>
                  </div>

                  <span
                    style={
                      styles.smallTag
                    }
                  >
                    {
                      pendingRiderApplications.length
                    }{' '}
                    PENDING
                  </span>
                </div>

                {pendingRiderApplications.length ===
                0 ? (
                  <p style={styles.empty}>
                    No pending rider
                    applications.
                  </p>
                ) : (
                  <div
                    style={
                      styles.applicationList
                    }
                  >
                    {pendingRiderApplications.map(
                      (application) => {
                        const reviewing =
                          riderAction ===
                          `application-${application.id}`

                        const fileUrls =
                          riderFileUrls[
                            application.id
                          ] || {}

                        return (
                          <div
                            key={
                              application.id
                            }
                            style={
                              styles.applicationCard
                            }
                          >
                            <div
                              style={
                                styles.applicationContent
                              }
                            >
                              <div
                                style={
                                  styles.applicationVerification
                                }
                              >
                                {fileUrls.passportPhotoUrl ? (
                                  <a
                                    href={
                                      fileUrls.passportPhotoUrl
                                    }
                                    target="_blank"
                                    rel="noreferrer"
                                    title="Open passport photo"
                                  >
                                    <img
                                      src={
                                        fileUrls.passportPhotoUrl
                                      }
                                      alt={`${application.full_name || 'Rider'} passport`}
                                      style={
                                        styles.passportPhoto
                                      }
                                    />
                                  </a>
                                ) : (
                                  <div
                                    style={
                                      styles.noPhoto
                                    }
                                  >
                                    No Photo
                                  </div>
                                )}

                                <div
                                  style={
                                    styles.documentLinks
                                  }
                                >
                                  <div
                                    style={
                                      styles.documentLabel
                                    }
                                  >
                                    Verification
                                  </div>

                                  {fileUrls.studentIdDocumentUrl ? (
                                    <a
                                      href={
                                        fileUrls.studentIdDocumentUrl
                                      }
                                      target="_blank"
                                      rel="noreferrer"
                                      style={
                                        styles.documentLink
                                      }
                                    >
                                      View Student ID / Document
                                    </a>
                                  ) : (
                                    <span
                                      style={
                                        styles.missingDocument
                                      }
                                    >
                                      No document uploaded
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div
                                style={
                                  styles.applicationInfo
                                }
                              >
                                <div
                                  style={
                                    styles.applicationName
                                  }
                                >
                                  {
                                    application.full_name
                                  }
                                </div>

                                <div
                                  style={
                                    styles.applicationMeta
                                  }
                                >
                                  Phone:{' '}
                                  {application.phone ||
                                    '—'}
                                </div>

                                <div
                                  style={
                                    styles.applicationMeta
                                  }
                                >
                                  Date of Birth:{' '}
                                  {application.date_of_birth ||
                                    '—'}
                                </div>

                                <div
                                  style={
                                    styles.applicationMeta
                                  }
                                >
                                  Address:{' '}
                                  {application.address ||
                                    '—'}
                                </div>

                                <div
                                  style={
                                    styles.applicationMeta
                                  }
                                >
                                  Student ID:{' '}
                                  {application.student_id_number ||
                                    '—'}
                                </div>

                                <div
                                  style={
                                    styles.applicationMeta
                                  }
                                >
                                  Department:{' '}
                                  {application.department ||
                                    '—'}
                                </div>

                                <div
                                  style={
                                    styles.applicationMeta
                                  }
                                >
                                  Level:{' '}
                                  {application.level ||
                                    '—'}
                                </div>

                                <div
                                  style={
                                    styles.applicationMeta
                                  }
                                >
                                  Emergency Contact:{' '}
                                  {application.emergency_contact_name ||
                                    '—'}
                                  {application.emergency_contact_phone
                                    ? ` • ${application.emergency_contact_phone}`
                                    : ''}
                                </div>

                                <div
                                  style={
                                    styles.applicationMeta
                                  }
                                >
                                  Vehicle Access:{' '}
                                  {application.has_vehicle
                                    ? 'Yes'
                                    : 'No'}
                                </div>

                                <div
                                  style={
                                    styles.applicationMeta
                                  }
                                >
                                  Applied:{' '}
                                  {new Date(
                                    application.created_at
                                  ).toLocaleDateString(
                                    'en-NG',
                                    {
                                      day: '2-digit',
                                      month: 'short',
                                      year: 'numeric',
                                    }
                                  )}
                                </div>
                              </div>
                            </div>

                            <div
                              style={
                                styles.applicationActions
                              }
                            >
                              <button
                                type="button"
                                disabled={
                                  reviewing
                                }
                                onClick={() =>
                                  reviewRiderApplication(
                                    application,
                                    'approved'
                                  )
                                }
                                style={{
                                  ...styles.approveButton,
                                  opacity:
                                    reviewing
                                      ? 0.5
                                      : 1,
                                }}
                              >
                                {reviewing
                                  ? 'Reviewing...'
                                  : 'Approve'}
                              </button>

                              <button
                                type="button"
                                disabled={
                                  reviewing
                                }
                                onClick={() =>
                                  reviewRiderApplication(
                                    application,
                                    'rejected'
                                  )
                                }
                                style={{
                                  ...styles.rejectButton,
                                  opacity:
                                    reviewing
                                      ? 0.5
                                      : 1,
                                }}
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                        )
                      }
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* RIDER ZONE PRICING */}
            <section>
              <div
                style={styles.sectionHeading}
              >
                Rider Zone Pricing
              </div>

              <div style={styles.panel}>
                <div
                  style={
                    styles.panelHeader
                  }
                >
                  <div>
                    <h3
                      style={
                        styles.panelTitle
                      }
                    >
                      Pending Zone Prices
                    </h3>

                    <p
                      style={
                        styles.panelSubtitle
                      }
                    >
                      Review delivery prices
                      submitted by riders for
                      specific delivery areas.
                    </p>
                  </div>

                  <span
                    style={
                      styles.smallTag
                    }
                  >
                    {pendingRiderRates.length}{' '}
                    PENDING
                  </span>
                </div>

                {pendingRiderRates.length ===
                0 ? (
                  <p style={styles.empty}>
                    No pending rider zone
                    prices.
                  </p>
                ) : (
                  <div
                    style={
                      styles.rateList
                    }
                  >
                    {pendingRiderRates.map(
                      (rate) => {
                        const riderProfile =
                          profilesById.get(
                            rate.rider_id
                          )

                        const zone =
                          zonesById.get(
                            rate.zone_id
                          )

                        const reviewing =
                          riderAction ===
                          `rate-${rate.id}`

                        return (
                          <div
                            key={rate.id}
                            style={
                              styles.rateCard
                            }
                          >
                            <div
                              style={
                                styles.rateInfo
                              }
                            >
                              <div
                                style={
                                  styles.rateName
                                }
                              >
                                {riderProfile?.full_name ||
                                  'Unnamed rider'}
                              </div>

                              <div
                                style={
                                  styles.rateMeta
                                }
                              >
                                Zone:{' '}
                                {zone?.name ||
                                  'Unknown zone'}
                              </div>

                              <div
                                style={
                                  styles.rateMeta
                                }
                              >
                                Proposed delivery
                                fee:{' '}
                                <strong
                                  style={
                                    styles.rateFee
                                  }
                                >
                                  {formatNaira(
                                    rate.proposed_fee
                                  )}
                                </strong>
                              </div>

                              <div
                                style={
                                  styles.rateMeta
                                }
                              >
                                Submitted:{' '}
                                {new Date(
                                  rate.created_at
                                ).toLocaleDateString(
                                  'en-NG',
                                  {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric',
                                  }
                                )}
                              </div>
                            </div>

                            <div
                              style={
                                styles.rateActions
                              }
                            >
                              <button
                                type="button"
                                disabled={
                                  reviewing
                                }
                                onClick={() =>
                                  reviewRiderDeliveryRate(
                                    rate,
                                    'approved'
                                  )
                                }
                                style={{
                                  ...styles.approveButton,
                                  opacity:
                                    reviewing
                                      ? 0.5
                                      : 1,
                                }}
                              >
                                {reviewing
                                  ? 'Saving...'
                                  : 'Approve'}
                              </button>

                              <button
                                type="button"
                                disabled={
                                  reviewing
                                }
                                onClick={() =>
                                  reviewRiderDeliveryRate(
                                    rate,
                                    'rejected'
                                  )
                                }
                                style={{
                                  ...styles.rejectButton,
                                  opacity:
                                    reviewing
                                      ? 0.5
                                      : 1,
                                }}
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                        )
                      }
                    )}
                  </div>
                )}
              </div>
            </section>

            <section>
              <div
                style={styles.sectionHeading}
              >
                Delivery Operations
              </div>

              <div
                style={
                  styles.deliveryStatsGrid
                }
              >
                {deliveryStats.map(
                  (item) => (
                    <div
                      key={item.status}
                      style={
                        styles.deliveryStatCard
                      }
                    >
                      <div
                        style={
                          styles.deliveryStatCount
                        }
                      >
                        {item.count}
                      </div>

                      <div
                        style={
                          styles.deliveryStatLabel
                        }
                      >
                        {formatStatus(
                          item.status
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>

              <div style={styles.panel}>
                <div
                  style={
                    styles.panelHeader
                  }
                >
                  <div>
                    <h3
                      style={
                        styles.panelTitle
                      }
                    >
                      Delivery Order Monitor
                    </h3>

                    <p
                      style={
                        styles.panelSubtitle
                      }
                    >
                      Monitor and manage vendor
                      order progress across the
                      marketplace.
                    </p>
                  </div>

                  <span
                    style={
                      styles.smallTag
                    }
                  >
                    ADMIN CONTROL
                  </span>
                </div>

                {deliveryOrders.length ===
                0 ? (
                  <p style={styles.empty}>
                    No vendor orders recorded
                    yet.
                  </p>
                ) : (
                  <div
                    style={
                      styles.tableWrapper
                    }
                  >
                    <table
                      style={styles.table}
                    >
                      <thead>
                        <tr>
                          <th>Order</th>
                          <th>Vendor</th>
                          <th>Amount</th>
                          <th>Payment</th>
                          <th>
                            Delivery Status
                          </th>
                          <th>Created</th>
                        </tr>
                      </thead>

                      <tbody>
                        {deliveryOrders
                          .slice(0, 20)
                          .map(
                            (
                              vendorOrder
                            ) => (
                              <tr
                                key={
                                  vendorOrder.id
                                }
                              >
                                <td
                                  style={
                                    styles.orderId
                                  }
                                >
                                  #
                                  {vendorOrder.order_id
                                    ? vendorOrder.order_id.slice(
                                        0,
                                        8
                                      )
                                    : vendorOrder.id.slice(
                                        0,
                                        8
                                      )}
                                </td>

                                <td>
                                  {vendorOrder
                                    .vendorProfile
                                    ?.full_name ||
                                    'Unknown vendor'}
                                </td>

                                <td>
                                  {formatNaira(
                                    vendorOrder.subtotal
                                  )}
                                </td>

                                <td>
                                  <StatusBadge
                                    value={
                                      vendorOrder
                                        .parentOrder
                                        ?.payment_status ||
                                      'unknown'
                                    }
                                  />
                                </td>

                                <td>
                                  <div
                                    style={
                                      styles.deliveryControl
                                    }
                                  >
                                    <select
                                      value={
                                        vendorOrder.status
                                      }
                                      disabled={
                                        updatingDelivery ===
                                        vendorOrder.id
                                      }
                                      onChange={(
                                        event
                                      ) =>
                                        updateDeliveryStatus(
                                          vendorOrder,
                                          event
                                            .target
                                            .value
                                        )
                                      }
                                      style={{
                                        ...styles.statusSelect,
                                        opacity:
                                          updatingDelivery ===
                                          vendorOrder.id
                                            ? 0.6
                                            : 1,
                                      }}
                                    >
                                      <option value="pending">
                                        Pending
                                      </option>

                                      <option value="accepted">
                                        Accepted
                                      </option>

                                      <option value="processing">
                                        Processing
                                      </option>

                                      <option value="ready">
                                        Ready
                                      </option>

                                      <option value="out_for_delivery">
                                        Out for Delivery
                                      </option>

                                      <option value="delivered">
                                        Delivered
                                      </option>

                                      <option value="cancelled">
                                        Cancelled
                                      </option>
                                    </select>

                                    {updatingDelivery ===
                                      vendorOrder.id && (
                                      <span
                                        style={
                                          styles.updatingText
                                        }
                                      >
                                        Saving...
                                      </span>
                                    )}
                                  </div>
                                </td>

                                <td
                                  style={
                                    styles.dateText
                                  }
                                >
                                  {new Date(
                                    vendorOrder.created_at
                                  ).toLocaleDateString(
                                    'en-NG',
                                    {
                                      day: '2-digit',
                                      month: 'short',
                                      year: 'numeric',
                                    }
                                  )}
                                </td>
                              </tr>
                            )
                          )}
                      </tbody>
                    </table>
                  </div>
                )}

                {deliveryOrders.length >
                  20 && (
                  <p
                    style={
                      styles.tableNote
                    }
                  >
                    Showing the latest 20
                    vendor orders.
                  </p>
                )}
              </div>
            </section>

            <section>
              <div
                style={styles.sectionHeading}
              >
                Rider Management
              </div>

              <div style={styles.riderGrid}>
                <div style={styles.panel}>
                  <div
                    style={
                      styles.panelHeader
                    }
                  >
                    <div>
                      <h3
                        style={
                          styles.panelTitle
                        }
                      >
                        Approved Riders
                      </h3>

                      <p
                        style={
                          styles.panelSubtitle
                        }
                      >
                        Manage riders currently
                        approved to deliver orders.
                      </p>
                    </div>

                    <span
                      style={
                        styles.smallTag
                      }
                    >
                      {data.riders.length} RIDER
                      {data.riders.length ===
                      1
                        ? ''
                        : 'S'}
                    </span>
                  </div>

                  {data.riders.length ===
                  0 ? (
                    <p style={styles.empty}>
                      No delivery riders have
                      been approved yet.
                    </p>
                  ) : (
                    <div
                      style={
                        styles.riderList
                      }
                    >
                      {data.riders.map(
                        (rider) => {
                          const profile =
                            data.profiles.find(
                              (item) =>
                                item.id ===
                                rider.id
                            )

                          const feeUpdating =
                            riderAction ===
                            `fee-${rider.id}`

                          const statusUpdating =
                            riderAction ===
                            rider.id

                          return (
                            <div
                              key={
                                rider.id
                              }
                              style={
                                styles.riderRow
                              }
                            >
                              <div>
                                <div
                                  style={
                                    styles.riderName
                                  }
                                >
                                  {profile?.full_name ||
                                    'Unnamed rider'}
                                </div>

                                <div
                                  style={
                                    styles.riderMeta
                                  }
                                >
                                  Fee:{' '}
                                  {formatNaira(
                                    rider.delivery_fee
                                  )}{' '}
                                  •{' '}
                                  {rider.is_active
                                    ? 'Active'
                                    : 'Inactive'}
                                </div>
                              </div>

                              <div
                                style={
                                  styles.riderActions
                                }
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateRiderFee(
                                      rider
                                    )
                                  }
                                  disabled={
                                    feeUpdating ||
                                    statusUpdating
                                  }
                                  style={{
                                    ...styles.riderButton,
                                    opacity:
                                      feeUpdating ||
                                      statusUpdating
                                        ? 0.6
                                        : 1,
                                  }}
                                >
                                  {feeUpdating
                                    ? 'Saving...'
                                    : 'Edit Fee'}
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    toggleRider(
                                      rider
                                    )
                                  }
                                  disabled={
                                    feeUpdating ||
                                    statusUpdating
                                  }
                                  style={{
                                    ...styles.riderButton,
                                    opacity:
                                      feeUpdating ||
                                      statusUpdating
                                        ? 0.6
                                        : 1,
                                  }}
                                >
                                  {statusUpdating
                                    ? 'Saving...'
                                    : rider.is_active
                                      ? 'Deactivate'
                                      : 'Reactivate'}
                                </button>
                              </div>
                            </div>
                          )
                        }
                      )}
                    </div>
                  )}
                </div>

                <div style={styles.panel}>
                  <div
                    style={
                      styles.panelHeader
                    }
                  >
                    <div>
                      <h3
                        style={
                          styles.panelTitle
                        }
                      >
                        Approve a User as Rider
                      </h3>

                      <p
                        style={
                          styles.panelSubtitle
                        }
                      >
                        Manual rider approval for
                        users who have not submitted
                        an application.
                      </p>
                    </div>
                  </div>

                  <div
                    style={
                      styles.riderFeeRow
                    }
                  >
                    <input
                      type="number"
                      min="0"
                      step="50"
                      value={riderFee}
                      onChange={(event) =>
                        setRiderFee(
                          event.target.value
                        )
                      }
                      placeholder="Delivery fee"
                      style={
                        styles.riderInput
                      }
                    />
                  </div>

                  {availableRiderProfiles.length ===
                  0 ? (
                    <p style={styles.empty}>
                      No users are currently
                      available for rider approval.
                    </p>
                  ) : (
                    <div
                      style={
                        styles.riderList
                      }
                    >
                      {availableRiderProfiles.map(
                        (profile) => (
                          <div
                            key={
                              profile.id
                            }
                            style={
                              styles.riderRow
                            }
                          >
                            <div>
                              <div
                                style={
                                  styles.riderName
                                }
                              >
                                {profile.full_name ||
                                  'Unnamed user'}
                              </div>

                              <div
                                style={
                                  styles.riderMeta
                                }
                              >
                                {formatStatus(
                                  profile.role
                                )}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                approveRider(
                                  profile.id
                                )
                              }
                              disabled={
                                riderAction ===
                                  profile.id ||
                                !riderFee
                              }
                              style={{
                                ...styles.riderButton,
                                opacity:
                                  riderAction ===
                                    profile.id ||
                                  !riderFee
                                    ? 0.5
                                    : 1,
                              }}
                            >
                              {riderAction ===
                              profile.id
                                ? 'Approving...'
                                : 'Approve Rider'}
                            </button>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* RIDER PAYOUT ACCOUNTS */}
            <section>
              <div
                style={styles.sectionHeading}
              >
                Rider Payout Accounts
              </div>

              <div style={styles.panel}>
                <div
                  style={
                    styles.panelHeader
                  }
                >
                  <div>
                    <h3
                      style={
                        styles.panelTitle
                      }
                    >
                      Rider Bank Accounts
                    </h3>

                    <p
                      style={
                        styles.panelSubtitle
                      }
                    >
                      View payout account details
                      submitted by approved riders.
                    </p>
                  </div>

                  <span
                    style={
                      styles.smallTag
                    }
                  >
                    {
                      riderPayoutAccounts.length
                    }{' '}
                    ACCOUNT
                    {riderPayoutAccounts.length ===
                    1
                      ? ''
                      : 'S'}
                  </span>
                </div>

                {riderPayoutAccounts.length ===
                0 ? (
                  <p style={styles.empty}>
                    No rider payout accounts have
                    been added yet.
                  </p>
                ) : (
                  <div
                    style={
                      styles.payoutAccountList
                    }
                  >
                    {riderPayoutAccounts.map(
                      (account) => (
                        <div
                          key={account.id}
                          style={
                            styles.payoutAccountCard
                          }
                        >
                          <div
                            style={
                              styles.payoutAccountInfo
                            }
                          >
                            <div
                              style={
                                styles.payoutAccountName
                              }
                            >
                              {account.riderProfile
                                ?.full_name ||
                                'Unnamed rider'}
                            </div>

                            <div
                              style={
                                styles.payoutAccountMeta
                              }
                            >
                              Account Name:{' '}
                              {account.account_name ||
                                '—'}
                            </div>

                            <div
                              style={
                                styles.payoutAccountMeta
                              }
                            >
                              Bank:{' '}
                              {account.bank_name ||
                                '—'}
                            </div>

                            <div
                              style={
                                styles.payoutAccountMeta
                              }
                            >
                              Bank Code:{' '}
                              {account.bank_code ||
                                '—'}
                            </div>

                            <div
                              style={
                                styles.payoutAccountMeta
                              }
                            >
                              Account Number:{' '}
                              <strong
                                style={
                                  styles.accountNumber
                                }
                              >
                                {maskAccountNumber(
                                  account.account_number
                                )}
                              </strong>
                            </div>

                            <div
                              style={
                                styles.payoutAccountMeta
                              }
                            >
                              Paystack Recipient:{' '}
                              {account.paystack_recipient_code
                                ? account.paystack_recipient_code.slice(
                                    0,
                                    18
                                  ) + '...'
                                : 'Not created'}
                            </div>
                          </div>

                          <div
                            style={
                              styles.payoutAccountStatus
                            }
                          >
                            <StatusBadge
                              value={
                                account.is_verified
                                  ? 'verified'
                                  : 'not_verified'
                              }
                            />

                            <StatusBadge
                              value={
                                account.is_active
                                  ? 'active'
                                  : 'inactive'
                              }
                            />

                            <span
                              style={
                                styles.payoutAccountDate
                              }
                            >
                              Updated:{' '}
                              {account.updated_at
                                ? new Date(
                                    account.updated_at
                                  ).toLocaleDateString(
                                    'en-NG',
                                    {
                                      day: '2-digit',
                                      month: 'short',
                                      year: 'numeric',
                                    }
                                  )
                                : '—'}
                            </span>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            </section>

            <section>
              <div
                style={styles.sectionHeading}
              >
                Vendor Payouts
              </div>

              <div
                style={styles.payoutGrid}
              >
                <MoneyCard
                  label="Pending"
                  value={formatNaira(
                    stats.pendingPayouts
                  )}
                />

                <MoneyCard
                  label="Processing"
                  value={formatNaira(
                    stats.processingPayouts
                  )}
                />

                <MoneyCard
                  label="Paid Out"
                  value={formatNaira(
                    stats.paidPayouts
                  )}
                />
              </div>
            </section>

            <section>
              <div
                style={styles.sectionHeading}
              >
                Recent Orders
              </div>

              <div style={styles.panel}>
                {data.orders.length ===
                0 ? (
                  <p style={styles.empty}>
                    No orders recorded yet.
                  </p>
                ) : (
                  <div
                    style={
                      styles.tableWrapper
                    }
                  >
                    <table
                      style={styles.table}
                    >
                      <thead>
                        <tr>
                          <th>Order</th>
                          <th>Amount</th>
                          <th>Payment</th>
                          <th>Status</th>
                        </tr>
                      </thead>

                      <tbody>
                        {data.orders
                          .slice(0, 8)
                          .map(
                            (order) => (
                              <tr
                                key={
                                  order.id
                                }
                              >
                                <td
                                  style={
                                    styles.orderId
                                  }
                                >
                                  #
                                  {order.id.slice(
                                    0,
                                    8
                                  )}
                                </td>

                                <td>
                                  {formatNaira(
                                    order.total_amount
                                  )}
                                </td>

                                <td>
                                  <StatusBadge
                                    value={
                                      order.payment_status
                                    }
                                  />
                                </td>

                                <td>
                                  <StatusBadge
                                    value={
                                      order.status
                                    }
                                  />
                                </td>
                              </tr>
                            )
                          )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>

            <section>
              <div
                style={styles.sectionHeading}
              >
                Recent Payout Activity
              </div>

              <div style={styles.panel}>
                {data.payouts.length ===
                0 ? (
                  <p style={styles.empty}>
                    No payout activity yet.
                  </p>
                ) : (
                  <div
                    style={
                      styles.tableWrapper
                    }
                  >
                    <table
                      style={styles.table}
                    >
                      <thead>
                        <tr>
                          <th>Payout</th>
                          <th>Amount</th>
                          <th>Status</th>
                          <th>Reference</th>
                        </tr>
                      </thead>

                      <tbody>
                        {data.payouts
                          .slice(0, 8)
                          .map(
                            (payout) => (
                              <tr
                                key={
                                  payout.id
                                }
                              >
                                <td
                                  style={
                                    styles.orderId
                                  }
                                >
                                  #
                                  {payout.id.slice(
                                    0,
                                    8
                                  )}
                                </td>

                                <td>
                                  {formatNaira(
                                    payout.payout_amount
                                  )}
                                </td>

                                <td>
                                  <StatusBadge
                                    value={
                                      payout.status
                                    }
                                  />
                                </td>

                                <td
                                  style={
                                    styles.reference
                                  }
                                >
                                  {payout.paystack_reference
                                    ? payout.paystack_reference.slice(
                                        0,
                                        24
                                      )
                                    : '—'}
                                </td>
                              </tr>
                            )
                          )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        <footer style={styles.footer}>
          UniAbuja Market • Admin Dashboard
        </footer>
      </div>
    </div>
  )
}

function formatStatus(value) {
  if (!value) return 'Unknown'

  return String(value)
    .replace(/_/g, ' ')
    .replace(
      /\b\w/g,
      (letter) => letter.toUpperCase()
    )
}

function StatCard({ label, value }) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statValue}>
        {Number(value).toLocaleString()}
      </div>

      <div style={styles.statLabel}>
        {label}
      </div>
    </div>
  )
}

function MoneyCard({ label, value }) {
  return (
    <div style={styles.moneyCard}>
      <div style={styles.moneyAccent} />

      <div>
        <div style={styles.moneyLabel}>
          {label}
        </div>

        <div style={styles.moneyValue}>
          {value}
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ value }) {
  return (
    <span style={styles.statusBadge}>
      <span style={styles.statusDot}>
        ●
      </span>

      {formatStatus(
        value || 'unknown'
      )}
    </span>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#0b0f12',
    color: '#e5e7eb',
    fontFamily:
      'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    padding: '28px 16px 50px',
  },

  container: {
    width: '100%',
    maxWidth: '1180px',
    margin: '0 auto',
  },

  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '20px',
    flexWrap: 'wrap',
    marginBottom: '32px',
  },

  eyebrow: {
    color: '#8b949e',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
    marginBottom: '8px',
  },

  title: {
    margin: 0,
    color: '#f3f4f6',
    fontSize: 'clamp(25px, 4vw, 36px)',
    fontWeight: 650,
    letterSpacing: '-0.8px',
  },

  subtitle: {
    margin: '8px 0 0',
    color: '#7d8790',
    fontSize: '13px',
  },

  lastUpdated: {
    color: '#56636a',
    fontSize: '10px',
    marginTop: '6px',
  },

  headerActions: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },

  refreshButton: {
    background: '#151a1f',
    color: '#d7dde2',
    border: '1px solid #2b333a',
    borderRadius: '6px',
    padding: '9px 13px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600,
  },

  backButton: {
    background: 'transparent',
    color: '#9da6ae',
    border: '1px solid #252c32',
    borderRadius: '6px',
    padding: '9px 13px',
    cursor: 'pointer',
    fontSize: '12px',
  },

  sectionHeading: {
    color: '#9ba4ac',
    fontSize: '12px',
    fontWeight: 600,
    margin: '26px 0 10px',
  },

  statsGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '10px',
  },

  statCard: {
    background: '#11161a',
    border: '1px solid #20272d',
    borderRadius: '8px',
    padding: '20px',
    minHeight: '100px',
  },

  statValue: {
    color: '#f0f2f3',
    fontSize: '27px',
    fontWeight: 650,
  },

  statLabel: {
    color: '#727c85',
    fontSize: '11px',
    marginTop: '7px',
  },

  moneyGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '10px',
  },

  moneyCard: {
    position: 'relative',
    overflow: 'hidden',
    background: '#11161a',
    border: '1px solid #20272d',
    borderRadius: '8px',
    padding: '18px 18px 18px 20px',
  },

  moneyAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '2px',
    background: '#6f9aa5',
  },

  moneyLabel: {
    color: '#737e87',
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '.7px',
  },

  moneyValue: {
    color: '#e8eaec',
    fontSize: '19px',
    fontWeight: 650,
    marginTop: '7px',
  },

  analyticsGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '10px',
  },

  panel: {
    background: '#11161a',
    border: '1px solid #20272d',
    borderRadius: '8px',
    padding: '19px',
    marginBottom: '10px',
  },

  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '15px',
    marginBottom: '20px',
  },

  panelTitle: {
    margin: 0,
    color: '#dfe3e6',
    fontSize: '13px',
    fontWeight: 600,
  },

  panelSubtitle: {
    color: '#707a83',
    fontSize: '11px',
    margin: '5px 0 0',
  },

  smallTag: {
    color: '#7f9299',
    background: '#171d21',
    border: '1px solid #293138',
    borderRadius: '4px',
    padding: '4px 7px',
    fontSize: '8px',
    whiteSpace: 'nowrap',
  },

  chart: {
    height: '180px',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    gap: '8px',
    borderBottom: '1px solid #252c31',
  },

  chartColumn: {
    height: '100%',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '5px',
  },

  chartValue: {
    color: '#aeb8be',
    fontSize: '9px',
  },

  chartTrack: {
    height: '125px',
    width: '100%',
    maxWidth: '32px',
    display: 'flex',
    alignItems: 'flex-end',
    background: '#151a1e',
    borderRadius: '3px 3px 0 0',
  },

  chartBar: {
    width: '100%',
    minHeight: '2px',
    background: '#607d86',
    borderRadius: '3px 3px 0 0',
  },

  chartLabel: {
    color: '#68747c',
    fontSize: '9px',
  },

  paymentList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    paddingTop: '8px',
  },

  paymentItem: {
    width: '100%',
  },

  paymentTop: {
    display: 'flex',
    justifyContent: 'space-between',
    color: '#aeb7bd',
    fontSize: '11px',
    marginBottom: '7px',
  },

  progressTrack: {
    height: '6px',
    background: '#1a2024',
    borderRadius: '10px',
    overflow: 'hidden',
  },

  progressBar: {
    height: '100%',
    background: '#6d8991',
    borderRadius: '10px',
  },

  percentage: {
    display: 'block',
    color: '#69757d',
    fontSize: '9px',
    marginTop: '5px',
  },

  applicationList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '9px',
  },

  applicationCard: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '15px',
    padding: '14px',
    background: '#151a1e',
    border: '1px solid #252d33',
    borderRadius: '7px',
    flexWrap: 'wrap',
  },

  applicationContent: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '16px',
    minWidth: '280px',
    flex: 1,
    flexWrap: 'wrap',
  },

  applicationVerification: {
    width: '150px',
    flexShrink: 0,
  },

  passportPhoto: {
    width: '120px',
    height: '120px',
    objectFit: 'cover',
    borderRadius: '7px',
    border: '1px solid #303940',
    display: 'block',
    cursor: 'pointer',
  },

  noPhoto: {
    width: '120px',
    height: '120px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#171c20',
    border: '1px solid #303940',
    borderRadius: '7px',
    color: '#68747c',
    fontSize: '9px',
  },

  documentLinks: {
    marginTop: '9px',
  },

  documentLabel: {
    color: '#77838b',
    fontSize: '9px',
    marginBottom: '5px',
  },

  documentLink: {
    color: '#9fb8be',
    fontSize: '9px',
    textDecoration: 'none',
  },

  missingDocument: {
    color: '#68747c',
    fontSize: '9px',
  },

  applicationInfo: {
    minWidth: '180px',
    flex: 1,
  },

  applicationName: {
    color: '#e0e5e8',
    fontSize: '12px',
    fontWeight: 650,
  },

  applicationMeta: {
    color: '#717d85',
    fontSize: '9px',
    marginTop: '5px',
  },

  applicationActions: {
    display: 'flex',
    gap: '7px',
    flexWrap: 'wrap',
  },

  approveButton: {
    background: '#1d2a2c',
    color: '#a9c5c9',
    border: '1px solid #395256',
    borderRadius: '5px',
    padding: '8px 13px',
    cursor: 'pointer',
    fontSize: '10px',
    fontWeight: 600,
  },

  rejectButton: {
    background: '#25181b',
    color: '#c99da3',
    border: '1px solid #4a2b30',
    borderRadius: '5px',
    padding: '8px 13px',
    cursor: 'pointer',
    fontSize: '10px',
    fontWeight: 600,
  },

  rateList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '9px',
  },

  rateCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '15px',
    padding: '14px',
    background: '#151a1e',
    border: '1px solid #252d33',
    borderRadius: '7px',
    flexWrap: 'wrap',
  },

  rateInfo: {
    minWidth: '220px',
  },

  rateName: {
    color: '#e0e5e8',
    fontSize: '12px',
    fontWeight: 650,
  },

  rateMeta: {
    color: '#717d85',
    fontSize: '9px',
    marginTop: '5px',
  },

  rateFee: {
    color: '#b9c9cd',
    fontWeight: 650,
  },

  rateActions: {
    display: 'flex',
    gap: '7px',
    flexWrap: 'wrap',
  },

  deliveryStatsGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(auto-fit, minmax(130px, 1fr))',
    gap: '8px',
    marginBottom: '10px',
  },

  deliveryStatCard: {
    background: '#11161a',
    border: '1px solid #20272d',
    borderRadius: '8px',
    padding: '14px',
  },

  deliveryStatCount: {
    color: '#e8eaec',
    fontSize: '21px',
    fontWeight: 650,
  },

  deliveryStatLabel: {
    color: '#707a83',
    fontSize: '10px',
    marginTop: '5px',
  },

  deliveryControl: {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
    minWidth: '145px',
  },

  statusSelect: {
    width: '100%',
    background: '#171c20',
    color: '#cbd2d6',
    border: '1px solid #303940',
    borderRadius: '5px',
    padding: '6px 8px',
    fontSize: '9px',
    outline: 'none',
    cursor: 'pointer',
  },

  updatingText: {
    color: '#68747c',
    fontSize: '8px',
  },

  riderGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(auto-fit, minmax(320px, 1fr))',
    gap: '10px',
  },

  riderList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },

  riderRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '12px',
    background: '#151a1e',
    border: '1px solid #252d33',
    borderRadius: '6px',
  },

  riderName: {
    color: '#dce1e4',
    fontSize: '11px',
    fontWeight: 600,
  },

  riderMeta: {
    color: '#6f7a82',
    fontSize: '9px',
    marginTop: '4px',
  },

  riderActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },

  riderFeeRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '12px',
  },

  riderInput: {
    width: '100%',
    boxSizing: 'border-box',
    background: '#171c20',
    color: '#d9dfe2',
    border: '1px solid #303940',
    borderRadius: '5px',
    padding: '9px 10px',
    fontSize: '11px',
    outline: 'none',
  },

  riderButton: {
    flexShrink: 0,
    background: '#171d21',
    color: '#c7d0d4',
    border: '1px solid #344047',
    borderRadius: '5px',
    padding: '7px 9px',
    cursor: 'pointer',
    fontSize: '9px',
    fontWeight: 600,
  },

  payoutAccountList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '9px',
  },

  payoutAccountCard: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '20px',
    padding: '14px',
    background: '#151a1e',
    border: '1px solid #252d33',
    borderRadius: '7px',
    flexWrap: 'wrap',
  },

  payoutAccountInfo: {
    minWidth: '240px',
    flex: 1,
  },

  payoutAccountName: {
    color: '#e0e5e8',
    fontSize: '12px',
    fontWeight: 650,
  },

  payoutAccountMeta: {
    color: '#717d85',
    fontSize: '9px',
    marginTop: '5px',
  },

  accountNumber: {
    color: '#b9c9cd',
    fontFamily: 'monospace',
    fontWeight: 650,
    letterSpacing: '0.5px',
  },

  payoutAccountStatus: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '6px',
    minWidth: '130px',
  },

  payoutAccountDate: {
    color: '#68747c',
    fontSize: '8px',
    marginTop: '3px',
    whiteSpace: 'nowrap',
  },

  payoutGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '10px',
  },

  tableWrapper: {
    width: '100%',
    overflowX: 'auto',
  },

  table: {
    width: '100%',
    minWidth: '720px',
    borderCollapse: 'collapse',
    fontSize: '11px',
  },

  orderId: {
    color: '#aeb8be',
    fontFamily: 'monospace',
  },

  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    color: '#aab4ba',
    background: '#171c20',
    border: '1px solid #293137',
    borderRadius: '4px',
    padding: '4px 7px',
    fontSize: '9px',
    whiteSpace: 'nowrap',
  },

  statusDot: {
    color: '#71868d',
    fontSize: '7px',
  },

  reference: {
    color: '#68747c',
    fontFamily: 'monospace',
    fontSize: '9px',
  },

  dateText: {
    color: '#69757d',
    fontSize: '10px',
    whiteSpace: 'nowrap',
  },

  tableNote: {
    color: '#5f6a72',
    fontSize: '9px',
    margin: '12px 0 0',
  },

  empty: {
    color: '#69747c',
    fontSize: '12px',
  },

  errorBox: {
    background: '#191113',
    border: '1px solid #40272b',
    borderRadius: '8px',
    padding: '18px',
    color: '#d9b8bc',
    marginBottom: '15px',
  },

  loading: {
    maxWidth: '400px',
    margin: '20vh auto',
    textAlign: 'center',
    padding: '30px',
  },

  loadingMark: {
    color: '#8499a0',
    fontSize: '32px',
    marginBottom: '15px',
  },

  footer: {
    color: '#4f5960',
    fontSize: '9px',
    textAlign: 'center',
    marginTop: '35px',
    paddingTop: '20px',
    borderTop: '1px solid #1b2125',
  },
}