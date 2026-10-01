import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'

export default function AdminDashboard({ user, onBack }) {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [error, setError] = useState('')
  const [updatingDelivery, setUpdatingDelivery] = useState(null)

  const [riderAction, setRiderAction] = useState(null)
  const [riderFileUrls, setRiderFileUrls] = useState({})
  const [vendorAction, setVendorAction] = useState(null)

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
  })

  const formatNaira = (value) =>
    `₦${Number(value || 0).toLocaleString('en-NG', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`

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
            .createSignedUrl(
              application.passport_photo_path,
              3600
            )

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
          fileData.studentIdDocumentUrl =
            documentData.signedUrl
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
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, role, created_at')
          .order('created_at', {
            ascending: false,
          }),

        supabase
          .from('stores')
          .select(
            'id, owner_id, store_name, description, logo_url, phone, location, status, delivery_fee, created_at'
          )
          .order('created_at', {
            ascending: false,
          }),

        supabase
          .from('products')
          .select(
            'id, vendor_id, name, price, stock, status, created_at'
          )
          .order('created_at', {
            ascending: false,
          }),

        supabase
          .from('orders')
          .select(
            'id, customer_id, total_amount, status, payment_status, created_at'
          )
          .order('created_at', {
            ascending: false,
          }),

        supabase
          .from('vendor_commissions')
          .select(
            'id, vendor_id, vendor_order_id, order_id, sale_amount, commission_amount, vendor_amount, status, created_at'
          )
          .order('created_at', {
            ascending: false,
          }),

        supabase
          .from('vendor_payouts')
          .select(
            'id, vendor_id, vendor_order_id, order_id, payout_amount, status, paystack_reference, created_at, paid_at'
          )
          .order('created_at', {
            ascending: false,
          }),

        supabase
          .from('vendor_orders')
          .select(
            'id, order_id, vendor_id, status, subtotal, created_at, updated_at'
          )
          .order('created_at', {
            ascending: false,
          }),

        supabase
          .from('delivery_riders')
          .select(
            'id, is_active, created_at, updated_at'
          )
          .order('created_at', {
            ascending: false,
          }),

        supabase
          .from('rider_applications')
          .select(
            'id, user_id, full_name, phone, date_of_birth, address, student_id_number, department, level, passport_photo_path, student_id_document_path, emergency_contact_name, emergency_contact_phone, has_vehicle, status, admin_note, created_at, updated_at'
          )
          .order('created_at', {
            ascending: false,
          }),
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
      ]

      const failed = results.find(
        (result) => result.error
      )

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
      })

      await loadRiderFileUrls(riderApplications)

      setLastUpdated(new Date())
    } catch (err) {
      console.error(
        'Admin dashboard error:',
        err
      )

      setError(
        err.message ||
          'Failed to load dashboard.'
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const reviewVendorApplication = async (
    store,
    decision
  ) => {
    const action =
      `${decision}-${store.id}`

    try {
      setVendorAction(action)
      setError('')

      const { error: reviewError } =
        await supabase.rpc(
          'review_vendor_application',
          {
            p_store_id: store.id,
            p_decision: decision,
          }
        )

      if (reviewError) {
        throw new Error(
          reviewError.message
        )
      }

      await loadDashboard(true)
    } catch (err) {
      console.error(
        'Vendor application review error:',
        err
      )

      setError(
        err.message ||
          'Failed to review vendor application.'
      )
    } finally {
      setVendorAction(null)
    }
  }

  const retryVendorApplication = async (
    store
  ) => {
    try {
      setVendorAction(
        `retry-${store.id}`
      )
      setError('')

      const { error: retryError } =
        await supabase.rpc(
          'retry_vendor_application',
          {
            p_store_id: store.id,
          }
        )

      if (retryError) {
        throw new Error(
          retryError.message
        )
      }

      await loadDashboard(true)
    } catch (err) {
      console.error(
        'Vendor application retry error:',
        err
      )

      setError(
        err.message ||
          'Failed to retry vendor application.'
      )
    } finally {
      setVendorAction(null)
    }
  }

  const toggleVendorStoreStatus = async (
    store
  ) => {
    const nextStatus =
      store.status === 'active'
        ? 'suspended'
        : 'active'

    try {
      setVendorAction(
        `status-${store.id}`
      )
      setError('')

      const { error: statusError } =
        await supabase.rpc(
          'set_vendor_store_status',
          {
            p_store_id: store.id,
            p_status: nextStatus,
          }
        )

      if (statusError) {
        throw new Error(
          statusError.message
        )
      }

      await loadDashboard(true)
    } catch (err) {
      console.error(
        'Vendor status update error:',
        err
      )

      setError(
        err.message ||
          'Failed to update vendor status.'
      )
    } finally {
      setVendorAction(null)
    }
  }

  const reviewRiderApplication = async (
    application,
    decision
  ) => {
    let note = ''

    if (decision === 'approved') {
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
      setRiderAction(
        `application-${application.id}`
      )

      setError('')

      const { error: reviewError } =
        await supabase.rpc(
          'review_rider_application',
          {
            p_application_id:
              application.id,
            p_decision: decision,
            p_admin_note:
              note || null,
          }
        )

      if (reviewError) {
        throw new Error(
          reviewError.message
        )
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

  const retryRiderApplication = async (
    application
  ) => {
    try {
      setRiderAction(
        `retry-${application.id}`
      )
      setError('')

      const { error: retryError } =
        await supabase.rpc(
          'retry_rider_application',
          {
            p_application_id:
              application.id,
          }
        )

      if (retryError) {
        throw new Error(
          retryError.message
        )
      }

      await loadDashboard(true)
    } catch (err) {
      console.error(
        'Rider application retry error:',
        err
      )

      setError(
        err.message ||
          'Failed to retry rider application.'
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
      newStatus ===
        vendorOrder.status
    ) {
      return
    }

    try {
      setUpdatingDelivery(
        vendorOrder.id
      )

      setError('')

      const { error: updateError } =
        await supabase
          .from('vendor_orders')
          .update({
            status: newStatus,
            updated_at:
              new Date().toISOString(),
          })
          .eq(
            'id',
            vendorOrder.id
          )

      if (updateError) {
        throw new Error(
          updateError.message
        )
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

  const approveRider = async (
    profileId
  ) => {
    try {
      setRiderAction(profileId)
      setError('')

      const { error: approveError } =
        await supabase.rpc(
          'approve_delivery_rider',
          {
            p_user_id: profileId,
            p_delivery_fee: 0,
          }
        )

      if (approveError) {
        throw new Error(
          approveError.message
        )
      }

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

  const toggleRider = async (
    rider
  ) => {
    try {
      setRiderAction(rider.id)
      setError('')

      const { error: statusError } =
        await supabase.rpc(
          'set_delivery_rider_status',
          {
            p_rider_id: rider.id,
            p_is_active:
              !rider.is_active,
          }
        )

      if (statusError) {
        throw new Error(
          statusError.message
        )
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
      products,
      orders,
      commissions,
      payouts,
    } = data

    const customers =
      profiles.filter(
        (profile) =>
          profile.role ===
          'customer'
      ).length

    const paidOrders =
      orders.filter(
        (order) =>
          order.payment_status ===
          'paid'
      )

    const paidOrderValue =
      paidOrders.reduce(
        (total, order) =>
          total +
          Number(
            order.total_amount ||
              0
          ),
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
            commission.vendor_amount ||
              0
          ),
        0
      )

    const payoutTotal = (
      status
    ) =>
      payouts
        .filter(
          (payout) =>
            payout.status ===
            status
        )
        .reduce(
          (
            total,
            payout
          ) =>
            total +
            Number(
              payout.payout_amount ||
                0
            ),
          0
        )

    return {
      customers,
      vendors:
        profiles.filter(
          (profile) =>
            profile.role ===
            'vendor'
        ).length,
      products:
        products.length,
      orders:
        orders.length,
      paidOrders:
        paidOrders.length,
      paidOrderValue,
      platformCommission,
      vendorEarnings,
      pendingPayouts:
        payoutTotal(
          'pending'
        ),
      processingPayouts:
        payoutTotal(
          'processing'
        ),
      paidPayouts:
        payoutTotal('paid'),
    }
  }, [data])

  const orderActivity =
    useMemo(() => {
      const days = []

      for (
        let i = 6;
        i >= 0;
        i--
      ) {
        const date =
          new Date()

        date.setHours(
          0,
          0,
          0,
          0
        )

        date.setDate(
          date.getDate() - i
        )

        days.push({
          key: date.toISOString(),
          label:
            date.toLocaleDateString(
              'en-NG',
              {
                weekday:
                  'short',
              }
            ),
          count: 0,
        })
      }

      data.orders.forEach(
        (order) => {
          const orderDate =
            new Date(
              order.created_at
            )

          orderDate.setHours(
            0,
            0,
            0,
            0
          )

          const matchingDay =
            days.find(
              (day) =>
                new Date(
                  day.key
                ).getTime() ===
                orderDate.getTime()
            )

          if (matchingDay) {
            matchingDay.count +=
              1
          }
        }
      )

      const maximum =
        Math.max(
          ...days.map(
            (day) =>
              day.count
          ),
          1
        )

      return days.map(
        (day) => ({
          ...day,
          height: day.count
            ? Math.max(
                (day.count /
                  maximum) *
                  100,
                8
              )
            : 3,
        })
      )
    }, [data.orders])

  const paymentStats =
    useMemo(() => {
      const total =
        Math.max(
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
            (paid / total) *
            100,
        },
        {
          label: 'Pending',
          count: pending,
          percent:
            (pending / total) *
            100,
        },
        {
          label: 'Unpaid',
          count: unpaid,
          percent:
            (unpaid / total) *
            100,
        },
      ]
    }, [data.orders])

  const deliveryStats =
    useMemo(() => {
      const statuses = [
        'pending',
        'accepted',
        'processing',
        'ready',
        'out_for_delivery',
        'delivered',
        'cancelled',
      ]

      return statuses.map(
        (status) => ({
          status,
          count:
            data.vendorOrders.filter(
              (order) =>
                order.status ===
                status
            ).length,
        })
      )
    }, [data.vendorOrders])

  const deliveryOrders =
    useMemo(() => {
      const storesByOwner =
        new Map()

      data.stores.forEach(
        (store) => {
          storesByOwner.set(
            store.owner_id,
            store
          )
        }
      )

      const profilesById =
        new Map()

      data.profiles.forEach(
        (profile) => {
          profilesById.set(
            profile.id,
            profile
          )
        }
      )

      const ordersById =
        new Map()

      data.orders.forEach(
        (order) => {
          ordersById.set(
            order.id,
            order
          )
        }
      )

      return data.vendorOrders
        .map(
          (
            vendorOrder
          ) => {
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
          }
        )
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

  const approvedRiderIds =
    useMemo(
      () =>
        new Set(
          data.riders.map(
            (rider) =>
              rider.id
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
            profile.role !==
              'admin'
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

  const rejectedRiderApplications =
    useMemo(
      () =>
        data.riderApplications.filter(
          (application) =>
            application.status ===
            'rejected'
        ),
      [data.riderApplications]
    )

  const pendingVendorApplications =
    useMemo(
      () =>
        data.stores.filter(
          (store) =>
            store.status ===
            'pending'
        ),
      [data.stores]
    )

  const rejectedVendorApplications =
    useMemo(
      () =>
        data.stores.filter(
          (store) =>
            store.status ===
            'rejected'
        ),
      [data.stores]
    )

  const manageableVendors =
    useMemo(
      () =>
        data.stores.filter(
          (store) =>
            store.status ===
              'active' ||
            store.status ===
              'suspended'
        ),
      [data.stores]
    )

  const profilesById =
    useMemo(() => {
      const map =
        new Map()

      data.profiles.forEach(
        (profile) => {
          map.set(
            profile.id,
            profile
          )
        }
      )

      return map
    }, [data.profiles])

  if (loading) {
    return (
      <div
        style={
          styles.page
        }
      >
        <div
          style={
            styles.loading
          }
        >
          <div
            style={
              styles.loadingMark
            }
          >
            ◈
          </div>

          <h2>
            Loading Admin Dashboard
          </h2>

          <p>
            Connecting to marketplace
            data...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      style={styles.page}
    >
      <div
        style={
          styles.container
        }
      >
        <header
          style={styles.header}
        >
          <div>
            <div
              style={
                styles.eyebrow
              }
            >
              ADMINISTRATION
            </div>

            <h1
              style={
                styles.title
              }
            >
              Marketplace Dashboard
            </h1>

            <p
              style={
                styles.subtitle
              }
            >
              Monitor orders, vendors,
              products and platform
              activity.
            </p>

            {lastUpdated && (
              <p
                style={
                  styles.lastUpdated
                }
              >
                Last updated:{' '}
                {lastUpdated.toLocaleTimeString(
                  'en-NG',
                  {
                    hour: '2-digit',
                    minute:
                      '2-digit',
                    second:
                      '2-digit',
                  }
                )}
              </p>
            )}
          </div>

          <div
            style={
              styles.headerActions
            }
          >
            <button
              type="button"
              onClick={() =>
                loadDashboard(
                  true
                )
              }
              disabled={
                refreshing
              }
              style={{
                ...styles.refreshButton,
                opacity:
                  refreshing
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
              onClick={
                onBack
              }
              style={
                styles.backButton
              }
            >
              ← Back
            </button>
          </div>
        </header>

        {error && (
          <div
            style={
              styles.errorBox
            }
          >
            <strong>
              Dashboard Error
            </strong>

            <p>{error}</p>

            <button
              type="button"
              onClick={() =>
                loadDashboard(
                  true
                )
              }
              style={
                styles.refreshButton
              }
            >
              Try Again
            </button>
          </div>
        )}

        {!error && (
          <>
            <section>
              <div
                style={
                  styles.sectionHeading
                }
              >
                Overview
              </div>

              <div
                style={
                  styles.statsGrid
                }
              >
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

            {/* VENDOR APPLICATIONS */}
            <section>
              <div
                style={
                  styles.sectionHeading
                }
              >
                Vendor Applications
              </div>

              <div
                style={
                  styles.panel
                }
              >
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
                      Pending Vendor Applications
                    </h3>

                    <p
                      style={
                        styles.panelSubtitle
                      }
                    >
                      Review stores submitted
                      by users who want to
                      become vendors.
                    </p>
                  </div>

                  <span
                    style={
                      styles.smallTag
                    }
                  >
                    {
                      pendingVendorApplications.length
                    }{' '}
                    PENDING
                  </span>
                </div>

                {pendingVendorApplications.length ===
                0 ? (
                  <p
                    style={
                      styles.empty
                    }
                  >
                    No pending vendor
                    applications.
                  </p>
                ) : (
                  <div
                    style={
                      styles.applicationList
                    }
                  >
                    {pendingVendorApplications.map(
                      (store) => {
                        const applicant =
                          profilesById.get(
                            store.owner_id
                          )

                        const approving =
                          vendorAction ===
                          `approved-${store.id}`

                        const rejecting =
                          vendorAction ===
                          `rejected-${store.id}`

                        const reviewing =
                          approving ||
                          rejecting

                        return (
                          <div
                            key={
                              store.id
                            }
                            style={
                              styles.vendorApplicationCard
                            }
                          >
                            <div
                              style={
                                styles.vendorApplicationContent
                              }
                            >
                              {store.logo_url ? (
                                <img
                                  src={
                                    store.logo_url
                                  }
                                  alt={
                                    store.store_name
                                  }
                                  style={
                                    styles.storeLogo
                                  }
                                />
                              ) : (
                                <div
                                  style={
                                    styles.noStoreLogo
                                  }
                                >
                                  No Logo
                                </div>
                              )}

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
                                    store.store_name
                                  }
                                </div>

                                <div
                                  style={
                                    styles.applicationMeta
                                  }
                                >
                                  Applicant:{' '}
                                  {applicant?.full_name ||
                                    'Unknown applicant'}
                                </div>

                                <div
                                  style={
                                    styles.applicationMeta
                                  }
                                >
                                  Phone:{' '}
                                  {store.phone ||
                                    applicant?.phone ||
                                    '—'}
                                </div>

                                <div
                                  style={
                                    styles.applicationMeta
                                  }
                                >
                                  Location:{' '}
                                  {store.location ||
                                    '—'}
                                </div>

                                <div
                                  style={
                                    styles.applicationMeta
                                  }
                                >
                                  Description:{' '}
                                  {store.description ||
                                    'No description provided.'}
                                </div>

                                <div
                                  style={
                                    styles.applicationMeta
                                  }
                                >
                                  Applied:{' '}
                                  {new Date(
                                    store.created_at
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
                                  reviewVendorApplication(
                                    store,
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
                                {approving
                                  ? 'Approving...'
                                  : 'Approve'}
                              </button>

                              <button
                                type="button"
                                disabled={
                                  reviewing
                                }
                                onClick={() =>
                                  reviewVendorApplication(
                                    store,
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
                                {rejecting
                                  ? 'Rejecting...'
                                  : 'Reject'}
                              </button>
                            </div>
                          </div>
                        )
                      }
                    )}
                  </div>
                )}

                {rejectedVendorApplications.length >
                  0 && (
                  <div
                    style={
                      styles.rejectedSection
                    }
                  >
                    <div
                      style={
                        styles.rejectedHeader
                      }
                    >
                      <div>
                        <h3
                          style={
                            styles.rejectedTitle
                          }
                        >
                          Rejected Vendor Applications
                        </h3>

                        <p
                          style={
                            styles.rejectedSubtitle
                          }
                        >
                          Retry a rejected application
                          to return it to pending review.
                        </p>
                      </div>

                      <span
                        style={
                          styles.rejectedTag
                        }
                      >
                        {
                          rejectedVendorApplications.length
                        }{' '}
                        REJECTED
                      </span>
                    </div>

                    <div
                      style={
                        styles.applicationList
                      }
                    >
                      {rejectedVendorApplications.map(
                        (store) => {
                          const applicant =
                            profilesById.get(
                              store.owner_id
                            )

                          const retrying =
                            vendorAction ===
                            `retry-${store.id}`

                          return (
                            <div
                              key={
                                store.id
                              }
                              style={
                                styles.rejectedApplicationCard
                              }
                            >
                              <div
                                style={
                                  styles.vendorApplicationContent
                                }
                              >
                                {store.logo_url ? (
                                  <img
                                    src={
                                      store.logo_url
                                    }
                                    alt={
                                      store.store_name
                                    }
                                    style={
                                      styles.storeLogo
                                    }
                                  />
                                ) : (
                                  <div
                                    style={
                                      styles.noStoreLogo
                                    }
                                  >
                                    No Logo
                                  </div>
                                )}

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
                                      store.store_name
                                    }
                                  </div>

                                  <div
                                    style={
                                      styles.applicationMeta
                                    }
                                  >
                                    Applicant:{' '}
                                    {applicant?.full_name ||
                                      'Unknown applicant'}
                                  </div>

                                  <div
                                    style={
                                      styles.applicationMeta
                                    }
                                  >
                                    Location:{' '}
                                    {store.location ||
                                      '—'}
                                  </div>

                                  <div
                                    style={
                                      styles.applicationMeta
                                    }
                                  >
                                    Applied:{' '}
                                    {new Date(
                                      store.created_at
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
                                    retrying
                                  }
                                  onClick={() =>
                                    retryVendorApplication(
                                      store
                                    )
                                  }
                                  style={{
                                    ...styles.retryButton,
                                    opacity:
                                      retrying
                                        ? 0.5
                                        : 1,
                                  }}
                                >
                                  {retrying
                                    ? 'Retrying...'
                                    : 'Retry'}
                                </button>
                              </div>
                            </div>
                          )
                        }
                      )}
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* VENDOR MANAGEMENT */}
            <section>
              <div
                style={
                  styles.sectionHeading
                }
              >
                Vendor Management
              </div>

              <div
                style={
                  styles.panel
                }
              >
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
                      Active & Suspended Vendors
                    </h3>

                    <p
                      style={
                        styles.panelSubtitle
                      }
                    >
                      Suspend a vendor store to
                      stop new orders, or reactivate
                      it later.
                    </p>
                  </div>

                  <span
                    style={
                      styles.smallTag
                    }
                  >
                    {
                      manageableVendors.length
                    }{' '}
                    VENDOR
                    {manageableVendors.length ===
                    1
                      ? ''
                      : 'S'}
                  </span>
                </div>

                {manageableVendors.length ===
                0 ? (
                  <p
                    style={
                      styles.empty
                    }
                  >
                    No active or suspended
                    vendor stores.
                  </p>
                ) : (
                  <div
                    style={
                      styles.applicationList
                    }
                  >
                    {manageableVendors.map(
                      (store) => {
                        const vendor =
                          profilesById.get(
                            store.owner_id
                          )

                        const updating =
                          vendorAction ===
                          `status-${store.id}`

                        const suspended =
                          store.status ===
                          'suspended'

                        return (
                          <div
                            key={
                              store.id
                            }
                            style={
                              styles.vendorManagementCard
                            }
                          >
                            <div
                              style={
                                styles.vendorManagementInfo
                              }
                            >
                              {store.logo_url ? (
                                <img
                                  src={
                                    store.logo_url
                                  }
                                  alt={
                                    store.store_name
                                  }
                                  style={
                                    styles.storeLogo
                                  }
                                />
                              ) : (
                                <div
                                  style={
                                    styles.noStoreLogo
                                  }
                                >
                                  No Logo
                                </div>
                              )}

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
                                    store.store_name
                                  }
                                </div>

                                <div
                                  style={
                                    styles.applicationMeta
                                  }
                                >
                                  Vendor:{' '}
                                  {vendor?.full_name ||
                                    'Unknown vendor'}
                                </div>

                                <div
                                  style={
                                    styles.applicationMeta
                                  }
                                >
                                  Location:{' '}
                                  {store.location ||
                                    '—'}
                                </div>

                                <div
                                  style={
                                    styles.applicationMeta
                                  }
                                >
                                  Status:{' '}
                                  {formatStatus(
                                    store.status
                                  )}
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              disabled={
                                updating
                              }
                              onClick={() =>
                                toggleVendorStoreStatus(
                                  store
                                )
                              }
                              style={{
                                ...(suspended
                                  ? styles.approveButton
                                  : styles.rejectButton),
                                opacity:
                                  updating
                                    ? 0.5
                                    : 1,
                              }}
                            >
                              {updating
                                ? 'Saving...'
                                : suspended
                                  ? 'Reactivate'
                                  : 'Suspend'}
                            </button>
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
                style={
                  styles.sectionHeading
                }
              >
                Financial Overview
              </div>

              <div
                style={
                  styles.moneyGrid
                }
              >
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
                style={
                  styles.sectionHeading
                }
              >
                Analytics
              </div>

              <div
                style={
                  styles.analyticsGrid
                }
              >
                <div
                  style={
                    styles.panel
                  }
                >
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
                        Orders over the
                        last 7 days
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

                  <div
                    style={
                      styles.chart
                    }
                  >
                    {orderActivity.map(
                      (day) => (
                        <div
                          key={
                            day.key
                          }
                          style={
                            styles.chartColumn
                          }
                        >
                          <span
                            style={
                              styles.chartValue
                            }
                          >
                            {
                              day.count
                            }
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
                            {
                              day.label
                            }
                          </span>
                        </div>
                      )
                    )}
                  </div>
                </div>

                <div
                  style={
                    styles.panel
                  }
                >
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
                        Current order
                        payment
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
                          key={
                            item.label
                          }
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
                              {
                                item.label
                              }
                            </span>

                            <strong>
                              {
                                item.count
                              }
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
                style={
                  styles.sectionHeading
                }
              >
                Rider Applications
              </div>

              <div
                style={
                  styles.panel
                }
              >
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
                      applied to become
                      delivery riders.
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
                  <p
                    style={
                      styles.empty
                    }
                  >
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

                {rejectedRiderApplications.length >
                  0 && (
                  <div
                    style={
                      styles.rejectedSection
                    }
                  >
                    <div
                      style={
                        styles.rejectedHeader
                      }
                    >
                      <div>
                        <h3
                          style={
                            styles.rejectedTitle
                          }
                        >
                          Rejected Rider Applications
                        </h3>

                        <p
                          style={
                            styles.rejectedSubtitle
                          }
                        >
                          Retry a rejected application
                          to return it to pending review.
                        </p>
                      </div>

                      <span
                        style={
                          styles.rejectedTag
                        }
                      >
                        {
                          rejectedRiderApplications.length
                        }{' '}
                        REJECTED
                      </span>
                    </div>

                    <div
                      style={
                        styles.applicationList
                      }
                    >
                      {rejectedRiderApplications.map(
                        (application) => {
                          const retrying =
                            riderAction ===
                            `retry-${application.id}`

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
                                styles.rejectedApplicationCard
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

                                  {application.admin_note && (
                                    <div
                                      style={
                                        styles.applicationMeta
                                      }
                                    >
                                      Rejection Note:{' '}
                                      {
                                        application.admin_note
                                      }
                                    </div>
                                  )}

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
                                    retrying
                                  }
                                  onClick={() =>
                                    retryRiderApplication(
                                      application
                                    )
                                  }
                                  style={{
                                    ...styles.retryButton,
                                    opacity:
                                      retrying
                                        ? 0.5
                                        : 1,
                                  }}
                                >
                                  {retrying
                                    ? 'Retrying...'
                                    : 'Retry'}
                                </button>
                              </div>
                            </div>
                          )
                        }
                      )}
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* DELIVERY OPERATIONS */}
            <section>
              <div
                style={
                  styles.sectionHeading
                }
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
                      key={
                        item.status
                      }
                      style={
                        styles.deliveryStatCard
                      }
                    >
                      <div
                        style={
                          styles.deliveryStatCount
                        }
                      >
                        {
                          item.count
                        }
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

              <div
                style={
                  styles.panel
                }
              >
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
                      Monitor and manage
                      vendor order
                      progress across
                      the marketplace.
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
                  <p
                    style={
                      styles.empty
                    }
                  >
                    No vendor orders
                    recorded yet.
                  </p>
                ) : (
                  <div
                    style={
                      styles.tableWrapper
                    }
                  >
                    <table
                      style={
                        styles.table
                      }
                    >
                      <thead>
                        <tr>
                          <th>
                            Order
                          </th>
                          <th>
                            Vendor
                          </th>
                          <th>
                            Amount
                          </th>
                          <th>
                            Payment
                          </th>
                          <th>
                            Delivery
                            Status
                          </th>
                          <th>
                            Created
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {deliveryOrders
                          .slice(
                            0,
                            20
                          )
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

            {/* RIDER MANAGEMENT */}
            <section>
              <div
                style={
                  styles.sectionHeading
                }
              >
                Rider Management
              </div>

              <div
                style={
                  styles.riderGrid
                }
              >
                <div
                  style={
                    styles.panel
                  }
                >
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
                        Manage riders
                        currently approved
                        to deliver orders.
                      </p>
                    </div>

                    <span
                      style={
                        styles.smallTag
                      }
                    >
                      {
                        data.riders
                          .length
                      }{' '}
                      RIDER
                      {data.riders
                        .length ===
                      1
                        ? ''
                        : 'S'}
                    </span>
                  </div>

                  {data.riders.length ===
                  0 ? (
                    <p
                      style={
                        styles.empty
                      }
                    >
                      No delivery riders
                      have been approved
                      yet.
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
                              (
                                item
                              ) =>
                                item.id ===
                                rider.id
                            )

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
                                    toggleRider(
                                      rider
                                    )
                                  }
                                  disabled={
                                    statusUpdating
                                  }
                                  style={{
                                    ...styles.riderButton,
                                    opacity:
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

                <div
                  style={
                    styles.panel
                  }
                >
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
                        Manual rider approval
                        for users who have
                        not submitted an
                        application.
                      </p>
                    </div>
                  </div>

                  {availableRiderProfiles.length ===
                  0 ? (
                    <p
                      style={
                        styles.empty
                      }
                    >
                      No users are
                      currently
                      available for
                      rider approval.
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
                                profile.id
                              }
                              style={{
                                ...styles.riderButton,
                                opacity:
                                  riderAction ===
                                  profile.id
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

            {/* VENDOR PAYOUTS */}
            <section>
              <div
                style={
                  styles.sectionHeading
                }
              >
                Vendor Payouts
              </div>

              <div
                style={
                  styles.payoutGrid
                }
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

            {/* RECENT ORDERS */}
            <section>
              <div
                style={
                  styles.sectionHeading
                }
              >
                Recent Orders
              </div>

              <div
                style={
                  styles.panel
                }
              >
                {data.orders.length ===
                0 ? (
                  <p
                    style={
                      styles.empty
                    }
                  >
                    No orders recorded
                    yet.
                  </p>
                ) : (
                  <div
                    style={
                      styles.tableWrapper
                    }
                  >
                    <table
                      style={
                        styles.table
                      }
                    >
                      <thead>
                        <tr>
                          <th>
                            Order
                          </th>
                          <th>
                            Amount
                          </th>
                          <th>
                            Payment
                          </th>
                          <th>
                            Status
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {data.orders
                          .slice(
                            0,
                            8
                          )
                          .map(
                            (
                              order
                            ) => (
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

            {/* RECENT PAYOUT ACTIVITY */}
            <section>
              <div
                style={
                  styles.sectionHeading
                }
              >
                Recent Payout Activity
              </div>

              <div
                style={
                  styles.panel
                }
              >
                {data.payouts.length ===
                0 ? (
                  <p
                    style={
                      styles.empty
                    }
                  >
                    No payout activity
                    yet.
                  </p>
                ) : (
                  <div
                    style={
                      styles.tableWrapper
                    }
                  >
                    <table
                      style={
                        styles.table
                      }
                    >
                      <thead>
                        <tr>
                          <th>
                            Payout
                          </th>
                          <th>
                            Amount
                          </th>
                          <th>
                            Status
                          </th>
                          <th>
                            Reference
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {data.payouts
                          .slice(
                            0,
                            8
                          )
                          .map(
                            (
                              payout
                            ) => (
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

        <footer
          style={
            styles.footer
          }
        >
          UniAbuja Market • Admin
          Dashboard
        </footer>
      </div>
    </div>
  )
}

function formatStatus(value) {
  if (!value) return 'Unknown'

  return String(value)
    .replace(
      /_/g,
      ' '
    )
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase()
    )
}

function StatCard({
  label,
  value,
}) {
  return (
    <div
      style={
        styles.statCard
      }
    >
      <div
        style={
          styles.statValue
        }
      >
        {Number(
          value
        ).toLocaleString()}
      </div>

      <div
        style={
          styles.statLabel
        }
      >
        {label}
      </div>
    </div>
  )
}

function MoneyCard({
  label,
  value,
}) {
  return (
    <div
      style={
        styles.moneyCard
      }
    >
      <div
        style={
          styles.moneyAccent
        }
      />

      <div>
        <div
          style={
            styles.moneyLabel
          }
        >
          {label}
        </div>

        <div
          style={
            styles.moneyValue
          }
        >
          {value}
        </div>
      </div>
    </div>
  )
}

function StatusBadge({
  value,
}) {
  return (
    <span
      style={
        styles.statusBadge
      }
    >
      <span
        style={
          styles.statusDot
        }
      >
        ●
      </span>

      {formatStatus(
        value ||
          'unknown'
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
    padding:
      '28px 16px 50px',
  },

  container: {
    width: '100%',
    maxWidth: '1180px',
    margin: '0 auto',
  },

  header: {
    display: 'flex',
    justifyContent:
      'space-between',
    alignItems:
      'flex-start',
    gap: '20px',
    flexWrap: 'wrap',
    marginBottom:
      '32px',
  },

  eyebrow: {
    color: '#8b949e',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing:
      '1.5px',
    textTransform:
      'uppercase',
    marginBottom:
      '8px',
  },

  title: {
    margin: 0,
    color: '#f3f4f6',
    fontSize:
      'clamp(25px, 4vw, 36px)',
    fontWeight: 650,
    letterSpacing:
      '-0.8px',
  },

  subtitle: {
    margin:
      '8px 0 0',
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
    border:
      '1px solid #2b333a',
    borderRadius: '6px',
    padding:
      '9px 13px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600,
  },

  backButton: {
    background:
      'transparent',
    color: '#9da6ae',
    border:
      '1px solid #252c32',
    borderRadius: '6px',
    padding:
      '9px 13px',
    cursor: 'pointer',
    fontSize: '12px',
  },

  sectionHeading: {
    color: '#9ba4ac',
    fontSize: '12px',
    fontWeight: 600,
    margin:
      '26px 0 10px',
  },

  statsGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '10px',
  },

  statCard: {
    background: '#11161a',
    border:
      '1px solid #20272d',
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
    border:
      '1px solid #20272d',
    borderRadius: '8px',
    padding:
      '18px 18px 18px 20px',
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
    textTransform:
      'uppercase',
    letterSpacing:
      '.7px',
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
    border:
      '1px solid #20272d',
    borderRadius: '8px',
    padding: '19px',
    marginBottom: '10px',
  },

  panelHeader: {
    display: 'flex',
    justifyContent:
      'space-between',
    alignItems:
      'flex-start',
    gap: '15px',
    marginBottom:
      '20px',
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
    margin:
      '5px 0 0',
  },

  smallTag: {
    color: '#7f9299',
    background: '#171d21',
    border:
      '1px solid #293138',
    borderRadius: '4px',
    padding:
      '4px 7px',
    fontSize: '8px',
    whiteSpace:
      'nowrap',
  },

  chart: {
    height: '180px',
    display: 'flex',
    alignItems:
      'flex-end',
    justifyContent:
      'space-around',
    gap: '8px',
    borderBottom:
      '1px solid #252c31',
  },

  chartColumn: {
    height: '100%',
    flex: 1,
    display: 'flex',
    flexDirection:
      'column',
    alignItems:
      'center',
    justifyContent:
      'flex-end',
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
    alignItems:
      'flex-end',
    background: '#151a1e',
    borderRadius:
      '3px 3px 0 0',
  },

  chartBar: {
    width: '100%',
    minHeight: '2px',
    background: '#607d86',
    borderRadius:
      '3px 3px 0 0',
  },

  chartLabel: {
    color: '#68747c',
    fontSize: '9px',
  },

  paymentList: {
    display: 'flex',
    flexDirection:
      'column',
    gap: '20px',
    paddingTop: '8px',
  },

  paymentItem: {
    width: '100%',
  },

  paymentTop: {
    display: 'flex',
    justifyContent:
      'space-between',
    color: '#aeb7bd',
    fontSize: '11px',
    marginBottom:
      '7px',
  },

  progressTrack: {
    height: '6px',
    background: '#1a2024',
    borderRadius:
      '10px',
    overflow: 'hidden',
  },

  progressBar: {
    height: '100%',
    background: '#6d8991',
    borderRadius:
      '10px',
  },

  percentage: {
    display: 'block',
    color: '#69757d',
    fontSize: '9px',
    marginTop: '5px',
  },

  applicationList: {
    display: 'flex',
    flexDirection:
      'column',
    gap: '9px',
  },

  applicationCard: {
    display: 'flex',
    alignItems:
      'flex-start',
    justifyContent:
      'space-between',
    gap: '15px',
    padding: '14px',
    background: '#151a1e',
    border:
      '1px solid #252d33',
    borderRadius: '7px',
    flexWrap: 'wrap',
  },

  vendorApplicationCard: {
    display: 'flex',
    alignItems:
      'flex-start',
    justifyContent:
      'space-between',
    gap: '15px',
    padding: '14px',
    background: '#151a1e',
    border:
      '1px solid #252d33',
    borderRadius: '7px',
    flexWrap: 'wrap',
  },

  rejectedApplicationCard: {
    display: 'flex',
    alignItems:
      'flex-start',
    justifyContent:
      'space-between',
    gap: '15px',
    padding: '14px',
    background: '#151a1e',
    border:
      '1px solid #3b292d',
    borderRadius: '7px',
    flexWrap: 'wrap',
  },

  vendorManagementCard: {
    display: 'flex',
    alignItems:
      'center',
    justifyContent:
      'space-between',
    gap: '15px',
    padding: '14px',
    background: '#151a1e',
    border:
      '1px solid #252d33',
    borderRadius: '7px',
    flexWrap: 'wrap',
  },

  vendorManagementInfo: {
    display: 'flex',
    alignItems:
      'flex-start',
    gap: '16px',
    minWidth: '280px',
    flex: 1,
    flexWrap: 'wrap',
  },

  rejectedSection: {
    marginTop: '22px',
    paddingTop: '18px',
    borderTop:
      '1px solid #252c31',
  },

  rejectedHeader: {
    display: 'flex',
    justifyContent:
      'space-between',
    alignItems:
      'flex-start',
    gap: '15px',
    marginBottom:
      '12px',
  },

  rejectedTitle: {
    margin: 0,
    color: '#c5a8ad',
    fontSize: '12px',
    fontWeight: 600,
  },

  rejectedSubtitle: {
    color: '#707a83',
    fontSize: '10px',
    margin:
      '5px 0 0',
  },

  rejectedTag: {
    color: '#b58f96',
    background: '#21171a',
    border:
      '1px solid #3b292d',
    borderRadius: '4px',
    padding:
      '4px 7px',
    fontSize: '8px',
    whiteSpace:
      'nowrap',
  },

  vendorApplicationContent: {
    display: 'flex',
    alignItems:
      'flex-start',
    gap: '16px',
    minWidth: '280px',
    flex: 1,
    flexWrap: 'wrap',
  },

  storeLogo: {
    width: '90px',
    height: '90px',
    objectFit: 'cover',
    borderRadius: '7px',
    border:
      '1px solid #303940',
    display: 'block',
  },

  noStoreLogo: {
    width: '90px',
    height: '90px',
    display: 'flex',
    alignItems:
      'center',
    justifyContent:
      'center',
    background: '#171c20',
    border:
      '1px solid #303940',
    borderRadius: '7px',
    color: '#68747c',
    fontSize: '9px',
  },

  applicationContent: {
    display: 'flex',
    alignItems:
      'flex-start',
    gap: '16px',
    minWidth: '280px',
    flex: 1,
    flexWrap: 'wrap',
  },

  applicationVerification: {
    width: '120px',
    flexShrink: 0,
  },

  passportPhoto: {
    width: '90px',
    height: '90px',
    objectFit: 'cover',
    borderRadius: '7px',
    border:
      '1px solid #303940',
    display: 'block',
    cursor: 'pointer',
  },

  noPhoto: {
    width: '90px',
    height: '90px',
    display: 'flex',
    alignItems:
      'center',
    justifyContent:
      'center',
    background: '#171c20',
    border:
      '1px solid #303940',
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
    textDecoration:
      'none',
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
    border:
      '1px solid #395256',
    borderRadius: '5px',
    padding:
      '8px 13px',
    cursor: 'pointer',
    fontSize: '10px',
    fontWeight: 600,
  },

  rejectButton: {
    background: '#25181b',
    color: '#c99da3',
    border:
      '1px solid #4a2b30',
    borderRadius: '5px',
    padding:
      '8px 13px',
    cursor: 'pointer',
    fontSize: '10px',
    fontWeight: 600,
  },

  retryButton: {
    background: '#171d21',
    color: '#c7d0d4',
    border:
      '1px solid #344047',
    borderRadius: '5px',
    padding:
      '8px 13px',
    cursor: 'pointer',
    fontSize: '10px',
    fontWeight: 600,
  },

  deliveryStatsGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(auto-fit, minmax(130px, 1fr))',
    gap: '8px',
    marginBottom:
      '10px',
  },

  deliveryStatCard: {
    background: '#11161a',
    border:
      '1px solid #20272d',
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
    flexDirection:
      'column',
    gap: '5px',
    minWidth: '145px',
  },

  statusSelect: {
    width: '100%',
    background: '#171c20',
    color: '#cbd2d6',
    border:
      '1px solid #303940',
    borderRadius: '5px',
    padding:
      '6px 8px',
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
    flexDirection:
      'column',
    gap: '8px',
  },

  riderRow: {
    display: 'flex',
    alignItems:
      'center',
    justifyContent:
      'space-between',
    gap: '12px',
    padding: '12px',
    background: '#151a1e',
    border:
      '1px solid #252d33',
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
    alignItems:
      'center',
    gap: '7px',
    flexWrap: 'wrap',
    justifyContent:
      'flex-end',
  },

  riderButton: {
    flexShrink: 0,
    background: '#171d21',
    color: '#c7d0d4',
    border:
      '1px solid #344047',
    borderRadius: '5px',
    padding:
      '7px 9px',
    cursor: 'pointer',
    fontSize: '9px',
    fontWeight: 600,
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
    borderCollapse:
      'collapse',
    fontSize: '11px',
  },

  orderId: {
    color: '#aeb8be',
    fontFamily:
      'monospace',
  },

  statusBadge: {
    display:
      'inline-flex',
    alignItems:
      'center',
    gap: '5px',
    color: '#aab4ba',
    background: '#171c20',
    border:
      '1px solid #293137',
    borderRadius: '4px',
    padding:
      '4px 7px',
    fontSize: '9px',
    whiteSpace:
      'nowrap',
  },

  statusDot: {
    color: '#71868d',
    fontSize: '7px',
  },

  reference: {
    color: '#68747c',
    fontFamily:
      'monospace',
    fontSize: '9px',
  },

  dateText: {
    color: '#69757d',
    fontSize: '10px',
    whiteSpace:
      'nowrap',
  },

  tableNote: {
    color: '#5f6a72',
    fontSize: '9px',
    margin:
      '12px 0 0',
  },

  empty: {
    color: '#69747c',
    fontSize: '12px',
  },

  errorBox: {
    background: '#191113',
    border:
      '1px solid #40272b',
    borderRadius: '8px',
    padding: '18px',
    color: '#d9b8bc',
    marginBottom:
      '15px',
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
    marginBottom:
      '15px',
  },

  footer: {
    color: '#4f5960',
    fontSize: '9px',
    textAlign: 'center',
    marginTop: '35px',
    paddingTop: '20px',
    borderTop:
      '1px solid #1b2125',
  },
}