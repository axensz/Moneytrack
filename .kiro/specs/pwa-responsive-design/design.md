# Design Document: PWA and Responsive Design

## Overview

This design document outlines the implementation of Progressive Web App (PWA) capabilities and comprehensive responsive design improvements for MoneyTrack. The solution transforms the existing Next.js application into a fully installable PWA with offline functionality while ensuring optimal display across all device sizes.

### Key Design Goals

1. **Installability**: Enable users to install MoneyTrack as a standalone app on any device
2. **Offline Functionality**: Provide access to cached financial data when network is unavailable
3. **Responsive Excellence**: Eliminate all horizontal overflow and ensure optimal layouts across all breakpoints
4. **Performance**: Achieve Lighthouse scores >90 for PWA and >85 for Performance
5. **Mobile-First**: Prioritize touch-friendly interactions and mobile user experience

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser / Device                         │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐         ┌─────────────────┐              │
│  │   UI Layer   │◄────────┤  Service Worker │              │
│  │  (React/Next)│         │   (sw.js)       │              │
│  └──────┬───────┘         └────────┬────────┘              │
│         │                           │                        │
│         │                           │                        │
│  ┌──────▼───────────────────────────▼────────┐             │
│  │         Cache Storage (CacheAPI)           │             │
│  │  ┌──────────┐  ┌──────────┐  ┌─────────┐ │             │
│  │  │ Static   │  │   API    │  │  Images │ │             │
│  │  │ Assets   │  │ Responses│  │         │ │             │
│  │  └──────────┘  └──────────┘  └─────────┘ │             │
│  └────────────────────────────────────────────┘             │
│                                                               │
│  ┌────────────────────────────────────────────┐             │
│  │      IndexedDB (Offline Queue)             │             │
│  │  - Pending transactions                     │             │
│  │  - Sync operations                          │             │
│  └────────────────────────────────────────────┘             │
│                                                               │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            │ Network Requests
                            │
                    ┌───────▼────────┐
                    │   Firebase     │
                    │   Firestore    │
                    └────────────────┘
```

### PWA Component Architecture

The PWA implementation consists of four main components:

1. **Web App Manifest** (`manifest.json`): Defines app metadata and installation behavior
2. **Service Worker** (`sw.js`): Handles caching, offline functionality, and background sync
3. **Install Manager** (React component): Manages installation prompts and user experience
4. **Offline Manager** (React component): Handles offline state and queued operations

### Responsive Design Architecture

The responsive design follows a mobile-first approach with three breakpoint tiers:

- **Mobile**: < 640px (sm)
- **Tablet**: 640px - 1024px (md to lg)
- **Desktop**: > 1024px (xl+)

All components use Tailwind CSS utility classes with responsive modifiers to adapt layouts.

## Components and Interfaces

### 1. Web App Manifest

**File**: `public/manifest.json`

**Structure**:
```typescript
interface WebAppManifest {
  name: string;              // "MoneyTrack - Gestión Financiera Personal"
  short_name: string;        // "MoneyTrack"
  description: string;       // Spanish description
  start_url: string;         // "/"
  scope: string;             // "/"
  display: "standalone" | "fullscreen" | "minimal-ui" | "browser";
  orientation: "any" | "portrait" | "landscape";
  background_color: string;  // "#1e1b4b" (dark purple)
  theme_color: string;       // "#8b5cf6" (brand purple)
  icons: Icon[];
  categories: string[];      // ["finance", "productivity"]
}

interface Icon {
  src: string;
  sizes: string;
  type: string;
  purpose?: "any" | "maskable" | "monochrome";
}
```

**Icon Requirements**:
- Generate from existing `public/moneytrack-icon.svg`
- Sizes: 72, 96, 128, 144, 152, 192, 384, 512 pixels
- Include maskable variants for Android adaptive icons
- Use PNG format for compatibility

### 2. Service Worker

**File**: `public/sw.js`

**Core Responsibilities**:
- Register and activate service worker lifecycle
- Implement caching strategies for different resource types
- Handle offline fallback
- Manage cache versioning and cleanup
- Queue operations for background sync

**Caching Strategies**:

```typescript
// Strategy definitions
enum CacheStrategy {
  CACHE_FIRST = "cache-first",      // Static assets
  NETWORK_FIRST = "network-first",  // API calls
  STALE_WHILE_REVALIDATE = "swr"    // Images
}

