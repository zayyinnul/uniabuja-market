import webpush from 'web-push'

const VAPID_PUBLIC_KEY =
  'BKiYiAZbJUhiZjGYq1F8wc4lpYZ2uL_6g4bxuOSXdYGERyaQ3fllqbKDWkivPAamYXXTZriEOE-o23n22i9DqGg'

const VAPID_SUBJECT =
  'https://uniabuja-market.mammanabideen.workers.dev'

const SUBSCRIPTION_GRACE_DAYS = 5

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers':
        'Content-Type, Authorization, x-paystack-signature, x-push-webhook-secret',
      'Access-Control-Allow-Methods':
        'GET, POST, OPTIONS',
      ...extraHeaders,
    },
  })
}

function getAppUrl(env, request) {
  return (
    env.APP_URL ||
    new URL(request.url).origin
  ).replace(/\/+$/, '')
}

async function supabaseRequest(
  env,
  path,
  options = {}
) {
  const supabaseKey =
    env.SUPABASE_SERVICE_ROLE_KEY ||
    env.SUPABASE_SECRET_KEY ||
    env.SUPABASE_PUBLISHABLE_KEY

  const headers = {
    apikey: supabaseKey,
    ...options.headers,
  }

  if (!supabaseKey.startsWith('sb_secret_')) {
    headers.Authorization = `Bearer ${supabaseKey}`
  }

  return fetch(
    `${env.SUPABASE_URL}${path}`,
    {
      ...options,
      headers,
    }
  )
}

async function getAuthenticatedUser(
  request,
  env
) {
  const authHeader =
    request.headers.get(
      'Authorization'
    )

  if (
    !authHeader?.startsWith(
      'Bearer '
    )
  ) {
    return null
  }

  const accessToken =
    authHeader
      .replace(
        'Bearer ',
        ''
      )
      .trim()

  if (!accessToken) {
    return null
  }

  const response =
    await fetch(
      `${env.SUPABASE_URL}/auth/v1/user`,
      {
        method: 'GET',
        headers: {
          apikey:
            env.SUPABASE_PUBLISHABLE_KEY,
          Authorization:
            `Bearer ${accessToken}`,
        },
      }
    )

  if (!response.ok) {
    return null
  }

  try {
    return await response.json()
  } catch {
    return null
  }
}

