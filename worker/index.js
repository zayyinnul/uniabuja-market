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
async function isAuthenticatedUserAdmin(
  request,
  env
) {
  const authHeader =
    request.headers.get('Authorization')

  if (!authHeader?.startsWith('Bearer ')) {
    return false
  }

  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/rpc/is_admin`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        Authorization: authHeader,
      },
      body: JSON.stringify({}),
    }
  )

  if (!response.ok) {
    console.error(
      'Admin verification failed:',
      await response.text()
    )
    return false
  }

  try {
    return (await response.json()) === true
  } catch {
    return false
  }
}

async function sendResendEmail(
  env,
  {
    to,
    subject,
    html,
    idempotencyKey,
  }
) {
  if (!env.RESEND_API_KEY || !to) {
    console.error(
      'Email not sent: missing API key or recipient.'
    )
    return false
  }

  try {
    const response = await fetch(
      'https://api.resend.com/emails',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
          ...(idempotencyKey
            ? {
                'Idempotency-Key': idempotencyKey,
              }
            : {}),
        },
        body: JSON.stringify({
          from: 'UniAbuja Market <notifications@mail.uniabujamarket.com.ng>',
          to: [to],
          subject,
          html,
        }),
      }
    )

    if (!response.ok) {
      console.error(
        'Resend email failed:',
        response.status,
        await response.text()
      )
      return false
    }

    return true
  } catch (error) {
    console.error(
      'Resend email error:',
      error.message
    )
    return false
  }
}
async function getUserEmail(
  env,
  userId
) {
  if (!userId) {
    return null
  }

  try {
    const response =
      await supabaseRequest(
        env,
        `/auth/v1/admin/users/${encodeURIComponent(userId)}`,
        {
          method: 'GET',
        }
      )

    if (!response.ok) {
      console.error(
        'Could not retrieve recipient email:',
        response.status,
        await response.text()
      )
      return null
    }

    const user = await response.json()

    return user?.email || null
  } catch (error) {
    console.error(
      'Recipient email lookup error:',
      error.message
    )
    return null
  }
}

async function updateVendorPayout(
  env,
  payoutId,
  updates
) {
  const allowedCurrentStatuses = {
    paid: ['processing', 'pending'],
    failed: ['processing', 'pending'],
    reversed: [
      'processing',
      'pending',
      'paid',
      'failed',
    ],
  }

  const targetStatus = updates?.status

  if (
    !payoutId ||
    !targetStatus ||
    !allowedCurrentStatuses[targetStatus]
  ) {
    console.error(
      `Refusing payout update for ${
        payoutId || 'unknown payout'
      }: invalid payout ID or target status.`
    )

    return false
  }

  const allowedStatuses =
    allowedCurrentStatuses[targetStatus]

  const statusFilter =
    `&status=in.(${allowedStatuses.join(',')})`

  let response

  try {
    response = await supabaseRequest(
      env,
      `/rest/v1/vendor_payouts?id=eq.${encodeURIComponent(
        payoutId
      )}${statusFilter}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          ...updates,
          updated_at: new Date().toISOString(),
        }),
      }
    )
  } catch (error) {
    console.error(
      `Payout ${payoutId}: status update request failed.`,
      error
    )

    return false
  }

  if (!response.ok) {
    console.error(
      `Could not update vendor payout ${payoutId}:`,
      await response.text()
    )

    return false
  }

  let updatedRows

  try {
    updatedRows = await response.json()
  } catch (error) {
    console.error(
      `Payout ${payoutId}: could not confirm the saved status update.`,
      error
    )

    return false
  }

  if (
    !Array.isArray(updatedRows) ||
    updatedRows.length !== 1 ||
    updatedRows[0]?.status !== targetStatus
  ) {
    console.warn(
      `Payout ${payoutId}: the requested status update to "${targetStatus}" was not confirmed.`
    )

    return false
  }

  console.log(
    `Payout ${payoutId}: status update to "${targetStatus}" confirmed.`
  )

  return true
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
  const reference = payout.paystack_reference

  if (!reference) {
    return {
      found: false,
      temporaryError: false,
    }
  }

  let verifyResponse
  let verifyData

  try {
    verifyResponse = await fetch(
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

    try {
      verifyData = await verifyResponse.json()
    } catch {
      console.error(
        `Payout ${payout.id}: Paystack verification returned invalid JSON.`
      )

      return {
        found: false,
        temporaryError: true,
      }
    }
  } catch (error) {
    console.error(
      `Payout ${payout.id}: Paystack verification request failed.`,
      error
    )

    return {
      found: false,
      temporaryError: true,
    }
  }

  if (verifyResponse.status === 404) {
    if (!payout.transfer_attempted_at) {
      console.log(
        `Payout ${payout.id}: Paystack has no transfer for reference ${reference}, and no transfer attempt is recorded. A first attempt may proceed.`
      )

      return {
        found: false,
        temporaryError: false,
      }
    }

    console.warn(
      `Payout ${payout.id}: Paystack returned 404 despite a recorded transfer attempt. No duplicate transfer will be submitted.`
    )

    return {
      found: false,
      temporaryError: true,
    }
  }

  if (!verifyResponse.ok) {
    console.error(
      `Payout ${payout.id}: Paystack verification failed.`,
      JSON.stringify({
        httpStatus: verifyResponse.status,
        message: verifyData?.message,
      })
    )

    return {
      found: false,
      temporaryError: true,
    }
  }

  if (
    verifyData?.status !== true ||
    !verifyData?.data ||
    typeof verifyData.data !== 'object'
  ) {
    console.error(
      `Payout ${payout.id}: unexpected Paystack verification response.`,
      verifyData
    )

    return {
      found: false,
      temporaryError: true,
    }
  }

  const transfer = verifyData.data

  if (transfer.reference !== reference) {
    console.error(
      `Payout ${payout.id}: Paystack returned a transfer reference that does not match the payout reference.`
    )

    return {
      found: false,
      temporaryError: true,
    }
  }

  const transferStatus = transfer.status

  console.log(
    `Payout ${payout.id} transfer status: ${transferStatus}`
  )

  let updates

  if (transferStatus === 'success') {
    updates = {
      status: 'paid',
      paid_at: new Date().toISOString(),
      failure_reason: null,
    }
  } else if (transferStatus === 'failed') {
    updates = {
      status: 'failed',
      failure_reason:
        transfer.reason ||
        'Paystack transfer failed',
    }
  } else if (transferStatus === 'reversed') {
    updates = {
      status: 'reversed',
      failure_reason:
        transfer.reason ||
        'Paystack transfer was reversed',
    }
  } else {
    // A queued, pending, or otherwise non-terminal transfer
    // must not trigger a second transfer submission.
    return {
      found: true,
      terminal: false,
    }
  }

  const updateConfirmed =
    await updateVendorPayout(
      env,
      payout.id,
      updates
    )

  if (!updateConfirmed) {
    console.error(
      `Payout ${payout.id}: Paystack reports "${transferStatus}", but the database update was not confirmed. Leaving it for reconciliation.`
    )

    return {
      found: true,
      terminal: false,
      temporaryError: true,
    }
  }

  return {
  found: true,
  terminal: true,
  temporaryError: false,
  transferStatus,
  transferReason:
    transfer.reason ||
    (transferStatus === 'failed'
      ? 'Paystack transfer failed'
      : transferStatus === 'reversed'
        ? 'Paystack transfer was reversed'
        : null),
}
}

// ---------------------------------------------------------
// PROCESS ONE VENDOR PAYOUT
// ---------------------------------------------------------

