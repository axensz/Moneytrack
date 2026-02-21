# Implementation Plan: PWA and Responsive Design

## Overview

This implementation plan transforms MoneyTrack into a fully functional Progressive Web App with comprehensive offline capabilities and fixes all responsive design issues. The implementation follows a mobile-first approach and ensures optimal user experience across all device sizes.

## Tasks

- [x] 1. Set up PWA infrastructure and manifest
  - Create `public/manifest.json` with all required fields (name, short_name, description, icons, theme colors, display mode)
  - Generate app icons in all required sizes (72, 96, 128, 144, 152, 192, 384, 512) from existing SVG
  - Add manifest link to `app/layout.tsx` head section
  - Add theme-color and viewport meta tags
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [ ]* 1.1 Write unit tests for manifest validation
  - Test manifest structure and required fields
  - Test icon sizes and formats
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [x] 2. Implement service worker with caching strategies
  - [x] 2.1 Create `public/sw.js` with install, activate, and fetch event handlers
    - Implement cache-first strategy for static assets
    - Implement network-first strategy for API requests
    - Implement stale-while-revalidate strategy for images
    - Add cache versioning and cleanup logic
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6, 2.7, 2.8_

  - [x] 2.2 Create service worker registration utility `src/lib/serviceWorker.ts`
    - Implement registration function with success/error callbacks
    - Add update detection and notification
    - Handle service worker lifecycle events
    - _Requirements: 2.1_

  - [x] 2.3 Register service worker in `app/layout.tsx`
    - Call registration on client-side mount
    - Handle registration success and errors
    - _Requirements: 2.1_

  - [ ]* 2.4 Write property test for service worker registration
    - **Property 1: Service Worker Registration**
    - **Validates: Requirements 2.1**

  - [ ]* 2.5 Write property test for cache-first strategy
    - **Property 2: Cache-First Strategy for Static Assets**
    - **Validates: Requirements 2.2**

  - [ ]* 2.6 Write property test for network-first strategy
    - **Property 3: Network-First Strategy for API Requests**
    - **Validates: Requirements 2.3**

  - [ ]* 2.7 Write property test for stale-while-revalidate strategy
    - **Property 4: Stale-While-Revalidate for Images**
    - **Validates: Requirements 2.4**

  - [ ]* 2.8 Write property test for cache version management
    - **Property 5: Cache Version Management**
    - **Validates: Requirements 2.6, 2.7, 20.2**

  - [ ]* 2.9 Write property test for fetch event interception
    - **Property 6: Fetch Event Interception**
    - **Validates: Requirements 2.8**

- [x] 3. Implement offline functionality and queue management
  - [x] 3.1 Create offline queue hook `src/hooks/useOfflineQueue.ts`
    - Implement IndexedDB storage for queued operations
    - Add operations to queue when offline
    - Sync operations when back online
    - Handle retry logic and failures
    - _Requirements: 3.5, 3.6_

  - [x] 3.2 Create offline indicator component `src/components/pwa/OfflineIndicator.tsx`
    - Display offline status banner
    - Show sync progress when reconnecting
    - _Requirements: 3.5, 3.6_

  - [x] 3.3 Integrate offline queue with Firestore operations
    - Modify `useTransactions`, `useAccounts`, `useBudgets`, `useDebts` hooks
    - Queue create/update/delete operations when offline
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ]* 3.4 Write property test for offline data display
    - **Property 7: Offline Data Display**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**

  - [ ]* 3.5 Write property test for offline operation queuing
    - **Property 8: Offline Operation Queuing**
    - **Validates: Requirements 3.5**

  - [ ]* 3.6 Write property test for online synchronization
    - **Property 9: Online Synchronization**
    - **Validates: Requirements 3.6**