// Cache configuration
const CACHE_CONFIG = {
  version: "v1",
  caches: {
    static: "moneytrack-static-v1",
    api: "moneytrack-api-v1",
    images: "moneytrack-images-v1"
  },
  maxAge: {
    static: 30 * 24 * 60 * 60 * 1000,  // 30 days
    api: 5 * 60 * 1000,                 // 5 minutes
    images: 7 * 24 * 60 * 60 * 1000     // 7 days
  }
}
```

**Service Worker Interface**:

```typescript
// Service worker event handlers
interface ServiceWorkerHandlers {
  onInstall: (event: ExtendableEvent) => void;
  onActivate: (event: ExtendableEvent) => void;
  onFetch: (event: FetchEvent) => void;
  onSync: (event: SyncEvent) => void;
  onMessage: (event: MessageEvent) => void;
}

// Cache management functions
interface CacheManager {
  precacheAssets(urls: string[]): Promise<void>;
  cacheFirst(request: Request): Promise<Response>;
  networkFirst(request: Request): Promise<Response>;
  staleWhileRevalidate(request: Request): Promise<Response>;
  cleanupOldCaches(currentVersion: string): Promise<void>;
}
```

**Implementation Details**:

```javascript
// Install event - precache critical assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_CONFIG.caches.static).then((cache) => {
      return cache.addAll([
        '/',
        '/globals.css',
        '/manifest.json',
        // Add other critical assets
      ]);
    }).then(() => self.skipWaiting())
  );
});

// Activate event - cleanup old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('moneytrack-') && !Object.values(CACHE_CONFIG.caches).includes(name))
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - route to appropriate strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // API requests - network first
  if (url.pathname.includes('/api/') || url.hostname.includes('firestore')) {
    event.respondWith(networkFirst(request));
  }
  // Images - stale while revalidate
  else if (request.destination === 'image') {
    event.respondWith(staleWhileRevalidate(request));
  }
  // Static assets - cache first
  else {
    event.respondWith(cacheFirst(request));
  }
});
```

### 3. Service Worker Registration

**File**: `src/lib/serviceWorker.ts`

```typescript
export interface ServiceWorkerConfig {
  onSuccess?: (registration: ServiceWorkerRegistration) => void;
  onUpdate?: (registration: ServiceWorkerRegistration) => void;
  onError?: (error: Error) => void;
}

export async function registerServiceWorker(config?: ServiceWorkerConfig): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    console.log('Service Worker not supported');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/'
    });

    // Check for updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          config?.onUpdate?.(registration);
        }
      });
    });

    config?.onSuccess?.(registration);
  } catch (error) {
    config?.onError?.(error as Error);
  }
}

export async function unregisterServiceWorker(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;
  
  const registration = await navigator.serviceWorker.ready;
  return registration.unregister();
}
```

### 4. Install Manager Component

**File**: `src/components/pwa/InstallPrompt.tsx`

```typescript
interface InstallPromptProps {
  variant?: 'banner' | 'button';
  onInstall?: () => void;
  onDismiss?: () => void;
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPrompt({ variant = 'button', onInstall, onDismiss }: InstallPromptProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Listen for install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Listen for successful installation
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setIsInstallable(false);
      onInstall?.();
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, [onInstall]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      console.log('User accepted install prompt');
    }

