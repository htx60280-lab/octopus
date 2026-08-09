// Service Worker for Octopus PWA
// Vite: hashed assets under /assets/ are immutable (Cache First)

/**
 * Cache naming
 * - Prefix MUST match `web/src/lib/sw.ts` (OCTOPUS_CACHE_PREFIX)
 * - Bump CACHE_VERSION when you change caching behavior in this file
 * - FONT cache is version-independent (fonts persist across updates)
 */
const CACHE_PREFIX = 'octopus';
const CACHE_VERSION = 'v3';
const CACHE_NAMES = {
    static: `${CACHE_PREFIX}-static-${CACHE_VERSION}`,
    app: `${CACHE_PREFIX}-app-${CACHE_VERSION}`,
    // Font cache is NOT versioned - persists across app updates
    font: `${CACHE_PREFIX}-font`,
};

const SW_MESSAGE_TYPE = {
    SKIP_WAITING: 'SKIP_WAITING',
    CLEAR_CACHE: 'CLEAR_CACHE',
    CACHE_CLEARED: 'CACHE_CLEARED',
};

// Precache (PWA essentials)
const PRECACHE_URLS = ['/', '/manifest.json', '/web-app-manifest-192x192.png', '/web-app-manifest-512x512.png', '/logo-dark.svg'];

function offlineResponse() {
    return new Response('Offline', { status: 503 });
}

async function openCache(cacheName) {
    try {
        return await caches.open(cacheName);
    } catch (e) {
        console.warn('SW cache open skipped:', e?.message || e);
        return null;
    }
}

async function matchInCache(cache, request) {
    if (!cache) return null;
    try {
        return await cache.match(request);
    } catch (e) {
        console.warn('SW cache match skipped:', e?.message || e);
        return null;
    }
}

async function fetchAndCache(cache, request) {
    const response = await fetch(request);
    await putInCache(cache, request, response);
    return response;
}

// ============ 安装事件 ============
self.addEventListener('install', (event) => {
    event.waitUntil(
        (async () => {
            // Best-effort precache: if one asset fails, we still want the SW to install.
            const cache = await openCache(CACHE_NAMES.app);
            if (cache) {
                await Promise.allSettled(PRECACHE_URLS.map(async (url) => {
                    // 绕过浏览器 HTTP 缓存，避免新版本把旧首页重新预缓存。
                    const request = new Request(url, { cache: 'reload' });
                    await fetchAndCache(cache, request);
                }));
            }
            await self.skipWaiting();
        })()
    );
});

// ============ 激活事件 ============
self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            // Clean up old Octopus caches (previous versions), then take control.
            await deleteOctopusCaches({ keep: new Set(Object.values(CACHE_NAMES)) });
            await self.clients.claim();
        })()
    );
});

// ============ Fetch 事件 ============
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // 只处理同源 GET 请求
    if (url.origin !== location.origin || request.method !== 'GET') {
        return;
    }

    // 跳过 API 请求和 Vite 开发环境资源
    if (
        url.pathname.startsWith('/api/') ||
        url.pathname.startsWith('/@vite') ||
        url.pathname.startsWith('/@react-refresh')
    ) {
        return;
    }

    // 字体资源：Cache First（永久缓存，跨版本持久化）
    if (url.pathname.endsWith('.woff2') || url.pathname.endsWith('.woff') || url.pathname.endsWith('.ttf')) {
        event.respondWith(cacheFirst(request, CACHE_NAMES.font));
        return;
    }

    // /assets/ 资源：Cache First（带哈希，永不变）
    if (url.pathname.startsWith('/assets/')) {
        event.respondWith(cacheFirst(request, CACHE_NAMES.static));
        return;
    }

    // 页面导航：Network First，离线时返回缓存
    if (request.mode === 'navigate') {
        event.respondWith(networkFirst(request, CACHE_NAMES.app, { fallbackUrl: '/' }));
        return;
    }

    // 其他静态资源（public 目录）：Stale While Revalidate
    event.respondWith(staleWhileRevalidate(request, CACHE_NAMES.app, event));
});