- [x] 4. Checkpoint - Ensure PWA functionality works
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement install prompt and installation experience
  - [x] 5.1 Create install prompt component `src/components/pwa/InstallPrompt.tsx`
    - Detect beforeinstallprompt event
    - Implement install button variant for desktop
    - Implement install banner variant for mobile
    - Handle install prompt dismissal
    - Track installation events
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 5.2 Add install prompt to header component
    - Show install button on desktop when installable
    - Show install banner on mobile when installable
    - Hide prompts when already installed
    - _Requirements: 4.1, 4.2, 4.4_

  - [x] 5.3 Create welcome modal for first-time installed users
    - Detect first run after installation
    - Display onboarding content
    - Store flag in localStorage to show once
    - _Requirements: 4.6_

  - [ ]* 5.4 Write unit tests for install prompt component
    - Test install button click handling
    - Test banner dismissal
    - Test installation state detection
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [x] 6. Implement responsive layout utilities and hooks
  - [x] 6.1 Create responsive utilities `src/utils/responsive.ts`
    - Define breakpoint constants
    - Implement `useBreakpoint` hook
    - Implement `useResponsiveValue` hook
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 6.2 Create responsive container component `src/components/layout/ResponsiveContainer.tsx`
    - Implement max-width constraints
    - Implement responsive padding
    - Ensure no horizontal overflow
    - _Requirements: 5.1, 5.2, 5.5_

  - [ ]* 6.3 Write property test for breakpoint detection
    - **Property 11: Breakpoint Detection**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**

  - [ ]* 6.4 Write unit tests for breakpoint boundary values
    - Test at 639px, 640px, 641px
    - Test at 1023px, 1024px, 1025px
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 7. Fix horizontal overflow issues across all pages
  - [x] 7.1 Add overflow prevention to global styles
    - Set `overflow-x: hidden` on html and body
    - Add `max-width: 100vw` to root containers
    - Ensure all containers have proper width constraints
    - _Requirements: 5.1, 5.2_

  - [x] 7.2 Wrap all page content in ResponsiveContainer
    - Update all page components to use ResponsiveContainer
    - Ensure proper padding at all breakpoints
    - _Requirements: 5.1, 5.2, 5.5_

  - [ ]* 7.3 Write property test for no horizontal overflow
    - **Property 10: No Horizontal Overflow**
    - **Validates: Requirements 5.1, 5.2, 9.5, 11.4, 12.4, 13.1, 15.2, 16.1, 17.1, 18.2, 19.1**

- [x] 8. Implement touch-friendly interactive elements
  - [x] 8.1 Update button styles for minimum touch target size
    - Ensure all buttons are at least 44x44px on mobile
    - Add adequate spacing between adjacent buttons
    - Increase button sizes on mobile breakpoints
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 8.2 Update form input styles for touch interaction
    - Increase input height to 48px on mobile
    - Ensure inputs span full width on mobile
    - Make dropdowns and selects touch-friendly
    - _Requirements: 7.4, 7.5, 10.2, 10.3_

  - [ ]* 8.3 Write property test for minimum touch target size
    - **Property 12: Minimum Touch Target Size**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 11.2, 16.4, 17.5, 18.4**

- [x] 9. Fix modal and overlay responsiveness
  - [x] 9.1 Update modal component for mobile viewport containment
    - Ensure modals fit within viewport height on mobile
    - Enable internal scrolling for tall modals
    - Prevent background scrolling when modal is open
    - Ensure close button is always accessible
    - Add appropriate padding on mobile
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 9.2 Update dropdown components for viewport containment
    - Adjust dropdown position to stay within viewport
    - Implement smart positioning (flip if needed)
    - _Requirements: 8.6_

  - [ ]* 9.3 Write property test for modal viewport containment
    - **Property 13: Modal Viewport Containment**
    - **Validates: Requirements 8.1, 8.2**

  - [ ]* 9.4 Write property test for overlay background lock
    - **Property 14: Overlay Background Lock**
    - **Validates: Requirements 8.3, 11.5, 16.5**

  - [ ]* 9.5 Write property test for modal accessibility
    - **Property 15: Modal Accessibility**
    - **Validates: Requirements 8.4**

  - [ ]* 9.6 Write property test for modal mobile padding
    - **Property 16: Modal Mobile Padding**
    - **Validates: Requirements 8.5**

  - [ ]* 9.7 Write property test for dropdown viewport containment
    - **Property 17: Dropdown Viewport Containment**
    - **Validates: Requirements 8.6**

- [x] 10. Checkpoint - Ensure responsive modals and overlays work
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Fix transaction list responsiveness
  - [x] 11.1 Update transaction list component for mobile layout
    - Display in single column on mobile
    - Stack transaction details vertically
    - Truncate long descriptions with ellipsis
    - Ensure action buttons are accessible
    - _Requirements: 9.1, 9.2, 9.3, 9.5_

  - [ ]* 11.2 Write property test for text truncation
    - **Property 18: Text Truncation**
    - **Validates: Requirements 9.2, 15.3**

  - [ ]* 11.3 Write property test for vertical scrolling
    - **Property 19: Vertical Scrolling for Long Content**
    - **Validates: Requirements 9.4, 16.3**

