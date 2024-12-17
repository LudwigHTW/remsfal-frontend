importScripts('/idb.js'); // Loads the UMD version of idb

const CACHE_NAME = 'remsfal-v1';
const CACHE_FILES = [
  '/', // Start URL
  '/index.html', // HTML file
  '/manifest.json', // PWA manifest
  '/styles.css', // CSS file
  '/script.js', // JavaScript file
  '/favicon.ico', // Favicon
  '/android-chrome-192x192.png', // Icons
  '/android-chrome-512x512.png',
];

// Install event: Load files into the cache
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.addAll(CACHE_FILES);
      }),
  );
});

// Activate event: Delete old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  console.log('SyncManager supported:', 'SyncManager' in self);
  event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
            cacheNames.map((cache) => {
              if (cache !== CACHE_NAME) {
                return caches.delete(cache);
              }
            }),
        );
      }),
  );
  return self.clients.claim(); // Claim control over all clients
});

// Fetch event: Online-first strategy with fallback to the cache
self.addEventListener('fetch', (event) => {
  console.log('[Service Worker] Fetching:', event.request.url);
  event.respondWith(
      fetch(event.request)
          .then((response) => {
            // Save the response in the cache
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
            return response;
          })
          .catch(() => {
            // On error (e.g., offline), retrieve from the cache
            return caches.match(event.request).then((response) => {
              if (response) {
                return response;
              } else if (event.request.mode === 'navigate') {
                return caches.match('/index.html'); // Fallback to the start page
              }
            });
          }),
  );
});

self.addEventListener('sync', (event) => {

  if (event.tag === 'sync-projects') {
    event.waitUntil(
        syncProjects()
            .then(() => {
              console.log('[Service Worker] Sync-projects completed successfully');
            })
            .catch((error) => {
              console.error('[Service Worker] Sync-projects failed:', error);
            }),
    );
  } else {
    console.warn('[Service Worker] Unknown sync tag:', event.tag);
  }
});

async function syncProjects() {
  try {
    const db = await idb.openDB('offline-projects-db', 1); // Access via idb.openDB

    const projects = await db.getAll('projects');

    for (const project of projects) {
      try {
        const response = await fetch('/api/v1/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: project.title }),
        });

        if (response.ok) {
          console.info(`[Service Worker] Project synced successfully: ${project.title}`);
          await db.delete('projects', project.createdAt);
          console.info(`[Service Worker] Project deleted from IndexedDB: ${project.createdAt}`);
        } else {
          console.error(`[Service Worker] Server responded with error: ${response.status}`);
        }
      } catch (error) {
        console.error(`[Service Worker] Error syncing project: ${project.title}`, error);
      }
    }
  } catch (error) {
    console.error('[Service Worker] syncProjects failed:', error);
  }
}