    setDeferredPrompt(null);
    setIsInstallable(false);
  };

  if (isInstalled || !isInstallable) return null;

  // Render banner or button based on variant
  return variant === 'banner' ? (
    <InstallBanner onInstall={handleInstallClick} onDismiss={onDismiss} />
  ) : (
    <InstallButton onClick={handleInstallClick} />
  );
}
```

### 5. Offline Manager

**File**: `src/hooks/useOfflineQueue.ts`

```typescript
interface QueuedOperation {
  id: string;
  type: 'create' | 'update' | 'delete';
  collection: string;
  data: any;
  timestamp: number;
}

export function useOfflineQueue() {
  const [queue, setQueue] = useState<QueuedOperation[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const isOnline = useNetworkStatus();

  // Load queue from IndexedDB on mount
  useEffect(() => {
    loadQueue().then(setQueue);
  }, []);

  // Sync when coming back online
  useEffect(() => {
    if (isOnline && queue.length > 0) {
      syncQueue();
    }
  }, [isOnline, queue.length]);

  const addToQueue = async (operation: Omit<QueuedOperation, 'id' | 'timestamp'>) => {
    const queuedOp: QueuedOperation = {
      ...operation,
      id: generateId(),
      timestamp: Date.now()
    };

    await saveToIndexedDB(queuedOp);
    setQueue(prev => [...prev, queuedOp]);
  };

  const syncQueue = async () => {
    if (isSyncing || queue.length === 0) return;

    setIsSyncing(true);
    const results = await Promise.allSettled(
      queue.map(op => executeOperation(op))
    );

    // Remove successful operations
    const successfulIds = results
      .map((result, index) => result.status === 'fulfilled' ? queue[index].id : null)
      .filter(Boolean);

    await removeFromIndexedDB(successfulIds);
    setQueue(prev => prev.filter(op => !successfulIds.includes(op.id)));
    setIsSyncing(false);
  };

  return {
    queue,
    addToQueue,
    syncQueue,
    isSyncing,
    queueLength: queue.length
  };
}
```

### 6. Offline Indicator Component

**File**: `src/components/pwa/OfflineIndicator.tsx`

```typescript
export function OfflineIndicator() {
  const isOnline = useNetworkStatus();
  const { queueLength, isSyncing } = useOfflineQueue();

  if (isOnline && queueLength === 0) return null;

  return (
    <div className="fixed top-16 left-0 right-0 z-40 bg-amber-500 text-white px-4 py-2 text-sm text-center">
      {!isOnline ? (
        <span>Sin conexión - Los cambios se guardarán cuando vuelvas a estar en línea</span>
      ) : isSyncing ? (
        <span>Sincronizando {queueLength} operaciones pendientes...</span>
      ) : null}
    </div>
  );
}
```

### 7. Responsive Layout Utilities

**File**: `src/utils/responsive.ts`

```typescript
// Breakpoint definitions matching Tailwind
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

// Hook for current breakpoint
export function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>('sm');

  useEffect(() => {
    const updateBreakpoint = () => {
      const width = window.innerWidth;
      if (width >= BREAKPOINTS['2xl']) setBreakpoint('2xl');
      else if (width >= BREAKPOINTS.xl) setBreakpoint('xl');
      else if (width >= BREAKPOINTS.lg) setBreakpoint('lg');
      else if (width >= BREAKPOINTS.md) setBreakpoint('md');
      else setBreakpoint('sm');
    };

    updateBreakpoint();
    window.addEventListener('resize', updateBreakpoint);
    return () => window.removeEventListener('resize', updateBreakpoint);
  }, []);

  return breakpoint;
}

// Utility for responsive values
export function useResponsiveValue<T>(values: Partial<Record<Breakpoint, T>>): T | undefined {
  const breakpoint = useBreakpoint();
  return values[breakpoint];
}
```

### 8. Responsive Container Component

**File**: `src/components/layout/ResponsiveContainer.tsx`

```typescript
interface ResponsiveContainerProps {
  children: React.ReactNode;
  className?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  padding?: boolean;
}