- [x] 12. Fix form responsiveness
  - [x] 12.1 Update all form components for mobile layout
    - Stack form fields vertically on mobile
    - Ensure inputs span full width on mobile
    - Increase input height for touch interaction
    - Make form buttons full-width or appropriately sized on mobile
    - Ensure date pickers work on mobile
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [ ]* 12.2 Write property test for form input full width on mobile
    - **Property 20: Form Input Full Width on Mobile**
    - **Validates: Requirements 10.2**

  - [ ]* 12.3 Write property test for increased input height on mobile
    - **Property 21: Increased Input Height on Mobile**
    - **Validates: Requirements 10.3**

  - [ ]* 12.4 Write property test for form button sizing on mobile
    - **Property 22: Form Button Sizing on Mobile**
    - **Validates: Requirements 10.4**

- [x] 13. Fix navigation responsiveness
  - [x] 13.1 Update navigation component for mobile
    - Implement mobile-friendly navigation menu
    - Ensure navigation items are touch-friendly
    - Provide visual feedback for active items
    - Prevent background interaction when menu is open
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [ ]* 13.2 Write unit tests for navigation component
    - Test mobile menu toggle
    - Test active state styling
    - Test background lock when open
    - _Requirements: 11.1, 11.3, 11.5_

- [x] 14. Fix card and grid layout responsiveness
  - [x] 14.1 Update account card grid for responsive columns
    - Single column on mobile (<640px)
    - 2-column grid on tablet (640-1024px)
    - 3-column grid on desktop (>1024px)
    - Ensure consistent spacing between cards
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [x] 14.2 Apply same responsive grid to debt cards
    - Match account card responsive behavior
    - Stack debt details vertically on mobile
    - _Requirements: 18.1, 18.2, 18.3_

  - [ ]* 14.3 Write property test for card grid responsiveness
    - **Property 23: Card Grid Responsiveness**
    - **Validates: Requirements 12.1, 12.2, 12.3**

  - [ ]* 14.4 Write property test for consistent card spacing
    - **Property 24: Consistent Card Spacing**
    - **Validates: Requirements 12.5**

- [x] 15. Fix chart and visualization responsiveness
  - [x] 15.1 Update chart components for responsive dimensions
    - Ensure charts fit within viewport width
    - Adjust chart dimensions based on screen space
    - Stack chart elements vertically on mobile
    - Make chart tooltips touch-friendly
    - _Requirements: 13.1, 13.2, 13.4, 13.5_

  - [ ]* 15.2 Write property test for chart responsive dimensions
    - **Property 25: Chart Responsive Dimensions**
    - **Validates: Requirements 13.2**

- [x] 16. Fix table responsiveness
  - [x] 16.1 Update table components for mobile
    - Convert tables to card-based layouts on mobile
    - Implement horizontal scrolling with indicators for wide tables
    - Ensure table headers remain visible (sticky)
    - Ensure action buttons remain accessible
    - _Requirements: 14.1, 14.2, 14.3, 14.5_

  - [ ]* 16.2 Write unit tests for table responsive behavior
    - Test card layout on mobile
    - Test horizontal scroll indicators
    - Test sticky headers
    - _Requirements: 14.1, 14.2, 14.3_

- [x] 17. Fix typography and text responsiveness
  - [x] 17.1 Update typography styles for responsive scaling
    - Implement responsive font sizes (14px mobile, 16px desktop)
    - Ensure text wraps properly
    - Truncate long text with ellipsis where appropriate
    - Maintain readable line heights (1.5+)
    - Ensure sufficient color contrast (4.5:1 for normal text)
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

  - [ ]* 17.2 Write property test for responsive font scaling
    - **Property 26: Responsive Font Scaling**
    - **Validates: Requirements 15.1**

  - [ ]* 17.3 Write property test for typography metrics
    - **Property 27: Typography Metrics**
    - **Validates: Requirements 15.4**

  - [ ]* 17.4 Write property test for color contrast
    - **Property 28: Color Contrast**
    - **Validates: Requirements 15.5**

