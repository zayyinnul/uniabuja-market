import webpush from 'web-push'

const VAPID_PUBLIC_KEY =
  'BKiYiAZbJUhiZjGYq1F8wc4lpYZ2uL_6g4bxuOSXdYGERyaQ3fllqbKDWkivPAamYXXTZriEOE-o23n22i9DqGg'

const VAPID_SUBJECT =
  'https://uniabuja-market.mammanabideen.workers.dev'

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

function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=UTF-8',
    },
  })
}

async function getAuthenticatedUser(request, env) {
  const authHeader =
    request.headers.get('Authorization')

  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }

  const accessToken =
    authHeader.replace('Bearer ', '').trim()

  const response = await fetch(
    `${env.SUPABASE_URL}/auth/v1/user`,
    {
      method: 'GET',
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  if (!response.ok) {
    return null
  }

  return await response.json()
}

// ---------------------------------------------------------
// SUPABASE SERVICE-ROLE HELPERS
// ---------------------------------------------------------

async function supabaseRequest(
  env,
  path,
  options = {}
) {
  const headers = {
    apikey: env.SUPABASE_SECRET_KEY,
    Authorization:
      `Bearer ${env.SUPABASE_SECRET_KEY}`,
    ...options.headers,
  }

  return fetch(
    `${env.SUPABASE_URL}${path}`,
    {
      ...options,
      headers,
    }
  )
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
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          ...updates,
          updated_at:
            new Date().toISOString(),
        }),
      }
    )

  if (!response.ok) {
    const errorText =
      await response.text()

    console.error(
      'Could not update vendor payout:',
      errorText
    )

    throw new Error(
      'Could not update vendor payout'
    )
  }
}

// ---------------------------------------------------------
// WEB PUSH
// ---------------------------------------------------------

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
          Prefer: 'return=minimal',
        },
      }
    )

  if (!response.ok) {
    console.error(
      `Could not delete expired push subscription ${subscriptionId}:`,
      await response.text()
    )
  }
}