export function ResponsiveContainer({ 
  children, 
  className = '', 
  maxWidth = 'xl',
  padding = true 
}: ResponsiveContainerProps) {
  const maxWidthClass = maxWidth === 'full' ? 'w-full' : `max-w-${maxWidth}`;
  const paddingClass = padding ? 'px-4 sm:px-6 lg:px-8' : '';

  return (
    <div className={`${maxWidthClass} ${paddingClass} mx-auto w-full ${className}`}>
      {children}
    </div>
  );
}
```

## Data Models

### PWA Installation State

```typescript
interface PWAInstallState {
  isInstallable: boolean;
  isInstalled: boolean;
  deferredPrompt: BeforeInstallPromptEvent | null;
  hasSeenPrompt: boolean;
  installDate: Date | null;
}
```

### Offline Queue Entry

```typescript
interface OfflineQueueEntry {
  id: string;
  type: 'transaction' | 'account' | 'budget' | 'debt';
  operation: 'create' | 'update' | 'delete';
  data: any;
  timestamp: number;
  retryCount: number;
  lastError?: string;
}
```

### Cache Metadata

```typescript
interface CacheMetadata {
  url: string;
  cachedAt: number;
  expiresAt: number;
  version: string;
  size: number;
}
```

### Responsive Breakpoint State

```typescript
interface ResponsiveState {
  currentBreakpoint: Breakpoint;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  orientation: 'portrait' | 'landscape';
  viewportWidth: number;
  viewportHeight: number;
}
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After analyzing all acceptance criteria, several properties emerged as redundant or overlapping:

- **Horizontal overflow prevention** (5.1, 5.2, 9.5, 11.4, 12.4, 13.1, 15.2, 16.1, 17.1, 18.2, 19.1) can be consolidated into a single comprehensive property
- **Touch target sizing** (7.1, 7.2, 7.3, 7.4, 7.5, 11.2, 16.4, 17.5, 18.4) can be consolidated into one property about minimum interactive element sizes
- **Background scroll locking** (8.3, 11.5, 16.5) can be consolidated into one property about overlay behavior
- **Cache management** (2.6, 2.7, 20.2) can be consolidated into one property about cache versioning
- **Offline data access** (3.1, 3.2, 3.3, 3.4) can be consolidated into one property about cached data display

The following properties represent the unique, non-redundant correctness guarantees:

### PWA Properties

**Property 1: Service Worker Registration**
*For any* application load, the service worker registration should complete successfully without errors and the service worker should enter the activated state.
**Validates: Requirements 2.1**

**Property 2: Cache-First Strategy for Static Assets**
*For any* static asset request (CSS, JS, fonts), the service worker should check the cache first and only fetch from network if not cached, ensuring faster load times.
**Validates: Requirements 2.2**

**Property 3: Network-First Strategy for API Requests**
*For any* API request to Firestore, the service worker should attempt network first and only fall back to cache on network failure, ensuring fresh data when online.
**Validates: Requirements 2.3**

**Property 4: Stale-While-Revalidate for Images**
*For any* image request, the service worker should serve from cache immediately while fetching a fresh version in the background, ensuring fast display with eventual freshness.
**Validates: Requirements 2.4**

**Property 5: Cache Version Management**
*For any* service worker activation, old cache versions should be deleted and only the current version should remain, preventing unbounded cache growth.
**Validates: Requirements 2.6, 2.7, 20.2**

**Property 6: Fetch Event Interception**
*For any* navigation request, the service worker should intercept the fetch event and apply the appropriate caching strategy based on resource type.
**Validates: Requirements 2.8**

**Property 7: Offline Data Display**
*For any* cached financial data (transactions, accounts, budgets, debts), when the user is offline, the application should display the cached data without errors.
**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

**Property 8: Offline Operation Queuing**
*For any* data modification attempt while offline, the operation should be added to the offline queue with a unique ID and timestamp for later synchronization.
**Validates: Requirements 3.5**

**Property 9: Online Synchronization**
*For any* queued operation, when connectivity is restored, the operation should be executed against Firestore and removed from the queue upon success.
**Validates: Requirements 3.6**

### Responsive Design Properties