// ============ 缓存策略 ============

/**
 * 判断响应是否可以安全写入 Cache。
 * 注意：不能用 response.ok —— 206 Partial Content 也满足 ok(200-299)，
 * 但 Cache API 明确不支持 206,一旦 cache.put() 就会抛 TypeError,
 * 导致 event.respondWith() 的 promise reject,页面导航直接失败(白屏/崩溃)。
 * 只缓存同源、状态为 200 的完整响应。
 */
function isCacheable(response) {
    return !!response && response.status === 200 && response.type === 'basic';
}

async function putInCache(cache, request, response) {
    try {
        if (cache && isCacheable(response)) {
            await cache.put(request, response.clone());
        }
    } catch (e) {
        // 缓存失败绝不影响请求本身（例如 206、opaque、配额满等）
        console.warn('SW cache put skipped:', e?.message || e);
    }
}

/**
 * Cache First：优先缓存，适用于带哈希的不变资源
 */
async function cacheFirst(request, cacheName) {
    const cache = await openCache(cacheName);
    const cached = await matchInCache(cache, request);
    if (cached) {
        return cached;
    }

    try {
        return await fetchAndCache(cache, request);
    } catch {
        // 离线且无缓存
        return offlineResponse();
    }
}

/**
 * Network First：优先网络，适用于需要最新内容的资源
 */
async function networkFirst(request, cacheName, { fallbackUrl = null } = {}) {
    const cache = await openCache(cacheName);
    try {
        return await fetchAndCache(cache, request);
    } catch {
        const cached = await matchInCache(cache, request);
        if (cached) {
            return cached;
        }
        // 如果有 fallback（通常是首页），返回 fallback
        if (fallbackUrl) {
            const fallback = await matchInCache(cache, fallbackUrl);
            if (fallback) return fallback;
        }
        return offlineResponse();
    }
}

/**
 * Stale While Revalidate：返回缓存同时后台更新
 */
function staleWhileRevalidate(request, cacheName, event) {
    const cachePromise = openCache(cacheName);
    const cachedPromise = cachePromise.then((cache) => matchInCache(cache, request));
    const updatePromise = cachePromise
        .then((cache) => fetchAndCache(cache, request))
        .catch(() => null);

    // 缓存命中时 respondWith 会立即结束；必须显式延长事件生命周期，
    // 否则后台更新可能在 cache.put 完成前被浏览器终止。
    event.waitUntil(updatePromise);
    return cachedPromise.then((cached) => cached || updatePromise.then((response) => response || offlineResponse()));
}

// ============ 消息事件 ============
self.addEventListener('message', (event) => {
    const { type } = event.data || {};

    switch (type) {
        case SW_MESSAGE_TYPE.SKIP_WAITING:
            self.skipWaiting();
            break;

        case SW_MESSAGE_TYPE.CLEAR_CACHE:
            // Only clear Octopus caches (avoid nuking other same-origin caches).
            // PRESERVE font cache - fonts should persist across updates.
            event.waitUntil(
                (async () => {
                    await deleteOctopusCaches({ keep: new Set([CACHE_NAMES.font]) });
                    const clients = await self.clients.matchAll();
                    clients.forEach((client) => client.postMessage({ type: SW_MESSAGE_TYPE.CACHE_CLEARED }));
                })()
            );
            break;
    }
});

// ========= Helpers =========
function isOctopusCacheName(name) {
    return name.startsWith(`${CACHE_PREFIX}-`);
}

async function deleteOctopusCaches({ keep } = {}) {
    const names = await caches.keys();
    const deletions = names
        .filter((name) => isOctopusCacheName(name))
        .filter((name) => !(keep && keep.has(name)))
        .map((name) => caches.delete(name));
    await Promise.all(deletions);
}