async function sendPushNotification(
  env,
  notification
) {
  if (!env.VAPID_PRIVATE_KEY) {
    console.error(
      'VAPID_PRIVATE_KEY is not configured.'
    )

    return {
      sent: 0,
      failed: 0,
      removed: 0,
    }
  }

  if (!notification?.user_id) {
    console.error(
      'Push notification is missing user_id.'
    )

    return {
      sent: 0,
      failed: 0,
      removed: 0,
    }
  }

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
    !Array.isArray(subscriptions)
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
      url: '/',
    })

  for (
    const subscriptionRow of subscriptions
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
  return [...new Uint8Array(buffer)]
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

  return arrayBufferToHex(signature)
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

  for (let i = 0; i < a.length; i++) {
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

  if (verifyResponse.status === 404) {
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
    transferStatus === 'success'
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
    transferStatus === 'failed'
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
    transferStatus === 'reversed'
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
    !Array.isArray(accountData) ||
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
    Number(payout.payout_amount)

  if (
    !Number.isFinite(payoutAmount) ||
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
          amount: amountInKobo,
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

  if (!transferResponse.ok) {
    const message =
      transferData?.message ||
      'Paystack transfer request failed'

    console.error(
      `Paystack transfer request was not accepted for payout ${payout.id}:`,
      message
    )

    return
  }

  if (!transferData?.status) {
    console.error(
      `Paystack returned an unsuccessful response for payout ${payout.id}:`,
      transferData
    )

    return
  }

  const transferStatus =
    transferData?.data?.status

  if (
    transferStatus === 'success'
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
    transferStatus === 'failed'
  ) {
    await updateVendorPayout(
      env,
      payout.id,
      {
        status: 'failed',
        failure_reason:
          transferData?.data?.reason ||
          'Paystack transfer failed',
      }
    )

    return
  }

  if (
    transferStatus === 'reversed'
  ) {
    await updateVendorPayout(
      env,
      payout.id,
      {
        status: 'reversed',
        failure_reason:
          transferData?.data?.reason ||
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

async function processPendingVendorPayouts(
  env
) {
  if (
    env.AUTOMATED_PAYOUTS_ENABLED !==
    'true'
  ) {
    console.log(
      'Automated payouts disabled. No transfers will be created.'
    )

    return
  }

  const payoutsResponse =
    await supabaseRequest(
      env,
      '/rest/v1/vendor_payouts?status=eq.processing&paystack_reference=not.is.null&select=id,vendor_id,payout_amount,paystack_reference,status&order=created_at.asc&limit=20',
      {
        method: 'GET',
      }
    )

  let payoutsData = null

  try {
    payoutsData =
      await payoutsResponse.json()
  } catch {
    console.error(
      'Could not parse processing payouts response.'
    )

    return
  }

  if (!payoutsResponse.ok) {
    console.error(
      'Could not load processing payouts:',
      payoutsData
    )

    return
  }

  if (
    !Array.isArray(payoutsData) ||
    !payoutsData.length
  ) {
    console.log(
      'No processing vendor payouts found.'
    )

    return
  }

  console.log(
    `Found ${payoutsData.length} processing vendor payout(s).`
  )

  for (
    const payout of payoutsData
  ) {
    try {
      await processVendorPayout(
        env,
        payout
      )
    } catch (error) {
      console.error(
        `Error processing payout ${payout.id}:`,
        error
      )
    }
  }
}

// ---------------------------------------------------------
// WORKER
// ---------------------------------------------------------

export default {
  async fetch(request, env) {
    const url =
      new URL(request.url)

    if (
      request.method ===
      'OPTIONS'
    ) {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin':
            '*',
          'Access-Control-Allow-Headers':
            'Content-Type, Authorization, x-paystack-signature, x-push-webhook-secret',
          'Access-Control-Allow-Methods':
            'GET, POST, OPTIONS',
        },
      })
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

        // ---------------------------------------------------
        // Resolve the notification from the actual webhook
        // payload used by this project.
        //
        // Current payload:
        // {
        //   title,
        //   message,
        //   user_id,
        //   notification_id
        // }
        // ---------------------------------------------------

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
          }
        }

        // Standard Supabase Database Webhook format
        if (
          !notification &&
          payload?.type === 'INSERT' &&
          payload?.table === 'notifications' &&
          payload?.schema === 'public' &&
          payload?.record
        ) {
          notification =
            payload.record
        }

        // Direct notification record
        if (
          !notification &&
          payload?.id &&
          payload?.user_id
        ) {
          notification =
            payload
        }

        // Custom wrapper containing a notification record
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
            JSON.stringify(notification)
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
    // PAYSTACK TRANSFER WEBHOOK
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

        if (
          ![
            'transfer.success',
            'transfer.failed',
            'transfer.reversed',
          ].includes(eventName)
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
          payout.status === 'paid'
        ) {
          return jsonResponse({
            success: true,
            already_processed: true,
          })
        }

        if (
          payout.status === 'reversed'
        ) {
          return jsonResponse({
            success: true,
            already_processed: true,
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
              failure_reason: null,
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
            body.account_number ?? ''
          ).trim()

        const bankCode =
          String(
            body.bank_code ?? ''
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
          !Array.isArray(accountData) ||
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
          recipientData?.status !== true
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

        if (!accountResponse.ok) {
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

        if (!updateResponse.ok) {
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
            .replace('Bearer ', '')
            .trim()

        const body =
          await request.json()

        const { order_id } =
          body

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
                  paymentInfo.customer_email,
                amount:
                  amountInKobo,
                reference:
                  internalReference,
                currency: 'NGN',
                callback_url:
                  `${url.origin}/payment/callback`,
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
          paystackData.data.reference

        const updateOrderResponse =
          await supabaseRequest(
            env,
            `/rest/v1/orders?id=eq.${encodeURIComponent(
              order_id
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
                payment_reference:
                  paystackReference,
                payment_status:
                  'pending',
                updated_at:
                  new Date().toISOString(),
              }),
            }
          )
          console.log(
          'PAYMENT UPDATE RESULT:',
          updateOrderResponse.status,
         await updateOrderResponse.clone().text()
         );

        if (
          !updateOrderResponse.ok
        ) {
          const updateError =
            await updateOrderResponse.text()

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
            'https://uniabuja-market.mammanabideen.workers.dev/?payment=error',
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
          verifyData.data?.status !==
            'success'
        ) {
          return Response.redirect(
            `https://uniabuja-market.mammanabideen.workers.dev/?payment=failed&reference=${encodeURIComponent(
              reference
            )}`,
            303
          )
        }

        const transaction =
          verifyData.data

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
          !Array.isArray(orders) ||
          !orders.length
        ) {
          return Response.redirect(
            `https://uniabuja-market.mammanabideen.workers.dev/?payment=error&reference=${encodeURIComponent(
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
            `https://uniabuja-market.mammanabideen.workers.dev/?payment=error&order_id=${encodeURIComponent(
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
            `https://uniabuja-market.mammanabideen.workers.dev/?payment=error&order_id=${encodeURIComponent(
              order.id
            )}`,
            303
          )
        }

        /*
          The Paystack callback has no customer access token,
          so mark_order_payment_paid() cannot use auth.uid()
          here.

          We have already:
          1. Verified the Paystack transaction.
          2. Confirmed the order exists.
          3. Confirmed the Paystack reference belongs to the order.
          4. Confirmed the amount paid matches the order total.

          Therefore the Worker performs the final server-side
          payment update using the existing service-role access.
        */

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
              `https://uniabuja-market.mammanabideen.workers.dev/?payment=processing&order_id=${encodeURIComponent(
                order.id
              )}`,
              303
            )
          }

          /*
            Remove only the products belonging to this
            successfully paid order from the customer's cart.
          */

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
            Array.isArray(orderItems)
          ) {
            for (
              const item of orderItems
            ) {
              if (!item?.product_id) {
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
          `https://uniabuja-market.mammanabideen.workers.dev/?payment=success&order_id=${encodeURIComponent(
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
          'https://uniabuja-market.mammanabideen.workers.dev/?payment=error',
          303
        )
      }
    }
    // ---------------------------------------------------------
    // FRONTEND ASSETS
    // ---------------------------------------------------------

    return env.ASSETS.fetch(request)
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
      'UniAbuja Market payout cron triggered:',
      new Date().toISOString()
    )

    if (
      env.AUTOMATED_PAYOUTS_ENABLED !==
      'true'
    ) {
      console.log(
        'AUTOMATED_PAYOUTS_ENABLED is not true. No payout will be sent.'
      )

      return
    }

    ctx.waitUntil(
      processPendingVendorPayouts(env)
    )
  },
}