# GURA Marketplace Architecture

## Verified baseline
React 18 + TypeScript + Vite frontend; Express + TypeScript API; PostgreSQL; seller-linked products with up to three images; business moderation, service requests, checkout, and Pesapal integration.

## Target components
- Identity and access: users, roles, sessions and account moderation.
- Business: one shop/technician profile per provider; seller verification.
- Catalogue: searchable products, categories, media, availability and inventory.
- Commerce: cart, server-owned prices, order history, secure payment verification.
- Logistics: addresses, fulfillment lifecycle, shipping assignments and tracking.
- Services: technicians, repair booking and appointment management.
- Administration: moderation, reporting, audits, fraud/disputes and analytics.

## Architecture
Responsive React SPA -> authenticated HTTPS Express REST API -> PostgreSQL.
External services: managed object image storage, Pesapal hosted checkout, email notifications.
Server enforces every business relationship and authorization decision. Never accept payment card or mobile-money PIN credentials in GURA.

## Initial API increment
New GET /api/commerce/catalog supports optional q, category, condition, minPrice, maxPrice, page and limit; response: { products, pagination: { page, limit, total, pages } }. Defaults page=1, limit=24, maximum limit=48. Filtering is server-side and uses SQL parameters. Existing GET /api/commerce/products remains unchanged. Only active non-demo products from pending or approved businesses are visible. Checkout still requires seller approval/verification.

## Next delivery milestones
1. Wire catalogue frontend to server filtering and pagination; add browse-by-category and seller storefront.
2. Enforce unique provider business profile in database, move image uploads to object storage, finish seller product management and moderation tests.
3. Separate payment status from order fulfillment; add delivery addresses, seller-specific orders and customer order tracking.
4. Strengthen stock reservation/decrement, idempotent gateway callbacks, refunds, reconciliation, and security controls before live transactions.
5. Run automated backend and frontend tests, accessibility and mobile QA, staged payments, and production monitoring.

## Safety and compatibility
Keep old routes working, review migration risks, and avoid changes to existing payment flows without dedicated integration tests. Code inspection does not constitute a passing build or production verification.