async function updateVendorPayout(
  env,
  payoutId,
  updates
) {
  const response =
    await supabaseRequest(
      env,
      `/rest/v1/vendor_payouts?id=eq.${encodeURIComponent(
        payoutId
      )}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type':
            'application/json',
          Prefer:
            'return=minimal',
        },
        body: JSON.stringify({
          ...updates,
          updated_at:
            new Date().toISOString(),
        }),
      }
    )

  if (!response.ok) {
    console.error(
      `Could not update vendor payout ${payoutId}:`,
      await response.text()
    )
  }

  return response
}

async function deletePushSubscription(
  env,
  subscriptionId
) {
  const response =
    await supabaseRequest(
      env,
      `/rest/v1/push_subscriptions?id=eq.${encodeURIComponent(
        subscriptionId
      )}`,
      {
        method: 'DELETE',
        headers: {
          Prefer:
            'return=minimal',
        },
      }
    )

  if (!response.ok) {
    console.error(
      `Could not delete push subscription ${subscriptionId}:`,
      await response.text()
    )
  }

  return response
}

// ---------------------------------------------------------
// PUSH NOTIFICATIONS
// ---------------------------------------------------------

async function sendPushNotification(
  env,
  notification
) {
  const subscriptionsResponse =
    await supabaseRequest(
      env,
      `/rest/v1/push_subscriptions?user_id=eq.${encodeURIComponent(
        notification.user_id
      )}&select=id,endpoint,p256dh,auth`,
      {
        method: 'GET',
      }
    )

  let subscriptions = null

  try {
    subscriptions =
      await subscriptionsResponse.json()
  } catch {
    subscriptions = null
  }

  if (
    !subscriptionsResponse.ok ||
    !Array.isArray(
      subscriptions
    )
  ) {
    console.error(
      'Could not load push subscriptions:',
      subscriptions
    )

    return {
      sent: 0,
      failed: 1,
      removed: 0,
    }
  }

  if (!subscriptions.length) {
    console.log(
      `No push subscriptions found for user ${notification.user_id}.`
    )

    return {
      sent: 0,
      failed: 0,
      removed: 0,
    }
  }

  console.log(
    `Found ${subscriptions.length} push subscription(s) for user ${notification.user_id}.`
  )

  webpush.setVapidDetails(
    VAPID_SUBJECT,
    VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY
  )

  let sent = 0
  let failed = 0
  let removed = 0

  const notificationUrl =
    notification.url ||
    notification.data?.url ||
    '/'

  const payload =
    JSON.stringify({
      title:
        notification.title ||
        'UniAbuja Market',
      message:
        notification.message ||
        'You have a new notification.',
      body:
        notification.message ||
        'You have a new notification.',
      url:
        notificationUrl,
      data: {
        url:
          notificationUrl,
        notification_id:
          notification.id ||
          null,
        type:
          notification.type ||
          'notification',
        title:
          notification.title ||
          'UniAbuja Market',
        body:
          notification.message ||
          'You have a new notification.',
      },
    })

  for (
    const subscriptionRow of
      subscriptions
  ) {
    const subscription = {
      endpoint:
        subscriptionRow.endpoint,
      keys: {
        p256dh:
          subscriptionRow.p256dh,
        auth:
          subscriptionRow.auth,
      },
    }

    try {
      await webpush.sendNotification(
        subscription,
        payload
      )

      sent++

      console.log(
        `Push notification sent successfully to subscription ${subscriptionRow.id}.`
      )
    } catch (error) {
      const statusCode =
        error?.statusCode

      console.error(
        `Push notification failed for subscription ${subscriptionRow.id}:`,
        JSON.stringify({
          statusCode,
          message:
            error?.message ||
            'Unknown push error',
        })
      )

      failed++

      if (
        statusCode === 404 ||
        statusCode === 410
      ) {
        await deletePushSubscription(
          env,
          subscriptionRow.id
        )

        removed++

        console.log(
          `Removed expired push subscription ${subscriptionRow.id}.`
        )
      }
    }
  }

  console.log(
    `Push result for ${notification.user_id}: sent=${sent}, failed=${failed}, removed=${removed}`
  )

  return {
    sent,
    failed,
    removed,
  }
}

// ---------------------------------------------------------
// PAYSTACK WEBHOOK SIGNATURE
// ---------------------------------------------------------

function arrayBufferToHex(buffer) {
  return [
    ...new Uint8Array(buffer),
  ]
    .map((byte) =>
      byte
        .toString(16)
        .padStart(2, '0')
    )
    .join('')
}

async function createHmacSha512Hex(
  secret,
  payload
) {
  const encoder =
    new TextEncoder()

  const key =
    await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      {
        name: 'HMAC',
        hash: 'SHA-512',
      },
      false,
      ['sign']
    )

  const signature =
    await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(payload)
    )

  return arrayBufferToHex(
    signature
  )
}

function safeEqual(a, b) {
  if (
    typeof a !== 'string' ||
    typeof b !== 'string' ||
    a.length !== b.length
  ) {
    return false
  }

  let result = 0

  for (
    let i = 0;
    i < a.length;
    i++
  ) {
    result |=
      a.charCodeAt(i) ^
      b.charCodeAt(i)
  }

  return result === 0
}

// ---------------------------------------------------------
// PAYSTACK TRANSFER STATUS RECONCILIATION
// ---------------------------------------------------------

async function reconcileTransfer(
  env,
  payout
) {
  const reference =
    payout.paystack_reference

  if (!reference) {
    return {
      found: false,
      temporaryError: false,
    }
  }

  const verifyResponse =
    await fetch(
      `https://api.paystack.co/transfer/verify/${encodeURIComponent(
        reference
      )}`,
      {
        method: 'GET',
        headers: {
          Authorization:
            `Bearer ${env.PAYSTACK_SECRET_KEY}`,
        },
      }
    )

  let verifyData = null

  try {
    verifyData =
      await verifyResponse.json()
  } catch {
    console.error(
      'Paystack transfer verification returned invalid JSON.'
    )

    return {
      found: false,
      temporaryError: true,
    }
  }

  if (
    verifyResponse.status ===
    404
  ) {
    return {
      found: false,
      temporaryError: false,
    }
  }

  if (!verifyResponse.ok) {
    console.error(
      'Paystack transfer verification failed:',
      JSON.stringify({
        httpStatus:
          verifyResponse.status,
        paystackStatus:
          verifyData?.status,
        message:
          verifyData?.message,
      })
    )

    return {
      found: false,
      temporaryError: true,
    }
  }

  if (
    !verifyData?.status ||
    !verifyData?.data
  ) {
    console.error(
      'Paystack returned an unexpected transfer verification response:',
      verifyData
    )

    return {
      found: false,
      temporaryError: true,
    }
  }

  const transfer =
    verifyData.data

  const transferStatus =
    transfer.status

  console.log(
    `Payout ${payout.id} transfer status: ${transferStatus}`
  )

  if (
    transferStatus ===
    'success'
  ) {
    await updateVendorPayout(
      env,
      payout.id,
      {
        status: 'paid',
        paid_at:
          new Date().toISOString(),
        failure_reason: null,
      }
    )

    return {
      found: true,
      terminal: true,
    }
  }

  if (
    transferStatus ===
    'failed'
  ) {
    await updateVendorPayout(
      env,
      payout.id,
      {
        status: 'failed',
        failure_reason:
          transfer.reason ||
          'Paystack transfer failed',
      }
    )

    return {
      found: true,
      terminal: true,
    }
  }

  if (
    transferStatus ===
    'reversed'
  ) {
    await updateVendorPayout(
      env,
      payout.id,
      {
        status: 'reversed',
        failure_reason:
          transfer.reason ||
          'Paystack transfer was reversed',
      }
    )

    return {
      found: true,
      terminal: true,
    }
  }

  return {
    found: true,
    terminal: false,
  }
}

// ---------------------------------------------------------
// PROCESS ONE VENDOR PAYOUT
// ---------------------------------------------------------

async function processVendorPayout(
  env,
  payout
) {
  const reference =
    payout.paystack_reference

  if (!reference) {
    console.error(
      `Payout ${payout.id} has no Paystack reference`
    )

    return
  }

  const transferCheck =
    await reconcileTransfer(
      env,
      payout
    )

  if (
    transferCheck.temporaryError
  ) {
    console.log(
      `Payout ${payout.id}: temporary Paystack verification problem. Leaving payout processing.`
    )

    return
  }

  if (
    transferCheck.found
  ) {
    return
  }

  const accountResponse =
    await supabaseRequest(
      env,
      `/rest/v1/vendor_payout_accounts?vendor_id=eq.${encodeURIComponent(
        payout.vendor_id
      )}&select=vendor_id,paystack_recipient_code,is_verified,is_active&limit=1`,
      {
        method: 'GET',
      }
    )

  let accountData = null

  try {
    accountData =
      await accountResponse.json()
  } catch {
    console.error(
      `Could not read payout account response for vendor ${payout.vendor_id}`
    )

    return
  }

  if (
    !accountResponse.ok ||
    !Array.isArray(
      accountData
    ) ||
    !accountData.length
  ) {
    console.error(
      `No payout account found for vendor ${payout.vendor_id}`
    )

    return
  }

  const account =
    accountData[0]

  if (
    !account.is_verified ||
    !account.is_active ||
    !account.paystack_recipient_code
  ) {
    console.error(
      `Vendor ${payout.vendor_id} does not have an active verified Paystack recipient`
    )

    return
  }

  const payoutAmount =
    Number(
      payout.payout_amount
    )

  if (
    !Number.isFinite(
      payoutAmount
    ) ||
    payoutAmount <= 0
  ) {
    console.error(
      `Invalid payout amount for ${payout.id}:`,
      payout.payout_amount
    )

    await updateVendorPayout(
      env,
      payout.id,
      {
        status: 'failed',
        failure_reason:
          'Invalid payout amount',
      }
    )

    return
  }

  const amountInKobo =
    Math.round(
      payoutAmount * 100
    )
    if (env.PAYOUTS_VERIFY_ONLY === 'true') {
  console.log(
    `Payout ${payout.id}: PAYOUTS_VERIFY_ONLY is enabled. No real transfer will be created.`
  )
  return
}

  if (
    env.LIVE_PAYOUTS_ENABLED !==
    'true'
  ) {
    console.log(
      `Payout ${payout.id}: LIVE_PAYOUTS_ENABLED is not true. No real transfer will be created.`
    )

    return
  }

  const transferResponse =
    await fetch(
      'https://api.paystack.co/transfer',
      {
        method: 'POST',
        headers: {
          Authorization:
            `Bearer ${env.PAYSTACK_SECRET_KEY}`,
          'Content-Type':
            'application/json',
        },
        body: JSON.stringify({
          source: 'balance',
          amount:
            amountInKobo,
          recipient:
            account.paystack_recipient_code,
          reference,
          reason:
            'UniAbuja Market vendor payout',
          currency: 'NGN',
        }),
      }
    )

  let transferData = null

  try {
    transferData =
      await transferResponse.json()
  } catch {
    console.error(
      `Paystack transfer returned invalid JSON for payout ${payout.id}.`
    )

    return
  }

  console.log(
    'Paystack transfer response:',
    JSON.stringify({
      httpStatus:
        transferResponse.status,
      status:
        transferData?.status,
      message:
        transferData?.message,
      transferStatus:
        transferData?.data?.status,
      reference:
        transferData?.data?.reference,
    })
  )

  if (
    !transferResponse.ok
  ) {
    const message =
      transferData?.message ||
      'Paystack transfer request failed'

    console.error(
      `Paystack transfer request was not accepted for payout ${payout.id}:`,
      message
    )

    // Paystack explicitly rejected this transfer because
    // the available balance was insufficient.
    // Stop the automatic retry loop; reconcile before retrying.
    if (
      message.toLowerCase().includes('balance is not enough')
    ) {
      await updateVendorPayout(
        env,
        payout.id,
        {
          status: 'failed',
          failure_reason:
            'Paystack rejected transfer: insufficient balance. Manual reconciliation required before retry.',
        }
      )

      console.error(
        `Payout ${payout.id} marked failed after Paystack rejected the transfer for insufficient balance.`
      )
    }

    return
  }

  if (
    !transferData?.status
  ) {
    console.error(
      `Paystack returned an unsuccessful response for payout ${payout.id}:`,
      transferData
    )

    return
  }

  const transferStatus =
    transferData?.data?.status

  if (
    transferStatus ===
    'success'
  ) {
    await updateVendorPayout(
      env,
      payout.id,
      {
        status: 'paid',
        paid_at:
          new Date().toISOString(),
        failure_reason: null,
      }
    )

    return
  }

  if (
    transferStatus ===
    'failed'
  ) {
    await updateVendorPayout(
      env,
      payout.id,
      {
        status: 'failed',
        failure_reason:
          transferData?.data
            ?.reason ||
          'Paystack transfer failed',
      }
    )

    return
  }

  if (
    transferStatus ===
    'reversed'
  ) {
    await updateVendorPayout(
      env,
      payout.id,
      {
        status: 'reversed',
        failure_reason:
          transferData?.data
            ?.reason ||
          'Paystack transfer was reversed',
      }
    )

    return
  }

  console.log(
    `Payout ${payout.id} remains processing. Paystack status: ${transferStatus}`
  )
}

// ---------------------------------------------------------
// AUTOMATED PAYOUT PROCESSOR
// ---------------------------------------------------------

async function processPendingVendorPayouts(env) {
  const verifyOnly = env.PAYOUTS_VERIFY_ONLY === 'true'
  const automatedEnabled =
    env.AUTOMATED_PAYOUTS_ENABLED === 'true'
  const livePayoutsEnabled =
    env.LIVE_PAYOUTS_ENABLED === 'true'

  // Verification-only mode may inspect records, but must never
  // claim payouts or create transfers.
  if (!verifyOnly && (!automatedEnabled || !livePayoutsEnabled)) {
    console.log(
      'Automated payouts are disabled. No payouts will be claimed or transferred.'
    )
    return
  }

  // Never call Paystack's transfer workflow without a Live Mode key.
  if (
    !env.PAYSTACK_SECRET_KEY ||
    !env.PAYSTACK_SECRET_KEY.startsWith('sk_live_')
  ) {
    console.error(
      'Payout processing stopped: a Paystack Live Mode secret key is required.'
    )
    return
  }

  async function readRows(path) {
    try {
      const response = await supabaseRequest(
        env,
        path,
        { method: 'GET' }
      )

      const responseText = await response.text()

      let data

      try {
        data = JSON.parse(responseText)
      } catch {
        data = null
      }

      if (!response.ok || !Array.isArray(data)) {
        console.error(
          'Could not retrieve payout verification data:',
          response.status,
          responseText
        )
        return null
      }

      return data
    } catch (error) {
      console.error(
        'Payout verification request failed:',
        error?.name,
        error?.message,
        error?.stack
      )
      return null
    }
  }

  async function verifyOriginalPayment(payoutId) {
  const payouts = await readRows(
    `/rest/v1/vendor_payouts?id=eq.${encodeURIComponent(
      payoutId
    )}&select=id,vendor_commission_id,payout_amount,status&limit=1`
  )

  if (!payouts?.length) {
    console.error(`Payout ${payoutId}: payout record not found.`)
    return false
  }

  const payout = payouts[0]

  if (!payout.vendor_commission_id) {
    console.error(`Payout ${payoutId}: commission relationship missing.`)
    return false
  }

  const commissions = await readRows(
    `/rest/v1/vendor_commissions?id=eq.${encodeURIComponent(
      payout.vendor_commission_id
    )}&select=vendor_order_id,payout_method&limit=1`
  )

  if (!commissions?.length || !commissions[0].vendor_order_id) {
    console.error(`Payout ${payoutId}: commission could not be verified.`)
    return false
  }

  // Split payments already allocate the vendor's share through Paystack.
  // Never issue a separate transfer for these commissions.
  if (commissions[0].payout_method === 'split') {
    console.log(
      `Payout ${payoutId}: commission uses Paystack Split Payments. Separate transfer prohibited.`
    )
    return false
  }

  const vendorOrders = await readRows(
    `/rest/v1/vendor_orders?id=eq.${encodeURIComponent(
      commissions[0].vendor_order_id
    )}&select=order_id&limit=1`
  )

  if (!vendorOrders?.length || !vendorOrders[0].order_id) {
    console.error(`Payout ${payoutId}: vendor order could not be verified.`)
    return false
  }

  const orders = await readRows(
    `/rest/v1/orders?id=eq.${encodeURIComponent(
      vendorOrders[0].order_id
    )}&select=id,total_amount,payment_reference,payment_status&limit=1`
  )

  if (!orders?.length) {
    console.error(`Payout ${payoutId}: parent order not found.`)
    return false
  }

  const order = orders[0]

  if (
    order.payment_status !== 'paid' ||
    !order.payment_reference
  ) {
    console.log(`Payout ${payoutId}: order is not confirmed as paid.`)
    return false
  }

  let response
  let result

  try {
    response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(
        order.payment_reference
      )}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
        },
      }
    )

    result = await response.json()
  } catch (error) {
    console.error(
      `Payout ${payoutId}: Paystack verification request failed.`,
      error
    )
    return false
  }

  const expectedAmount = Math.round(Number(order.total_amount) * 100)

  // First establish that Paystack returned a successful verification response.
  // A failed API response must not be misclassified as a test payment.
  if (!response.ok || result?.status !== true) {
    console.error(
      `Payout ${payoutId}: Paystack verification unavailable or unsuccessful (HTTP ${response.status}): ${result?.message || 'No message returned'}. Payment remains unverified.`
    )
    return false
  }

  const transaction = result?.data

if (!transaction) {
  console.error(
    `Payout ${payoutId}: Paystack returned no transaction data. Payment remains unverified.`
  )
  return false
}

const payoutVerifiedSubaccount =
  typeof transaction.subaccount === 'string'
    ? transaction.subaccount
    : transaction.subaccount?.subaccount_code

if (payoutVerifiedSubaccount) {
  console.error(
    `Payout ${payoutId}: Paystack confirms a subaccount transaction. Separate vendor transfer prohibited.`
  )

  return false
}
  // Fail closed if Paystack confirms this transaction used a subaccount.
// Paystack split settlement already handles the vendor's share, so
// a separate vendor transfer must not be initiated.
const verifiedSubaccount =
  typeof transaction.subaccount === 'string'
    ? transaction.subaccount
    : transaction.subaccount?.subaccount_code

if (verifiedSubaccount) {
  console.error(
    `Payout ${payoutId}: Paystack confirms a subaccount transaction. Separate vendor transfer prohibited.`
  )
  return false
}

  // Explicitly distinguish a confirmed test transaction from an unknown mode.
  if (transaction.domain === 'test') {
    console.error(
      `Payout ${payoutId}: original payment is confirmed as Test Mode. No payout permitted.`
    )
    return false
  }

  if (transaction.domain !== 'live') {
    console.error(
      `Payout ${payoutId}: transaction domain is not confirmed as Live Mode. No payout permitted.`
    )
    return false
  }

  // Validate the original customer payment before allowing payout processing.
  if (
    transaction.status !== 'success' ||
    transaction.reference !== order.payment_reference ||
    transaction.currency !== 'NGN' ||
    !Number.isFinite(expectedAmount) ||
    expectedAmount <= 0 ||
    Number(transaction.amount) !== expectedAmount
  ) {
    console.error(
      `Payout ${payoutId}: original payment failed status, reference, currency, or amount verification.`
    )
    return false
  }

  console.log(
    `Payout ${payoutId}: original customer payment verified.`
  )

  return true
}

  // Load pending payouts without changing their status.
  const pendingPayouts = await readRows(
    '/rest/v1/vendor_payouts?status=eq.pending&select=id&order=created_at.asc&limit=2'
  )

  if (!pendingPayouts) {
    console.error('Could not load pending vendor payouts.')
    return
  }

  // Verification-only mode ends here: no claims and no transfers.
  if (verifyOnly) {
    const processingPayouts = await readRows(
      '/rest/v1/vendor_payouts?status=eq.processing&select=id&order=created_at.asc&limit=2'
    )

    if (!processingPayouts) {
      console.error('Could not load processing vendor payouts.')
      return
    }

    for (const payout of [
      ...pendingPayouts,
      ...processingPayouts,
    ]) {
      try {
        const verified = await verifyOriginalPayment(payout.id)

        console.log(
          `Verification-only result for payout ${payout.id}: ${
            verified ? 'PAYMENT VERIFIED' : 'NOT VERIFIED'
          }`
        )
      } catch (error) {
        console.error(
          `Verification-only check failed for payout ${payout.id}:`,
          error
        )
      }
    }

    console.log(
      'Verification-only run finished. No payouts were claimed or transferred.'
    )
    return
  }

  // Normal mode: verify each original customer payment before claiming.
  for (const payout of pendingPayouts) {
    try {
      const paymentVerified =
        await verifyOriginalPayment(payout.id)

      if (!paymentVerified) {
        continue
      }

      const claimResponse = await supabaseRequest(
        env,
        '/rest/v1/rpc/claim_vendor_payout',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            p_payout_id: payout.id,
          }),
        }
      )

      let claimData

      try {
        claimData = await claimResponse.json()
      } catch {
        console.error(
          `Payout ${payout.id}: could not parse claim response.`
        )
        continue
      }

      if (
        !claimResponse.ok ||
        !Array.isArray(claimData) ||
        !claimData.length ||
        !claimData[0].payout_id ||
        !claimData[0].paystack_reference
      ) {
        console.log(`Payout ${payout.id} was not claimed.`, claimData)
        continue
      }

      console.log(`Claimed verified payout ${payout.id}.`)
    } catch (error) {
      console.error(`Error claiming payout ${payout.id}:`, error)
    }
  }

  // Re-fetch processing payouts after claims.
  const processingPayouts = await readRows(
    '/rest/v1/vendor_payouts?status=eq.processing&paystack_reference=not.is.null&select=id,vendor_id,payout_amount,paystack_reference,status&order=created_at.asc&limit=20'
  )

  if (!processingPayouts) {
    console.error('Could not load processing vendor payouts.')
    return
  }

  for (const payout of processingPayouts) {
    try {
      const paymentVerified =
        await verifyOriginalPayment(payout.id)

      if (!paymentVerified) {
        console.log(
          `Payout ${payout.id} remains unchanged because its original payment could not be verified.`
        )
        continue
      }

      await processVendorPayout(env, payout)
    } catch (error) {
      console.error(`Error processing payout ${payout.id}:`, error)
    }
  }
}
// ---------------------------------------------------------
// VENDOR SUBSCRIPTION HELPERS
// ---------------------------------------------------------

function addDays(date, days) {
  const result =
    new Date(date)

  result.setUTCDate(
    result.getUTCDate() +
      days
  )

  return result
}

function normalizePaystackDate(
  value
) {
  if (!value) {
    return null
  }

  const date =
    new Date(value)

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null
  }

  return date.toISOString()
}

async function findVendorSubscriptionById(
  env,
  subscriptionId
) {
  if (!subscriptionId) {
    return null
  }

  const response =
    await supabaseRequest(
      env,
      `/rest/v1/vendor_subscriptions?id=eq.${encodeURIComponent(
        subscriptionId
      )}&select=*&limit=1`,
      {
        method: 'GET',
      }
    )

  if (!response.ok) {
    console.error(
      'Could not load vendor subscription by ID:',
      await response.text()
    )

    return null
  }

  let data = null

  try {
    data =
      await response.json()
  } catch {
    return null
  }

  return Array.isArray(data) &&
    data.length
    ? data[0]
    : null
}

async function findVendorSubscriptionByVendorId(
  env,
  vendorId
) {
  if (!vendorId) {
    return null
  }

  const response =
    await supabaseRequest(
      env,
      `/rest/v1/vendor_subscriptions?vendor_id=eq.${encodeURIComponent(
        vendorId
      )}&select=*&limit=1`,
      {
        method: 'GET',
      }
    )

  if (!response.ok) {
    console.error(
      'Could not load vendor subscription:',
      await response.text()
    )

    return null
  }

  let data = null

  try {
    data =
      await response.json()
  } catch {
    return null
  }

  return Array.isArray(data) &&
    data.length
    ? data[0]
    : null
}
async function processVendorSubscriptionPayment(
  env,
  payment
) {
  const response = await supabaseRequest(
    env,
    '/rest/v1/rpc/process_vendor_subscription_payment',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_subscription_id: payment.subscriptionId,
        p_vendor_id: payment.vendorId,
        p_paystack_reference: payment.reference,
        p_amount_kobo: payment.amountKobo,
        p_currency: payment.currency,
        p_paid_at: payment.paidAt,
        p_period_start: payment.periodStart,
        p_period_end: payment.periodEnd,
        p_customer_code: payment.customerCode || null,
        p_subscription_code: payment.subscriptionCode || null,
      }),
    }
  )

  let result = null

  try {
    result = await response.json()
  } catch {
    result = null
  }

  if (!response.ok) {
    console.error(
      'Vendor subscription payment processing failed:',
      response.status,
      result
    )

    throw new Error(
      'Could not process vendor subscription payment'
    )
  }

  if (
    !result ||
    result.success !== true ||
    typeof result.already_processed !== 'boolean'
  ) {
    console.error(
      'Unexpected vendor subscription payment RPC response:',
      result
    )

    throw new Error(
      'Invalid vendor subscription payment processing response'
    )
  }

  return result
}

async function updateVendorSubscription(
  env,
  subscriptionId,
  updates
) {
  if (!subscriptionId) {
    return false
  }

  const response =
    await supabaseRequest(
      env,
      `/rest/v1/vendor_subscriptions?id=eq.${encodeURIComponent(
        subscriptionId
      )}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type':
            'application/json',
          Prefer:
            'return=minimal',
        },
        body: JSON.stringify({
          ...updates,
          updated_at:
            new Date().toISOString(),
        }),
      }
    )

  if (!response.ok) {
    console.error(
      `Could not update vendor subscription ${subscriptionId}:`,
      await response.text()
    )

    return false
  }

  return true
}

