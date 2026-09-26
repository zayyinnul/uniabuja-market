import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

const formatNaira = (amount) =>
  `₦${Number(amount || 0).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

const formatDate = (date) =>
  new Date(date).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

const getStatusLabel = (status) => {
  if (status === 'eligible') return 'Available'
  if (status === 'pending') return 'Pending'
  if (status === 'processing') return 'Processing'
  if (status === 'paid') return 'Paid'
  if (status === 'failed') return 'Failed'
  if (status === 'reversed') return 'Reversed'

  return status || 'Unknown'
}

function VendorEarnings({ onBack }) {
  const [loading, setLoading] = useState(true)
  const [commissions, setCommissions] = useState([])
  const [payouts, setPayouts] = useState([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadEarnings()
  }, [])

  const loadEarnings = async () => {
    setLoading(true)
    setMessage('')

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError) throw userError

      if (!user) {
        throw new Error('Please log in again.')
      }

      const [commissionsResult, payoutsResult] =
        await Promise.all([
          supabase
            .from('vendor_commissions')
            .select(
              `
                id,
                vendor_order_id,
                order_id,
                sale_amount,
                vendor_amount,
                status,
                created_at
              `
            )
            .eq('vendor_id', user.id)
            .order('created_at', { ascending: false }),

          supabase
            .from('vendor_payouts')
            .select(
              `
                id,
                vendor_commission_id,
                vendor_order_id,
                order_id,
                payout_amount,
                status,
                paystack_reference,
                created_at,
                updated_at,
                paid_at
              `
            )
            .eq('vendor_id', user.id)
            .order('created_at', { ascending: false }),
        ])

      if (commissionsResult.error) {
        throw commissionsResult.error
      }

      if (payoutsResult.error) {
        throw payoutsResult.error
      }

      setCommissions(commissionsResult.data || [])
      setPayouts(payoutsResult.data || [])
    } catch (error) {
      console.error('Vendor earnings error:', error)

      setMessage(
        error.message || 'Could not load your earnings.'
      )
    } finally {
      setLoading(false)
    }
  }

  const totalSales = commissions.reduce(
    (sum, item) => sum + Number(item.sale_amount || 0),
    0
  )

  const totalEarnings = commissions.reduce(
    (sum, item) => sum + Number(item.vendor_amount || 0),
    0
  )

  const processingPayout = payouts
    .filter((item) => item.status === 'processing')
    .reduce(
      (sum, item) =>
        sum + Number(item.payout_amount || 0),
      0
    )

  const paidOut = payouts
    .filter((item) => item.status === 'paid')
    .reduce(
      (sum, item) =>
        sum + Number(item.payout_amount || 0),
      0
    )

  const payoutAmountsByCommission = {}

  payouts.forEach((payout) => {
    if (!payout.vendor_commission_id) return

    if (
      payout.status === 'processing' ||
      payout.status === 'paid'
    ) {
      payoutAmountsByCommission[
        payout.vendor_commission_id
      ] =
        (payoutAmountsByCommission[
          payout.vendor_commission_id
        ] || 0) +
        Number(payout.payout_amount || 0)
    }
  })

  const availableForPayout = commissions
    .filter((item) => item.status === 'eligible')
    .reduce((sum, item) => {
      const earnings = Number(item.vendor_amount || 0)

      const alreadyPayout =
        payoutAmountsByCommission[item.id] || 0

      return (
        sum +
        Math.max(earnings - alreadyPayout, 0)
      )
    }, 0)

  const totalOrders = new Set(
    commissions.map((item) => item.vendor_order_id)
  ).size

  const recentEarnings = commissions.slice(0, 10)

  if (loading) {
    return (
      <div
        style={{
          maxWidth: '1100px',
          margin: '0 auto',
          padding: '24px 16px',
        }}
      >
        <div
          style={{
            background: '#fff',
            borderRadius: '14px',
            padding: '30px',
            textAlign: 'center',
          }}
        >
          <h2 style={{ marginBottom: '8px' }}>
            Earnings & Sales
          </h2>

          <p style={{ color: '#666', margin: 0 }}>
            Loading your earnings...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        maxWidth: '1100px',
        margin: '0 auto',
        padding: '20px 16px 40px',
      }}
    >
      {/* HEADER */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '24px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <button
            type="button"
            onClick={onBack}
            style={{
              border: 'none',
              background: 'transparent',
              padding: '0',
              marginBottom: '10px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
            }}
          >
            ← Back to Dashboard
          </button>

          <h2
            style={{
              margin: 0,
              fontSize: '28px',
            }}
          >
            Earnings & Sales
          </h2>

          <p
            style={{
              margin: '6px 0 0',
              color: '#666',
            }}
          >
            Track your sales, earnings and payouts.
          </p>
        </div>

        <button
          type="button"
          onClick={loadEarnings}
          style={{
            padding: '10px 16px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: '600',
          }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* ERROR / MESSAGE */}
      {message && (
        <div
          style={{
            padding: '12px 14px',
            marginBottom: '18px',
            borderRadius: '10px',
            background: '#fff3cd',
            color: '#664d03',
          }}
        >
          {message}
        </div>
      )}

      {/* SUMMARY */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '14px',
          marginBottom: '26px',
        }}
      >
        {/* TOTAL SALES */}
        <div
          style={{
            background: '#fff',
            borderRadius: '14px',
            padding: '20px',
            boxShadow:
              '0 2px 10px rgba(0,0,0,0.06)',
          }}
        >
          <div
            style={{
              fontSize: '14px',
              color: '#666',
              marginBottom: '9px',
            }}
          >
            Total Sales
          </div>

          <div
            style={{
              fontSize: '25px',
              fontWeight: '700',
            }}
          >
            {formatNaira(totalSales)}
          </div>
        </div>

        {/* ORDERS */}
        <div
          style={{
            background: '#fff',
            borderRadius: '14px',
            padding: '20px',
            boxShadow:
              '0 2px 10px rgba(0,0,0,0.06)',
          }}
        >
          <div
            style={{
              fontSize: '14px',
              color: '#666',
              marginBottom: '9px',
            }}
          >
            Orders
          </div>

          <div
            style={{
              fontSize: '25px',
              fontWeight: '700',
            }}
          >
            {totalOrders}
          </div>
        </div>

        {/* YOUR EARNINGS */}
        <div
          style={{
            background: '#fff',
            borderRadius: '14px',
            padding: '20px',
            boxShadow:
              '0 2px 10px rgba(0,0,0,0.06)',
          }}
        >
          <div
            style={{
              fontSize: '14px',
              color: '#666',
              marginBottom: '9px',
            }}
          >
            Your Earnings
          </div>

          <div
            style={{
              fontSize: '25px',
              fontWeight: '700',
            }}
          >
            {formatNaira(totalEarnings)}
          </div>
        </div>

        {/* AVAILABLE */}
        <div
          style={{
            background: '#fff',
            borderRadius: '14px',
            padding: '20px',
            boxShadow:
              '0 2px 10px rgba(0,0,0,0.06)',
          }}
        >
          <div
            style={{
              fontSize: '14px',
              color: '#666',
              marginBottom: '9px',
            }}
          >
            Available to Withdraw
          </div>

          <div
            style={{
              fontSize: '25px',
              fontWeight: '700',
            }}
          >
            {formatNaira(availableForPayout)}
          </div>
        </div>

        {/* PROCESSING */}
        <div
          style={{
            background: '#fff',
            borderRadius: '14px',
            padding: '20px',
            boxShadow:
              '0 2px 10px rgba(0,0,0,0.06)',
          }}
        >
          <div
            style={{
              fontSize: '14px',
              color: '#666',
              marginBottom: '9px',
            }}
          >
            Processing Payout
          </div>

          <div
            style={{
              fontSize: '25px',
              fontWeight: '700',
            }}
          >
            {formatNaira(processingPayout)}
          </div>
        </div>

        {/* PAID OUT */}
        <div
          style={{
            background: '#fff',
            borderRadius: '14px',
            padding: '20px',
            boxShadow:
              '0 2px 10px rgba(0,0,0,0.06)',
          }}
        >
          <div
            style={{
              fontSize: '14px',
              color: '#666',
              marginBottom: '9px',
            }}
          >
            Paid Out
          </div>

          <div
            style={{
              fontSize: '25px',
              fontWeight: '700',
            }}
          >
            {formatNaira(paidOut)}
          </div>
        </div>
      </div>

      {/* RECENT SALES */}
      <div
        style={{
          background: '#fff',
          borderRadius: '14px',
          padding: '20px',
          marginBottom: '20px',
          boxShadow:
            '0 2px 10px rgba(0,0,0,0.06)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}
        >
          <h3 style={{ margin: 0 }}>
            Recent Sales
          </h3>

          <span
            style={{
              fontSize: '13px',
              color: '#777',
            }}
          >
            Latest activity
          </span>
        </div>

        {recentEarnings.length === 0 ? (
          <p
            style={{
              color: '#666',
              marginBottom: 0,
            }}
          >
            You don't have any sales yet.
          </p>
        ) : (
          <div>
            {recentEarnings.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '15px',
                  padding: '15px 0',
                  borderTop:
                    '1px solid #eeeeee',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div
                    style={{
                      fontWeight: '600',
                      marginBottom: '5px',
                    }}
                  >
                    Order #
                    {item.order_id.slice(0, 8)}
                  </div>

                  <div
                    style={{
                      fontSize: '13px',
                      color: '#777',
                    }}
                  >
                    {formatDate(item.created_at)}
                  </div>
                </div>

                <div
                  style={{
                    textAlign: 'right',
                  }}
                >
                  <div
                    style={{
                      fontWeight: '700',
                      marginBottom: '5px',
                    }}
                  >
                    {formatNaira(
                      item.vendor_amount
                    )}
                  </div>

                  <div
                    style={{
                      fontSize: '13px',
                      color:
                        item.status === 'eligible'
                          ? '#16803c'
                          : '#777',
                    }}
                  >
                    {getStatusLabel(item.status)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* PAYOUT HISTORY */}
      <div
        style={{
          background: '#fff',
          borderRadius: '14px',
          padding: '20px',
          marginBottom: '20px',
          boxShadow:
            '0 2px 10px rgba(0,0,0,0.06)',
        }}
      >
        <div
          style={{
            marginBottom: '16px',
          }}
        >
          <h3 style={{ margin: 0 }}>
            Payout History
          </h3>

          <p
            style={{
              margin: '5px 0 0',
              color: '#777',
              fontSize: '13px',
            }}
          >
            Your previous and current payout activity.
          </p>
        </div>

        {payouts.length === 0 ? (
          <p
            style={{
              color: '#666',
              marginBottom: 0,
            }}
          >
            No payouts yet.
          </p>
        ) : (
          <div>
            {payouts.map((payout) => (
              <div
                key={payout.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '15px',
                  padding: '15px 0',
                  borderTop:
                    '1px solid #eeeeee',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div
                    style={{
                      fontWeight: '600',
                      marginBottom: '5px',
                    }}
                  >
                    Vendor Payout
                  </div>

                  <div
                    style={{
                      fontSize: '13px',
                      color: '#777',
                    }}
                  >
                    {formatDate(
                      payout.created_at
                    )}
                  </div>
                </div>

                <div
                  style={{
                    textAlign: 'right',
                  }}
                >
                  <div
                    style={{
                      fontWeight: '700',
                      marginBottom: '5px',
                    }}
                  >
                    {formatNaira(
                      payout.payout_amount
                    )}
                  </div>

                  <div
                    style={{
                      fontSize: '13px',
                      color:
                        payout.status === 'paid'
                          ? '#16803c'
                          : payout.status ===
                              'failed' ||
                            payout.status ===
                              'reversed'
                          ? '#c62828'
                          : '#777',
                    }}
                  >
                    {getStatusLabel(
                      payout.status
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* PAYOUT ACCOUNT */}
      <div
        style={{
          background: '#f7f7f7',
          borderRadius: '14px',
          padding: '18px',
          textAlign: 'center',
        }}
      >
        <p
          style={{
            margin: '0 0 12px',
            color: '#666',
            fontSize: '14px',
          }}
        >
          Payouts are sent to your verified payout
          account.
        </p>

        <p
          style={{
            margin: 0,
            color: '#777',
            fontSize: '13px',
          }}
        >
          To change your payout account, return to
          the dashboard and open{' '}
          <strong>Manage Payout Account</strong>.
        </p>
      </div>
    </div>
  )
}

export default VendorEarnings