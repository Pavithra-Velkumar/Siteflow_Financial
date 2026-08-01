# SiteFlow Financials — PRD

## Original Problem Statement
Build "SiteFlow Financials" — a construction management web app for small contractors: financial dashboard, cash-flow CRUD, employee/payroll management, and construction planner.

## Stack
- Backend: FastAPI + Motor (MongoDB) at `0.0.0.0:8001`, routes prefixed `/api`
- Frontend: React (CRA) + Tailwind + Shadcn + Recharts + Lucide + Sonner
- Auth: JWT (Bearer, `localStorage.sf_token`)
- Storage: Emergent Object Storage for PDF/receipt uploads
- Currency: INR (₹), Indian numbering

## User Personas
- Small construction contractor / independent builder managing 1–5 job sites in India
- Site supervisor logging payouts and expenses from mobile at active job sites

## Modules Implemented (Feb 2026)
1. **Auth** — Login, Register, JWT-protected routes. Admin seeded: `futureperfectcourse@gmail.com` / `SiteFlow@2026`
2. **Dashboard** — 5 stat cards (Cash Balance, Revenue, Expenses, Net Profit, Pending Payroll), Bar chart Revenue vs Expenses, Donut chart Expense Breakdown, filters (Week/Month/Quarter/YTD), Recent transactions table
3. **Cash Flow Tracker** — Full CRUD for incoming/outgoing txns with search + type + status filters; attachable to a saved document
4. **Crew & Payroll** — Employee directory CRUD; log payouts (auto-calculates total from rate × units and auto-creates a linked outgoing expense); payout ledger with total-paid roll-up per employee
5. **Construction Planner** — Monthly calendar view + list view; task CRUD with color, priority, status, crew assignment
6. **Bills & Documents** — Drag/drop upload to Emergent Object Storage; list, view, download, soft-delete; can attach to transactions
7. **Layout** — Dark slate sidebar (desktop), bottom nav (mobile), safety-orange accents, Cabinet Grotesk headings / IBM Plex Sans body

## Backlog (P1)
- Auto-generate a printable PDF invoice for incoming milestone billings
- Per-project P&L view (drill-down from dashboard)
- Multi-user (crew/foreman) access with role-based permissions
- Bill OCR: auto-fill vendor/amount from uploaded receipt using LLM
- Export cash flow to CSV/Excel

## Backlog (P2)
- SMS reminders for overdue client payments (Twilio)
- GST/TDS handling
- Recurring transactions

## What's next
Testing agent will validate auth + CRUD + upload flows end-to-end.

## Follow-up phase (Feb 2026 — post-MVP)
- **Printable Invoice PDF** — GET `/api/transactions/{id}/invoice?auth=<token>` returns a branded, orange-accented PDF invoice generated with ReportLab. Frontend shows a green download icon on every incoming transaction.
- **Project P&L** — new `/projects` page and nav item. Backend `/api/projects` aggregates revenue/expense/net/overdue/task counts per `project_site`. Each card drills into a detail view with transactions + scheduled tasks.
- **Bill Auto-Read (Gemini 3 Flash)** — new `POST /api/scan-bill` endpoint. "AI Scan Bill" button in the new-transaction modal uploads a photo/PDF; Gemini 3 Flash returns `{vendor_name, total_amount, date, category, notes}` and prefills the form.
- **Overdue Reminders (Resend via Emergent managed integration)** — new `POST /api/transactions/{id}/send-reminder` sends a branded HTML email to `client_email`. Amber-colored Send icon shows on any incoming pending/overdue transaction. New `client_email` field added to transaction schema.
- **Receipt Camera (Snap Bill)** — top-level Snap Bill button + Camera/Upload split inside the modal. On mobile, opens the rear camera directly via `capture="environment"`.
- **Multi-Site Photos** — TransactionIn extended with `site_photos: List[str]`. Snap Bill is now a 2-step camera wizard (bill photo → site photo). Modal has a Site Photos gallery with camera-add tile. Row shows a `📷 N` badge.
- **Photo Wall (Feb 2026)** — Project detail page now includes a scrollable image grid built from every `site_photos` + `document_id` reference in the project's transactions. Lightbox modal shows the party name / date / amount context. Backend `/api/projects/details` extended with a `documents` array so the frontend can filter to image content types.