async function findSubscriptionByPaystackCode(
  env,
  subscriptionCode
) {
  if (!subscriptionCode) {
    return null
  }

  const response =
    await supabaseRequest(
      env,
      `/rest/v1/vendor_subscriptions?paystack_subscription_code=eq.${encodeURIComponent(
        subscriptionCode
      )}&select=*&limit=1`,
      {
        method: 'GET',
      }
    )

  if (!response.ok) {
    console.error(
      'Could not find vendor subscription by Paystack subscription code:',
      await response.text()
    )

    return null
  }

  let data = null

  try {
    data =
      await response.json()
  } catch {
    return null
  }

  return Array.isArray(data) &&
    data.length
    ? data[0]
    : null
}

async function findSubscriptionByPaystackCustomerCode(
  env,
  customerCode
) {
  if (!customerCode) {
    return null
  }

  const response =
    await supabaseRequest(
      env,
      `/rest/v1/vendor_subscriptions?paystack_customer_code=eq.${encodeURIComponent(
        customerCode
      )}&select=*&limit=1`,
      {
        method: 'GET',
      }
    )

  if (!response.ok) {
    console.error(
      'Could not find vendor subscription by Paystack customer code:',
      await response.text()
    )

    return null
  }

  let data = null

  try {
    data =
      await response.json()
  } catch {
    return null
  }

  return Array.isArray(data) &&
    data.length
    ? data[0]
    : null
}

function getPaystackSubscriptionData(
  event
) {
  const data =
    event?.data || {}

  const subscriptionCode =
    data.subscription_code ||
    data.subscription?.subscription_code ||
    data.subscription?.code ||
    null

  const customerCode =
    data.customer?.customer_code ||
    data.customer_code ||
    data.customer?.code ||
    null

  return {
    subscriptionCode,
    customerCode,
  }
}

async function resolveVendorSubscriptionForEvent(
  env,
  event
) {
  const data =
    event?.data || {}

  const metadata =
    data.metadata ||
    data.transaction_metadata ||
    {}

  let parsedMetadata =
    metadata

  if (
    typeof metadata ===
    'string'
  ) {
    try {
      parsedMetadata =
        JSON.parse(metadata)
    } catch {
      parsedMetadata = {}
    }
  }

  const subscriptionId =
    parsedMetadata?.subscription_id ||
    data.metadata?.subscription_id ||
    null

  const vendorId =
    parsedMetadata?.vendor_id ||
    data.metadata?.vendor_id ||
    null

  if (subscriptionId) {
    const subscription =
      await findVendorSubscriptionById(
        env,
        subscriptionId
      )

    if (subscription) {
      return subscription
    }
  }

  if (vendorId) {
    const subscription =
      await findVendorSubscriptionByVendorId(
        env,
        vendorId
      )

    if (subscription) {
      return subscription
    }
  }

  const {
    subscriptionCode,
    customerCode,
  } =
    getPaystackSubscriptionData(
      event
    )

  if (subscriptionCode) {
    const subscription =
      await findSubscriptionByPaystackCode(
        env,
        subscriptionCode
      )

    if (subscription) {
      return subscription
    }
  }

  if (customerCode) {
    const subscription =
      await findSubscriptionByPaystackCustomerCode(
        env,
        customerCode
      )

    if (subscription) {
      return subscription
    }
  }

  return null
}

async function handleVendorSubscriptionWebhook(
  env,
  event
) {
  const eventName =
    event?.event

  if (
    ![
      'subscription.create',
      'subscription.disable',
      'subscription.not_renew',
      'invoice.create',
      'invoice.update',
      'invoice.payment_failed',
      'charge.success',
    ].includes(
      eventName
    )
  ) {
    return {
      handled: false,
      reason:
        'Unhandled subscription event',
    }
  }

  /*
   * IMPORTANT:
   *
   * A generic Paystack charge.success event is NOT automatically
   * treated as a vendor subscription payment.
   *
   * We only process charge.success here when the transaction
   * contains explicit vendor-subscription metadata or when the
   * transaction can be safely matched to an existing Paystack
   * subscription/customer code.
   */
  const subscription =
    await resolveVendorSubscriptionForEvent(
      env,
      event
    )

  if (!subscription) {
    return {
      handled: false,
      reason:
        'No matching vendor subscription',
    }
  }

  const data =
    event?.data || {}

  const {
    subscriptionCode,
    customerCode,
  } =
    getPaystackSubscriptionData(
      event
    )

  const metadata =
    data.metadata ||
    {}

  let parsedMetadata =
    metadata

  if (
    typeof metadata ===
    'string'
  ) {
    try {
      parsedMetadata =
        JSON.parse(metadata)
    } catch {
      parsedMetadata = {}
    }
  }

  const currentTime =
    new Date()

  const currentTimeIso =
    currentTime.toISOString()

  const periodStart =
    normalizePaystackDate(
      data.period_start ||
      data.subscription?.period_start
    )

  const periodEnd =
    normalizePaystackDate(
      data.period_end ||
      data.subscription?.period_end
    )

  if (
    eventName ===
    'subscription.create'
  ) {
    await updateVendorSubscription(
      env,
      subscription.id,
      {
        status:
          periodEnd &&
          new Date(periodEnd) >
            currentTime
            ? 'active'
            : 'trialing',
        current_period_start:
          periodStart ||
          subscription.current_period_start ||
          currentTimeIso,
        current_period_end:
          periodEnd ||
          subscription.current_period_end ||
          null,
        grace_period_ends_at:
          null,
        paystack_customer_code:
          customerCode ||
          subscription.paystack_customer_code ||
          null,
        paystack_subscription_code:
          subscriptionCode ||
          subscription.paystack_subscription_code ||
          null,
      }
    )

    console.log(
      `Vendor subscription ${subscription.id} activated from Paystack subscription.create.`
    )

    return {
      handled: true,
      status: 'active',
    }
  }

  if (
    eventName ===
    'charge.success'
  ) {
    /*
     * Only a successful transaction with subscription metadata
     * or an already-known Paystack subscription/customer relationship
     * reaches this point.
     *
     * This prevents ordinary marketplace order payments from
     * changing vendor subscription state.
     */

    const explicitVendorSubscription =
      parsedMetadata?.purpose ===
        'vendor_subscription' ||
      parsedMetadata?.subscription_id ||
      parsedMetadata?.vendor_id

    const hasKnownSubscriptionRelationship =
      Boolean(
        subscriptionCode ||
        customerCode
      )

    if (
      !explicitVendorSubscription &&
      !hasKnownSubscriptionRelationship
    ) {
      return {
        handled: false,
        reason:
          'Charge was not explicitly identified as vendor subscription payment',
      }
    }

    const transactionStatus =
      data.status

    if (
      transactionStatus &&
      transactionStatus !==
        'success'
    ) {
      return {
        handled: true,
        status:
          subscription.status,
      }
    }

    const transactionAmount =
      Number(
        data.amount
      )

    const monthlyPriceKobo =
      Math.round(
        Number(
          subscription.monthly_price
        ) * 100
      )

    if (
      Number.isFinite(
        transactionAmount
      ) &&
      Number.isFinite(
        monthlyPriceKobo
      ) &&
      transactionAmount !==
        monthlyPriceKobo
    ) {
      console.error(
        `Vendor subscription ${subscription.id}: Paystack charge amount does not match monthly subscription price.`
      )

      return {
        handled: true,
        status:
          subscription.status,
      }
    }

    const newPeriodStart =
      periodStart ||
      currentTimeIso

    const newPeriodEnd =
      periodEnd ||
      addDays(
        currentTime,
        30
      ).toISOString()

    await updateVendorSubscription(
      env,
      subscription.id,
      {
        status: 'active',
        current_period_start:
          newPeriodStart,
        current_period_end:
          newPeriodEnd,
        grace_period_ends_at:
          null,
        paystack_customer_code:
          customerCode ||
          subscription.paystack_customer_code ||
          null,
        paystack_subscription_code:
          subscriptionCode ||
          subscription.paystack_subscription_code ||
          null,
      }
    )

    console.log(
      `Vendor subscription ${subscription.id} renewed successfully from Paystack charge.success.`
    )

    return {
      handled: true,
      status: 'active',
    }
  }

  if (
    eventName ===
    'invoice.create' ||
    eventName ===
    'invoice.update'
  ) {
    if (
      periodStart ||
      periodEnd
    ) {
      await updateVendorSubscription(
        env,
        subscription.id,
        {
          current_period_start:
            periodStart ||
            subscription.current_period_start ||
            null,
          current_period_end:
            periodEnd ||
            subscription.current_period_end ||
            null,
          paystack_customer_code:
            customerCode ||
            subscription.paystack_customer_code ||
            null,
          paystack_subscription_code:
            subscriptionCode ||
            subscription.paystack_subscription_code ||
            null,
        }
      )
    }

    return {
      handled: true,
      status:
        subscription.status,
    }
  }

  if (
    eventName ===
    'invoice.payment_failed'
  ) {
    const graceEnd =
      addDays(
        currentTime,
        SUBSCRIPTION_GRACE_DAYS
      ).toISOString()

    await updateVendorSubscription(
      env,
      subscription.id,
      {
        status: 'past_due',
        grace_period_ends_at:
          graceEnd,
        paystack_customer_code:
          customerCode ||
          subscription.paystack_customer_code ||
          null,
        paystack_subscription_code:
          subscriptionCode ||
          subscription.paystack_subscription_code ||
          null,
      }
    )

    console.log(
      `Vendor subscription ${subscription.id} marked past_due after failed invoice payment.`
    )

    return {
      handled: true,
      status: 'past_due',
    }
  }

  if (
    eventName ===
    'subscription.not_renew'
  ) {
    await updateVendorSubscription(
      env,
      subscription.id,
      {
        status:
          periodEnd &&
          new Date(periodEnd) >
            currentTime
            ? 'cancelled'
            : 'expired',
        current_period_end:
          periodEnd ||
          subscription.current_period_end ||
          null,
        grace_period_ends_at:
          null,
        paystack_customer_code:
          customerCode ||
          subscription.paystack_customer_code ||
          null,
        paystack_subscription_code:
          subscriptionCode ||
          subscription.paystack_subscription_code ||
          null,
      }
    )

    console.log(
      `Vendor subscription ${subscription.id} marked not renewing.`
    )

    return {
      handled: true,
      status:
        periodEnd &&
        new Date(periodEnd) >
          currentTime
          ? 'cancelled'
          : 'expired',
    }
  }

  if (
    eventName ===
    'subscription.disable'
  ) {
    await updateVendorSubscription(
      env,
      subscription.id,
      {
        status:
          periodEnd &&
          new Date(periodEnd) >
            currentTime
            ? 'cancelled'
            : 'expired',
        grace_period_ends_at:
          null,
        paystack_customer_code:
          customerCode ||
          subscription.paystack_customer_code ||
          null,
        paystack_subscription_code:
          subscriptionCode ||
          subscription.paystack_subscription_code ||
          null,
      }
    )

    console.log(
      `Vendor subscription ${subscription.id} marked expired after Paystack disable.`
    )

    return {
      handled: true,
      status:
        periodEnd &&
        new Date(periodEnd) >
          currentTime
          ? 'cancelled'
          : 'expired',
    }
  }

  return {
    handled: false,
    reason:
      'Unhandled subscription event',
  }
}