- [x] 18. Checkpoint - Ensure all responsive layouts work
  - Ensure all tests pass, ask the user if questions arise.

- [x] 19. Fix notification center responsiveness
  - [x] 19.1 Update notification center for responsive width
    - 100% width on mobile
    - 400px width on tablet
    - 450px width on desktop
    - Enable vertical scrolling for long lists
    - Prevent background scrolling when open
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

  - [ ]* 19.2 Write property test for notification center responsive width
    - **Property 29: Notification Center Responsive Width**
    - **Validates: Requirements 16.2**

- [x] 20. Fix budget and progress bar responsiveness
  - [x] 20.1 Update budget components for mobile layout
    - Ensure progress bars fit within viewport
    - Stack budget information vertically on mobile
    - Ensure action buttons are accessible
    - _Requirements: 17.1, 17.2, 17.5_

  - [ ]* 20.2 Write unit tests for budget component responsiveness
    - Test vertical stacking on mobile
    - Test progress bar width constraints
    - _Requirements: 17.1, 17.2_

- [x] 21. Fix image and icon responsiveness
  - [x] 21.1 Update image and icon styles for responsive scaling
    - Ensure images scale proportionally
    - Use appropriate icon sizes for each breakpoint (16-20px mobile, 20-24px desktop)
    - Implement lazy loading for images
    - Provide fallbacks for failed image loads
    - _Requirements: 19.1, 19.2, 19.4, 19.5_

  - [ ]* 21.2 Write property test for image proportional scaling
    - **Property 30: Image Proportional Scaling**
    - **Validates: Requirements 19.1**

  - [ ]* 21.3 Write property test for responsive icon sizing
    - **Property 31: Responsive Icon Sizing**
    - **Validates: Requirements 19.2**

  - [ ]* 21.4 Write unit tests for image lazy loading and fallbacks
    - Test lazy loading attribute
    - Test error fallback handling
    - _Requirements: 19.4, 19.5_

- [x] 22. Implement performance optimizations
  - [x] 22.1 Add resource preloading
    - Preload critical CSS and fonts
    - Preload critical images
    - Add preconnect for Firebase
    - _Requirements: 20.6_

  - [x] 22.2 Implement cache storage limits
    - Monitor cache size
    - Evict oldest entries when approaching 50MB limit
    - _Requirements: 20.5_

  - [ ]* 22.3 Write property test for cache storage limits
    - **Property 32: Cache Storage Limits**
    - **Validates: Requirements 20.5**

  - [ ]* 22.4 Write unit tests for resource preloading
    - Test preload tags exist
    - Test preconnect tags exist
    - _Requirements: 20.6_

- [x] 23. Add offline fallback page
  - Create `public/offline.html` with user-friendly offline message
  - Style to match app theme
  - Serve from service worker when offline and content not cached
  - _Requirements: 2.5_

- [x] 24. Update viewport meta tags
  - Add proper viewport meta tag to prevent unwanted zooming
  - Add theme-color meta tag
  - _Requirements: 5.3_

- [x] 25. Final integration and testing
  - [x] 25.1 Test PWA installation on multiple browsers
    - Test on Chrome desktop and mobile
    - Test on Safari desktop and mobile
    - Test on Firefox desktop and mobile
    - Test on Edge desktop
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 25.2 Test offline functionality end-to-end
    - Test viewing cached data offline
    - Test queuing operations offline
    - Test syncing when back online
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 25.3 Test responsive design on multiple devices
    - Test on various mobile devices (320px to 480px)
    - Test on tablets (768px to 1024px)
    - Test on desktop (1280px to 2560px)
    - Verify no horizontal scrolling on any page
    - _Requirements: 5.1, 6.1, 6.2, 6.3_

  - [x] 25.4 Run Lighthouse audits
    - Verify PWA score > 90
    - Verify Performance score > 85
    - Verify Accessibility score > 90
    - _Requirements: 20.3, 20.4_

- [x] 26. Final checkpoint - Ensure all functionality works
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate universal correctness properties across all inputs
- Unit tests validate specific examples, edge cases, and integration points
- The implementation follows a mobile-first approach
- All responsive changes use Tailwind CSS utility classes with responsive modifiers
- Service worker uses vanilla JavaScript for maximum compatibility
- PWA features gracefully degrade if not supported by the browser