**Property 10: No Horizontal Overflow**
*For any* page and any viewport width, the document body scrollWidth should equal clientWidth, ensuring no horizontal scrolling is required.
**Validates: Requirements 5.1, 5.2, 9.5, 11.4, 12.4, 13.1, 15.2, 16.1, 17.1, 18.2, 19.1**

**Property 11: Breakpoint Detection**
*For any* viewport width, the breakpoint detection should correctly identify mobile (<640px), tablet (640-1024px), or desktop (>1024px) and apply corresponding styles.
**Validates: Requirements 6.1, 6.2, 6.3, 6.4**

**Property 12: Minimum Touch Target Size**
*For any* interactive element (button, link, input, select), the computed dimensions should be at least 44x44 pixels on mobile breakpoints, ensuring touch accessibility.
**Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 11.2, 16.4, 17.5, 18.4**

**Property 13: Modal Viewport Containment**
*For any* modal displayed on mobile, the modal height should not exceed viewport height, and if content is taller, internal scrolling should be enabled.
**Validates: Requirements 8.1, 8.2**

**Property 14: Overlay Background Lock**
*For any* overlay component (modal, navigation menu, notification center), when open, the background body scroll should be prevented.
**Validates: Requirements 8.3, 11.5, 16.5**

**Property 15: Modal Accessibility**
*For any* modal, the close button should always be visible and accessible within the viewport bounds, ensuring users can always dismiss the modal.
**Validates: Requirements 8.4**

**Property 16: Modal Mobile Padding**
*For any* modal on mobile breakpoints, the content should have minimum padding of 16px on all sides to prevent content from touching screen edges.
**Validates: Requirements 8.5**

**Property 17: Dropdown Viewport Containment**
*For any* dropdown or select menu, when opened, the dropdown panel should remain within viewport bounds by adjusting position if necessary.
**Validates: Requirements 8.6**

**Property 18: Text Truncation**
*For any* text element with overflow-ellipsis styling, when text exceeds container width, an ellipsis should be displayed and text should not overflow.
**Validates: Requirements 9.2, 15.3**

**Property 19: Vertical Scrolling for Long Content**
*For any* container with content exceeding viewport height, vertical scrolling should be enabled and horizontal scrolling should remain disabled.
**Validates: Requirements 9.4, 16.3**

**Property 20: Form Input Full Width on Mobile**
*For any* form input on mobile breakpoints, the input width should span the full available container width minus padding.
**Validates: Requirements 10.2**

**Property 21: Increased Input Height on Mobile**
*For any* form input on mobile breakpoints, the input height should be at least 48px for easier touch interaction.
**Validates: Requirements 10.3**

**Property 22: Form Button Sizing on Mobile**
*For any* form button on mobile breakpoints, the button should be either full-width or have minimum width of 120px and height of 44px.
**Validates: Requirements 10.4**

**Property 23: Card Grid Responsiveness**
*For any* card grid, the number of columns should be 1 on mobile (<640px), 2 on tablet (640-1024px), and 3 on desktop (>1024px).
**Validates: Requirements 12.1, 12.2, 12.3**

**Property 24: Consistent Card Spacing**
*For any* card grid at any breakpoint, the gap between cards should be consistent (16px on mobile, 24px on tablet/desktop).
**Validates: Requirements 12.5**

**Property 25: Chart Responsive Dimensions**
*For any* chart component, the chart width should adjust to container width and height should maintain aspect ratio, never exceeding viewport dimensions.
**Validates: Requirements 13.2**

**Property 26: Responsive Font Scaling**
*For any* text element, font sizes should scale appropriately at each breakpoint (base 14px mobile, 16px desktop) while maintaining readability.
**Validates: Requirements 15.1**

**Property 27: Typography Metrics**
*For any* text element, line-height should be at least 1.5 and letter-spacing should be appropriate for the font size, ensuring readability.
**Validates: Requirements 15.4**

**Property 28: Color Contrast**
*For any* text element, the color contrast ratio between text and background should be at least 4.5:1 for normal text and 3:1 for large text (WCAG AA).
**Validates: Requirements 15.5**