// ---------------------------------------------------------
// VENDOR SUBSCRIPTION CRON LIFECYCLE
// ---------------------------------------------------------

async function processVendorSubscriptionLifecycle(
  env
) {
  const response =
    await supabaseRequest(
      env,
      '/rest/v1/vendor_subscriptions?select=id,status,trial_ends_at,current_period_end,grace_period_ends_at&limit=200',
      {
        method: 'GET',
      }
    )

  let subscriptions = null

  try {
    subscriptions =
      await response.json()
  } catch {
    subscriptions = null
  }

  if (
    !response.ok ||
    !Array.isArray(
      subscriptions
    )
  ) {
    console.error(
      'Could not load vendor subscriptions for lifecycle processing:',
      subscriptions
    )

    return
  }

  const now =
    new Date()

  for (
    const subscription of
      subscriptions
  ) {
    try {
      if (
        subscription.status ===
        'trialing'
      ) {
        if (
          subscription.trial_ends_at &&
          new Date(
            subscription.trial_ends_at
          ) <= now
        ) {
          await updateVendorSubscription(
            env,
            subscription.id,
            {
              status:
                'expired',
              grace_period_ends_at:
                null,
            }
          )

          console.log(
            `Vendor subscription ${subscription.id} trial expired.`
          )
        }

        continue
      }

      if (
        subscription.status ===
        'active'
      ) {
        if (
          subscription.current_period_end &&
          new Date(
            subscription.current_period_end
          ) <= now
        ) {
          await updateVendorSubscription(
            env,
            subscription.id,
            {
              status:
                'past_due',
              grace_period_ends_at:
                addDays(
                  now,
                  SUBSCRIPTION_GRACE_DAYS
                ).toISOString(),
            }
          )

          console.log(
            `Vendor subscription ${subscription.id} period ended. Grace period started.`
          )
        }

        continue
      }

      if (
        subscription.status ===
        'past_due'
      ) {
        if (
          subscription.grace_period_ends_at &&
          new Date(
            subscription.grace_period_ends_at
          ) <= now
        ) {
          await updateVendorSubscription(
            env,
            subscription.id,
            {
              status:
                'expired',
              grace_period_ends_at:
                null,
            }
          )

          console.log(
            `Vendor subscription ${subscription.id} grace period expired.`
          )
        }

        continue
      }

      if (
        subscription.status ===
        'cancelled'
      ) {
        if (
          subscription.current_period_end &&
          new Date(
            subscription.current_period_end
          ) <= now
        ) {
          await updateVendorSubscription(
            env,
            subscription.id,
            {
              status:
                'expired',
              grace_period_ends_at:
                null,
            }
          )

          console.log(
            `Vendor subscription ${subscription.id} cancelled period expired.`
          )
        }
      }
    } catch (error) {
      console.error(
        `Error processing vendor subscription lifecycle for ${subscription.id}:`,
        error
      )
    }
  }
}
// ---------------------------------------------------------
// WORKER
// ---------------------------------------------------------

