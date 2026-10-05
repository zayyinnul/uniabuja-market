import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat(
    (4 - (base64String.length % 4)) % 4
  )

  const base64 = (
    base64String +
    padding
  )
    .replace(/-/g, '+')
    .replace(/_/g, '/')

  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }

  return outputArray
}

function arrayBufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })

  return window
    .btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function Notifications({ user }) {
  const [notifications, setNotifications] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)
  const [pushMessage, setPushMessage] = useState('')

  useEffect(() => {
    if (!user?.id) {
      setNotifications([])
      setLoading(false)
      setPushEnabled(false)
      setPushMessage('')
      return
    }

    loadNotifications()
    checkPushSubscription()

    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setNotifications((current) => [
            payload.new,
            ...current,
          ])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id])

  const loadNotifications = async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', {
        ascending: false,
      })
      .limit(30)

    if (error) {
      console.error(
        'Notification loading error:',
        error
      )
      setNotifications([])
    } else {
      setNotifications(data || [])
    }

    setLoading(false)
  }

  const checkPushSubscription = async () => {
    if (
      !('serviceWorker' in navigator) ||
      !('PushManager' in window)
    ) {
      setPushEnabled(false)
      return
    }

    try {
      const registration =
        await navigator.serviceWorker.ready

      const subscription =
        await registration.pushManager.getSubscription()

      if (!subscription) {
        setPushEnabled(false)
        return
      }

      const p256dh = subscription.getKey('p256dh')
      const auth = subscription.getKey('auth')

      if (!p256dh || !auth) {
        setPushEnabled(false)
        return
      }

      const { data, error } = await supabase
        .from('push_subscriptions')
        .select('id')
        .eq('user_id', user.id)
        .eq('endpoint', subscription.endpoint)
        .maybeSingle()

      if (error) {
        console.error(
          'Push subscription database check error:',
          error
        )
        setPushEnabled(false)
        return
      }

      setPushEnabled(!!data)
    } catch (error) {
      console.error(
        'Push subscription check error:',
        error
      )
      setPushEnabled(false)
    }
  }

  const savePushSubscription = async (
    subscription
  ) => {
    const p256dh = subscription.getKey('p256dh')
    const auth = subscription.getKey('auth')

    if (!p256dh || !auth) {
      throw new Error(
        'Push subscription keys are unavailable.'
      )
    }

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: user.id,
          endpoint: subscription.endpoint,
          p256dh:
            arrayBufferToBase64Url(p256dh),
          auth:
            arrayBufferToBase64Url(auth),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,endpoint',
        }
      )

    if (error) {
      throw error
    }
  }

  const enablePushNotifications = async () => {
    setPushMessage('')

    if (
      !('serviceWorker' in navigator) ||
      !('PushManager' in window) ||
      !('Notification' in window)
    ) {
      setPushMessage(
        'Push notifications are not supported on this browser.'
      )
      return
    }

    setPushLoading(true)

    try {
      const permission =
        await Notification.requestPermission()

      if (permission !== 'granted') {
        setPushMessage(
          'Notification permission was not granted.'
        )
        return
      }

      const registration =
        await navigator.serviceWorker.ready

      let subscription =
        await registration.pushManager.getSubscription()

      if (!subscription) {
        const publicKey =
          import.meta.env.VITE_VAPID_PUBLIC_KEY

        if (!publicKey) {
          throw new Error(
            'VITE_VAPID_PUBLIC_KEY is missing.'
          )
        }

        subscription =
          await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey:
              urlBase64ToUint8Array(publicKey),
          })
      }

      await savePushSubscription(subscription)

      setPushEnabled(true)
      setPushMessage(
        'Notifications enabled on this device.'
      )
    } catch (error) {
      console.error(
        'Push notification setup error:',
        error
      )

      setPushMessage(
        error?.message ||
          'Could not enable notifications.'
      )
    } finally {
      setPushLoading(false)
    }
  }

  const refreshPushSubscription = async () => {
    setPushMessage('')
    setPushLoading(true)

    try {
      if (
        !('serviceWorker' in navigator) ||
        !('PushManager' in window) ||
        !('Notification' in window)
      ) {
        throw new Error(
          'Push notifications are not supported on this browser.'
        )
      }

      if (Notification.permission !== 'granted') {
        const permission =
          await Notification.requestPermission()

        if (permission !== 'granted') {
          throw new Error(
            'Notification permission was not granted.'
          )
        }
      }

      const registration =
        await navigator.serviceWorker.ready

      const oldSubscription =
        await registration.pushManager.getSubscription()

      if (oldSubscription) {
        const oldEndpoint =
          oldSubscription.endpoint

        await oldSubscription.unsubscribe()

        const { error: deleteError } =
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('user_id', user.id)
            .eq('endpoint', oldEndpoint)

        if (deleteError) {
          console.warn(
            'Could not remove old push subscription from database:',
            deleteError
          )
        }
      }

      const publicKey =
        import.meta.env.VITE_VAPID_PUBLIC_KEY

      if (!publicKey) {
        throw new Error(
          'VITE_VAPID_PUBLIC_KEY is missing.'
        )
      }

      const newSubscription =
        await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey:
            urlBase64ToUint8Array(publicKey),
        })

      await savePushSubscription(
        newSubscription
      )

      setPushEnabled(true)
      setPushMessage(
        'Push connection refreshed successfully.'
      )
    } catch (error) {
      console.error(
        'Push subscription refresh error:',
        error
      )

      setPushMessage(
        error?.message ||
          'Could not refresh push notifications.'
      )
    } finally {
      setPushLoading(false)
    }
  }

  const unreadCount = notifications.filter(
    (notification) => !notification.is_read
  ).length

  const markAsRead = async (notificationId) => {
    const { error } = await supabase
      .from('notifications')
      .update({
        is_read: true,
      })
      .eq('id', notificationId)
      .eq('user_id', user.id)

    if (error) {
      console.error(
        'Notification read error:',
        error
      )
      return
    }

    setNotifications((current) =>
      current.map((notification) =>
        notification.id === notificationId
          ? {
              ...notification,
              is_read: true,
            }
          : notification
      )
    )
  }

  const markAllAsRead = async () => {
    const { error } = await supabase
      .from('notifications')
      .update({
        is_read: true,
      })
      .eq('user_id', user.id)
      .eq('is_read', false)

    if (error) {
      console.error(
        'Mark all notifications error:',
        error
      )
      return
    }

    setNotifications((current) =>
      current.map((notification) => ({
        ...notification,
        is_read: true,
      }))
    )
  }

  const formatDate = (date) => {
    return new Date(date).toLocaleString()
  }

  if (!user) {
    return null
  }

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-block',
      }}
    >
      <button
        type="button"
        className="back-button"
        onClick={() => setOpen((current) => !current)}
        style={{
          position: 'relative',
        }}
      >
        🔔 Notifications

        {unreadCount > 0 && (
          <span
            style={{
              marginLeft: '6px',
              background: '#dc2626',
              color: '#fff',
              borderRadius: '999px',
              padding: '2px 7px',
              fontSize: '12px',
              fontWeight: '700',
            }}
          >
            {unreadCount > 99
              ? '99+'
              : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 10px)',
            width: 'min(380px, calc(100vw - 24px))',
            maxHeight: '75vh',
            overflowY: 'auto',
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '14px',
            boxShadow:
              '0 12px 30px rgba(0,0,0,0.15)',
            zIndex: 1000,
            padding: '14px',
          }}
        >
          {/* PUSH NOTIFICATION SETTINGS */}
          <div
            style={{
              marginBottom: '14px',
              paddingBottom: '14px',
              borderBottom: '1px solid #e5e7eb',
            }}
          >
            <strong>
              📱 App notifications
            </strong>

            {pushEnabled ? (
              <>
                <p
                  style={{
                    margin: '6px 0 0',
                    fontSize: '13px',
                    color: '#16a34a',
                    fontWeight: '600',
                  }}
                >
                  ✓ Push notifications enabled on
                  this device
                </p>

                <button
                  type="button"
                  onClick={
                    refreshPushSubscription
                  }
                  disabled={pushLoading}
                  style={{
                    marginTop: '9px',
                    padding: '8px 12px',
                    border:
                      '1px solid #d1d5db',
                    background: '#fff',
                    borderRadius: '7px',
                    cursor: pushLoading
                      ? 'not-allowed'
                      : 'pointer',
                    fontSize: '12px',
                    fontWeight: '600',
                  }}
                >
                  {pushLoading
                    ? 'Refreshing...'
                    : 'Refresh push connection'}
                </button>
              </>
            ) : (
              <>
                <p
                  style={{
                    margin: '6px 0 0',
                    fontSize: '13px',
                    color: '#6b7280',
                  }}
                >
                  Receive notifications even when
                  the app is not open.
                </p>

                <button
                  type="button"
                  onClick={
                    enablePushNotifications
                  }
                  disabled={pushLoading}
                  style={{
                    marginTop: '9px',
                    padding: '9px 14px',
                    border: 'none',
                    background: '#15803d',
                    color: '#fff',
                    borderRadius: '8px',
                    cursor: pushLoading
                      ? 'not-allowed'
                      : 'pointer',
                    fontSize: '13px',
                    fontWeight: '700',
                    width: '100%',
                  }}
                >
                  {pushLoading
                    ? 'Enabling...'
                    : '🔔 Enable app notifications'}
                </button>
              </>
            )}

            {pushMessage && (
              <p
                style={{
                  margin: '7px 0 0',
                  fontSize: '12px',
                  color: '#374151',
                }}
              >
                {pushMessage}
              </p>
            )}
          </div>

          {/* NOTIFICATION HEADER */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '12px',
            }}
          >
            <strong
              style={{
                fontSize: '16px',
              }}
            >
              Notifications
            </strong>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                style={{
                  border:
                    '1px solid #15803d',
                  background: '#15803d',
                  color: '#fff',
                  borderRadius: '7px',
                  padding: '7px 10px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '700',
                  whiteSpace: 'nowrap',
                }}
              >
                ✓ Mark all read
              </button>
            )}
          </div>

          {/* NOTIFICATIONS */}
          {loading ? (
            <p>Loading notifications...</p>
          ) : notifications.length === 0 ? (
            <p
              style={{
                color: '#6b7280',
                fontSize: '14px',
              }}
            >
              You don't have any notifications yet.
            </p>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.id}
                onClick={() =>
                  !notification.is_read &&
                  markAsRead(notification.id)
                }
                style={{
                  padding: '13px',
                  marginBottom: '9px',
                  borderRadius: '10px',
                  background:
                    notification.is_read
                      ? '#f9fafb'
                      : '#eff6ff',
                  border:
                    notification.is_read
                      ? '1px solid #e5e7eb'
                      : '1px solid #bfdbfe',
                  cursor: notification.is_read
                    ? 'default'
                    : 'pointer',
                }}
              >
                <strong
                  style={{
                    display: 'block',
                    fontSize: '14px',
                  }}
                >
                  {notification.title}
                </strong>

                <p
                  style={{
                    margin: '6px 0',
                    fontSize: '14px',
                    lineHeight: '1.45',
                  }}
                >
                  {notification.message}
                </p>

                <div
                  style={{
                    marginTop: '9px',
                    display: 'flex',
                    justifyContent:
                      'space-between',
                    alignItems: 'center',
                    gap: '10px',
                    flexWrap: 'wrap',
                  }}
                >
                  <small
                    style={{
                      color: '#6b7280',
                    }}
                  >
                    {formatDate(
                      notification.created_at
                    )}
                  </small>

                  {!notification.is_read && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        markAsRead(
                          notification.id
                        )
                      }}
                      style={{
                        border:
                          '1px solid #15803d',
                        background: '#fff',
                        color: '#15803d',
                        borderRadius: '7px',
                        padding: '7px 10px',
                        fontSize: '12px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      ✓ Mark as read
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default Notifications