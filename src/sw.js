import { precacheAndRoute } from 'workbox-precaching'

precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('push', (event) => {
  if (!event.data) return

  let data

  try {
    data = event.data.json()
  } catch {
    data = {
      title: 'UniAbuja Market',
      message: event.data.text(),
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'UniAbuja Market', {
      body: data.message || data.body || 'You have a new notification.',
      icon: data.icon || '/uniabuja-icon.png',
      badge: data.badge || '/uniabuja-icon.png',
      data: {
        url: data.url || '/',
      },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const url = event.notification.data?.url || '/'

  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(url)
      }
    })
  )
})