async function processVendorPayout(
  env,
  payout
) {
  // Defence in depth: split and unknown payout methods
  // must never enter the separate-transfer workflow.
  if (!payout.vendor_commission_id) {
    console.error(
      `Payout ${payout.id}: commission ID is missing. Transfer blocked.`
    )
    return
  }

  let commissionResponse

  try {
    commissionResponse = await supabaseRequest(
      env,
      `/rest/v1/vendor_commissions?id=eq.${encodeURIComponent(
        payout.vendor_commission_id
      )}&select=id,payout_method&limit=1`,
      { method: 'GET' }
    )
  } catch (error) {
    console.error(
      `Payout ${payout.id}: could not verify commission payout method. Transfer blocked.`,
      error
    )
    return
  }

  let commissionRows

  try {
    commissionRows = await commissionResponse.json()
  } catch {
    commissionRows = null
  }

  if (
    !commissionResponse.ok ||
    !Array.isArray(commissionRows) ||
    commissionRows.length !== 1 ||
    commissionRows[0].payout_method !== 'transfer'
  ) {
    console.error(
      `Payout ${payout.id}: commission is missing, ambiguous, split, or not explicitly marked transfer. Transfer blocked.`
    )
    return
  }

  const reference = payout.paystack_reference

  if (!reference) {
    console.error(
      `Payout ${payout.id} has no Paystack reference.`
    )

    return
  }

  // Reconcile first. Never submit another transfer while
  // the outcome of an earlier attempt is uncertain.
  const transferCheck =
    await reconcileTransfer(
      env,
      payout
    )

  if (transferCheck.temporaryError) {
    console.warn(
      `Payout ${payout.id}: reconciliation was inconclusive. No transfer will be submitted.`
    )

    return
  }

  if (transferCheck.found) {
    return
  }

  if (payout.transfer_attempted_at) {
    console.error(
      `Payout ${payout.id} has a previous transfer attempt. No duplicate transfer will be submitted.`
    )

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

  let accountData

  try {
    accountData = await accountResponse.json()
  } catch {
    console.error(
      `Could not read payout account response for vendor ${payout.vendor_id}.`
    )

    return
  }

  if (
    !accountResponse.ok ||
    !Array.isArray(accountData) ||
    accountData.length !== 1
  ) {
    console.error(
      `Could not confirm exactly one payout account for vendor ${payout.vendor_id}.`
    )

    return
  }

  const account = accountData[0]

  if (
    !account.is_verified ||
    !account.is_active ||
    !account.paystack_recipient_code
  ) {
    console.error(
      `Vendor ${payout.vendor_id} does not have an active, verified Paystack recipient.`
    )

    return
  }

  const payoutAmount = Number(payout.payout_amount)
  const amountInKobo = Math.round(payoutAmount * 100)

  if (
    !Number.isFinite(payoutAmount) ||
    payoutAmount <= 0 ||
    !Number.isSafeInteger(amountInKobo) ||
    amountInKobo <= 0 ||
    Math.abs(payoutAmount * 100 - amountInKobo) > 0.000001
  ) {
    console.error(
      `Payout ${payout.id} has an invalid payout amount:`,
      payout.payout_amount
    )

    const updateConfirmed =
      await updateVendorPayout(
        env,
        payout.id,
        {
          status: 'failed',
          failure_reason: 'Invalid payout amount',
        }
      )

    if (!updateConfirmed) {
      console.error(
        `Payout ${payout.id}: invalid amount was detected, but its failed status was not confirmed.`
      )
    }

    return
  }

  // These guards must remain before the transfer reservation
  // and before any call that creates a Paystack transfer.
  if (env.PAYOUTS_VERIFY_ONLY === 'true') {
    console.log(
      `Payout ${payout.id}: verification-only mode. No transfer will be created.`
    )

    return
  }

  if (
    env.AUTOMATED_PAYOUTS_ENABLED !== 'true' ||
    env.LIVE_PAYOUTS_ENABLED !== 'true'
  ) {
    console.log(
      `Payout ${payout.id}: automated or live payouts are disabled. No transfer will be created.`
    )

    return
  }

  if (
    !env.PAYSTACK_SECRET_KEY ||
    !env.PAYSTACK_SECRET_KEY.startsWith('sk_live_')
  ) {
    console.error(
      `Payout ${payout.id}: a Paystack Live Mode secret key is required.`
    )

    return
  }

  // Atomically reserve the one permitted transfer attempt.
  let attemptResponse

  try {
    attemptResponse = await supabaseRequest(
      env,
      '/rest/v1/rpc/begin_vendor_payout_transfer',
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
  } catch (error) {
    console.error(
      `Could not reserve the transfer attempt for payout ${payout.id}.`,
      error
    )

    return
  }

  if (!attemptResponse.ok) {
    console.error(
      `Transfer attempt reservation failed for payout ${payout.id}:`,
      await attemptResponse.text()
    )

    return
  }

  let attemptGranted

  try {
    attemptGranted = await attemptResponse.json()
  } catch {
    console.error(
      `Could not read the transfer reservation result for payout ${payout.id}.`
    )

    return
  }

  if (attemptGranted !== true) {
    console.log(
      `Payout ${payout.id}: the transfer attempt was not granted. No transfer will be submitted.`
    )

    return
  }

  // From this point onward, a request or response failure is
  // treated as uncertain. Later runs must reconcile first.
  let transferResponse

  try {
    transferResponse = await fetch(
      'https://api.paystack.co/transfer',
      {
        method: 'POST',
        headers: {
          Authorization:
            `Bearer ${env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source: 'balance',
          amount: amountInKobo,
          recipient: account.paystack_recipient_code,
          reference,
          reason: 'UniAbuja Market vendor payout',
          currency: 'NGN',
        }),
      }
    )
  } catch (error) {
    console.error(
      `Payout ${payout.id}: transfer request outcome is uncertain. Do not retry automatically.`,
      error
    )

    return
  }

  let transferData

  try {
    transferData = await transferResponse.json()
  } catch {
    console.error(
      `Payout ${payout.id}: Paystack returned invalid transfer JSON. Reconciliation is required; do not retry automatically.`
    )

    return
  }

  console.log(
    'Paystack transfer response:',
    JSON.stringify({
      httpStatus: transferResponse.status,
      status: transferData?.status,
      message: transferData?.message,
      transferStatus: transferData?.data?.status,
      reference: transferData?.data?.reference,
    })
  )

  if (!transferResponse.ok) {
  const message =
    typeof transferData?.message === 'string'
      ? transferData.message
      : 'Paystack transfer request failed'

  const normalizedMessage = message.toLowerCase()

  // These responses can have an uncertain outcome.
  if ([408, 409, 429].includes(transferResponse.status) ||
      transferResponse.status >= 500) {
    console.error(
      `Payout ${payout.id}: uncertain Paystack response; reconcile before retrying.`,
      transferResponse.status,
      message
    )
    return
  }

  // Record a definitive client-side rejection. Retry eligibility
  // is checked separately; recording failure does not mean retry now.
  if (transferResponse.status >= 400 &&
      transferResponse.status < 500) {
    const insufficientBalance =
  /insufficient balance|balance is not enough|insufficient funds|not enough balance/i.test(message)

    const updateConfirmed = await updateVendorPayout(
      env,
      payout.id,
      {
        status: 'failed',
        failure_reason: insufficientBalance
          ? `Paystack rejected transfer: insufficient balance. ${message}`
          : `Paystack rejected transfer: ${message}`,
      }
    )

    if (!updateConfirmed) {
      console.error(
        `Payout ${payout.id}: rejection received but failed status was not confirmed.`
      )
    }

    return
  }

  console.error(
    `Payout ${payout.id}: unexpected Paystack response.`,
    transferResponse.status,
    message
  )
  return
}

  if (
    transferData?.status !== true ||
    !transferData?.data ||
    transferData.data.reference !== reference
  ) {
    console.error(
      `Payout ${payout.id}: Paystack response did not confirm the expected transfer reference. Reconciliation is required.`
    )

    return
  }

  const transfer = transferData.data

  let updates = null

  if (transfer.status === 'success') {
    updates = {
      status: 'paid',
      paid_at: new Date().toISOString(),
      failure_reason: null,
    }
  } else if (transfer.status === 'failed') {
    updates = {
      status: 'failed',
      failure_reason:
        transfer.reason || 'Paystack transfer failed',
    }
  } else if (transfer.status === 'reversed') {
    updates = {
      status: 'reversed',
      failure_reason:
        transfer.reason || 'Paystack transfer was reversed',
    }
  }

  if (!updates) {
    console.log(
      `Payout ${payout.id} remains processing. Paystack transfer status: ${transfer.status || 'unknown'}.`
    )

    return
  }

  const updateConfirmed =
    await updateVendorPayout(
      env,
      payout.id,
      updates
    )

  if (!updateConfirmed) {
    console.error(
      `Payout ${payout.id}: Paystack returned transfer status "${transfer.status}", but the database update was not confirmed. The payout must be reconciled before any further action.`
    )

    return
  }

  console.log(
    `Payout ${payout.id}: Paystack transfer status "${transfer.status}" was saved and confirmed.`
  )
}

// ---------------------------------------------------------
// AUTOMATED PAYOUT PROCESSOR
// ---------------------------------------------------------
// ---------------------------------------------------------
// CENTRALIZED VENDOR PAYOUT FEE CALCULATION
// ---------------------------------------------------------

async function calculateConfiguredVendorPayout(
  env,
  vendorAmountKobo,
  transactionFeeKobo
) {
  if (
    !Number.isSafeInteger(vendorAmountKobo) ||
    vendorAmountKobo <= 0 ||
    !Number.isSafeInteger(transactionFeeKobo) ||
    transactionFeeKobo < 0 ||
    transactionFeeKobo >= vendorAmountKobo
  ) {
    console.error(
      'Payout fee calculation refused: invalid vendor amount or transaction fee.'
    );
    return null;
  }

  let response;
  let responseText;
  let feeRules;

  try {
    response = await supabaseRequest(
      env,
      '/rest/v1/vendor_payout_fee_config?select=fee_key,fee_type,min_transfer_amount_kobo,max_transfer_amount_kobo,amount_kobo,enabled&enabled=eq.true',
      { method: 'GET' }
    );

    responseText = await response.text();

    try {
      feeRules = JSON.parse(responseText);
    } catch {
      feeRules = null;
    }
  } catch (error) {
    console.error(
      'Could not load centralized vendor payout fee rules.',
      error?.message || error
    );
    return null;
  }

  if (
    !response.ok ||
    !Array.isArray(feeRules) ||
    feeRules.length === 0
  ) {
    console.error(
      'Payout calculation refused: fee configuration could not be loaded.',
      response?.status,
      responseText
    );
    return null;
  }

  // Refuse malformed or unsupported fee rules.
  for (const rule of feeRules) {
    const validTypes = [
      'transfer_fee',
      'stamp_duty',
      'other_fixed',
    ];

    const minimum = Number(
      rule.min_transfer_amount_kobo
    );

    const amount = Number(rule.amount_kobo);

    const maximum =
      rule.max_transfer_amount_kobo === null
        ? null
        : Number(rule.max_transfer_amount_kobo);

    if (
      !validTypes.includes(rule.fee_type) ||
      !Number.isSafeInteger(minimum) ||
      minimum < 0 ||
      !Number.isSafeInteger(amount) ||
      amount < 0 ||
      (
        maximum !== null &&
        (
          !Number.isSafeInteger(maximum) ||
          maximum < minimum
        )
      )
    ) {
      console.error(
        `Payout calculation refused: invalid fee rule ${rule.fee_key}.`
      );
      return null;
    }

    rule._minimumKobo = minimum;
    rule._maximumKobo = maximum;
    rule._amountKobo = amount;
  }

  function getFeesForAmount(amountKobo) {
    const matchingRules = feeRules.filter(rule => {
      return (
        amountKobo >= rule._minimumKobo &&
        (
          rule._maximumKobo === null ||
          amountKobo <= rule._maximumKobo
        )
      );
    });

    const matchingTransferRules = matchingRules.filter(
      rule => rule.fee_type === 'transfer_fee'
    );

    // Every payout must match exactly one transfer-fee band.
    if (matchingTransferRules.length !== 1) {
      return null;
    }

    let totalFeesKobo = 0;

    for (const rule of matchingRules) {
      if (
        !Number.isSafeInteger(
          totalFeesKobo + rule._amountKobo
        )
      ) {
        return null;
      }

      totalFeesKobo += rule._amountKobo;
    }

    return totalFeesKobo;
  }

  // The fee band is based on the final transfer amount.
  // Recalculate until the amount and its fees agree.
  let totalTransferFeesKobo = 0;

  for (let iteration = 0; iteration < 20; iteration++) {
    const proposedPayoutKobo =
      vendorAmountKobo -
      transactionFeeKobo -
      totalTransferFeesKobo;

        if (
      !Number.isSafeInteger(proposedPayoutKobo) ||
      proposedPayoutKobo <= 0
    ) {
      console.error(
        'Payout calculation refused: deductions leave no positive amount for the vendor.'
      );
      return null;
    }

    const nextFeesKobo = getFeesForAmount(
      proposedPayoutKobo
    );

    if (
      nextFeesKobo === null ||
      !Number.isSafeInteger(nextFeesKobo)
    ) {
      console.error(
        `Payout calculation refused: no unambiguous enabled fee rules match ₦${(proposedPayoutKobo / 100).toFixed(2)}.`
      );
      return null;
    }

    if (nextFeesKobo === totalTransferFeesKobo) {
      return {
        payoutKobo: proposedPayoutKobo,
        transferFeeKobo: totalTransferFeesKobo,
        transactionFeeKobo,
        vendorAmountKobo,
      };
    }

    totalTransferFeesKobo = nextFeesKobo;
  }

  console.error(
    'Payout calculation refused: fee calculation did not converge.'
  );

  return null;
}
async function prepareFailedVendorPayoutRetry(
  env,
  payout,
  paymentVerification
) {
  if (
    !payout ||
    payout.status !== 'failed' ||
    !payout.paystack_reference ||
    !payout.transfer_attempted_at
  ) {
    return false;
  }

  if (payout.manual_review_required === true) {
    console.warn(
      `Payout ${payout.id}: flagged for manual review. Automatic retry blocked.`
    );
    return false;
  }

  const failureReason =
    typeof payout.failure_reason === 'string'
      ? payout.failure_reason
      : '';

  console.log(
    `[PAYOUT RETRY DIAGNOSTIC] START payout=${payout.id}; ` +
    `status=${payout.status}; ` +
    `amount=₦${Number(payout.payout_amount).toFixed(2)}; ` +
    `collectionFee=${payout.transaction_fee_amount ?? 'NULL'}; ` +
    `transferFee=${payout.transfer_fee_amount ?? 'NULL'}; ` +
    `reference=${payout.paystack_reference}; ` +
    `attemptedAt=${payout.transfer_attempted_at}; ` +
    `failure=${failureReason || '(empty)'}`
  )

  // Do not automatically retry known data or account problems.
  const permanentFailurePatterns = [
    /invalid payout amount/i,
    /recipient.*invalid/i,
    /invalid recipient/i,
    /recipient.*inactive/i,
    /recipient.*not found/i,
    /account.*not verified/i,
  ]

  if (
    permanentFailurePatterns.some(
      pattern => pattern.test(failureReason)
    )
  ) {
    console.warn(
      `Payout ${payout.id}: correct the underlying problem before retrying.`
    )
    return false
  }


    // A retry must have a complete, reconciled fee breakdown.
  // Use the transaction fee returned by verified Paystack data.
  // Calculate transfer fees using the applicable Nigerian pricing.
  // Never overwrite an existing, valid fee breakdown.

  if (
    !paymentVerification ||
    paymentVerification.verified !== true ||
    !Number.isSafeInteger(paymentVerification.transactionFeeKobo) ||
    paymentVerification.transactionFeeKobo < 0 ||
    !Number.isSafeInteger(paymentVerification.vendorAmountKobo) ||
    paymentVerification.vendorAmountKobo <= 0
  ) {
    console.error(
      `Payout ${payout.id}: verified payment fee or vendor amount is unavailable. Retry refused.`
    );
    return false;
  }

  const retryVendorAmountKobo =
    paymentVerification.vendorAmountKobo;

  const retryTransactionFeeKobo =
    paymentVerification.transactionFeeKobo;

  const hasRetryTransactionFee =
    payout.transaction_fee_amount !== null &&
    payout.transaction_fee_amount !== undefined;

  const hasRetryTransferFee =
    payout.transfer_fee_amount !== null &&
    payout.transfer_fee_amount !== undefined;

  // A partial fee breakdown is unsafe.
  if (hasRetryTransactionFee !== hasRetryTransferFee) {
    console.error(
      `Payout ${payout.id}: incomplete saved fee breakdown. Manual review required.`
    );
    return false;
  }

    let retryPayoutKobo;
  let retryTransferFeeKobo;

  // Recalculate against the centralized fee configuration.
  // This is used for both existing and missing fee breakdowns.
  const retryCalculation =
    await calculateConfiguredVendorPayout(
      env,
      retryVendorAmountKobo,
      retryTransactionFeeKobo
    );

  if (!retryCalculation) {
    console.error(
      `Payout ${payout.id}: configured fees could not be verified. Retry refused.`
    );
    return false;
  }

  retryPayoutKobo = retryCalculation.payoutKobo;
  retryTransferFeeKobo =
    retryCalculation.transferFeeKobo;
    console.log(
  `[PAYOUT RETRY DIAGNOSTIC] RECONCILIATION payout=${payout.id}; ` +
  `savedPayout=₦${Number(payout.payout_amount).toFixed(2)}; ` +
  `savedCollectionFee=${payout.transaction_fee_amount ?? 'NULL'}; ` +
  `savedTransferFee=${payout.transfer_fee_amount ?? 'NULL'}; ` +
  `verifiedVendorShare=₦${(retryVendorAmountKobo / 100).toFixed(2)}; ` +
  `verifiedCollectionFee=₦${(retryTransactionFeeKobo / 100).toFixed(2)}; ` +
  `calculatedPayout=₦${(retryPayoutKobo / 100).toFixed(2)}; ` +
  `calculatedTransferFees=₦${(retryTransferFeeKobo / 100).toFixed(2)}`
);

  if (hasRetryTransactionFee && hasRetryTransferFee) {
    const savedTransactionFeeKobo = Math.round(
      Number(payout.transaction_fee_amount) * 100
    );

    const savedTransferFeeKobo = Math.round(
      Number(payout.transfer_fee_amount) * 100
    );

    const savedPayoutKobo = Math.round(
      Number(payout.payout_amount) * 100
    );

    if (
      !Number.isSafeInteger(savedTransactionFeeKobo) ||
      !Number.isSafeInteger(savedTransferFeeKobo) ||
      !Number.isSafeInteger(savedPayoutKobo) ||
      savedTransactionFeeKobo !== retryTransactionFeeKobo ||
      savedTransferFeeKobo !== retryTransferFeeKobo ||
      savedPayoutKobo !== retryPayoutKobo
    ) {
      console.error(
        `Payout ${payout.id}: saved fees do not match the current verified fee calculation. Manual reconciliation required; retry refused.`
      );
      return false;
    }
  } else {
    // Missing fees may only be reconstructed when the existing
    // amount is still the original, unadjusted vendor share.
    const existingPayoutKobo = Math.round(
      Number(payout.payout_amount) * 100
    );

    if (
      !Number.isSafeInteger(existingPayoutKobo) ||
      existingPayoutKobo !== retryVendorAmountKobo
    ) {
      console.error(
        `Payout ${payout.id}: missing fees cannot safely be reconstructed from the current payout amount. Manual reconciliation required.`
      );
      return false;
    }

    let feeSaveResponse;

    try {
      feeSaveResponse = await supabaseRequest(
        env,
        `/rest/v1/vendor_payouts?id=eq.${encodeURIComponent(
          payout.id
        )}&status=eq.failed&paystack_reference=eq.${encodeURIComponent(
          payout.paystack_reference
        )}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
          },
          body: JSON.stringify({
            transaction_fee_amount:
              retryTransactionFeeKobo / 100,
            transfer_fee_amount:
              retryTransferFeeKobo / 100,
            payout_amount:
              retryPayoutKobo / 100,
            updated_at: new Date().toISOString(),
          }),
        }
      );
    } catch (error) {
      console.error(
        `Payout ${payout.id}: could not save retry fee breakdown.`,
        error?.message || error
      );
      return false;
    }

    if (!feeSaveResponse.ok) {
      console.error(
        `Payout ${payout.id}: failed to save retry fee breakdown.`,
        await feeSaveResponse.text()
      );
      return false;
    }

    let savedFeeRows;

    try {
      savedFeeRows = await feeSaveResponse.json();
    } catch {
      console.error(
        `Payout ${payout.id}: could not confirm saved retry fees.`
      );
      return false;
    }

    const savedFeeRow =
      Array.isArray(savedFeeRows) &&
      savedFeeRows.length === 1
        ? savedFeeRows[0]
        : null;

    const savedPayoutKobo =
      savedFeeRow?.payout_amount == null
        ? null
        : Math.round(
            Number(savedFeeRow.payout_amount) * 100
          );

    const savedTransactionFeeKobo =
      savedFeeRow?.transaction_fee_amount == null
        ? null
        : Math.round(
            Number(savedFeeRow.transaction_fee_amount) * 100
          );

    const savedTransferFeeKobo =
      savedFeeRow?.transfer_fee_amount == null
        ? null
        : Math.round(
            Number(savedFeeRow.transfer_fee_amount) * 100
          );

    if (
      !savedFeeRow ||
      savedFeeRow.status !== 'failed' ||
      savedFeeRow.paystack_reference !==
        payout.paystack_reference ||
      savedPayoutKobo !== retryPayoutKobo ||
      savedTransactionFeeKobo !== retryTransactionFeeKobo ||
      savedTransferFeeKobo !== retryTransferFeeKobo
    ) {
      console.error(
        `Payout ${payout.id}: saved retry fees could not be confirmed. Retry refused.`
      );
      return false;
    }

    payout.payout_amount = savedFeeRow.payout_amount;
    payout.transaction_fee_amount =
      savedFeeRow.transaction_fee_amount;
    payout.transfer_fee_amount =
      savedFeeRow.transfer_fee_amount;

    console.log(
      `Payout ${payout.id}: retry fees saved and confirmed. ` +
      `Collection fee ₦${(retryTransactionFeeKobo / 100).toFixed(2)}, ` +
      `transfer-related fees ₦${(retryTransferFeeKobo / 100).toFixed(2)}, ` +
      `vendor payout ₦${(retryPayoutKobo / 100).toFixed(2)}.`
    );
  }
  let previousTransferConfirmedFailed = false;
  // Confirm the old transfer's final status before authorizing
  // another attempt. Never retry pending or uncertain transfers.
  let verificationResponse
  let verificationData

  try {
    verificationResponse = await fetch(
      `https://api.paystack.co/transfer/verify/${encodeURIComponent(
        payout.paystack_reference
      )}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
        },
      }
    )

    verificationData = await verificationResponse.json()
    console.log(
      `[PAYOUT RETRY DIAGNOSTIC] PREVIOUS TRANSFER CHECK payout=${payout.id}; ` +
      `httpStatus=${verificationResponse.status}; ` +
      `apiStatus=${verificationData?.status ?? 'unknown'}; ` +
      `apiMessage=${verificationData?.message ?? 'none'}; ` +
      `returnedReference=${verificationData?.data?.reference ?? 'none'}; ` +
      `previousTransferStatus=${verificationData?.data?.status ?? 'unknown'}`
    )
  } catch (error) {
    console.error(
      `Payout ${payout.id}: could not verify the previous attempt.`,
      error
    )
    return false
  }

  const insufficientBalanceFailure =
  /insufficient balance|balance is not enough/i.test(
    failureReason
  )

if (
  verificationResponse.ok &&
  verificationData?.status === true &&
  verificationData?.data?.reference ===
    payout.paystack_reference
) {
  const previousStatus =
    verificationData.data.status

  if (previousStatus === 'success') {
    console.error(
      `Payout ${payout.id}: previous transfer succeeded. Retry refused.`
    )
    return false
  }

  if (previousStatus === 'reversed') {
    console.warn(
      `Payout ${payout.id}: transfer was reversed. Manual review required.`
    )
    return false
  }

  if (previousStatus !== 'failed') {
  console.log(
    `Payout ${payout.id}: previous transfer is not confirmed failed. Retry refused.`
  )
  return false
}

previousTransferConfirmedFailed = true;
} else {
  if (
    insufficientBalanceFailure &&
    verificationResponse.status === 404 &&
    verificationData?.status === false &&
    /transfer not found/i.test(
      String(verificationData?.message || '')
    )
  ) {
    console.warn(
      `Payout ${payout.id}: Paystack reports insufficient balance and cannot find the previous transfer. Automatic retry remains blocked pending independent confirmation.`
    )
  } else {
  console.warn(
    `Payout ${payout.id}: previous transfer outcome could not be confirmed. Fee reconciliation may continue, but retry remains blocked.`
  )
}

  return false
}
// Fee reconciliation is not permission to retry.
// Only a transfer explicitly verified as failed may proceed.
if (!previousTransferConfirmedFailed) {
  console.warn(
    `Payout ${payout.id}: fee reconciliation finished, but the previous transfer is not confirmed failed. Retry remains blocked.`
  );
  return false;
}

  // For insufficient-balance failures, check the current Paystack
  // NGN balance before allowing a retry.
  if (insufficientBalanceFailure) {
    let balanceResponse
    let balanceData

    try {
      balanceResponse = await fetch(
        'https://api.paystack.co/balance',
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
          },
        }
      )

      balanceData = await balanceResponse.json()
    } catch (error) {
      console.error(
        `Payout ${payout.id}: Paystack balance check failed.`,
        error
      )
      return false
    }

    if (
      !balanceResponse.ok ||
      balanceData?.status !== true ||
      !Array.isArray(balanceData?.data)
    ) {
      console.error(
        `Payout ${payout.id}: Paystack balance could not be confirmed.`
      )
      return false
    }

    const ngnBalance = balanceData.data.find(
      item => item.currency === 'NGN'
    )

    const availableKobo = Number(ngnBalance?.balance)
    const payoutAmountKobo = Math.round(
  Number(payout.payout_amount) * 100
)

const transferFeeKobo = Math.round(
  Number(payout.transfer_fee_amount) * 100
)

const requiredKobo =
  payoutAmountKobo + transferFeeKobo

if (
  payout.transfer_fee_amount === null ||
  payout.transfer_fee_amount === undefined ||
  payout.transfer_fee_amount === '' ||
  !Number.isSafeInteger(availableKobo) ||
  !Number.isSafeInteger(payoutAmountKobo) ||
  !Number.isSafeInteger(transferFeeKobo) ||
  payoutAmountKobo <= 0 ||
  transferFeeKobo < 0 ||
  !Number.isSafeInteger(requiredKobo) ||
  availableKobo < requiredKobo
) {
  console.log(
    `Payout ${payout.id}: insufficient available NGN balance, or invalid payout/fee amounts. Retry postponed.`
  )
  return false
}
  }

  // The database function enforces the retry limit and creates
  // a fresh transfer reference. It must succeed before processing.
  let retryResponse

  try {
    retryResponse = await supabaseRequest(
      env,
      '/rest/v1/rpc/prepare_vendor_payout_retry',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          p_payout_id: payout.id,
          p_expected_reference: payout.paystack_reference,
          p_confirmed_failure_reason: failureReason,
        }),
      }
    )
  } catch (error) {
    console.error(
      `Payout ${payout.id}: retry authorization failed.`,
      error
    )
    return false
  }

  if (!retryResponse.ok) {
    console.error(
      `Payout ${payout.id}: retry was not authorized by the database.`,
      await retryResponse.text()
    )
    return false
  }

  let newReference

  try {
    newReference = await retryResponse.json()
  } catch {
    console.error(
      `Payout ${payout.id}: could not read the new transfer reference.`
    )
    return false
  }

  if (
    typeof newReference !== 'string' ||
    !newReference ||
    newReference === payout.paystack_reference
  ) {
    console.error(
      `Payout ${payout.id}: database did not return a valid new transfer reference.`
    )
    return false
  }

  console.log(
    `Payout ${payout.id}: retry authorized with a new reference.`
  )

  return true
}

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
    )}&select=id,vendor_commission_id,payout_amount,status,transaction_fee_amount,transfer_fee_amount&limit=1`
  );

  if (!payouts?.length) {
    console.error(
      `Payout ${payoutId}: payout record not found.`
    );
    return false;
  }

  const payout = payouts[0];

  if (!payout.vendor_commission_id) {
    console.error(
      `Payout ${payoutId}: commission relationship missing.`
    );
    return false;
  }

  const commissions = await readRows(
    `/rest/v1/vendor_commissions?id=eq.${encodeURIComponent(
      payout.vendor_commission_id
    )}&select=vendor_order_id,payout_method,vendor_amount&limit=1`
  );

  if (
    !commissions?.length ||
    !commissions[0].vendor_order_id
  ) {
    console.error(
      `Payout ${payoutId}: commission could not be verified.`
    );
    return false;
  }

  const commission = commissions[0];

  const vendorAmountKobo = Math.round(
    Number(commission.vendor_amount) * 100
  );

  const actualPayoutKobo = Math.round(
    Number(payout.payout_amount) * 100
  );

  if (
    !Number.isSafeInteger(vendorAmountKobo) ||
    vendorAmountKobo <= 0 ||
    !Number.isSafeInteger(actualPayoutKobo) ||
    actualPayoutKobo <= 0
  ) {
    console.error(
      `Payout ${payoutId}: invalid commission or payout amount.`
    );
    return false;
  }

  if (commission.payout_method !== 'transfer') {
  console.error(
    `Payout ${payoutId}: commission is not explicitly marked for separate transfer. Split or unknown payout method; retry refused.`
  );
  return false;
}

  const hasTransactionFee =
    payout.transaction_fee_amount !== null &&
    payout.transaction_fee_amount !== undefined;

  const hasTransferFee =
    payout.transfer_fee_amount !== null &&
    payout.transfer_fee_amount !== undefined;

  if (hasTransactionFee !== hasTransferFee) {
    console.error(
      `Payout ${payoutId}: incomplete fee breakdown.`
    );
    return false;
  }

  let savedTransactionFeeKobo = null;
  let savedTransferFeeKobo = null;

  if (hasTransactionFee && hasTransferFee) {
    savedTransactionFeeKobo = Math.round(
      Number(payout.transaction_fee_amount) * 100
    );

    savedTransferFeeKobo = Math.round(
      Number(payout.transfer_fee_amount) * 100
    );

    if (
      !Number.isSafeInteger(savedTransactionFeeKobo) ||
      savedTransactionFeeKobo < 0 ||
      !Number.isSafeInteger(savedTransferFeeKobo) ||
      savedTransferFeeKobo < 0
    ) {
      console.error(
        `Payout ${payoutId}: invalid saved fee amounts.`
      );
      return false;
    }
  } else {
    if (payout.status === 'processing') {
      console.error(
        `Payout ${payoutId}: processing payout has no saved fee breakdown. Reconciliation required.`
      );
      return false;
    }

    if (actualPayoutKobo !== vendorAmountKobo) {
      console.error(
        `Payout ${payoutId}: payout without saved fees does not match the original vendor share. Manual reconciliation required.`
      );
      return false;
    }
  }

  const vendorOrders = await readRows(
    `/rest/v1/vendor_orders?id=eq.${encodeURIComponent(
      commission.vendor_order_id
    )}&select=order_id&limit=1`
  );

  if (
    !vendorOrders?.length ||
    !vendorOrders[0].order_id
  ) {
    console.error(
      `Payout ${payoutId}: vendor order could not be verified.`
    );
    return false;
  }

  const orders = await readRows(
    `/rest/v1/orders?id=eq.${encodeURIComponent(
      vendorOrders[0].order_id
    )}&select=id,total_amount,payment_reference,payment_status&limit=1`
  );

  if (!orders?.length) {
    console.error(
      `Payout ${payoutId}: parent order not found.`
    );
    return false;
  }

  const order = orders[0];

  if (
    order.payment_status !== 'paid' ||
    !order.payment_reference
  ) {
    console.error(
      `Payout ${payoutId}: parent order is not confirmed as paid.`
    );
    return false;
  }

  let response;
  let result;

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
    );

    const responseText = await response.text();

    try {
      result = JSON.parse(responseText);
    } catch {
      result = null;
    }
  } catch (error) {
    console.error(
      `Payout ${payoutId}: Paystack verification request failed.`,
      error?.message || error
    );
    return false;
  }

  if (
    !response.ok ||
    result?.status !== true ||
    !result?.data
  ) {
    console.error(
      `Payout ${payoutId}: Paystack payment verification failed.`,
      JSON.stringify({
        httpStatus: response.status,
        paystackStatus: result?.status ?? null,
        message:
          result?.message ??
          'No Paystack error message returned',
      })
    );
    return false;
  }

  const transaction = result.data;

  const expectedAmount = Math.round(
    Number(order.total_amount) * 100
  );

  const verifiedSubaccount =
    typeof transaction.subaccount === 'string'
      ? transaction.subaccount
      : transaction.subaccount?.subaccount_code;

  if (verifiedSubaccount) {
    console.error(
      `Payout ${payoutId}: original payment uses a Paystack subaccount. Separate transfer prohibited.`
    );
    return false;
  }

  if (
    transaction.domain !== 'live' ||
    transaction.status !== 'success' ||
    transaction.reference !== order.payment_reference ||
    transaction.currency !== 'NGN' ||
    !Number.isSafeInteger(expectedAmount) ||
    expectedAmount <= 0 ||
    Number(transaction.amount) !== expectedAmount
  ) {
    console.error(
      `Payout ${payoutId}: original payment failed Live Mode, status, reference, currency, or amount verification.`
    );
    return false;
  }

  // Use the actual collection fee returned by Paystack.
  // Never silently replace a missing fee with an estimate.
  const transactionFeeKobo = Number(transaction.fees);

  if (
    transaction.fees === null ||
    transaction.fees === undefined ||
    !Number.isSafeInteger(transactionFeeKobo) ||
    transactionFeeKobo < 0
  ) {
    console.error(
      `Payout ${payoutId}: payment is verified, but Paystack did not return a valid transaction fee. Payout held for fee reconciliation.`
    );
    return false;
  }

  if (hasTransactionFee && hasTransferFee) {
    if (
      savedTransactionFeeKobo !== transactionFeeKobo ||
      vendorAmountKobo -
        transactionFeeKobo -
        savedTransferFeeKobo !== actualPayoutKobo
    ) {
      console.error(
        `Payout ${payoutId}: saved fees do not reconcile with the verified transaction and vendor payout.`
      );
      return false;
    }
  }

  console.log(
    `Payout ${payoutId}: original payment verified; reported collection fee ₦${(transactionFeeKobo / 100).toFixed(2)}.`
  );

  return {
    verified: true,
    transactionFeeKobo,
    vendorAmountKobo,
  };
}
async function reconcileFailedPayoutFees(env, payout) {
  if (
    !payout ||
    payout.status !== 'failed' ||
    !payout.id ||
    !payout.paystack_reference ||
    !payout.transfer_attempted_at
  ) {
    console.error(
      'Failed-payout fee reconciliation refused: payout is missing required failed-status or transfer-attempt details.'
    );
    return false;
  }

  // Verify the original customer payment independently.
  const paymentVerification =
    await verifyOriginalPayment(payout.id);

  if (
    !paymentVerification ||
    paymentVerification.verified !== true ||
    !Number.isSafeInteger(
      paymentVerification.transactionFeeKobo
    ) ||
    paymentVerification.transactionFeeKobo < 0 ||
    !Number.isSafeInteger(
      paymentVerification.vendorAmountKobo
    ) ||
    paymentVerification.vendorAmountKobo <= 0
  ) {
    console.error(
      `Payout ${payout.id}: original payment or fee data could not be verified. Fee reconciliation stopped.`
    );
    return false;
  }

  const transactionFeeKobo =
    paymentVerification.transactionFeeKobo;

  const vendorAmountKobo =
    paymentVerification.vendorAmountKobo;

  const hasTransactionFee =
    payout.transaction_fee_amount !== null &&
    payout.transaction_fee_amount !== undefined;

  const hasTransferFee =
    payout.transfer_fee_amount !== null &&
    payout.transfer_fee_amount !== undefined;

  // Never repair only half of a fee breakdown.
  if (hasTransactionFee !== hasTransferFee) {
    console.error(
      `Payout ${payout.id}: only one fee field is saved. Manual reconciliation required.`
    );
    return false;
  }

  const calculation =
    await calculateConfiguredVendorPayout(
      env,
      vendorAmountKobo,
      transactionFeeKobo
    );

  if (
    !calculation ||
    !Number.isSafeInteger(calculation.payoutKobo) ||
    !Number.isSafeInteger(calculation.transferFeeKobo) ||
    calculation.payoutKobo <= 0 ||
    calculation.transferFeeKobo < 0 ||
    calculation.payoutKobo !==
      vendorAmountKobo -
        transactionFeeKobo -
        calculation.transferFeeKobo
  ) {
    console.error(
      `Payout ${payout.id}: configured fee calculation failed reconciliation. Manual review required.`
    );
    return false;
  }

  const expectedPayoutKobo = calculation.payoutKobo;
  const expectedTransferFeeKobo =
    calculation.transferFeeKobo;

  const currentPayoutKobo = Math.round(
    Number(payout.payout_amount) * 100
  );

  if (!Number.isSafeInteger(currentPayoutKobo)) {
    console.error(
      `Payout ${payout.id}: existing payout amount is invalid. Manual review required.`
    );
    return false;
  }

  // If both fee fields already exist, verify them.
  // Do not overwrite an existing breakdown.
  if (hasTransactionFee && hasTransferFee) {
    const savedTransactionFeeKobo = Math.round(
      Number(payout.transaction_fee_amount) * 100
    );

    const savedTransferFeeKobo = Math.round(
      Number(payout.transfer_fee_amount) * 100
    );

    if (
      !Number.isSafeInteger(savedTransactionFeeKobo) ||
      !Number.isSafeInteger(savedTransferFeeKobo) ||
      savedTransactionFeeKobo !== transactionFeeKobo ||
      savedTransferFeeKobo !== expectedTransferFeeKobo ||
      currentPayoutKobo !== expectedPayoutKobo
    ) {
      console.error(
        `Payout ${payout.id}: saved fee breakdown differs from the verified configured calculation. Manual review required.`
      );
      return false;
    }

    console.log(
      `Payout ${payout.id}: existing fee breakdown reconciles. No database changes made.`
    );
    return true;
  }

  // Missing fees may only be reconstructed if the payout amount
  // is still exactly the original vendor share.
  if (currentPayoutKobo !== vendorAmountKobo) {
    console.error(
      `Payout ${payout.id}: missing fees cannot safely be reconstructed because the existing payout amount is not the original vendor share. Manual review required.`
    );
    return false;
  }

  let saveResponse;

  try {
    saveResponse = await supabaseRequest(
      env,
      `/rest/v1/vendor_payouts?id=eq.${encodeURIComponent(
        payout.id
      )}&status=eq.failed&paystack_reference=eq.${encodeURIComponent(
        payout.paystack_reference
      )}&transaction_fee_amount=is.null&transfer_fee_amount=is.null`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          transaction_fee_amount:
            transactionFeeKobo / 100,
          transfer_fee_amount:
            expectedTransferFeeKobo / 100,
          payout_amount:
            expectedPayoutKobo / 100,
          updated_at: new Date().toISOString(),
        }),
      }
    );
  } catch (error) {
    console.error(
      `Payout ${payout.id}: fee-only reconciliation update failed.`,
      error?.message || error
    );
    return false;
  }

  if (!saveResponse.ok) {
    console.error(
      `Payout ${payout.id}: fee-only reconciliation PATCH failed.`,
      await saveResponse.text()
    );
    return false;
  }

  let savedRows;

  try {
    savedRows = await saveResponse.json();
  } catch {
    console.error(
      `Payout ${payout.id}: could not read the fee reconciliation result.`
    );
    return false;
  }

  const savedRow =
    Array.isArray(savedRows) && savedRows.length === 1
      ? savedRows[0]
      : null;

  const savedPayoutKobo =
    savedRow?.payout_amount == null
      ? null
      : Math.round(Number(savedRow.payout_amount) * 100);

  const savedTransactionFeeKobo =
    savedRow?.transaction_fee_amount == null
      ? null
      : Math.round(
          Number(savedRow.transaction_fee_amount) * 100
        );

  const savedTransferFeeKobo =
    savedRow?.transfer_fee_amount == null
      ? null
      : Math.round(
          Number(savedRow.transfer_fee_amount) * 100
        );

  if (
    !savedRow ||
    savedRow.status !== 'failed' ||
    savedRow.paystack_reference !== payout.paystack_reference ||
    !Number.isSafeInteger(savedPayoutKobo) ||
    !Number.isSafeInteger(savedTransactionFeeKobo) ||
    !Number.isSafeInteger(savedTransferFeeKobo) ||
    savedPayoutKobo !== expectedPayoutKobo ||
    savedTransactionFeeKobo !== transactionFeeKobo ||
    savedTransferFeeKobo !== expectedTransferFeeKobo
  ) {
    console.error(
      `Payout ${payout.id}: saved fee reconciliation could not be confirmed exactly. Manual review required.`
    );
    return false;
  }

  console.log(
    `Payout ${payout.id}: fee-only reconciliation saved and verified. ` +
    `Collection fee=₦${(transactionFeeKobo / 100).toFixed(2)}; ` +
    `transfer fees=₦${(expectedTransferFeeKobo / 100).toFixed(2)}; ` +
    `calculated payout=₦${(expectedPayoutKobo / 100).toFixed(2)}. ` +
    `Status and transfer reference were not changed.`
  );

  return true;
}

  // Load pending payouts without changing their status.
  const pendingPayouts = await readRows(
    '/rest/v1/vendor_payouts?status=eq.pending&manual_review_required=eq.false&select=id&order=created_at.desc&limit=2'
  )

  if (!pendingPayouts) {
    console.error('Could not load pending vendor payouts.')
    return
  }


  // Verification-only mode: inspect pending and failed payouts.
  // Do not claim payouts, prepare retries, or initiate transfers.
  if (verifyOnly) {
    for (const payout of pendingPayouts) {
      try {
        const verified = await verifyOriginalPayment(payout.id);

        console.log(
          `Verification-only result for pending payout ${payout.id}: ${
            verified?.verified === true
              ? 'PAYMENT VERIFIED'
              : 'NOT VERIFIED'
          }`
        );
      } catch (error) {
        console.error(
          `Verification-only check failed for pending payout ${payout.id}:`,
          error
        );
      }
    }

    const failedPayouts = await readRows(
  '/rest/v1/vendor_payouts?status=eq.failed&manual_review_required=eq.false&paystack_reference=not.is.null&transfer_attempted_at=not.is.null&select=id,payout_amount,transaction_fee_amount,transfer_fee_amount,paystack_reference,status,transfer_attempted_at,failure_reason&order=updated_at.asc&limit=10'
);

if (failedPayouts) {
  for (const payout of failedPayouts) {
    try {
      console.log(
        `Verification-only failed payout review: ${payout.id}; ` +
        `reference=${payout.paystack_reference}; ` +
        `amount=₦${payout.payout_amount}; ` +
        `collectionFee=${payout.transaction_fee_amount ?? 'NULL'}; ` +
        `transferFee=${payout.transfer_fee_amount ?? 'NULL'}; ` +
        `failure=${payout.failure_reason}`
      );

      await reconcileFailedPayoutFees(env, payout);
    } catch (error) {
      console.error(
        `Verification-only fee reconciliation failed for payout ${payout.id}:`,
        error?.message || error
      );
    }
  }
}

    console.log(
      'Verification-only run finished. No payouts were claimed, retried, or transferred.'
    );
    return;
  }


  // Normal mode: verify the original payment, calculate all fees,
  // save the adjusted payout, and only then claim it.
  for (const payout of pendingPayouts) {
    try {
      const paymentVerification =
        await verifyOriginalPayment(payout.id)

      if (
        !paymentVerification ||
        paymentVerification.verified !== true
      ) {
        console.log(
          `Payout ${payout.id}: original payment or fees could not be verified. No payout claimed.`
        )
        continue
      }

      const transactionFeeKobo =
        paymentVerification.transactionFeeKobo

      const vendorAmountKobo =
        paymentVerification.vendorAmountKobo

            if (
        !Number.isSafeInteger(transactionFeeKobo) ||
        transactionFeeKobo < 0 ||
        !Number.isSafeInteger(vendorAmountKobo) ||
        vendorAmountKobo <= 0
      ) {
        console.error(
          `Payout ${payout.id}: invalid transaction fee or vendor amount.`
        )
        continue
      }

            // Calculate the vendor payout using the actual verified
      // Paystack collection fee and centralized transfer fee rules.
      const payoutCalculation =
        await calculateConfiguredVendorPayout(
          env,
          vendorAmountKobo,
          transactionFeeKobo
        );
        console.log(
  `[PAYOUT FEE CALCULATION] payout=${payout.id}; ` +
  `vendorAmount=₦${(vendorAmountKobo / 100).toFixed(2)}; ` +
  `collectionFee=₦${(transactionFeeKobo / 100).toFixed(2)}; ` +
  `calculationSucceeded=${Boolean(payoutCalculation)}; ` +
  `calculatedPayout=₦${payoutCalculation ? (payoutCalculation.payoutKobo / 100).toFixed(2) : 'N/A'}; ` +
  `transferFees=₦${payoutCalculation ? (payoutCalculation.transferFeeKobo / 100).toFixed(2) : 'N/A'}`
);

      if (!payoutCalculation) {
        console.error(
          `Payout ${payout.id}: configured fees could not be verified. No payout claimed.`
        );
        continue;
      }

      const adjustedPayoutKobo =
        payoutCalculation.payoutKobo;

      const totalTransferFeesKobo =
        payoutCalculation.transferFeeKobo;

      if (
        adjustedPayoutKobo !==
          vendorAmountKobo -
            transactionFeeKobo -
            totalTransferFeesKobo
      ) {
        console.error(
          `Payout ${payout.id}: final payout reconciliation failed. No payout claimed.`
        );
        continue;
      }

      const transactionFeeAmount =
        transactionFeeKobo / 100

      const transferFeeAmount =
        totalTransferFeesKobo / 100

      const adjustedPayoutAmount =
        adjustedPayoutKobo / 100

      // Save fee breakdown before calling the database claim RPC.
      const feeUpdateResponse =
        await supabaseRequest(
          env,
          `/rest/v1/vendor_payouts?id=eq.${encodeURIComponent(
            payout.id
          )}&status=eq.pending`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Prefer: 'return=representation',
            },
            body: JSON.stringify({
              transaction_fee_amount: transactionFeeAmount,
              transfer_fee_amount: transferFeeAmount,
              payout_amount: adjustedPayoutAmount,
              updated_at: new Date().toISOString(),
            }),
          }
        )

      if (!feeUpdateResponse.ok) {
        console.error(
          `Payout ${payout.id}: failed to save fee breakdown. Not claiming payout.`,
          await feeUpdateResponse.text()
        )
        continue
      }

      let updatedPayoutRows

      try {
        updatedPayoutRows =
          await feeUpdateResponse.json()
      } catch {
        console.error(
          `Payout ${payout.id}: could not verify saved fee breakdown. Not claiming payout.`
        )
        continue
      }

            const savedPayoutRow =
        Array.isArray(updatedPayoutRows) &&
        updatedPayoutRows.length === 1
          ? updatedPayoutRows[0]
          : null

      const savedPayoutKobo =
        savedPayoutRow?.payout_amount === null ||
        savedPayoutRow?.payout_amount === undefined
          ? null
          : Math.round(
              Number(savedPayoutRow.payout_amount) * 100
            )

      const savedTransactionFeeKobo =
        savedPayoutRow?.transaction_fee_amount === null ||
        savedPayoutRow?.transaction_fee_amount === undefined
          ? null
          : Math.round(
              Number(savedPayoutRow.transaction_fee_amount) * 100
            )

      const savedTransferFeeKobo =
        savedPayoutRow?.transfer_fee_amount === null ||
        savedPayoutRow?.transfer_fee_amount === undefined
          ? null
          : Math.round(
              Number(savedPayoutRow.transfer_fee_amount) * 100
            )

      if (
        !savedPayoutRow ||
        savedPayoutRow.status !== 'pending' ||
        !Number.isSafeInteger(savedPayoutKobo) ||
        !Number.isSafeInteger(savedTransactionFeeKobo) ||
        !Number.isSafeInteger(savedTransferFeeKobo) ||
        savedPayoutKobo !== adjustedPayoutKobo ||
        savedTransactionFeeKobo !== transactionFeeKobo ||
        savedTransferFeeKobo !== totalTransferFeesKobo
      ) {
        console.error(
          `Payout ${payout.id}: saved payout amount, fee breakdown, or pending status did not match the calculated values. Not claiming payout.`
        )

        continue
      }

      console.log(
        `Payout ${payout.id}: calculated transaction fee ₦${transactionFeeAmount.toFixed(2)}, transfer fees including applicable stamp duty ₦${transferFeeAmount.toFixed(2)}, vendor payout ₦${adjustedPayoutAmount.toFixed(2)}.`
      )

      const claimResponse =
        await supabaseRequest(
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
        console.log(
          `Payout ${payout.id} was not claimed.`,
          claimData
        )
        continue
      }

      console.log(
        `Claimed verified payout ${payout.id} for ₦${adjustedPayoutAmount.toFixed(2)}.`
      )
    } catch (error) {
      console.error(
        `Error preparing or claiming payout ${payout.id}:`,
        error
      )
    }
  }
  // Prepare eligible failed payouts for a controlled retry.

