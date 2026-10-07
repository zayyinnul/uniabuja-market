import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './lib/supabase'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat(
    (4 - (base64String.length % 4)) % 4
  )

  const base64 = (
    base64String + padding
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

      const p256dh =
        subscription.getKey('p256dh')

      const auth =
        subscription.getKey('auth')

      if (!p256dh || !auth) {
        setPushEnabled(false)
        return
      }

      const { data, error } = await supabase
        .from('push_subscriptions')
        .select('id')
        .eq('user_id', user.id)
        .eq(
          'endpoint',
          subscription.endpoint
        )
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
    const p256dh =
      subscription.getKey('p256dh')

    const auth =
      subscription.getKey('auth')

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
          updated_at:
            new Date().toISOString(),
        },
        {
          onConflict:
            'user_id,endpoint',
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

      await savePushSubscription(
        subscription
      )

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

  const refreshPushSubscription =
    async () => {
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

        if (
          Notification.permission !==
          'granted'
        ) {
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
              .eq(
                'user_id',
                user.id
              )
              .eq(
                'endpoint',
                oldEndpoint
              )

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
              urlBase64ToUint8Array(
                publicKey
              ),
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

  const unreadCount =
    notifications.filter(
      (notification) =>
        !notification.is_read
    ).length

  const markAsRead = async (
    notificationId
  ) => {
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

  const notificationPanel =
    open &&
    typeof document !== 'undefined'
      ? createPortal(
          <>
            {/* BACKDROP */}
            <div
              onClick={() => setOpen(false)}
              style={{
                position: 'fixed',
                inset: 0,
                background:
                  'rgba(0,0,0,0.25)',
                zIndex: 9998,
              }}
            />

            {/* CENTERING WRAPPER */}
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '12px',
                boxSizing: 'border-box',
                pointerEvents: 'none',
              }}
            >
              {/* MAIN PANEL */}
              <div
                onClick={(event) =>
                  event.stopPropagation()
                }
                style={{
                  width:
                    'min(760px, calc(100vw - 24px))',
                  height:
                    'min(620px, calc(100vh - 24px))',
                  maxHeight:
                    'calc(100vh - 24px)',
                  background: '#fff',
                  border:
                    '1px solid #e5e7eb',
                  borderRadius: '16px',
                  boxShadow:
                    '0 20px 55px rgba(0,0,0,0.25)',
                  boxSizing: 'border-box',
                  display: 'grid',
                  gridTemplateColumns:
                    '230px minmax(0, 1fr)',
                  overflow: 'hidden',
                  pointerEvents: 'auto',
                }}
              >
                {/* ========================= */}
                {/* LEFT SIDE: PUSH SETTINGS */}
                {/* ========================= */}

                <div
                  style={{
                    background: '#f8fafc',
                    borderRight:
                      '1px solid #e5e7eb',
                    padding: '16px',
                    boxSizing: 'border-box',
                    overflowY: 'auto',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent:
                        'space-between',
                      gap: '8px',
                      marginBottom: '16px',
                    }}
                  >
                    <strong
                      style={{
                        fontSize: '16px',
                        color: '#111827',
                      }}
                    >
                      📱 App notifications
                    </strong>

                    <button
                      type="button"
                      onClick={() =>
                        setOpen(false)
                      }
                      aria-label="Close notifications"
                      style={{
                        border: 'none',
                        background:
                          'transparent',
                        color: '#6b7280',
                        fontSize: '24px',
                        lineHeight: 1,
                        cursor: 'pointer',
                        padding: '2px 5px',
                      }}
                    >
                      ×
                    </button>
                  </div>

                  {pushEnabled ? (
                    <>
                      <div
                        style={{
                          padding:
                            '11px',
                          background:
                            '#f0fdf4',
                          border:
                            '1px solid #bbf7d0',
                          borderRadius:
                            '9px',
                          color:
                            '#166534',
                          fontSize:
                            '13px',
                          lineHeight:
                            '1.45',
                        }}
                      >
                        <strong>
                          ✓ Push notifications
                          enabled on this
                          device
                        </strong>

                        <div
                          style={{
                            marginTop:
                              '6px',
                          }}
                        >
                          This device is
                          registered to receive
                          UniAbuja Market
                          notifications.
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={
                          refreshPushSubscription
                        }
                        disabled={
                          pushLoading
                        }
                        style={{
                          width: '100%',
                          minHeight:
                            '44px',
                          marginTop:
                            '10px',
                          padding:
                            '10px',
                          border:
                            'none',
                          borderRadius:
                            '8px',
                          background:
                            '#15803d',
                          color: '#fff',
                          cursor:
                            pushLoading
                              ? 'not-allowed'
                              : 'pointer',
                          fontSize:
                            '13px',
                          fontWeight:
                            '700',
                          opacity:
                            pushLoading
                              ? 0.7
                              : 1,
                        }}
                      >
                        {pushLoading
                          ? 'Refreshing...'
                          : '🔄 Refresh push notifications'}
                      </button>
                    </>
                  ) : (
                    <>
                      <div
                        style={{
                          padding:
                            '11px',
                          background:
                            '#fff',
                          border:
                            '1px solid #e5e7eb',
                          borderRadius:
                            '9px',
                          color:
                            '#4b5563',
                          fontSize:
                            '13px',
                          lineHeight:
                            '1.5',
                        }}
                      >
                        Enable app notifications
                        to receive important
                        updates about your
                        orders, deliveries and
                        account.
                      </div>

                      <button
                        type="button"
                        onClick={
                          enablePushNotifications
                        }
                        disabled={
                          pushLoading
                        }
                        style={{
                          width: '100%',
                          minHeight:
                            '44px',
                          marginTop:
                            '10px',
                          padding:
                            '10px',
                          border:
                            'none',
                          borderRadius:
                            '8px',
                          background:
                            '#15803d',
                          color: '#fff',
                          cursor:
                            pushLoading
                              ? 'not-allowed'
                              : 'pointer',
                          fontSize:
                            '13px',
                          fontWeight:
                            '700',
                          opacity:
                            pushLoading
                              ? 0.7
                              : 1,
                        }}
                      >
                        {pushLoading
                          ? 'Enabling...'
                          : '🔔 Enable app notifications'}
                      </button>
                    </>
                  )}

                  {pushMessage && (
                    <div
                      style={{
                        marginTop:
                          '10px',
                        padding:
                          '9px 10px',
                        background:
                          '#fff',
                        border:
                          '1px solid #e5e7eb',
                        borderRadius:
                          '8px',
                        color:
                          '#374151',
                        fontSize:
                          '12px',
                        lineHeight:
                          '1.45',
                      }}
                    >
                      {pushMessage}
                    </div>
                  )}

                  <div
                    style={{
                      marginTop:
                        '20px',
                      paddingTop:
                        '15px',
                      borderTop:
                        '1px solid #e5e7eb',
                      color:
                        '#6b7280',
                      fontSize:
                        '12px',
                      lineHeight:
                        '1.5',
                    }}
                  >
                    Push notifications let
                    UniAbuja Market send
                    important updates to this
                    device even when the app is
                    closed.
                  </div>
                </div>

                {/* ========================= */}
                {/* RIGHT SIDE: NOTIFICATIONS */}
                {/* ========================= */}

                <div
                  style={{
                    minWidth: 0,
                    minHeight: 0,
                    display: 'flex',
                    flexDirection:
                      'column',
                    overflow: 'hidden',
                  }}
                >
                  {/* HEADER */}
                  <div
                    style={{
                      flexShrink: 0,
                      padding: '16px',
                      borderBottom:
                        '1px solid #e5e7eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent:
                        'space-between',
                      gap: '10px',
                    }}
                  >
                    <strong
                      style={{
                        fontSize: '17px',
                        color: '#111827',
                      }}
                    >
                      Notifications

                      {unreadCount > 0 && (
                        <span
                          style={{
                            display:
                              'inline-flex',
                            alignItems:
                              'center',
                            justifyContent:
                              'center',
                            marginLeft:
                              '7px',
                            minWidth:
                              '21px',
                            height:
                              '21px',
                            padding:
                              '0 6px',
                            borderRadius:
                              '999px',
                            background:
                              '#dc2626',
                            color:
                              '#fff',
                            fontSize:
                              '11px',
                            fontWeight:
                              '700',
                            boxSizing:
                              'border-box',
                          }}
                        >
                          {unreadCount >
                          99
                            ? '99+'
                            : unreadCount}
                        </span>
                      )}
                    </strong>

                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={
                          markAllAsRead
                        }
                        style={{
                          border:
                            '1px solid #15803d',
                          background:
                            '#15803d',
                          color:
                            '#fff',
                          borderRadius:
                            '7px',
                          padding:
                            '7px 10px',
                          cursor:
                            'pointer',
                          fontSize:
                            '12px',
                          fontWeight:
                            '700',
                          whiteSpace:
                            'nowrap',
                        }}
                      >
                        ✓ Mark all read
                      </button>
                    )}
                  </div>

                  {/* SCROLLABLE LIST */}
                  <div
                    style={{
                      flex: '1 1 0',
                      minHeight: 0,
                      overflowY:
                        'auto',
                      overflowX:
                        'hidden',
                      WebkitOverflowScrolling:
                        'touch',
                      padding: '14px',
                      boxSizing:
                        'border-box',
                    }}
                  >
                    {loading ? (
                      <p
                        style={{
                          color:
                            '#6b7280',
                          fontSize:
                            '14px',
                        }}
                      >
                        Loading
                        notifications...
                      </p>
                    ) : notifications.length ===
                      0 ? (
                      <div
                        style={{
                          padding:
                            '40px 15px',
                          textAlign:
                            'center',
                          color:
                            '#6b7280',
                        }}
                      >
                        <div
                          style={{
                            fontSize:
                              '32px',
                            marginBottom:
                              '10px',
                          }}
                        >
                          🔔
                        </div>

                        <div
                          style={{
                            fontWeight:
                              '600',
                            color:
                              '#374151',
                            marginBottom:
                              '5px',
                          }}
                        >
                          No notifications yet
                        </div>

                        <div
                          style={{
                            fontSize:
                              '13px',
                          }}
                        >
                          New updates will
                          appear here.
                        </div>
                      </div>
                    ) : (
                      notifications.map(
                        (notification) => (
                          <div
                            key={
                              notification.id
                            }
                            onClick={() =>
                              !notification.is_read &&
                              markAsRead(
                                notification.id
                              )
                            }
                            style={{
                              padding:
                                '13px',
                              marginBottom:
                                '9px',
                              borderRadius:
                                '10px',
                              background:
                                notification.is_read
                                  ? '#f9fafb'
                                  : '#eff6ff',
                              border:
                                notification.is_read
                                  ? '1px solid #e5e7eb'
                                  : '1px solid #bfdbfe',
                              cursor:
                                notification.is_read
                                  ? 'default'
                                  : 'pointer',
                            }}
                          >
                            <div
                              style={{
                                display:
                                  'flex',
                                alignItems:
                                  'flex-start',
                                justifyContent:
                                  'space-between',
                                gap: '8px',
                              }}
                            >
                              <strong
                                style={{
                                  display:
                                    'block',
                                  fontSize:
                                    '14px',
                                  color:
                                    '#111827',
                                }}
                              >
                                {
                                  notification.title
                                }
                              </strong>

                              {!notification.is_read && (
                                <span
                                  style={{
                                    flexShrink:
                                      0,
                                    width:
                                      '8px',
                                    height:
                                      '8px',
                                    marginTop:
                                      '5px',
                                    borderRadius:
                                      '50%',
                                    background:
                                      '#2563eb',
                                  }}
                                />
                              )}
                            </div>

                            <p
                              style={{
                                margin:
                                  '6px 0',
                                fontSize:
                                  '14px',
                                lineHeight:
                                  '1.45',
                                color:
                                  '#374151',
                              }}
                            >
                              {
                                notification.message
                              }
                            </p>

                            <div
                              style={{
                                display:
                                  'flex',
                                alignItems:
                                  'center',
                                justifyContent:
                                  'space-between',
                                gap:
                                  '10px',
                                flexWrap:
                                  'wrap',
                                marginTop:
                                  '9px',
                              }}
                            >
                              <small
                                style={{
                                  color:
                                    '#6b7280',
                                  fontSize:
                                    '11px',
                                }}
                              >
                                {formatDate(
                                  notification.created_at
                                )}
                              </small>

                              {!notification.is_read && (
                                <button
                                  type="button"
                                  onClick={(
                                    event
                                  ) => {
                                    event.stopPropagation()

                                    markAsRead(
                                      notification.id
                                    )
                                  }}
                                  style={{
                                    border:
                                      '1px solid #15803d',
                                    background:
                                      '#fff',
                                    color:
                                      '#15803d',
                                    borderRadius:
                                      '7px',
                                    padding:
                                      '6px 9px',
                                    cursor:
                                      'pointer',
                                    fontSize:
                                      '11px',
                                    fontWeight:
                                      '700',
                                  }}
                                >
                                  ✓ Mark as read
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      )
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>,
          document.body
        )
      : null

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
        onClick={() =>
          setOpen((current) => !current)
        }
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

      {notificationPanel}
    </div>
  )
}

export default Notifications