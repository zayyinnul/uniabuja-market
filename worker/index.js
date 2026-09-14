function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      ...extraHeaders,
    },
  })
}

function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=UTF-8',
    },
  })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        },
      })
    }

    if (url.pathname === '/api/health') {
      return jsonResponse({
        success: true,
        message: 'UniAbuja Market API is running',
      })
    }

    if (
      url.pathname === '/api/payments/initialize' &&
      request.method === 'POST'
    ) {
      try {
        const authHeader = request.headers.get('Authorization')

        if (!authHeader?.startsWith('Bearer ')) {
          return jsonResponse(
            { success: false, message: 'You must be logged in' },
            401
          )
        }

        const accessToken = authHeader.replace('Bearer ', '').trim()
        const body = await request.json()
        const { order_id } = body

        if (!order_id) {
          return jsonResponse(
            { success: false, message: 'Order ID is required' },
            400
          )
        }

        const internalReference = `UM-${order_id}-${crypto.randomUUID()}`

        const prepareResponse = await fetch(
          `${env.SUPABASE_URL}/rest/v1/rpc/prepare_order_payment`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: env.SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              p_order_id: order_id,
              p_reference: internalReference,
            }),
          }
        )

        const prepareData = await prepareResponse.json()

        if (!prepareResponse.ok) {
          return jsonResponse(
            {
              success: false,
              message:
                prepareData.message ||
                prepareData.error ||
                'Could not prepare order for payment',
            },
            400
          )
        }

        if (!Array.isArray(prepareData) || !prepareData.length) {
          return jsonResponse(
            {
              success: false,
              message: 'Could not prepare order for payment',
            },
            400
          )
        }

        const paymentInfo = prepareData[0]

        const amountInKobo = Math.round(
          Number(paymentInfo.total_amount) * 100
        )

        if (!Number.isFinite(amountInKobo) || amountInKobo <= 0) {
          return jsonResponse(
            {
              success: false,
              message: 'Invalid order amount',
            },
            400
          )
        }

        const paystackResponse = await fetch(
          'https://api.paystack.co/transaction/initialize',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: paymentInfo.customer_email,
              amount: amountInKobo,
              reference: internalReference,
              currency: 'NGN',
              callback_url: `${url.origin}/payment/callback`,
            }),
          }
        )

        const paystackData = await paystackResponse.json()

        if (
          !paystackResponse.ok ||
          !paystackData.status ||
          !paystackData.data?.authorization_url ||
          !paystackData.data?.reference
        ) {
          return jsonResponse(
            {
              success: false,
              message:
                paystackData.message ||
                'Paystack could not initialize the payment',
            },
            400
          )
        }

        const paystackReference = paystackData.data.reference

        const updateOrderResponse = await fetch(
          `${env.SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(
            order_id
          )}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              apikey: env.SUPABASE_SECRET_KEY,
              Prefer: 'return=minimal',
            },
            body: JSON.stringify({
              payment_reference: paystackReference,
              payment_status: 'pending',
              updated_at: new Date().toISOString(),
            }),
          }
        )

        if (!updateOrderResponse.ok) {
          const updateError = await updateOrderResponse.text()

          console.error(
            'Could not save Paystack reference:',
            updateError
          )

          return jsonResponse(
            {
              success: false,
              message:
                'Payment was initialized but the order could not be updated.',
            },
            500
          )
        }

        console.log(
          'Payment initialized successfully:',
          paystackReference
        )

        return jsonResponse({
          success: true,
          authorization_url: paystackData.data.authorization_url,
          reference: paystackReference,
        })
      } catch (error) {
        console.error(
          'Payment initialization error:',
          error
        )

        return jsonResponse(
          {
            success: false,
            message:
              error.message ||
              'Payment initialization failed',
          },
          500
        )
      }
    }

    if (
      url.pathname === '/payment/callback' &&
      request.method === 'GET'
    ) {
      try {
        const reference = url.searchParams.get('reference')

        if (!reference) {
          return htmlResponse(
            `
            <html>
              <body>
                <h2>Payment reference missing</h2>
                <p>We could not identify this payment.</p>
              </body>
            </html>
            `,
            400
          )
        }

        console.log(
          'Paystack callback reference:',
          reference
        )

        const verifyResponse = await fetch(
          `https://api.paystack.co/transaction/verify/${encodeURIComponent(
            reference
          )}`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
            },
          }
        )

        const verifyData = await verifyResponse.json()

        if (
          !verifyResponse.ok ||
          !verifyData.status ||
          verifyData.data?.status !== 'success'
        ) {
          console.error(
            'Paystack verification failed:',
            verifyData
          )

          return htmlResponse(
            `
            <html>
              <body>
                <h2>Payment was not completed</h2>
                <p>Please try the payment again.</p>
                <p>Reference: ${reference}</p>
              </body>
            </html>
            `,
            400
          )
        }

        const transaction = verifyData.data

        const orderResponse = await fetch(
          `${env.SUPABASE_URL}/rest/v1/orders?payment_reference=eq.${encodeURIComponent(
            reference
          )}&select=id,total_amount,payment_reference,payment_status`,
          {
            method: 'GET',
            headers: {
              apikey: env.SUPABASE_SECRET_KEY,
            },
          }
        )

        const orders = await orderResponse.json()

        if (!orderResponse.ok || !orders.length) {
          console.error(
            'Order not found for payment reference:',
            reference
          )

          return htmlResponse(
            `
            <html>
              <body>
                <h2>Order not found</h2>
                <p>We could not match this payment to an order.</p>
                <p>Reference: ${reference}</p>
              </body>
            </html>
            `,
            404
          )
        }

        const order = orders[0]

        const paidAmount = Number(transaction.amount)
        const expectedAmount = Math.round(
          Number(order.total_amount) * 100
        )

        if (paidAmount !== expectedAmount) {
          console.error(
            'Payment amount mismatch:',
            {
              paidAmount,
              expectedAmount,
            }
          )

          return htmlResponse(
            `
            <html>
              <body>
                <h2>Payment amount mismatch</h2>
                <p>The amount paid does not match the order.</p>
              </body>
            </html>
            `,
            400
          )
        }

        if (order.payment_reference !== reference) {
          return htmlResponse(
            `
            <html>
              <body>
                <h2>Payment reference mismatch</h2>
                <p>
                  This payment could not be safely matched
                  to the order.
                </p>
              </body>
            </html>
            `,
            400
          )
        }

        const paidResponse = await fetch(
          `${env.SUPABASE_URL}/rest/v1/rpc/mark_order_payment_paid`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: env.SUPABASE_SECRET_KEY,
            },
            body: JSON.stringify({
              p_order_id: order.id,
              p_reference: reference,
            }),
          }
        )

        const paidData = await paidResponse.json()

        if (!paidResponse.ok || paidData !== true) {
          console.error(
            'Could not mark order as paid:',
            paidData
          )

          return htmlResponse(
            `
            <html>
              <head>
                <title>Payment Received</title>
              </head>
              <body>
                <h2>Payment received</h2>
                <p>
                  Your payment was received, but confirmation
                  is still being processed.
                </p>
              </body>
            </html>
            `,
            500
          )
        }

        return htmlResponse(
          `
          <html>
            <head>
              <title>Payment Successful</title>
            </head>
            <body>
              <h2>Payment successful 🎉</h2>
              <p>Your order has been paid successfully.</p>
              <p>Reference: ${reference}</p>
              <p>You can return to UniAbuja Market.</p>
            </body>
          </html>
          `,
          200
        )
      } catch (error) {
        console.error(
          'Payment verification error:',
          error
        )

        return htmlResponse(
          `
          <html>
            <head>
              <title>Payment Verification Failed</title>
            </head>
            <body>
              <h2>Payment verification failed</h2>
              <p>
                ${
                  error.message ||
                  'An unexpected error occurred.'
                }
              </p>
            </body>
          </html>
          `,
          500
        )
      }
    }

    return env.ASSETS.fetch(request)
  },
}