**Property 29: Notification Center Responsive Width**
*For any* breakpoint, the notification center width should be 100% on mobile, 400px on tablet, and 450px on desktop, never exceeding viewport width.
**Validates: Requirements 16.2**

**Property 30: Image Proportional Scaling**
*For any* image, when viewport width changes, the image should scale proportionally maintaining aspect ratio and never exceed container width.
**Validates: Requirements 19.1**

**Property 31: Responsive Icon Sizing**
*For any* icon, the size should be appropriate for the breakpoint (16-20px mobile, 20-24px desktop) and should scale with text size.
**Validates: Requirements 19.2**

**Property 32: Cache Storage Limits**
*For any* cache operation, the total cache storage should not exceed 50MB, and oldest entries should be evicted when limit is approached.
**Validates: Requirements 20.5**

## Error Handling

### Service Worker Errors

**Registration Failures**:
- If service worker registration fails, log error and continue without offline functionality
- Display a non-intrusive notification that offline features are unavailable
- Retry registration on next page load

**Fetch Errors**:
- If both network and cache fail, serve offline fallback page
- Log fetch errors for debugging
- Provide user-friendly error messages

**Cache Errors**:
- If cache storage is full, evict oldest entries using LRU strategy
- If cache write fails, log error but don't block operation
- Gracefully degrade to network-only mode if cache is unavailable

### Offline Queue Errors

**Sync Failures**:
- If operation fails after 3 retry attempts, mark as failed in queue
- Notify user of failed operations with option to retry manually
- Preserve failed operations for manual resolution

**Data Conflicts**:
- If synced data conflicts with server state, prefer server state
- Notify user of conflicts and allow manual resolution
- Log conflicts for debugging

### Responsive Design Errors

**Breakpoint Detection Failures**:
- Default to mobile layout if breakpoint detection fails
- Use CSS media queries as fallback
- Log detection errors for debugging

**Overflow Detection**:
- Monitor for horizontal overflow using ResizeObserver
- Log overflow occurrences with element details
- Provide developer warnings in development mode

### Installation Errors

**Install Prompt Failures**:
- If beforeinstallprompt event doesn't fire, hide install UI
- If prompt() fails, log error and hide install button
- Provide alternative installation instructions

**Manifest Errors**:
- Validate manifest JSON on build
- Provide clear error messages for invalid manifest
- Ensure app works without manifest (graceful degradation)

## Testing Strategy

### Dual Testing Approach

This feature requires both unit tests and property-based tests for comprehensive coverage:

**Unit Tests**: Focus on specific examples, edge cases, and integration points
- Manifest structure validation
- Service worker lifecycle events
- Install prompt interactions
- Specific breakpoint layouts
- Edge cases (empty cache, offline fallback, etc.)

**Property Tests**: Verify universal properties across all inputs
- Overflow prevention across all viewport widths
- Touch target sizing across all interactive elements
- Cache strategies across all resource types
- Responsive behavior across all breakpoints
- Text truncation across all text lengths

### Property-Based Testing Configuration

**Library**: Use `fast-check` for JavaScript/TypeScript property-based testing

**Configuration**:
- Minimum 100 iterations per property test
- Each test tagged with feature name and property number
- Tag format: `Feature: pwa-responsive-design, Property {N}: {property_text}`

**Example Property Test**:
```typescript
import fc from 'fast-check';

// Feature: pwa-responsive-design, Property 10: No Horizontal Overflow
test('no horizontal overflow at any viewport width', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 320, max: 2560 }), // viewport widths
      (viewportWidth) => {
        // Set viewport width
        window.innerWidth = viewportWidth;
        window.dispatchEvent(new Event('resize'));
        
        // Check all pages
        const pages = ['/', '/accounts', '/budgets', '/debts'];
        pages.forEach(page => {
          render(<App initialRoute={page} />);
          const body = document.body;
          expect(body.scrollWidth).toBeLessThanOrEqual(body.clientWidth);
        });
      }
    ),
    { numRuns: 100 }
  );
});
```

