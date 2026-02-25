// Service worker for PWA functionality - v3 with aggressive cache busting
const CACHE_NAME = 'joliefam-crm-v4';
const urlsToCache = [
  '/',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.json'
];

// Install: cache essential files and skip waiting immediately
self.addEventListener('install', (event) => {
  console.log('📦 SW v3: Installing new Service Worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📦 SW v3: Caching essential files');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('📦 SW v3: skipWaiting() - Taking control immediately');
        return self.skipWaiting();
      })
  );
});

// Activate: AGGRESSIVELY clean up ALL old caches
self.addEventListener('activate', (event) => {
  console.log('🔄 SW v3: Activating new Service Worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      console.log('🔄 SW v3: Found caches:', cacheNames);
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Delete ALL caches that aren't the current version
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ SW v3: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('✅ SW v3: Old caches cleared, claiming all clients');
      // Take control of ALL clients immediately (including other tabs)
      return self.clients.claim();
    }).then(() => {
      // Notify all clients to refresh
      return self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          console.log('📢 SW v3: Notifying client to refresh:', client.url);
          client.postMessage({ type: 'SW_UPDATED', version: 'v3' });
        });
      });
    })
  );
});

// Fetch: ALWAYS use Network-first for code files to ensure latest version
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip Supabase and API requests - never cache these
  if (url.hostname.includes('supabase') || 
      url.pathname.startsWith('/api/') ||
      url.pathname.includes('/functions/')) {
    return;
  }
  
  // Network-first for main app files (HTML, JS, CSS) - ALWAYS get fresh code
  if (event.request.mode === 'navigate' || 
      url.pathname.endsWith('.js') || 
      url.pathname.endsWith('.css') ||
      url.pathname.endsWith('.html') ||
      url.pathname === '/' ||
      url.pathname.includes('/assets/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Only cache successful responses
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback to cache ONLY if network completely fails
          console.log('⚠️ SW v3: Network failed, falling back to cache for:', url.pathname);
          return caches.match(event.request);
        })
    );
  } else {
    // Cache-first for static assets only (icons, images, manifest)
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          return response || fetch(event.request).then((fetchResponse) => {
            if (fetchResponse.ok) {
              const responseClone = fetchResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone);
              });
            }
            return fetchResponse;
          });
        })
    );
  }
});

// Handle messages from clients
self.addEventListener('message', (event) => {
  console.log('📬 SW v3: Received message:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('⏭️ SW v3: Received SKIP_WAITING, activating now');
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: 'v3', cacheName: CACHE_NAME });
  }
});

// Handle app shortcuts
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );
});

console.log('📦 SW v3: Service Worker script loaded');