const failedPayouts = await readRows(
  '/rest/v1/vendor_payouts?status=eq.failed&manual_review_required=eq.false&paystack_reference=not.is.null&transfer_attempted_at=not.is.null&select=id,vendor_id,payout_amount,transaction_fee_amount,transfer_fee_amount,paystack_reference,status,transfer_attempted_at,failure_reason,manual_review_required&order=updated_at.asc&limit=10'
);

if (failedPayouts) {
  for (const payout of failedPayouts) {
    try {
      const paymentVerification =
        await verifyOriginalPayment(payout.id);
        console.log(
        `[PAYOUT RETRY DIAGNOSTIC] ORIGINAL PAYMENT CHECK payout=${payout.id}; ` +
        `verified=${paymentVerification?.verified ?? false}; ` +
        `transactionFeeKobo=${paymentVerification?.transactionFeeKobo ?? 'NULL'}; ` +
        `vendorAmountKobo=${paymentVerification?.vendorAmountKobo ?? 'NULL'}; ` +
        `verificationMessage=${paymentVerification?.message ?? 'No message returned'}`
      )

      if (
        !paymentVerification ||
        paymentVerification.verified !== true
      ) {
        console.log(
          `Payout ${payout.id}: original payment could not be verified. Retry refused.`
        );
        continue;
      }

      await prepareFailedVendorPayoutRetry(
        env,
        payout,
        paymentVerification
      );
    } catch (error) {
      console.error(
        `Could not prepare retry for payout ${payout.id}:`,
        error
      );
    }
  }
}

  // Re-fetch processing payouts after claims.
  const processingPayouts = await readRows(
  '/rest/v1/vendor_payouts?status=eq.processing&manual_review_required=eq.false&paystack_reference=not.is.null&select=id,vendor_id,vendor_commission_id,payout_amount,paystack_reference,status,transfer_attempted_at&order=created_at.asc&limit=2'
)

  if (!processingPayouts) {
    console.error('Could not load processing vendor payouts.')
    return
  }

    for (const payout of processingPayouts) {
    try {
      // The original payment and fee breakdown were verified
      // before the payout was claimed. Reconcile the existing
      // Paystack transfer before considering any further action.
      await processVendorPayout(env, payout);
    } catch (error) {
      console.error(
        `Error processing payout ${payout.id}:`,
        error
      );
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
    // ADMIN: READ PAYOUT ATTEMPT HISTORY
    // -------------------------------------------------------

    if (
      url.pathname === '/api/admin/payout-attempts' &&
      request.method === 'GET'
    ) {
      try {
        const user = await getAuthenticatedUser(
          request,
          env
        )

        if (!user?.id) {
          return jsonResponse(
            {
              success: false,
              message: 'Unauthorized.',
            },
            401
          )
        }

        const isAdmin =
          await isAuthenticatedUserAdmin(
            request,
            env
          )

        if (!isAdmin) {
          return jsonResponse(
            {
              success: false,
              message: 'Admin access required.',
            },
            403
          )
        }

        const payoutId =
          url.searchParams.get('payout_id')

        if (
          !payoutId ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payoutId)
        ) {
          return jsonResponse(
            {
              success: false,
              message: 'A valid payout ID is required.',
            },
            400
          )
        }

        const response = await supabaseRequest(
          env,
          `/rest/v1/vendor_payout_transfer_attempts?payout_id=eq.${encodeURIComponent(payoutId)}&select=id,payout_id,attempt_number,paystack_reference,status,failure_reason,paystack_transfer_status,created_at,submitted_at,completed_at,updated_at&order=attempt_number.asc`
        )

        if (!response.ok) {
          throw new Error(
            'Could not retrieve payout attempt history.'
          )
        }

        const attempts = await response.json()

        return jsonResponse({
          success: true,
          attempts,
        })
      } catch (error) {
        console.error(
          'Admin payout history error:',
          error
        )

        return jsonResponse(
          {
            success: false,
            message: 'Unable to retrieve payout history.',
          },
          500
        )
      }
    }
    // -------------------------------------------------------
// ADMIN: MANAGE VENDOR PAYOUT
// -------------------------------------------------------

if (
  url.pathname === '/api/admin/payout-action' &&
  request.method === 'POST'
) {
  try {
    // Authenticate the actual logged-in user.
    const user = await getAuthenticatedUser(
      request,
      env
    )

    if (!user?.id) {
      return jsonResponse(
        {
          success: false,
          message: 'Unauthorized.',
        },
        401
      )
    }

    // Confirm admin privileges using the user's session.
    const isAdmin =
      await isAuthenticatedUserAdmin(
        request,
        env
      )

    if (!isAdmin) {
      return jsonResponse(
        {
          success: false,
          message: 'Admin access required.',
        },
        403
      )
    }

    const body = await request.json()

    const {
      payout_id,
      action,
      note,
      confirmed,
    } = body || {}

    // Validate payout ID.
    if (
      typeof payout_id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        payout_id
      )
    ) {
      return jsonResponse(
        {
          success: false,
          message: 'A valid payout ID is required.',
        },
        400
      )
    }

    // Validate action.
    const allowedActions = [
      'mark_paid',
      'authorize_retry',
      'keep_under_review',
      'cancel',
    ]

    if (!allowedActions.includes(action)) {
      return jsonResponse(
        {
          success: false,
          message: 'Invalid payout action.',
        },
        400
      )
    }

    // Require an explanatory note.
    if (
      typeof note !== 'string' ||
      !note.trim() ||
      note.trim().length > 2000
    ) {
      return jsonResponse(
        {
          success: false,
          message: 'A valid admin note is required.',
        },
        400
      )
    }

    // Mark Paid and Cancel require explicit confirmation.
    if (
      ['mark_paid', 'cancel'].includes(action) &&
      confirmed !== true
    ) {
      return jsonResponse(
        {
          success: false,
          message: 'Explicit confirmation is required.',
        },
        400
      )
    }

    // Retrieve the payout before performing any action.
    const payoutResponse = await supabaseRequest(
      env,
      `/rest/v1/vendor_payouts?id=eq.${encodeURIComponent(
        payout_id
      )}&select=id,status,paystack_reference,transfer_attempted_at,manual_review_required&limit=1`
    )

    if (!payoutResponse.ok) {
      throw new Error('Could not retrieve payout.')
    }

    const payoutRows = await payoutResponse.json()
    const payout = payoutRows?.[0]

    if (!payout) {
      return jsonResponse(
        {
          success: false,
          message: 'Payout not found.',
        },
        404
      )
    }

    // -----------------------------------------------------
    // INDEPENDENT PAYSTACK VERIFICATION BEFORE RETRY
    // -----------------------------------------------------

    let previousTransferConfirmedFailed = false

    if (action === 'authorize_retry') {
      if (
        payout.status !== 'failed' ||
        payout.manual_review_required !== true ||
        !payout.paystack_reference ||
        !payout.transfer_attempted_at
      ) {
        return jsonResponse(
          {
            success: false,
            message:
              'This payout does not meet the requirements for retry authorization.',
          },
          409
        )
      }

      if (
        !env.PAYSTACK_SECRET_KEY ||
        !env.PAYSTACK_SECRET_KEY.startsWith('sk_live_')
      ) {
        return jsonResponse(
          {
            success: false,
            message:
              'Paystack Live Mode verification is unavailable. Retry remains blocked.',
          },
          503
        )
      }

      let verificationResponse
      let verificationData

      try {
        verificationResponse = await fetch(
          `https://api.paystack.co/transfer/verify/${encodeURIComponent(
            payout.paystack_reference
          )}`,
          {
            method: 'GET',
            headers: {
              Authorization:
                `Bearer ${env.PAYSTACK_SECRET_KEY}`,
            },
          }
        )

        verificationData =
          await verificationResponse.json()
      } catch (error) {
        console.error(
          'Admin retry Paystack verification failed:',
          error
        )

        return jsonResponse(
          {
            success: false,
            message:
              'Paystack verification could not be completed. Retry remains blocked.',
          },
          503
        )
      }

      if (
        !verificationResponse.ok ||
        verificationData?.status !== true ||
        verificationData?.data?.reference !==
          payout.paystack_reference ||
        verificationData?.data?.status !== 'failed'
      ) {
        console.warn(
          `Admin retry refused for payout ${payout_id}: previous transfer was not independently confirmed failed.`
        )

        return jsonResponse(
          {
            success: false,
            message:
              'Paystack has not confirmed that the previous transfer failed. This payout must remain under review.',
          },
          409
        )
      }

      previousTransferConfirmedFailed = true
    }

    // -----------------------------------------------------
    // EXECUTE THE SECURE DATABASE RPC
    // -----------------------------------------------------

    const rpcResponse = await supabaseRequest(
      env,
      '/rest/v1/rpc/admin_manage_vendor_payout',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          p_payout_id: payout_id,

          // Never accept an admin ID supplied by the browser.
          p_admin_id: user.id,

          p_action: action,
          p_note: note.trim(),

          p_confirmed:
            confirmed === true,

          p_previous_transfer_confirmed_failed:
            previousTransferConfirmedFailed,
        }),
      }
    )

    const rpcText = await rpcResponse.text()

    let rpcData

    try {
      rpcData = JSON.parse(rpcText)
    } catch {
      rpcData = null
    }

    if (!rpcResponse.ok) {
      console.error(
        'Admin payout action database error:',
        rpcResponse.status,
        rpcText
      )

      return jsonResponse(
        {
          success: false,
          message:
            'The payout action could not be completed. No successful confirmation was received from the database.',
        },
        409
      )
    }

    return jsonResponse({
      success: true,
      message: 'Payout action completed successfully.',
      result: rpcData,
    })

  } catch (error) {
    console.error(
      'Admin payout action error:',
      error
    )

    return jsonResponse(
      {
        success: false,
        message: 'Unable to process the payout action.',
      },
      500
    )
  }
}
        // -------------------------------------------------------
    // CHAT EMAIL NOTIFICATION
    // -------------------------------------------------------

    if (
      url.pathname === '/api/chat/email-notification' &&
      request.method === 'POST'
    ) {
      try {
        const user = await getAuthenticatedUser(
          request,
          env
        )

        if (!user?.id) {
          return jsonResponse(
            {
              success: false,
              message: 'Unauthorized',
            },
            401
          )
        }

        const body = await request.json()

        const {
          message_id,
          chat_id,
        } = body

        if (!message_id || !chat_id) {
          return jsonResponse(
            {
              success: false,
              message: 'Missing message information.',
            },
            400
          )
        }

        // Verify the saved message belongs to the sender.
        const messageResponse = await supabaseRequest(
          env,
          `/rest/v1/chat_messages?id=eq.${encodeURIComponent(message_id)}&chat_id=eq.${encodeURIComponent(chat_id)}&sender_id=eq.${encodeURIComponent(user.id)}&select=id,chat_id,sender_id,message&limit=1`
        )

        if (!messageResponse.ok) {
          throw new Error('Could not verify chat message.')
        }

        const messages = await messageResponse.json()
        const message = messages?.[0]

        if (!message) {
          return jsonResponse(
            {
              success: false,
              message: 'Message not found or unauthorized.',
            },
            403
          )
        }

        // Retrieve the chat.
        const chatResponse = await supabaseRequest(
          env,
          `/rest/v1/order_chats?id=eq.${encodeURIComponent(chat_id)}&select=id,vendor_order_id&limit=1`
        )

        if (!chatResponse.ok) {
          throw new Error('Could not retrieve chat.')
        }

        const chats = await chatResponse.json()
        const chat = chats?.[0]

        if (!chat?.vendor_order_id) {
          return jsonResponse(
            {
              success: false,
              message: 'Chat not found.',
            },
            404
          )
        }

        // Retrieve the vendor order.
        const vendorOrderResponse = await supabaseRequest(
          env,
          `/rest/v1/vendor_orders?id=eq.${encodeURIComponent(chat.vendor_order_id)}&select=id,order_id,vendor_id&limit=1`
        )

        if (!vendorOrderResponse.ok) {
          throw new Error('Could not retrieve vendor order.')
        }

        const vendorOrders = await vendorOrderResponse.json()
        const vendorOrder = vendorOrders?.[0]

        if (!vendorOrder) {
          return jsonResponse(
            {
              success: false,
              message: 'Vendor order not found.',
            },
            404
          )
        }

        // Retrieve the customer.
        const orderResponse = await supabaseRequest(
          env,
          `/rest/v1/orders?id=eq.${encodeURIComponent(vendorOrder.order_id)}&select=id,customer_id&limit=1`
        )

        if (!orderResponse.ok) {
          throw new Error('Could not retrieve order.')
        }

        const orders = await orderResponse.json()
        const order = orders?.[0]

        if (!order) {
          return jsonResponse(
            {
              success: false,
              message: 'Order not found.',
            },
            404
          )
        }

        // Only the customer and vendor receive chat emails.
        let recipientUserId = null
        let recipientRole = ''

        if (user.id === order.customer_id) {
          recipientUserId = vendorOrder.vendor_id
          recipientRole = 'vendor'
        } else if (user.id === vendorOrder.vendor_id) {
          recipientUserId = order.customer_id
          recipientRole = 'customer'
        } else {
          return jsonResponse(
            {
              success: false,
              message: 'You are not a participant in this chat.',
            },
            403
          )
        }

        const recipientEmail = await getUserEmail(
          env,
          recipientUserId
        )

        if (!recipientEmail) {
          return jsonResponse(
            {
              success: false,
              message: 'Recipient email is unavailable.',
            },
            404
          )
        }

        // Escape message content before placing it in HTML.
        const safeMessage = String(message.message || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;')
          .replace(/\n/g, '<br>')

        const appUrl = getAppUrl(env, request)

        const emailSent = await sendResendEmail(
          env,
          {
            to: recipientEmail,
            subject: 'New message on UniAbuja Market',
            idempotencyKey: `chat-message-${message.id}`,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;line-height:1.6">
                <h2>New order chat message</h2>
                <p>You have received a new message from the other ${recipientRole === 'vendor' ? 'order participant' : 'order participant'}.</p>
                <div style="padding:16px;background:#f4f4f4;border-radius:8px;margin:20px 0">
                  ${safeMessage}
                </div>
                <p>Log in to UniAbuja Market and open the relevant order to reply.</p>
                <p>
                  <a href="${appUrl}" style="display:inline-block;padding:12px 20px;background:#166534;color:white;text-decoration:none;border-radius:6px">
                    Open UniAbuja Market
                  </a>
                </p>
              </div>
            `,
          }
        )

        return jsonResponse({
          success: emailSent,
        })

      } catch (error) {
        console.error(
          'Chat email notification error:',
          error.message
        )

        return jsonResponse(
          {
            success: false,
            message: 'Could not process chat email notification.',
          },
          500
        )
      }
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
            verifiedTransaction?.domain !== 'live' ||
            verifiedTransaction?.status !== 'success' ||
            verifiedTransaction?.reference !== reference ||
            verifiedTransaction?.currency !== 'NGN' ||
            Number(verifiedTransaction?.amount) !== expectedAmount
          ) {
            console.error(
              `Payment ${reference}: Paystack verification failed or transaction is not Live Mode.`
            )

            return jsonResponse(
              {
                success: true,
                ignored: true,
                message: 'Payment is not verified as a Live Mode transaction',
              }
            )
          }

                    // Standard transactions settle into the platform balance.
          // Only validate split details when Paystack confirms a subaccount.
          const verifiedSubaccount =
            typeof verifiedTransaction.subaccount === 'string'
              ? verifiedTransaction.subaccount
              : verifiedTransaction.subaccount?.subaccount_code

          if (verifiedSubaccount) {
            const vendorOrder = paidVendorOrders[0]

            const mappingResponse = await supabaseRequest(
              env,
              `/rest/v1/vendor_paystack_subaccounts?vendor_id=eq.${encodeURIComponent(
                vendorOrder.vendor_id
              )}&select=subaccount_code&limit=2`,
              { method: 'GET' }
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
              !mappings[0]?.subaccount_code ||
              verifiedSubaccount !== mappings[0].subaccount_code
            ) {
              console.error(
                `Could not confirm the split destination for order ${order.id}.`
              )

              return jsonResponse(
                {
                  success: false,
                  message: 'Could not confirm split destination',
                },
                500
              )
            }

            const commissionResponse = await supabaseRequest(
              env,
              `/rest/v1/vendor_commissions?vendor_order_id=eq.${encodeURIComponent(
                vendorOrder.id
              )}&select=id&limit=2`,
              { method: 'GET' }
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

            // -------------------------------------------------
            // EMAIL VENDOR AFTER SUCCESSFUL CUSTOMER PAYMENT
            // -------------------------------------------------

            try {
              const vendorOrder =
                paidVendorOrders[0]

              const vendorEmail =
                await getUserEmail(
                  env,
                  vendorOrder.vendor_id
                )

              if (vendorEmail) {
                const formatNaira = (amount) =>
                  `₦${Number(amount).toLocaleString('en-NG', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`

                const amountPaid =
                  Number(order.total_amount)

                const productSubtotal =
                  Number(vendorOrder.subtotal || 0)

                const deliveryFee =
                  Math.max(
                    0,
                    amountPaid - productSubtotal
                  )

                await sendResendEmail(
                  env,
                  {
                    to: vendorEmail,
                    subject: 'Payment received for your UniAbuja Market order',
                    idempotencyKey: `order-payment-${order.id}`,
                    html: `
                      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#222;">
                        <h2>Payment received!</h2>
                        <p>Good news! A customer has successfully paid for an order from your store.</p>
                        <p><strong>Order reference:</strong> ${String(reference).replace(/[&<>"']/g, '')}</p>
                        <p><strong>Product subtotal:</strong> ${formatNaira(productSubtotal)}</p>
                        <p><strong>Delivery fee:</strong> ${formatNaira(deliveryFee)}</p>
                        <p><strong>Total paid by customer:</strong> ${formatNaira(amountPaid)}</p>
                        <p>Please log in to UniAbuja Market to view and process the order.</p>
                        <p>
                          <a href="${getAppUrl(env, request)}"
                             style="display:inline-block;padding:12px 20px;background:#16a34a;color:white;text-decoration:none;border-radius:6px;">
                            Open UniAbuja Market
                          </a>
                        </p>
                      </div>
                    `,
                  }
                )
              } else {
                console.warn(
                  `No email address found for vendor ${vendorOrder.vendor_id}.`
                )
              }
            } catch (emailError) {
              console.error(
                `Vendor payment email failed for order ${order.id}:`,
                emailError
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


        const payout = payouts[0]

        const targetStatusByEvent = {
          'transfer.success': 'paid',
          'transfer.failed': 'failed',
          'transfer.reversed': 'reversed',
        }

        const targetStatus =
          targetStatusByEvent[eventName]

        const currentStatus = payout.status

        if (currentStatus === targetStatus) {
          return jsonResponse({
            success: true,
            already_processed: true,
          })
        }

        // Never let a delayed failure overwrite a paid or reversed payout.
        if (
          eventName === 'transfer.failed' &&
          ['paid', 'reversed'].includes(currentStatus)
        ) {
          console.warn(
            `Ignoring transfer.failed for payout ${payout.id}; current status is ${currentStatus}.`
          )

          return jsonResponse({
            success: true,
            ignored: true,
          })
        }

        // A late success after failure needs reconciliation.
        if (
          eventName === 'transfer.success' &&
          currentStatus === 'failed'
        ) {
          console.error(
            `Payout ${payout.id} has a conflicting late success event. Reconciliation is required.`
          )

          return jsonResponse({
            success: true,
            ignored: true,
            reconciliation_required: true,
          })
        }

        const allowedCurrentStatuses = {
          'transfer.success': ['processing', 'pending'],
          'transfer.failed': ['processing', 'pending'],
          'transfer.reversed': [
            'processing',
            'pending',
            'paid',
            'failed',
          ],
        }

        if (
          !allowedCurrentStatuses[eventName]?.includes(
            currentStatus
          )
        ) {
          console.warn(
            `Ignoring ${eventName} for payout ${payout.id}; current status is ${currentStatus}.`
          )

          return jsonResponse({
            success: true,
            ignored: true,
          })
        }

        const payoutUpdates = {
          status: targetStatus,
        }

        if (targetStatus === 'paid') {
          payoutUpdates.paid_at = new Date().toISOString()
          payoutUpdates.failure_reason = null
        } else {
          payoutUpdates.failure_reason =
            transfer?.reason ||
            (
              targetStatus === 'reversed'
                ? 'Paystack transfer was reversed'
                : 'Paystack transfer failed'
            )
        }

        const updateConfirmed =
          await updateVendorPayout(
            env,
            payout.id,
            payoutUpdates
          )

        if (updateConfirmed) {
          return jsonResponse({
            success: true,
          })
        }

        // Re-read the row in case another webhook updated it concurrently.
        let latestResponse

        try {
          latestResponse = await supabaseRequest(
            env,
            `/rest/v1/vendor_payouts?id=eq.${encodeURIComponent(
              payout.id
            )}&select=id,status&limit=1`,
            {
              method: 'GET',
            }
          )
        } catch (error) {
          console.error(
            `Could not verify payout ${payout.id} after its status update failed.`,
            error
          )

          return jsonResponse(
            {
              success: false,
              message: 'Could not verify payout status update',
            },
            500
          )
        }

        if (!latestResponse.ok) {
          console.error(
            `Could not re-read payout ${payout.id}:`,
            await latestResponse.text()
          )

          return jsonResponse(
            {
              success: false,
              message: 'Could not verify payout status update',
            },
            500
          )
        }

        let latestPayouts

        try {
          latestPayouts = await latestResponse.json()
        } catch (error) {
          console.error(
            `Invalid payout status response for ${payout.id}.`,
            error
          )

          return jsonResponse(
            {
              success: false,
              message: 'Could not verify payout status update',
            },
            500
          )
        }

        const latestStatus =
          Array.isArray(latestPayouts) &&
          latestPayouts.length === 1
            ? latestPayouts[0].status
            : null

        if (latestStatus === targetStatus) {
          return jsonResponse({
            success: true,
            already_processed: true,
          })
        }

        if (
          eventName === 'transfer.failed' &&
          ['paid', 'reversed'].includes(latestStatus)
        ) {
          return jsonResponse({
            success: true,
            ignored: true,
          })
        }

        if (
          eventName === 'transfer.success' &&
          latestStatus === 'failed'
        ) {
          console.error(
            `Payout ${payout.id} remains failed despite a success event. Reconciliation is required.`
          )

          return jsonResponse({
            success: true,
            ignored: true,
            reconciliation_required: true,
          })
        }

        console.error(
          `Payout ${payout.id}: webhook status "${targetStatus}" was not confirmed. Current database status: ${latestStatus || 'unknown'}.`
        )

        return jsonResponse(
          {
            success: false,
            message: 'Payout status update was not confirmed',
          },
          500
        )

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

        // 3. Calculate the platform's 10% commission.
        // Customer payments settle into the platform's Paystack balance.
        // Vendor payouts will be handled separately after delivery.

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

        // 4. Initialize a standard Paystack transaction.
        // Do not use subaccount split-settlement parameters.

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
          transaction?.domain !== 'live' ||
          transaction?.status !== 'success' ||
          transaction?.reference !== reference ||
          transaction?.currency !== 'NGN'
        ) {
          console.error(
            'Customer payment callback rejected: transaction is not verified as Live Mode.'
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

        // Standard transactions have no subaccount. Only mark commissions
        // as split when Paystack confirms a split destination.
        if (callbackVerifiedSubaccount) {
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
            !callbackMappings[0]?.subaccount_code ||
            callbackMappings[0].subaccount_code !== callbackVerifiedSubaccount
          ) {
            console.error(
              `Could not verify split destination for callback payment ${reference}.`
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
