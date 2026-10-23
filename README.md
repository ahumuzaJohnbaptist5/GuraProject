# Gura Phase 15

Gura is a responsive React + TypeScript MVP for connecting customers with verified computer technicians, electronics shops, and second-hand sellers.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. To make a production build:

```bash
npm run build
npm run preview
```

## Included in Phase 15

- Marketing homepage and responsive navigation
- Searchable directory with type filters, services, ratings, and verification signals
- Registration and login with validation
- Sign-out and session restoration
- Profile editing
- Role-based dashboards for customer, technician, shop, and administrator
- Protected dashboard route
- Customer service requests from directory listings
- Request status actions for providers and threaded local messaging
- Domain persistence through a `DomainAdapter` boundary in `src/data.ts`
- Local verification queue surface for administrators
- Favorites saved per user
- Request lifecycle completion from accepted to completed
- Customer reviews with 1–5 star ratings after completion
- Backend-ready review and favorites methods in `DomainAdapter`
- Provider listing creation with pending moderation status
- In-app notifications for new requests and request status changes
- Administrator listing moderation actions
- Dynamic listing ratings from submitted reviews
- Listing profile modal with service details and community reviews
- Favorites-only directory discovery
- Customer request cancellation before completion
- Provider availability shown on listings
- Customer preferred appointment date on service requests
- Provider appointment details in request conversations
- Directory sorting by highest rated
- Provider editing of listing availability
- Dashboard metrics for requests and live listings
- Request status filtering in dashboards
- Listing reports with administrator resolve/dismiss actions
- Customer favorites surfaced in the dashboard
- Trust and safety reporting workflow for questionable listings
- Provider confirmation of requested appointment dates
- Customer-visible confirmed appointment state
- Appointment confirmation notifications
- Administrator user account review
- Provider verification controls for registered users
- Account suspend/restore controls honored by local login
- Persistent audit events for administrator actions
- Recent admin activity panel
- Audit entries for account moderation and report resolution
- Structured preferred appointment date and time on service requests
- Provider confirmation of the requested appointment slot
- Customer notifications and dashboard display for confirmed appointment slots
- Provider ownership for listings and assigned request inboxes
- Provider claim flow for legacy/unowned directory listings
- Provider proposal of an alternative appointment date/time before confirmation
- Appointment slot updates with customer notifications
- Local domain snapshot export for backend migration
- Local domain reset control for repeatable demonstrations

## Important limitation and next backend steps

This MVP stores users, passwords, sessions, listings, requests, messages, reviews, favorites, notifications, reports, and audit events in browser `localStorage` only. Client-side role checks and the local admin controls are for UX and are **not production security**. Before launch, replace `AuthAdapter` and `DomainAdapter` with server-backed implementations using PostgreSQL and a real authentication provider, hash passwords server-side, issue secure HTTP-only sessions, validate authorization on every API request, add verified identity/business credentials, and add server-side audit logging, moderation, notifications, calendar integration, and rate limiting. Appointment slots remain local date/time fields; they do not prevent double-booking or sync with an external calendar. Ownership and appointment permissions must be enforced by the future server API.

## Backend Phase 4

The backend now provides a PostgreSQL schema, secure bcrypt password hashing, HTTP-only session cookies, server-side suspension and role checks, approved listing discovery, provider listing creation/editing/claiming, administrator listing moderation, server-backed listing reports, administrator user moderation, provider verification, persistent audit events, authenticated service request creation/listing, request status transitions, appointment confirmation, ownership authorization, request messaging, completed-request reviews, per-user favorites, security headers, same-origin protection for state-changing requests, and in-memory request rate limits. The rate limiter is suitable for local development and a single instance; production deployments should move rate-limit state to shared infrastructure.

To run it locally:

```bash
cd server
copy .env.example .env
npm install
npm run db:migrate
npm run dev
```

The PostgreSQL database in `DATABASE_URL` must exist before migration. Set `VITE_API_URL` in the root `.env` to enable API-backed authentication and domain hydration; without it, localStorage mode remains available. Notifications and complete frontend synchronization remain the next backend slices.

To enable the API-backed authentication path in the frontend, copy `.env.example` to `.env` in the project root and run the Vite app after starting the API. Without `VITE_API_URL`, the app intentionally continues using its local demo authentication.

## Deploy on Render free tier

The repository includes `render.yaml` for a Render Blueprint with two services:

- `gura-api`: Node/Express API running from `server/`
- `gura-web`: free Node web service serving the React/Vite build with SPA fallback

To deploy:

1. Push the repository to GitHub (already configured for `ahumuzaJohnbaptist5/GuraProject`).
2. In Render, choose **New > Blueprint**, connect the repository, and select the `main` branch.
3. When prompted for `DATABASE_URL`, enter the Supabase pooled PostgreSQL connection string. Use the transaction pooler URL for the API runtime.
4. Apply the Blueprint. Render wires `VITE_API_URL` to the API public URL and `WEB_ORIGIN` to the frontend public URL.
5. After deployment, verify `/health` on the API URL and open the frontend URL.

Do not commit `.env` files or Supabase secret keys. The Blueprint intentionally marks `DATABASE_URL` as a secret input. Frontend environment variables are injected at build time, so redeploy the web service after changing the API URL.