export default {
  async fetch(
    request,
    env
  ) {
    const url =
      new URL(request.url)

    if (
      request.method ===
      'OPTIONS'
    ) {
      return new Response(
        null,
        {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin':
              '*',
            'Access-Control-Allow-Headers':
              'Content-Type, Authorization, x-paystack-signature, x-push-webhook-secret',
            'Access-Control-Allow-Methods':
              'GET, POST, OPTIONS',
          },
        }
      )
    }

    // -------------------------------------------------------
    // API HEALTH
    // -------------------------------------------------------

    if (
      url.pathname ===
      '/api/health'
    ) {
      return jsonResponse({
        success: true,
        message:
          'UniAbuja Market API is running',
      })
    }

    // -------------------------------------------------------
    // PUSH NOTIFICATION WEBHOOK
    // -------------------------------------------------------

    if (
      url.pathname ===
        '/api/push/notification' &&
      request.method === 'POST'
    ) {
      try {
        const webhookSecret =
          request.headers.get(
            'x-push-webhook-secret'
          )

        if (
          !env.PUSH_WEBHOOK_SECRET ||
          !webhookSecret ||
          !safeEqual(
            webhookSecret,
            env.PUSH_WEBHOOK_SECRET
          )
        ) {
          console.error(
            'Push webhook rejected: invalid secret.'
          )

          return jsonResponse(
            {
              success: false,
              message:
                'Unauthorized',
            },
            401
          )
        }

        let payload

        try {
          payload =
            await request.json()
        } catch (error) {
          console.error(
            'Push webhook contained invalid JSON:',
            error
          )

          return jsonResponse(
            {
              success: false,
              message:
                'Invalid webhook JSON',
            },
            400
          )
        }

        console.log(
          'PUSH WEBHOOK PAYLOAD:',
          JSON.stringify(payload)
        )

        let notification = null

        if (
          payload?.notification_id &&
          payload?.user_id
        ) {
          notification = {
            id:
              payload.notification_id,
            user_id:
              payload.user_id,
            title:
              payload.title,
            message:
              payload.message,
            type:
              payload.type,
            url:
              payload.url,
          }
        }

        if (
          !notification &&
          payload?.type ===
            'INSERT' &&
          payload?.table ===
            'notifications' &&
          payload?.schema ===
            'public' &&
          payload?.record
        ) {
          notification =
            payload.record
        }

        if (
          !notification &&
          payload?.id &&
          payload?.user_id
        ) {
          notification =
            payload
        }

        if (
          !notification &&
          payload?.record?.id &&
          payload?.record?.user_id
        ) {
          notification =
            payload.record
        }

        if (!notification) {
          console.warn(
            'Push webhook payload did not contain a usable notification record.'
          )

          return jsonResponse({
            success: true,
            ignored: true,
          })
        }

        if (
          !notification.id ||
          !notification.user_id
        ) {
          console.error(
            'Notification record is incomplete:',
            JSON.stringify(
              notification
            )
          )

          return jsonResponse(
            {
              success: false,
              message:
                'Notification record is incomplete',
            },
            400
          )
        }

        console.log(
          'Sending push notification:',
          JSON.stringify({
            id:
              notification.id,
            user_id:
              notification.user_id,
            title:
              notification.title,
            type:
              notification.type ||
              'webhook',
          })
        )

        const result =
          await sendPushNotification(
            env,
            notification
          )

        return jsonResponse({
          success: true,
          sent:
            result.sent,
          failed:
            result.failed,
          removed:
            result.removed,
        })
      } catch (error) {
        console.error(
          'Push notification webhook error:',
          error
        )

        return jsonResponse(
          {
            success: false,
            message:
              error.message ||
              'Push notification failed',
          },
          500
        )
      }
    }

    // -------------------------------------------------------
    // PAYSTACK WEBHOOK
    // -------------------------------------------------------

    if (
      url.pathname ===
        '/api/paystack/webhook' &&
      request.method === 'POST'
    ) {
      try {
        const rawBody =
          await request.text()

        const signature =
          request.headers.get(
            'x-paystack-signature'
          )

        if (!signature) {
          return jsonResponse(
            {
              success: false,
              message:
                'Missing Paystack signature',
            },
            401
          )
        }

        const expectedSignature =
          await createHmacSha512Hex(
            env.PAYSTACK_SECRET_KEY,
            rawBody
          )

        if (
          !safeEqual(
            signature,
            expectedSignature
          )
        ) {
          return jsonResponse(
            {
              success: false,
              message:
                'Invalid Paystack signature',
            },
            401
          )
        }

        let event

        try {
          event =
            JSON.parse(rawBody)
        } catch {
          return jsonResponse(
            {
              success: false,
              message:
                'Invalid webhook payload',
            },
            400
          )
        }

        const eventName =
          event?.event

        console.log(
          'PAYSTACK WEBHOOK EVENT:',
          eventName
        )

        // -----------------------------------------------------
        // VENDOR SUBSCRIPTION EVENTS
        // -----------------------------------------------------

        if (
          [
            'subscription.create',
            'subscription.disable',
            'subscription.not_renew',
            'invoice.create',
            'invoice.update',
            'invoice.payment_failed',
            'charge.success',
          ].includes(eventName)
        ) {
          try {
            const result =
              await handleVendorSubscriptionWebhook(
                env,
                event
              )

            if (
              result?.handled
            ) {
              return jsonResponse({
                success: true,
                subscription:
                  true,
                status:
                  result.status ||
                  null,
              })
            }
          } catch (subscriptionError) {
            console.error(
              'Vendor subscription webhook processing error:',
              subscriptionError
            )

            return jsonResponse(
              {
                success: false,
                message:
                  subscriptionError.message ||
                  'Vendor subscription webhook processing failed',
              },
              500
            )
          }
        }

        // -----------------------------------------------------
        // CUSTOMER ORDER CHARGE.SUCCESS BACKUP
        // -----------------------------------------------------

        if (
          eventName ===
          'charge.success'
        ) {
          const transaction =
            event?.data

          const reference =
            transaction?.reference

          if (!reference) {
            return jsonResponse({
              success: true,
              ignored: true,
            })
          }

          const orderResponse =
            await supabaseRequest(
              env,
              `/rest/v1/orders?payment_reference=eq.${encodeURIComponent(
                reference
              )}&select=id,total_amount,payment_reference,payment_status,customer_id&limit=1`,
              {
                method: 'GET',
              }
            )

          let orders = null

          try {
            orders =
              await orderResponse.json()
          } catch {
            orders = null
          }

          if (
            !orderResponse.ok ||
            !Array.isArray(
              orders
            ) ||
            !orders.length
          ) {
            return jsonResponse({
              success: true,
              ignored: true,
            })
          }

                    const order =
            orders[0]

          // Confirm the webhook transaction matches this order's payment.
          if (
            transaction?.status !== 'success' ||
            transaction?.reference !== order.payment_reference ||
            transaction?.currency !== 'NGN'
          ) {
            console.error(
              `Customer order ${order.id}: Paystack transaction status, reference, or currency is invalid.`
            )

            return jsonResponse(
              {
                success: false,
                message: 'Payment verification failed',
              },
              400
            )
          }

          const paidAmount =
            Number(
              transaction.amount
            )

          const expectedAmount =
            Math.round(
              Number(
                order.total_amount
              ) * 100
            )

          if (
            !Number.isFinite(
              paidAmount
            ) ||
            paidAmount !==
              expectedAmount
          ) {
            console.error(
              `Customer order ${order.id}: charge.success amount does not match expected amount.`
            )

            return jsonResponse(
              {
                success: false,
                message:
                  'Payment amount mismatch',
              },
              400
            )
          }
          // Identify the vendor order for this payment.
const vendorOrderResponse =
  await supabaseRequest(
    env,
    `/rest/v1/vendor_orders?order_id=eq.${encodeURIComponent(
      order.id
    )}&select=id,vendor_id,subtotal&limit=2`,
    {
      method: 'GET',
    }
  )

let paidVendorOrders = null

try {
  paidVendorOrders =
    await vendorOrderResponse.json()
} catch {
  paidVendorOrders = null
}

          if (
            !vendorOrderResponse.ok ||
            !Array.isArray(paidVendorOrders) ||
            paidVendorOrders.length !== 1
          ) {
            console.error(
              `Could not identify the vendor order for paid order ${order.id}.`
            )

            return jsonResponse(
              {
                success: false,
                message:
                  'Could not identify the vendor commission',
              },
              500
            )
          }

                    // Verify the transaction directly with Paystack before
          // deciding whether this commission was actually split.
          const splitVerifyResponse = await fetch(
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

          let splitVerifyData = null

          try {
            splitVerifyData = await splitVerifyResponse.json()
          } catch {
            splitVerifyData = null
          }

          const verifiedTransaction = splitVerifyData?.data

          if (
            !splitVerifyResponse.ok ||
            !splitVerifyData?.status ||
            verifiedTransaction?.status !== 'success' ||
            verifiedTransaction?.reference !== reference ||
            verifiedTransaction?.currency !== 'NGN' ||
            Number(verifiedTransaction?.amount) !== expectedAmount
          ) {
            console.error(
              `Could not independently verify payment ${reference} before classifying its commission.`
            )

            return jsonResponse(
              {
                success: false,
                message: 'Could not verify payment settlement',
              },
              500
            )
          }

          // An ordinary transaction has no subaccount split.
          // Leave its commission payout_method as "transfer".
          const verifiedSubaccount =
            typeof verifiedTransaction.subaccount === 'string'
              ? verifiedTransaction.subaccount
              : verifiedTransaction.subaccount?.subaccount_code
              if (!verifiedSubaccount) {
  console.error(
    `Payment ${reference}: Paystack did not confirm the vendor subaccount. Refusing to mark this order paid.`
  )

  return jsonResponse(
    {
      success: false,
      message: 'Vendor split settlement could not be verified',
    },
    500
  )
}

          if (verifiedSubaccount) {
            const vendorOrder = paidVendorOrders[0]

            const mappingResponse = await supabaseRequest(
              env,
              `/rest/v1/vendor_paystack_subaccounts?vendor_id=eq.${encodeURIComponent(
                vendorOrder.vendor_id
              )}&select=subaccount_code&limit=2`,
              {
                method: 'GET',
              }
            )

            let mappings = null

            try {
              mappings = await mappingResponse.json()
            } catch {
              mappings = null
            }

            if (
              !mappingResponse.ok ||
              !Array.isArray(mappings) ||
              mappings.length !== 1 ||
              !mappings[0]?.subaccount_code
            ) {
              console.error(
                `Could not confirm the vendor subaccount for order ${order.id}.`
              )

              return jsonResponse(
                {
                  success: false,
                  message: 'Could not confirm split destination',
                },
                500
              )
            }

            const expectedCommission =
              Math.round(Number(vendorOrder.subtotal) * 10) / 100

            const expectedTransactionCharge =
              Math.round(expectedCommission * 100)

            if (
  verifiedSubaccount !== mappings[0].subaccount_code
) {
  console.error(
    `Split subaccount does not match the expected vendor for order ${order.id}.`
  )

  return jsonResponse(
    {
      success: false,
      message: 'Split settlement subaccount does not match',
    },
    500
  )
}

            const commissionResponse = await supabaseRequest(
              env,
              `/rest/v1/vendor_commissions?vendor_order_id=eq.${encodeURIComponent(
                vendorOrder.id
              )}&select=id&limit=2`,
              {
                method: 'GET',
              }
            )

            let commissions = null

            try {
              commissions = await commissionResponse.json()
            } catch {
              commissions = null
            }

            if (
              !commissionResponse.ok ||
              !Array.isArray(commissions) ||
              commissions.length !== 1
            ) {
              console.error(
                `Could not identify the commission for order ${order.id}.`
              )

              return jsonResponse(
                {
                  success: false,
                  message: 'Could not identify vendor commission',
                },
                500
              )
            }

            const markSplitResponse = await supabaseRequest(
              env,
              `/rest/v1/vendor_commissions?id=eq.${encodeURIComponent(
                commissions[0].id
              )}`,
              {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  Prefer: 'return=minimal',
                },
                body: JSON.stringify({
                  payout_method: 'split',
                  updated_at: new Date().toISOString(),
                }),
              }
            )

            if (!markSplitResponse.ok) {
              console.error(
                `Could not mark confirmed split commission for order ${order.id}:`,
                await markSplitResponse.text()
              )

              return jsonResponse(
                {
                  success: false,
                  message: 'Could not record confirmed split settlement',
                },
                500
              )
            }
          }

          if (
            order.payment_status !==
            'paid'
          ) {
            const paidAt =
              new Date().toISOString()

            const updateOrderResponse =
              await supabaseRequest(
                env,
                `/rest/v1/orders?id=eq.${encodeURIComponent(
                  order.id
                )}&payment_reference=eq.${encodeURIComponent(
                  reference
                )}`,
                {
                  method: 'PATCH',
                  headers: {
                    'Content-Type':
                      'application/json',
                    Prefer:
                      'return=minimal',
                  },
                  body: JSON.stringify({
                    payment_status:
                      'paid',
                    paid_at:
                      paidAt,
                    updated_at:
                      paidAt,
                  }),
                }
              )

            if (
              !updateOrderResponse.ok
            ) {
              console.error(
                `Could not mark customer order ${order.id} as paid from charge.success:`,
                await updateOrderResponse.text()
              )

              return jsonResponse(
                {
                  success: false,
                  message:
                    'Could not mark order as paid',
                },
                500
              )
            }

            const orderItemsResponse =
              await supabaseRequest(
                env,
                `/rest/v1/order_items?order_id=eq.${encodeURIComponent(
                  order.id
                )}&select=product_id`,
                {
                  method: 'GET',
                }
              )

            let orderItems = null

            try {
              orderItems =
                await orderItemsResponse.json()
            } catch {
              orderItems = null
            }

            if (
              orderItemsResponse.ok &&
              Array.isArray(
                orderItems
              )
            ) {
              for (
                const item of
                  orderItems
              ) {
                if (
                  !item?.product_id
                ) {
                  continue
                }

                const deleteCartResponse =
                  await supabaseRequest(
                    env,
                    `/rest/v1/cart_items?customer_id=eq.${encodeURIComponent(
                      order.customer_id
                    )}&product_id=eq.${encodeURIComponent(
                      item.product_id
                    )}`,
                    {
                      method: 'DELETE',
                      headers: {
                        Prefer:
                          'return=minimal',
                      },
                    }
                  )

                if (
                  !deleteCartResponse.ok
                ) {
                  console.error(
                    `Could not remove product ${item.product_id} from customer cart after charge.success payment:`,
                    await deleteCartResponse.text()
                  )
                }
              }
            }

            console.log(
              `Customer order ${order.id} marked paid from verified Paystack charge.success.`
            )
          }

          return jsonResponse({
            success: true,
            order:
              true,
            status:
              'paid',
          })
        }

        // -----------------------------------------------------
        // PAYOUT TRANSFER EVENTS
        // -----------------------------------------------------

        if (
          ![
            'transfer.success',
            'transfer.failed',
            'transfer.reversed',
          ].includes(
            eventName
          )
        ) {
          return jsonResponse({
            success: true,
            ignored: true,
          })
        }

        const transfer =
          event?.data

        const reference =
          transfer?.reference

        if (!reference) {
          return jsonResponse(
            {
              success: false,
              message:
                'Transfer reference missing',
            },
            400
          )
        }

        const payoutResponse =
          await supabaseRequest(
            env,
            `/rest/v1/vendor_payouts?paystack_reference=eq.${encodeURIComponent(
              reference
            )}&select=id,status,paystack_reference&limit=1`,
            {
              method: 'GET',
            }
          )

        let payouts = null

        try {
          payouts =
            await payoutResponse.json()
        } catch {
          payouts = null
        }

        if (
          !payoutResponse.ok
        ) {
          console.error(
            'Webhook payout lookup failed:',
            payouts
          )

          return jsonResponse(
            {
              success: false,
              message:
                'Could not find payout',
            },
            500
          )
        }

        if (
          !Array.isArray(payouts) ||
          !payouts.length
        ) {
          console.warn(
            `No vendor payout found for Paystack reference ${reference}`
          )

          return jsonResponse({
            success: true,
            ignored: true,
          })
        }

        const payout =
          payouts[0]

        if (
          payout.status ===
          'paid'
        ) {
          return jsonResponse({
            success: true,
            already_processed:
              true,
          })
        }

        if (
          payout.status ===
          'reversed'
        ) {
          return jsonResponse({
            success: true,
            already_processed:
              true,
          })
        }

        if (
          eventName ===
          'transfer.success'
        ) {
          if (
            ![
              'processing',
              'pending',
            ].includes(
              payout.status
            )
          ) {
            return jsonResponse({
              success: true,
              ignored: true,
            })
          }

          await updateVendorPayout(
            env,
            payout.id,
            {
              status: 'paid',
              paid_at:
                new Date().toISOString(),
              failure_reason:
                null,
            }
          )
        }

        if (
          eventName ===
          'transfer.failed'
        ) {
          if (
            ![
              'processing',
              'pending',
            ].includes(
              payout.status
            )
          ) {
            return jsonResponse({
              success: true,
              ignored: true,
            })
          }

          await updateVendorPayout(
            env,
            payout.id,
            {
              status: 'failed',
              failure_reason:
                transfer?.reason ||
                'Paystack transfer failed',
            }
          )
        }

        if (
          eventName ===
          'transfer.reversed'
        ) {
          if (
            ![
              'processing',
              'pending',
              'paid',
            ].includes(
              payout.status
            )
          ) {
            return jsonResponse({
              success: true,
              ignored: true,
            })
          }

          await updateVendorPayout(
            env,
            payout.id,
            {
              status: 'reversed',
              failure_reason:
                transfer?.reason ||
                'Paystack transfer was reversed',
            }
          )
        }

        return jsonResponse({
          success: true,
        })
      } catch (error) {
        console.error(
          'Paystack webhook error:',
          error
        )

        return jsonResponse(
          {
            success: false,
            message:
              error.message ||
              'Webhook processing failed',
          },
          500
        )
      }
    }

    // ---------------------------------------------------------
    // PAYOUTS: LOAD NIGERIAN BANKS
    // ---------------------------------------------------------

    if (
      url.pathname ===
        '/api/payouts/banks' &&
      request.method === 'GET'
    ) {
      try {
        const user =
          await getAuthenticatedUser(
            request,
            env
          )

        if (!user) {
          return jsonResponse(
            {
              success: false,
              message:
                'You must be logged in',
            },
            401
          )
        }

        const banksResponse =
          await fetch(
            'https://api.paystack.co/bank?country=nigeria&currency=NGN&perPage=100',
            {
              method: 'GET',
              headers: {
                Authorization:
                  `Bearer ${env.PAYSTACK_SECRET_KEY}`,
              },
            }
          )

        const banksData =
          await banksResponse.json()

        if (
          !banksResponse.ok ||
          !banksData.status ||
          !Array.isArray(
            banksData.data
          )
        ) {
          return jsonResponse(
            {
              success: false,
              message:
                banksData.message ||
                'Could not load Nigerian banks',
            },
            400
          )
        }

        const banks =
          banksData.data
            .filter(
              (bank) =>
                bank.name &&
                bank.code
            )
            .map(
              (bank) => ({
                name: bank.name,
                code: bank.code,
              })
            )

        return jsonResponse({
          status: true,
          data: banks,
        })
      } catch (error) {
        console.error(
          'Bank list error:',
          error
        )

        return jsonResponse(
          {
            success: false,
            message:
              error.message ||
              'Could not load banks',
          },
          500
        )
      }
    }

    // ---------------------------------------------------------
    // PAYOUTS: RESOLVE BANK ACCOUNT
    // ---------------------------------------------------------

    if (
      url.pathname ===
        '/api/payouts/resolve-account' &&
      request.method === 'POST'
    ) {
      try {
        const user =
          await getAuthenticatedUser(
            request,
            env
          )

        if (!user) {
          return jsonResponse(
            {
              success: false,
              message:
                'Invalid or expired session',
            },
            401
          )
        }

        const body =
          await request.json()

        const accountNumber =
          String(
            body.account_number ??
              ''
          ).trim()

        const bankCode =
          String(
            body.bank_code ??
              ''
          ).trim()

        if (
          !/^\d{10}$/.test(
            accountNumber
          )
        ) {
          return jsonResponse(
            {
              success: false,
              message:
                'Account number must be 10 digits',
            },
            400
          )
        }

        if (!bankCode) {
          return jsonResponse(
            {
              success: false,
              message:
                'Bank code is required',
            },
            400
          )
        }

        const resolveResponse =
          await fetch(
            `https://api.paystack.co/bank/resolve?account_number=${encodeURIComponent(
              accountNumber
            )}&bank_code=${encodeURIComponent(
              bankCode
            )}`,
            {
              method: 'GET',
              headers: {
                Authorization:
                  `Bearer ${env.PAYSTACK_SECRET_KEY}`,
              },
            }
          )

        const resolveData =
          await resolveResponse.json()

        if (
          !resolveResponse.ok ||
          !resolveData.status ||
          !resolveData.data
            ?.account_name
        ) {
          return jsonResponse(
            {
              success: false,
              message:
                resolveData.message ||
                'Could not verify this bank account',
            },
            400
          )
        }

        return jsonResponse({
          success: true,
          account_number:
            resolveData.data
              .account_number,
          account_name:
            resolveData.data
              .account_name,
          bank_code:
            bankCode,
        })
      } catch (error) {
        console.error(
          'Bank account resolution error:',
          error
        )

        return jsonResponse(
          {
            success: false,
            message:
              error.message ||
              'Could not verify bank account',
          },
          500
        )
      }
    }

    // ---------------------------------------------------------
    // PAYOUTS: VERIFY EXISTING PAYSTACK RECIPIENT
    // ---------------------------------------------------------

    if (
      url.pathname ===
        '/api/payouts/verify-recipient' &&
      request.method === 'GET'
    ) {
      try {
        const user =
          await getAuthenticatedUser(
            request,
            env
          )

        if (!user) {
          return jsonResponse(
            {
              success: false,
              message:
                'You must be logged in',
            },
            401
          )
        }

        const accountResponse =
          await supabaseRequest(
            env,
            `/rest/v1/vendor_payout_accounts?vendor_id=eq.${encodeURIComponent(
              user.id
            )}&select=paystack_recipient_code&limit=1`,
            {
              method: 'GET',
            }
          )

        let accountData = null

        try {
          accountData =
            await accountResponse.json()
        } catch {
          accountData = null
        }

        if (
          !accountResponse.ok ||
          !Array.isArray(
            accountData
          ) ||
          !accountData.length ||
          !accountData[0]
            ?.paystack_recipient_code
        ) {
          return jsonResponse(
            {
              success: false,
              message:
                'No Paystack recipient is configured for this vendor account',
            },
            404
          )
        }

        const recipientCode =
          accountData[0]
            .paystack_recipient_code

        const recipientResponse =
          await fetch(
            `https://api.paystack.co/transferrecipient/${encodeURIComponent(
              recipientCode
            )}`,
            {
              method: 'GET',
              headers: {
                Authorization:
                  `Bearer ${env.PAYSTACK_SECRET_KEY}`,
              },
            }
          )

        let recipientData = null

        try {
          recipientData =
            await recipientResponse.json()
        } catch {
          recipientData = null
        }

        console.log(
          'Paystack recipient verification:',
          JSON.stringify({
            httpStatus:
              recipientResponse.status,
            status:
              recipientData?.status,
            message:
              recipientData?.message,
            recipientCode:
              recipientData?.data
                ?.recipient_code,
            domain:
              recipientData?.data
                ?.domain,
            active:
              recipientData?.data
                ?.active,
          })
        )

        if (
          !recipientResponse.ok ||
          recipientData?.status !==
            true
        ) {
          return jsonResponse(
            {
              success: false,
              message:
                recipientData?.message ||
                'Paystack recipient could not be verified',
              recipient: null,
            },
            recipientResponse.status ||
              400
          )
        }

        const recipient =
          recipientData.data

        const accountNumber =
          recipient?.details
            ?.account_number
            ? String(
                recipient.details
                  .account_number
              )
            : null

        return jsonResponse({
          success: true,
          message:
            'Paystack recipient verified successfully',
          recipient: {
            recipient_code:
              recipient.recipient_code,
            active:
              recipient.active,
            domain:
              recipient.domain,
            currency:
              recipient.currency,
            account_name:
              recipient.details
                ?.account_name ||
              null,
            account_number_last4:
              accountNumber
                ? accountNumber.slice(-4)
                : null,
            bank_code:
              recipient.details
                ?.bank_code ||
              null,
            bank_name:
              recipient.details
                ?.bank_name ||
              null,
          },
        })
      } catch (error) {
        console.error(
          'Paystack recipient verification error:',
          error
        )

        return jsonResponse(
          {
            success: false,
            message:
              error.message ||
              'Could not verify Paystack recipient',
          },
          500
        )
      }
    }

    // ---------------------------------------------------------
    // PAYOUTS: CREATE PAYSTACK RECIPIENT
    // ---------------------------------------------------------

    if (
      url.pathname ===
        '/api/payouts/prepare-recipient' &&
      request.method === 'POST'
    ) {
      try {
        const user =
          await getAuthenticatedUser(
            request,
            env
          )

        if (!user) {
          return jsonResponse(
            {
              success: false,
              message:
                'Invalid or expired session',
            },
            401
          )
        }

        const accountResponse =
          await supabaseRequest(
            env,
            `/rest/v1/vendor_payout_accounts?vendor_id=eq.${encodeURIComponent(
              user.id
            )}&select=id,vendor_id,account_name,bank_code,bank_name,account_number,paystack_recipient_code,is_verified,is_active`,
            {
              method: 'GET',
            }
          )

        const accountData =
          await accountResponse.json()

        if (
          !accountResponse.ok
        ) {
          console.error(
            'Payout account lookup failed:',
            accountData
          )

          return jsonResponse(
            {
              success: false,
              message:
                'Could not retrieve your payout account',
            },
            500
          )
        }

        if (
          !Array.isArray(
            accountData
          ) ||
          !accountData.length
        ) {
          return jsonResponse(
            {
              success: false,
              message:
                'Please save and verify your payout account first',
            },
            400
          )
        }

        const account =
          accountData[0]

        if (
          !account.is_verified ||
          !account.is_active
        ) {
          return jsonResponse(
            {
              success: false,
              message:
                'Your payout account is not verified or active',
            },
            400
          )
        }

        if (
          account.paystack_recipient_code
        ) {
          return jsonResponse({
            success: true,
            message:
              'Paystack recipient is already configured',
            recipient_code:
              account.paystack_recipient_code,
          })
        }

        const recipientResponse =
          await fetch(
            'https://api.paystack.co/transferrecipient',
            {
              method: 'POST',
              headers: {
                Authorization:
                  `Bearer ${env.PAYSTACK_SECRET_KEY}`,
                'Content-Type':
                  'application/json',
              },
              body: JSON.stringify({
                type: 'nuban',
                name:
                  account.account_name,
                account_number:
                  account.account_number,
                bank_code:
                  account.bank_code,
                currency: 'NGN',
              }),
            }
          )

        const recipientData =
          await recipientResponse.json()

        if (
          !recipientResponse.ok ||
          !recipientData.status ||
          !recipientData.data
            ?.recipient_code
        ) {
          console.error(
            'Paystack recipient creation failed:',
            recipientData
          )

          return jsonResponse(
            {
              success: false,
              message:
                recipientData.message ||
                'Could not create Paystack recipient',
            },
            400
          )
        }

        const recipientCode =
          recipientData.data
            .recipient_code

        const updateResponse =
          await supabaseRequest(
            env,
            `/rest/v1/vendor_payout_accounts?id=eq.${encodeURIComponent(
              account.id
            )}`,
            {
              method: 'PATCH',
              headers: {
                'Content-Type':
                  'application/json',
                Prefer:
                  'return=representation',
              },
              body: JSON.stringify({
                account_name:
                  account.account_name,
                paystack_recipient_code:
                  recipientCode,
                is_verified: true,
                is_active: true,
                updated_at:
                  new Date().toISOString(),
              }),
            }
          )

        const updateData =
          await updateResponse.json()

        if (
          !updateResponse.ok
        ) {
          console.error(
            'Could not save recipient code:',
            updateData
          )

          return jsonResponse(
            {
              success: false,
              message:
                'Paystack recipient was created, but could not be saved to the vendor account',
            },
            500
          )
        }

        return jsonResponse({
          success: true,
          message:
            'Paystack recipient configured successfully',
          recipient_code:
            recipientCode,
        })
      } catch (error) {
        console.error(
          'Prepare payout recipient error:',
          error
        )

        return jsonResponse(
          {
            success: false,
            message:
              error.message ||
              'Could not prepare payout recipient',
          },
          500
        )
      }
    }
    // ---------------------------------------------------------
    // PAYMENTS: INITIALIZE PAYSTACK PAYMENT
    // ---------------------------------------------------------

    if (
      url.pathname ===
        '/api/payments/initialize' &&
      request.method === 'POST'
    ) {
      try {
        const authHeader =
          request.headers.get(
            'Authorization'
          )

        if (
          !authHeader?.startsWith(
            'Bearer '
          )
        ) {
          return jsonResponse(
            {
              success: false,
              message:
                'You must be logged in',
            },
            401
          )
        }

        const accessToken =
          authHeader
            .replace(
              'Bearer ',
              ''
            )
            .trim()

        const body =
          await request.json()

        const {
          order_id,
        } = body

        if (!order_id) {
          return jsonResponse(
            {
              success: false,
              message:
                'Order ID is required',
            },
            400
          )
        }

        const internalReference =
          `UM-${order_id}-${crypto.randomUUID()}`

        const prepareResponse =
          await fetch(
            `${env.SUPABASE_URL}/rest/v1/rpc/prepare_order_payment`,
            {
              method: 'POST',
              headers: {
                'Content-Type':
                  'application/json',
                apikey:
                  env.SUPABASE_PUBLISHABLE_KEY,
                Authorization:
                  `Bearer ${accessToken}`,
              },
              body: JSON.stringify({
                p_order_id:
                  order_id,
                p_reference:
                  internalReference,
              }),
            }
          )

        const prepareData =
          await prepareResponse.json()

        if (
          !prepareResponse.ok
        ) {
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

        if (
          !Array.isArray(
            prepareData
          ) ||
          !prepareData.length
        ) {
          return jsonResponse(
            {
              success: false,
              message:
                'Could not prepare order for payment',
            },
            400
          )
        }

        const paymentInfo =
          prepareData[0]

        const amountInKobo =
          Math.round(
            Number(
              paymentInfo.total_amount
            ) * 100
          )

        if (
          !Number.isFinite(
            amountInKobo
          ) ||
          amountInKobo <= 0
        ) {
          return jsonResponse(
            {
              success: false,
              message:
                'Invalid order amount',
            },
            400
          )
        }
        // PREPARE PAYSTACK SPLIT PAYMENT

        // 1. Find the vendor order.
        const vendorOrderResponse = await supabaseRequest(
          env,
          `/rest/v1/vendor_orders?select=id,vendor_id,subtotal&order_id=eq.${encodeURIComponent(order_id)}&limit=2`
        )

        let vendorOrders = null

        try {
          vendorOrders = await vendorOrderResponse.json()
        } catch {
          vendorOrders = null
        }

        if (
          !vendorOrderResponse.ok ||
          !Array.isArray(vendorOrders) ||
          vendorOrders.length !== 1
        ) {
          return jsonResponse({
            success: false,
            message: 'Could not identify the vendor for this order',
          }, 400)
        }

        const vendorOrder = vendorOrders[0]
        const vendorId = vendorOrder.vendor_id
        const productSubtotal = Number(vendorOrder.subtotal)

        if (
          !Number.isFinite(productSubtotal) ||
          productSubtotal <= 0
        ) {
          return jsonResponse({
            success: false,
            message: 'Invalid vendor order subtotal',
          }, 400)
        }

        // 2. Find the vendor's verified, active bank account.
        const accountResponse = await supabaseRequest(
          env,
          `/rest/v1/vendor_payout_accounts?select=id,vendor_id,account_name,bank_code,bank_name,account_number,is_verified,is_active&vendor_id=eq.${encodeURIComponent(vendorId)}&limit=1`
        )

        let accounts = null

        try {
          accounts = await accountResponse.json()
        } catch {
          accounts = null
        }

        if (
          !accountResponse.ok ||
          !Array.isArray(accounts) ||
          accounts.length !== 1 ||
          accounts[0].is_verified !== true ||
          accounts[0].is_active !== true
        ) {
          return jsonResponse({
            success: false,
            message: 'The vendor must have a verified, active payout account before checkout can proceed',
          }, 400)
        }

        const payoutAccount = accounts[0]

        // 3. Look for an existing Paystack subaccount.
        const subaccountResponse = await supabaseRequest(
          env,
          `/rest/v1/vendor_paystack_subaccounts?select=payout_account_id,subaccount_code&vendor_id=eq.${encodeURIComponent(vendorId)}&limit=1`
        )

        let subaccounts = null

        try {
          subaccounts = await subaccountResponse.json()
        } catch {
          subaccounts = null
        }

        if (
          !subaccountResponse.ok ||
          !Array.isArray(subaccounts)
        ) {
          return jsonResponse({
            success: false,
            message: 'Could not retrieve the vendor Paystack subaccount',
          }, 500)
        }

        let subaccountCode = null

        if (subaccounts.length > 0) {
          const existingSubaccount = subaccounts[0]

          // Never pay an outdated bank account silently.
          if (
            existingSubaccount.payout_account_id !== payoutAccount.id
          ) {
            return jsonResponse({
              success: false,
              message: 'The vendor payout account has changed. The Paystack subaccount must be updated before accepting payments.',
            }, 400)
          }

          subaccountCode = existingSubaccount.subaccount_code
        } else {
          // 4. Create the Paystack subaccount.
          const createSubaccountResponse = await fetch(
            'https://api.paystack.co/subaccount',
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                business_name: `UniAbuja Market - ${payoutAccount.account_name}`,
                settlement_bank: payoutAccount.bank_code,
                account_number: payoutAccount.account_number,
                percentage_charge: 0,
                description: 'UniAbuja Market vendor settlement',
              }),
            }
          )

          let createdSubaccount = null

          try {
            createdSubaccount = await createSubaccountResponse.json()
          } catch {
            createdSubaccount = null
          }

          if (
            !createSubaccountResponse.ok ||
            !createdSubaccount?.status ||
            !createdSubaccount.data?.subaccount_code
          ) {
            console.error(
              'Paystack subaccount creation failed:',
              createdSubaccount?.message
            )

            return jsonResponse({
              success: false,
              message: 'Could not set up the vendor Paystack subaccount',
            }, 400)
          }

          subaccountCode = createdSubaccount.data.subaccount_code

          // 5. Save the subaccount mapping.
          const saveSubaccountResponse = await supabaseRequest(
            env,
            '/rest/v1/vendor_paystack_subaccounts',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Prefer: 'return=minimal',
              },
              body: JSON.stringify({
                vendor_id: vendorId,
                payout_account_id: payoutAccount.id,
                subaccount_code: subaccountCode,
              }),
            }
          )

          if (!saveSubaccountResponse.ok) {
            console.error(
              'Could not save vendor subaccount mapping:',
              await saveSubaccountResponse.text()
            )

            return jsonResponse({
              success: false,
              message: 'Could not save the vendor Paystack subaccount. Please retry.',
            }, 500)
          }
        }

        // 6. Calculate the platform's 10% commission.
        const commissionAmount =
          Math.round(productSubtotal * 10) / 100

        const transactionCharge =
          Math.round(commissionAmount * 100)

        if (
          transactionCharge <= 0 ||
          transactionCharge >= amountInKobo
        ) {
          return jsonResponse({
            success: false,
            message: 'Invalid platform commission for this order',
          }, 400)
        }

        const paystackResponse =
          await fetch(
            'https://api.paystack.co/transaction/initialize',
            {
              method: 'POST',
              headers: {
                Authorization:
                  `Bearer ${env.PAYSTACK_SECRET_KEY}`,
                'Content-Type':
                  'application/json',
              },
              body: JSON.stringify({
  email: paymentInfo.customer_email,
  amount: amountInKobo,
  reference: internalReference,
  currency: 'NGN',

  // Vendor receives the remainder.
  subaccount: subaccountCode,

  // Platform receives 10% of the product subtotal.
  // Paystack expects this value in kobo.
  transaction_charge: transactionCharge,

  // Platform bears Paystack transaction fees.
  bearer: 'subaccount',

  callback_url:
    `${getAppUrl(env, request)}/payment/callback`,
}),
            }
          )

        const paystackData =
          await paystackResponse.json()

        if (
          !paystackResponse.ok ||
          !paystackData.status ||
          !paystackData.data
            ?.authorization_url ||
          !paystackData.data
            ?.reference
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

        const paystackReference =
          paystackData.data
            .reference

        return jsonResponse({
          success: true,
          authorization_url:
            paystackData.data
              .authorization_url,
          reference:
            paystackReference,
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

    // ---------------------------------------------------------
    // VENDOR SUBSCRIPTION INITIALIZATION
    // ---------------------------------------------------------

    if (
      [
        '/api/vendor-subscription/initialize',
        '/api/subscriptions/initialize',
      ].includes(
        url.pathname
      ) &&
      request.method === 'POST'
    ) {
      try {
        const user =
          await getAuthenticatedUser(
            request,
            env
          )

        if (!user?.id) {
          return jsonResponse(
            {
              success: false,
              message:
                'You must be logged in',
            },
            401
          )
        }

        if (!user.email) {
          return jsonResponse(
            {
              success: false,
              message:
                'Your account does not have an email address',
            },
            400
          )
        }

        if (
          !env.PAYSTACK_VENDOR_PLAN_CODE
        ) {
          console.error(
            'PAYSTACK_VENDOR_PLAN_CODE is not configured.'
          )

          return jsonResponse(
            {
              success: false,
              message:
                'Vendor subscription plan is not configured',
            },
            500
          )
        }

        const profileResponse =
          await supabaseRequest(
            env,
            `/rest/v1/profiles?id=eq.${encodeURIComponent(
              user.id
            )}&select=id,role&limit=1`,
            {
              method: 'GET',
            }
          )

        let profiles = null

        try {
          profiles =
            await profileResponse.json()
        } catch {
          profiles = null
        }

        if (
          !profileResponse.ok ||
          !Array.isArray(
            profiles
          ) ||
          !profiles.length
        ) {
          console.error(
            'Could not verify vendor profile:',
            profiles
          )

          return jsonResponse(
            {
              success: false,
              message:
                'Could not verify your vendor account',
            },
            400
          )
        }

        if (
          profiles[0].role !==
          'vendor'
        ) {
          return jsonResponse(
            {
              success: false,
              message:
                'Only vendors can start a vendor subscription',
            },
            403
          )
        }

        const subscriptionResponse =
          await supabaseRequest(
            env,
            `/rest/v1/vendor_subscriptions?vendor_id=eq.${encodeURIComponent(
              user.id
            )}&select=id,status,monthly_price,trial_ends_at,current_period_end,grace_period_ends_at&limit=1`,
            {
              method: 'GET',
            }
          )

        let subscriptions = null

        try {
          subscriptions =
            await subscriptionResponse.json()
        } catch {
          subscriptions = null
        }

        if (
          !subscriptionResponse.ok ||
          !Array.isArray(
            subscriptions
          ) ||
          !subscriptions.length
        ) {
          console.error(
            'Could not load vendor subscription:',
            subscriptions
          )

          return jsonResponse(
            {
              success: false,
              message:
                'Vendor subscription record not found',
            },
            404
          )
        }

        const subscription =
          subscriptions[0]

        if (
          [
            'active',
            'trialing',
          ].includes(
            subscription.status
          )
        ) {
          return jsonResponse(
            {
              success: false,
              message:
                'Your vendor subscription is already active',
            },
            400
          )
        }

        const monthlyPrice =
          Number(
            subscription.monthly_price
          )

        if (
          !Number.isFinite(
            monthlyPrice
          ) ||
          monthlyPrice <= 0
        ) {
          return jsonResponse(
            {
              success: false,
              message:
                'Invalid vendor subscription amount',
            },
            400
          )
        }

        const internalReference =
          `UM-VSUB-${user.id}-${crypto.randomUUID()}`

        const paystackResponse =
          await fetch(
            'https://api.paystack.co/transaction/initialize',
            {
              method: 'POST',
              headers: {
                Authorization:
                  `Bearer ${env.PAYSTACK_SECRET_KEY}`,
                'Content-Type':
                  'application/json',
              },
              body: JSON.stringify({
                email:
                  user.email,
                amount:
                  Math.round(
                    monthlyPrice * 100
                  ),
                reference:
                  internalReference,
                currency: 'NGN',
                plan:
                  env.PAYSTACK_VENDOR_PLAN_CODE,
                callback_url:
                  `${getAppUrl(
                    env,
                    request
                  )}/vendor-subscription/callback`,
                metadata:
                  {
                    vendor_id:
                      user.id,
                    subscription_id:
                      subscription.id,
                    purpose:
                      'vendor_subscription',
                  },
              }),
            }
          )

        const paystackData =
          await paystackResponse.json()

        if (
          !paystackResponse.ok ||
          !paystackData.status ||
          !paystackData.data
            ?.authorization_url ||
          !paystackData.data
            ?.reference
        ) {
          console.error(
            'Vendor subscription Paystack initialization failed:',
            paystackData
          )

          return jsonResponse(
            {
              success: false,
              message:
                paystackData.message ||
                'Paystack could not initialize the vendor subscription',
            },
            400
          )
        }

        console.log(
          'Vendor subscription initialized:',
          JSON.stringify({
            vendor_id:
              user.id,
            subscription_id:
              subscription.id,
            reference:
              paystackData.data
                .reference,
          })
        )

        return jsonResponse({
          success: true,
          authorization_url:
            paystackData.data
              .authorization_url,
          reference:
            paystackData.data
              .reference,
        })
      } catch (error) {
        console.error(
          'Vendor subscription initialization error:',
          error
        )

        return jsonResponse(
          {
            success: false,
            message:
              error.message ||
              'Vendor subscription initialization failed',
          },
          500
        )
      }
    }

    // ---------------------------------------------------------
    // VENDOR SUBSCRIPTION CALLBACK
    // ---------------------------------------------------------

    if (
      url.pathname ===
        '/vendor-subscription/callback' &&
      request.method === 'GET'
    ) {
      try {
        const reference =
          url.searchParams.get(
            'reference'
          )

        if (!reference) {
          return Response.redirect(
            `${getAppUrl(
              env,
              request
            )}/?subscription=error`,
            303
          )
        }

        const verifyResponse =
          await fetch(
            `https://api.paystack.co/transaction/verify/${encodeURIComponent(
              reference
            )}`,
            {
              method: 'GET',
              headers: {
                Authorization:
                  `Bearer ${env.PAYSTACK_SECRET_KEY}`,
              },
            }
          )

        let verifyData = null

        try {
          verifyData =
            await verifyResponse.json()
        } catch {
          verifyData = null
        }

        if (
          !verifyResponse.ok ||
          !verifyData?.status ||
          verifyData.data
            ?.status !==
            'success'
        ) {
          return Response.redirect(
            `${getAppUrl(
              env,
              request
            )}/?subscription=failed&reference=${encodeURIComponent(
              reference
            )}`,
            303
          )
        }

        const transaction =
          verifyData.data
          if (
  transaction.reference !== reference ||
  transaction.currency !== 'NGN' ||
  transaction.status !== 'success'
) {
  console.error(
    'Vendor subscription callback: Paystack reference, currency, or status validation failed.'
  )

  return Response.redirect(
    `${getAppUrl(
      env,
      request
    )}/?subscription=error`,
    303
  )
}

        if (
          transaction?.reference !== reference ||
          transaction?.currency !== 'NGN'
        ) {
          console.error(
            'Vendor subscription callback reference or currency mismatch.'
          )

          return Response.redirect(
            `${getAppUrl(
              env,
              request
            )}/?subscription=failed&reference=${encodeURIComponent(
              reference
            )}`,
            303
          )
        }

        const metadata =
          transaction.metadata ||
          {}

        let parsedMetadata =
          metadata

        if (
          typeof metadata ===
          'string'
        ) {
          try {
            parsedMetadata =
              JSON.parse(metadata)
          } catch {
            parsedMetadata = {}
          }
        }

        const subscriptionId =
          parsedMetadata
            ?.subscription_id

        const vendorId =
          parsedMetadata
            ?.vendor_id

        if (
          parsedMetadata?.purpose !==
            'vendor_subscription' ||
          !subscriptionId ||
          !vendorId
        ) {
          return Response.redirect(
            `${getAppUrl(
              env,
              request
            )}/?subscription=error`,
            303
          )
        }

        const subscription =
          await findVendorSubscriptionById(
            env,
            subscriptionId
          )

        if (
          !subscription ||
          subscription.vendor_id !==
            vendorId
        ) {
          return Response.redirect(
            `${getAppUrl(
              env,
              request
            )}/?subscription=error`,
            303
          )
        }

        const expectedAmount =
          Math.round(
            Number(
              subscription.monthly_price
            ) * 100
          )

        const paidAmount =
          Number(
            transaction.amount
          )

        if (
          !Number.isFinite(
            expectedAmount
          ) ||
          !Number.isFinite(
            paidAmount
          ) ||
          paidAmount !==
            expectedAmount
        ) {
          console.error(
            `Vendor subscription ${subscription.id}: callback payment amount mismatch.`
          )

          return Response.redirect(
            `${getAppUrl(
              env,
              request
            )}/?subscription=error`,
            303
          )
        }

        // Prevent a repeated callback from resetting an
        // already-active subscription period.
        if (
          subscription.status === 'active' &&
          subscription.current_period_end &&
          new Date(
            subscription.current_period_end
          ).getTime() > Date.now()
        ) {
          console.log(
            `Vendor subscription ${subscription.id} is already active. Duplicate activation skipped.`
          )

          return Response.redirect(
            `${getAppUrl(
              env,
              request
            )}/?subscription=success`,
            303
          )
        }

        const periodStart =
          normalizePaystackDate(
            transaction.paid_at
          ) ||
          new Date().toISOString()

        const periodEnd =
          addDays(
            new Date(
              periodStart
            ),
            30
          ).toISOString()

        const paymentResult =
  await processVendorSubscriptionPayment(
    env,
    {
      subscriptionId: subscription.id,
      vendorId: vendorId,
      reference: reference,
      amountKobo: paidAmount,
      currency: transaction.currency,
      paidAt:
        normalizePaystackDate(
          transaction.paid_at
        ) || periodStart,
      periodStart: periodStart,
      periodEnd: periodEnd,
      customerCode:
        transaction.customer?.customer_code ||
        null,
      subscriptionCode:
        transaction.subscription?.subscription_code ||
        null,
    }
  )

console.log(
  `Vendor subscription ${subscription.id} callback processed. Already processed: ${paymentResult.already_processed}.`
)

        return Response.redirect(
          `${getAppUrl(
            env,
            request
          )}/?subscription=success`,
          303
        )
      } catch (error) {
        console.error(
          'Vendor subscription callback error:',
          error
        )

        return Response.redirect(
          `${getAppUrl(
            env,
            request
          )}/?subscription=error`,
          303
        )
      }
    }

    // ---------------------------------------------------------
    // PAYMENT CALLBACK
    // ---------------------------------------------------------

    if (
      url.pathname ===
        '/payment/callback' &&
      request.method === 'GET'
    ) {
      try {
        const reference =
          url.searchParams.get(
            'reference'
          )

        if (!reference) {
          return Response.redirect(
            `${getAppUrl(
              env,
              request
            )}/?payment=error`,
            303
          )
        }

        const verifyResponse =
          await fetch(
            `https://api.paystack.co/transaction/verify/${encodeURIComponent(
              reference
            )}`,
            {
              method: 'GET',
              headers: {
                Authorization:
                  `Bearer ${env.PAYSTACK_SECRET_KEY}`,
              },
            }
          )

        const verifyData =
          await verifyResponse.json()

        if (
          !verifyResponse.ok ||
          !verifyData.status ||
          verifyData.data
            ?.status !==
            'success'
        ) {
          return Response.redirect(
            `${getAppUrl(
              env,
              request
            )}/?payment=failed&reference=${encodeURIComponent(
              reference
            )}`,
            303
          )
        }

                const transaction =
          verifyData.data

        if (
          transaction?.reference !== reference ||
          transaction?.currency !== 'NGN'
        ) {
          console.error(
            'Customer payment callback reference or currency mismatch.'
          )

          return Response.redirect(
            `${getAppUrl(
              env,
              request
            )}/?payment=failed&reference=${encodeURIComponent(
              reference
            )}`,
            303
          )
        }

        const orderResponse =
          await supabaseRequest(
            env,
            `/rest/v1/orders?payment_reference=eq.${encodeURIComponent(
              reference
            )}&select=id,total_amount,payment_reference,payment_status,customer_id&limit=1`,
            {
              method: 'GET',
            }
          )

        const orders =
          await orderResponse.json()

        if (
          !orderResponse.ok ||
          !Array.isArray(
            orders
          ) ||
          !orders.length
        ) {
          return Response.redirect(
            `${getAppUrl(
              env,
              request
            )}/?payment=error&reference=${encodeURIComponent(
              reference
            )}`,
            303
          )
        }

        const order =
          orders[0]

        const paidAmount =
          Number(
            transaction.amount
          )

        const expectedAmount =
          Math.round(
            Number(
              order.total_amount
            ) * 100
          )

        if (
          paidAmount !==
          expectedAmount
        ) {
          return Response.redirect(
            `${getAppUrl(
              env,
              request
            )}/?payment=error&order_id=${encodeURIComponent(
              order.id
            )}`,
            303
          )
        }

        if (
          order.payment_reference !==
          reference
        ) {
          return Response.redirect(
            `${getAppUrl(
              env,
              request
            )}/?payment=error&order_id=${encodeURIComponent(
              order.id
            )}`,
            303
          )
        }
                // Identify the vendor order before allowing the order to be marked paid.
        const callbackVendorOrderResponse = await supabaseRequest(
          env,
          `/rest/v1/vendor_orders?order_id=eq.${encodeURIComponent(
            order.id
          )}&select=id,vendor_id,subtotal&limit=2`,
          { method: 'GET' }
        )

        let callbackVendorOrders = null

        try {
          callbackVendorOrders = await callbackVendorOrderResponse.json()
        } catch {
          callbackVendorOrders = null
        }

        if (
          !callbackVendorOrderResponse.ok ||
          !Array.isArray(callbackVendorOrders) ||
          callbackVendorOrders.length !== 1
        ) {
          console.error(
            `Could not identify vendor order for callback payment ${order.id}.`
          )

          return Response.redirect(
            `${getAppUrl(env, request)}/?payment=processing&order_id=${encodeURIComponent(order.id)}`,
            303
          )
        }

        const callbackVerifiedSubaccount =
          typeof transaction.subaccount === 'string'
            ? transaction.subaccount
            : transaction.subaccount?.subaccount_code

        if (!callbackVerifiedSubaccount) {
          console.error(
            `Payment ${reference} has no verified Paystack subaccount. Do not release a vendor payout until settlement is reconciled.`
          )

          return Response.redirect(
            `${getAppUrl(env, request)}/?payment=processing&order_id=${encodeURIComponent(order.id)}`,
            303
          )
        }

        const callbackVendorOrder = callbackVendorOrders[0]

        const callbackMappingResponse = await supabaseRequest(
          env,
          `/rest/v1/vendor_paystack_subaccounts?vendor_id=eq.${encodeURIComponent(
            callbackVendorOrder.vendor_id
          )}&select=subaccount_code&limit=2`,
          { method: 'GET' }
        )

        let callbackMappings = null

        try {
          callbackMappings = await callbackMappingResponse.json()
        } catch {
          callbackMappings = null
        }

        if (
          !callbackMappingResponse.ok ||
          !Array.isArray(callbackMappings) ||
          callbackMappings.length !== 1 ||
          callbackMappings[0]?.subaccount_code !== callbackVerifiedSubaccount
        ) {
          console.error(
            `Paystack subaccount mismatch for callback payment ${reference}.`
          )

          return Response.redirect(
            `${getAppUrl(env, request)}/?payment=processing&order_id=${encodeURIComponent(order.id)}`,
            303
          )
        }

        const callbackCommissionResponse = await supabaseRequest(
          env,
          `/rest/v1/vendor_commissions?vendor_order_id=eq.${encodeURIComponent(
            callbackVendorOrder.id
          )}&select=id&limit=2`,
          { method: 'GET' }
        )

        let callbackCommissions = null

        try {
          callbackCommissions = await callbackCommissionResponse.json()
        } catch {
          callbackCommissions = null
        }

        if (
          !callbackCommissionResponse.ok ||
          !Array.isArray(callbackCommissions) ||
          callbackCommissions.length !== 1
        ) {
          console.error(
            `Could not identify commission for callback payment ${reference}.`
          )

          return Response.redirect(
            `${getAppUrl(env, request)}/?payment=processing&order_id=${encodeURIComponent(order.id)}`,
            303
          )
        }

        const callbackMarkSplitResponse = await supabaseRequest(
          env,
          `/rest/v1/vendor_commissions?id=eq.${encodeURIComponent(
            callbackCommissions[0].id
          )}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Prefer: 'return=minimal',
            },
            body: JSON.stringify({
              payout_method: 'split',
              updated_at: new Date().toISOString(),
            }),
          }
        )

        if (!callbackMarkSplitResponse.ok) {
          console.error(
            `Could not record split settlement for callback payment ${reference}:`,
            await callbackMarkSplitResponse.text()
          )

          return Response.redirect(
            `${getAppUrl(env, request)}/?payment=processing&order_id=${encodeURIComponent(order.id)}`,
            303
          )
        }

        if (
          order.payment_status !==
          'paid'
        ) {
          const paidAt =
            new Date().toISOString()

          const updateOrderResponse =
            await supabaseRequest(
              env,
              `/rest/v1/orders?id=eq.${encodeURIComponent(
                order.id
              )}&payment_reference=eq.${encodeURIComponent(
                reference
              )}`,
              {
                method: 'PATCH',
                headers: {
                  'Content-Type':
                    'application/json',
                  Prefer:
                    'return=minimal',
                },
                body: JSON.stringify({
                  payment_status:
                    'paid',
                  paid_at:
                    paidAt,
                  updated_at:
                    paidAt,
                }),
              }
            )

          if (
            !updateOrderResponse.ok
          ) {
            const updateError =
              await updateOrderResponse.text()

            console.error(
              'Could not mark order as paid:',
              updateError
            )

            return Response.redirect(
              `${getAppUrl(
                env,
                request
              )}/?payment=processing&order_id=${encodeURIComponent(
                order.id
              )}`,
              303
            )
          }

          const orderItemsResponse =
            await supabaseRequest(
              env,
              `/rest/v1/order_items?order_id=eq.${encodeURIComponent(
                order.id
              )}&select=product_id`,
              {
                method: 'GET',
              }
            )

          let orderItems = null

          try {
            orderItems =
              await orderItemsResponse.json()
          } catch {
            orderItems = null
          }

          if (
            orderItemsResponse.ok &&
            Array.isArray(
              orderItems
            )
          ) {
            for (
              const item of
                orderItems
            ) {
              if (
                !item?.product_id
              ) {
                continue
              }

              const deleteCartResponse =
                await supabaseRequest(
                  env,
                  `/rest/v1/cart_items?customer_id=eq.${encodeURIComponent(
                    order.customer_id
                  )}&product_id=eq.${encodeURIComponent(
                    item.product_id
                  )}`,
                  {
                    method: 'DELETE',
                    headers: {
                      Prefer:
                        'return=minimal',
                    },
                  }
                )

              if (
                !deleteCartResponse.ok
              ) {
                console.error(
                  `Could not remove product ${item.product_id} from customer cart after payment:`,
                  await deleteCartResponse.text()
                )
              }
            }
          } else {
            console.error(
              'Could not load order items for cart cleanup:',
              orderItems
            )
          }
        }

        return Response.redirect(
          `${getAppUrl(
            env,
            request
          )}/?payment=success&order_id=${encodeURIComponent(
            order.id
          )}`,
          303
        )
      } catch (error) {
        console.error(
          'Payment verification error:',
          error
        )

        return Response.redirect(
          `${getAppUrl(
            env,
            request
          )}/?payment=error`,
          303
        )
      }
    }

    // ---------------------------------------------------------
    // FRONTEND ASSETS
    // ---------------------------------------------------------

    return env.ASSETS.fetch(
      request
    )
  },

  // ---------------------------------------------------------
  // CLOUDFLARE CRON
  // ---------------------------------------------------------

  async scheduled(
    controller,
    env,
    ctx
  ) {
    console.log(
      'UniAbuja Market cron triggered:',
      new Date().toISOString()
    )

    // Subscription lifecycle must run independently
    // of the payout toggle.
    ctx.waitUntil(
      processVendorSubscriptionLifecycle(
        env
      )
    )

    // Existing payout processor remains separate.
    if (
      env.AUTOMATED_PAYOUTS_ENABLED ===
      'true'
    ) {
      ctx.waitUntil(
        processPendingVendorPayouts(
          env
        )
      )
    } else {
      console.log(
        'AUTOMATED_PAYOUTS_ENABLED is not true. Skipping payout processing.'
      )
    }
  },
}