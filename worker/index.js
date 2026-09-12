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

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    // CORS preflight
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

    // Health check
    if (url.pathname === '/api/health') {
      return jsonResponse({
        success: true,
        message: 'UniAbuja Market API is running',
      })
    }

    // Start Paystack payment
    if (
      url.pathname === '/api/payments/initialize' &&
      request.method === 'POST'
    ) {
      try {
        const authHeader = request.headers.get('Authorization')

        if (!authHeader?.startsWith('Bearer ')) {
          return jsonResponse(
            {
              success: false,
              message: 'You must be logged in',
            },
            401
          )
        }

        const accessToken = authHeader.replace('Bearer ', '').trim()

        const body = await request.json()
        const { order_id } = body

        if (!order_id) {
          return jsonResponse(
            {
              success: false,
              message: 'Order ID is required',
            },
            400
          )
        }

        const reference = `UM-${order_id}-${crypto.randomUUID()}`

        const supabaseResponse = await fetch(
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
              p_reference: reference,
            }),
          }
        )

        const supabaseData = await supabaseResponse.json()

        if (!supabaseResponse.ok) {
          return jsonResponse(
            {
              success: false,
              message:
                supabaseData.message ||
                supabaseData.error ||
                'Could not prepare order for payment',
            },
            400
          )
        }

        if (!supabaseData.length) {
          return jsonResponse(
            {
              success: false,
              message: 'Could not prepare order for payment',
            },
            400
          )
        }

        const paymentInfo = supabaseData[0]

        const amountInKobo = Math.round(
          Number(paymentInfo.total_amount) * 100
        )

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
              reference,
              currency: 'NGN',
              callback_url: `${url.origin}/payment/callback`,
            }),
          }
        )

        const paystackData = await paystackResponse.json()

        if (!paystackResponse.ok || !paystackData.status) {
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

        return jsonResponse({
          success: true,
          authorization_url: paystackData.data.authorization_url,
          reference: paystackData.data.reference,
        })
      } catch (error) {
        return jsonResponse(
          {
            success: false,
            message: error.message || 'Payment initialization failed',
          },
          500
        )
      }
    }

    return jsonResponse(
      {
        success: false,
        message: 'Not found',
      },
      404
    )
  },
}