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
            width: 'min(360px, 90vw)',
            maxHeight: '480px',
            overflowY: 'auto',
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '14px',
            boxShadow:
              '0 12px 30px rgba(0,0,0,0.15)',
            zIndex: 1000,
            padding: '12px',
          }}
        >
          <div
            style={{
              marginBottom: '12px',
              paddingBottom: '12px',
              borderBottom: '1px solid #e5e7eb',
            }}
          >
            <strong>
              Offline notifications
            </strong>

            {pushEnabled ? (
              <>
                <p
                  style={{
                    margin: '5px 0 0',
                    fontSize: '13px',
                    color: '#16a34a',
                  }}
                >
                  ✓ Enabled on this device
                </p>

                <button
                  type="button"
                  onClick={
                    refreshPushSubscription
                  }
                  disabled={pushLoading}
                  style={{
                    marginTop: '8px',
                    fontSize: '12px',
                  }}
                >
                  {pushLoading
                    ? 'Refreshing...'
                    : 'Refresh push connection'}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={
                  enablePushNotifications
                }
                disabled={pushLoading}
                style={{
                  marginTop: '8px',
                }}
              >
                {pushLoading
                  ? 'Enabling...'
                  : 'Enable notifications'}
              </button>
            )}

            {pushMessage && (
              <p
                style={{
                  margin: '6px 0 0',
                  fontSize: '12px',
                }}
              >
                {pushMessage}
              </p>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '10px',
            }}
          >
            <strong>
              Notifications
            </strong>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {loading ? (
            <p>Loading notifications...</p>
          ) : notifications.length === 0 ? (
            <p>
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
                  padding: '12px',
                  marginBottom: '8px',
                  borderRadius: '10px',
                  background: notification.is_read
                    ? '#f9fafb'
                    : '#eff6ff',
                  border: '1px solid #e5e7eb',
                  cursor: notification.is_read
                    ? 'default'
                    : 'pointer',
                }}
              >
                <strong>
                  {notification.title}
                </strong>

                <p
                  style={{
                    margin: '5px 0',
                    fontSize: '14px',
                  }}
                >
                  {notification.message}
                </p>

                <small
                  style={{
                    color: '#6b7280',
                  }}
                >
                  {formatDate(
                    notification.created_at
                  )}
                </small>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default Notifications