### Unit Testing Strategy

**Service Worker Tests**:
- Test registration success and failure scenarios
- Test each caching strategy with mock fetch
- Test cache cleanup on activation
- Test offline fallback serving
- Mock service worker API for testing

**PWA Installation Tests**:
- Test install prompt display logic
- Test install button click handling
- Test installation state detection
- Mock beforeinstallprompt event

**Offline Queue Tests**:
- Test operation queuing when offline
- Test sync when back online
- Test retry logic for failed operations
- Test conflict resolution
- Use IndexedDB mock for testing

**Responsive Layout Tests**:
- Test breakpoint detection at boundary values (639px, 640px, 641px)
- Test specific component layouts at each breakpoint
- Test modal behavior on mobile
- Test form layouts on mobile
- Use React Testing Library with viewport mocking

**Touch Target Tests**:
- Test button sizes on mobile breakpoints
- Test spacing between adjacent buttons
- Test form input sizes
- Use computed styles to verify dimensions

**Overflow Tests**:
- Test specific components for horizontal overflow
- Test long text truncation
- Test image scaling
- Test table responsiveness
- Use scrollWidth vs clientWidth comparison

### Integration Testing

**End-to-End PWA Tests**:
- Test full offline workflow (go offline, view data, make changes, go online, sync)
- Test installation flow from prompt to installed state
- Test service worker update flow
- Use Playwright or Cypress with service worker support

**Responsive Design Tests**:
- Test navigation flow at each breakpoint
- Test form submission at each breakpoint
- Test modal interactions on mobile
- Test chart interactions on touch devices
- Use Playwright with device emulation

### Performance Testing

**Lighthouse Audits**:
- Run Lighthouse CI in automated tests
- Assert PWA score > 90
- Assert Performance score > 85
- Assert Accessibility score > 90
- Fail build if scores drop below thresholds

**Cache Performance**:
- Measure cache hit rates
- Measure time to first byte with/without cache
- Measure cache storage usage
- Assert cache size < 50MB

### Manual Testing Checklist

**PWA Installation**:
- [ ] Install prompt appears on desktop
- [ ] Install banner appears on mobile
- [ ] App installs successfully on Chrome, Edge, Safari
- [ ] App opens in standalone mode after installation
- [ ] App icon appears correctly on home screen

**Offline Functionality**:
- [ ] App loads when offline
- [ ] Cached data displays correctly
- [ ] Offline indicator appears
- [ ] Operations queue when offline
- [ ] Operations sync when back online

**Responsive Design**:
- [ ] No horizontal scrolling on any page at any width
- [ ] All buttons are easily tappable on mobile
- [ ] Modals fit on screen on mobile
- [ ] Forms are usable on mobile
- [ ] Navigation works on mobile
- [ ] Charts display correctly on mobile
- [ ] Tables are readable on mobile

**Cross-Browser Testing**:
- [ ] Chrome (desktop and mobile)
- [ ] Safari (desktop and mobile)
- [ ] Firefox (desktop and mobile)
- [ ] Edge (desktop)

**Device Testing**:
- [ ] iPhone (various sizes)
- [ ] Android phones (various sizes)
- [ ] iPad
- [ ] Android tablets
- [ ] Desktop (various resolutions)

### Test Coverage Goals

- Unit test coverage: > 80%
- Property test coverage: All 32 properties implemented
- Integration test coverage: All critical user flows
- Manual test coverage: All devices and browsers

### Continuous Testing

**Pre-commit**:
- Run unit tests
- Run linting and type checking
- Run fast property tests (10 iterations)

**CI Pipeline**:
- Run full unit test suite
- Run full property test suite (100 iterations)
- Run Lighthouse audits
- Run integration tests
- Generate coverage reports

**Pre-release**:
- Run full manual testing checklist
- Run extended property tests (1000 iterations)
- Run performance benchmarks
- Test on real devices
