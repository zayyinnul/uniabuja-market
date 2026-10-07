import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',

      manifest: {
  name: 'UniAbuja Market',
  short_name: 'UniAbuja Market',
  description: 'The marketplace for University of Abuja students.',
  start_url: '/',
  display: 'standalone',
  background_color: '#ffffff',
  theme_color: '#ffffff',

  icons: [
    {
      src: '/uniabuja-logo.jpeg',
      sizes: '512x512',
      type: 'image/jpeg',
      purpose: 'any maskable',
    },
  ],
},

      workbox: {
        runtimeCaching: [
          {
            urlPattern: /\/storage\/v1\/object\/public\/.*\.(?:png|jpg|jpeg|webp|gif|svg)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'uniabuja-public-images',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
})