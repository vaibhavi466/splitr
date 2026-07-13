<div align="center">

<img src="public/logo.png" alt="Splitr Logo" width="80" height="80" />

# Splitr

### Industry-Grade Expense Splitting & Financial Management Platform

[![Next.js](https://img.shields.io/badge/Next.js-16.1-black?logo=next.js&logoColor=white)](https://nextjs.org)
[![Convex](https://img.shields.io/badge/Convex-1.23-orange?logo=convex)](https://convex.dev)
[![Clerk](https://img.shields.io/badge/Clerk-Auth-purple?logo=clerk)](https://clerk.com)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38bdf8?logo=tailwindcss)](https://tailwindcss.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![GitHub last commit](https://img.shields.io/github/last-commit/vaibhavi466/splitr)](https://github.com/vaibhavi466/splitr)

**[Live Demo](https://splitr.vercel.app)** · **[Report Bug](https://github.com/vaibhavi466/splitr/issues)** · **[Request Feature](https://github.com/vaibhavi466/splitr/issues)**

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Architecture](#️-architecture)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Project Structure](#-project-structure)
- [Core Business Logic](#-core-business-logic)
- [Database Schema](#️-database-schema)
- [API Reference](#-api-reference)
- [Deployment](#-deployment)
- [Testing](#-testing)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🌟 Overview

**Splitr** is a production-ready expense splitting and financial tracking platform built for groups and individuals. It enables users to record shared expenses, split bills across multiple participants, track who owes whom, and settle debts — all with a fully immutable audit trail and real-time sync.

Unlike simple split calculators, Splitr implements a complete **double-entry ledger model** with graph-based debt simplification, multi-payer support, and placeholder friend profiles for users who haven't joined the platform yet.

> Built to solve the real-world complexity of shared finances: unequal splits, multi-currency groups, deferred settlements, and the chaos of group trips.

---

## ✨ Key Features

### 💸 Expense Management
- **4 Splitting Modes** — Equal, Exact Amount, Percentage, and Share Ratio (e.g. 2:1:1)
- **Multi-Payer Support** — Multiple people can pay for a single expense
- **Rich Metadata** — Title, amount, category, date, notes, receipt image, and currency
- **Fixed-Decimal Precision** — All amounts stored in 2 decimal places to prevent floating-point drift
- **Input Validation** — Rejects zero/negative amounts, unbalanced splits, and percentage totals ≠ 100%

### 🔒 Immutable Financial History
- **Ledger Reversal Pattern** — Edits soft-delete the old record and insert a new corrected version (never overwrite)
- **Soft Delete** — Deleted expenses are marked `isDeleted: true`, auto-reversing balances without losing audit history
- **Duplicate Prevention** — Blocks identical expenses (same title, amount, payer, group) submitted within 60 seconds

### 👥 Groups & Members
- **Group Metadata** — Name, description, currency, creator, creation date
- **Unlimited Members** — Add any number of registered or unregistered users
- **Guest Members** — Add non-Splitr users by name + phone number (placeholder profile auto-merges when they register)
- **Leave Protection** — Users cannot leave a group unless their net balance is exactly ₹0.00
- **Group Archiving** — Groups are never hard-deleted; admins can archive them (`isArchived: true`)

### 📊 Smart Debt Resolution
- **Graph-Based Debt Simplification** — Greedy net-balance algorithm minimises total transactions (at most N-1 settlements for N people)
- **Settlement Tracking** — Records who paid whom and for how much
- **Dynamic Balances** — Balances computed in real-time from the ledger; no stale cached totals

### 🕵️ Activity & Audit Log
- **Immutable Activity Log** — Every action (expense created/edited/deleted, settlement, group leave/archive) writes a timestamped record
- **Per-Group History** — Query logs filtered by group or user

### 🔐 Authentication & Users
- **Clerk Authentication** — Google OAuth, email magic links, and phone OTP
- **Placeholder Friends** — Create profiles for unregistered users via phone; auto-merges on signup
- **User Search** — Search registered users by name or email with deduplication

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                      │
│  Next.js 16 App Router · React 19 · Tailwind v4 · shadcn/ui │
└──────────────────────────┬──────────────────────────────────┘
                           │ Real-time subscriptions
                           │ Convex React Hooks
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    CONVEX BACKEND (BaaS)                     │
│   Queries · Mutations · Actions · File Storage · Indexes    │
│                                                             │
│   ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌─────────┐  │
│   │  users   │  │  groups  │  │ expenses  │  │settle-  │  │
│   │          │  │          │  │           │  │ments    │  │
│   └──────────┘  └──────────┘  └───────────┘  └─────────┘  │
│                                                             │
│   ┌──────────────────────────────────────────────────────┐  │
│   │              activityLogs (immutable)                │  │
│   └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
┌─────────────────────┐   ┌─────────────────────────┐
│   Clerk Auth        │   │   Inngest (Background)  │
│   (Auth + Webhooks) │   │   (Async Jobs/Emails)   │
└─────────────────────┘   └─────────────────────────┘
```

### Design Principles
- **Immutable Ledger** — Financial records are never mutated in-place; only soft-deleted and superseded
- **Dynamic Balance Computation** — Balances calculated at runtime from active records (no stale totals)
- **Real-Time Sync** — Convex subscriptions push updates to all connected clients instantly
- **Zero-Trust Validation** — All business rules enforced server-side in Convex mutations

---

## 🛠 Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Next.js 16 (App Router) | SSR/SSG, routing, API routes |
| **UI Components** | shadcn/ui + Radix UI | Accessible, headless component primitives |
| **Styling** | Tailwind CSS v4 | Utility-first CSS |
| **State & DB** | Convex | Real-time BaaS with reactive queries |
| **Authentication** | Clerk | Auth, user management, webhooks |
| **Forms** | React Hook Form + Zod | Type-safe form validation |
| **Charts** | Recharts | Spending visualisations |
| **Background Jobs** | Inngest | Async tasks, email notifications |
| **Email** | Resend | Transactional email delivery |
| **AI** | Google Gemini API | Receipt parsing (planned) |
| **Deployment** | Vercel | Edge-optimised hosting |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18.17
- **npm** ≥ 9.x
- A [Convex](https://dashboard.convex.dev) account
- A [Clerk](https://dashboard.clerk.com) account

### 1. Clone the repository

```bash
git clone https://github.com/vaibhavi466/splitr.git
cd splitr
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env.local
# Fill in the values — see Environment Variables section below
```

### 4. Set up Convex

```bash
npx convex dev
```

This provisions your Convex deployment and writes `CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL` to `.env.local` automatically.

### 5. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔑 Environment Variables

Create a `.env.local` file in the project root with the following:

```env
# ── Convex ────────────────────────────────────────────────────
CONVEX_DEPLOYMENT=dev:your-deployment-name
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud

# ── Clerk Authentication ──────────────────────────────────────
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
CLERK_JWT_ISSUER_DOMAIN=https://your-clerk-domain.clerk.accounts.dev

# ── Email (Resend) ────────────────────────────────────────────
RESEND_API_KEY=re_...

# ── AI Features (Google Gemini) ───────────────────────────────
GEMINI_API_KEY=AIza...
```

> **For Vercel deployment:** Add all of the above in your Vercel project's **Settings → Environment Variables**. Additionally add `CONVEX_DEPLOY_KEY` from the Convex dashboard under **Settings → Deploy Keys**.

---

## 📁 Project Structure

```
splitr/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Auth pages (sign-in, sign-up)
│   ├── (main)/                   # Protected app pages
│   │   ├── dashboard/            # Overview: balances, recent activity
│   │   ├── contacts/             # Friends list & group creation
│   │   ├── expenses/new/         # Create expense form
│   │   ├── groups/[id]/          # Group detail page
│   │   ├── person/[id]/          # 1-to-1 expense history
│   │   └── settlements/[type]/[id]/ # Settlement flow
│   └── api/
│       └── inngest/              # Inngest webhook handler
│
├── components/                   # Shared UI components
│   ├── ui/                       # shadcn/ui primitives
│   ├── expense-list.jsx
│   ├── group-balances.jsx
│   └── settlement-list.jsx
│
├── convex/                       # Convex backend functions
│   ├── schema.js                 # Database schema & indexes
│   ├── users.js                  # User management + placeholder logic
│   ├── contacts.js               # Contacts & group creation
│   ├── groups.js                 # Group queries + leaveGroup + deleteGroup
│   ├── expenses.js               # Expense CRUD + split algorithms
│   ├── settlements.js            # Settlement mutations + debt simplification
│   ├── dashboard.js              # Aggregated balance queries
│   ├── activity.js               # Activity log helper + queries
│   └── seed_test_users.js        # Test data utilities
│
├── hooks/                        # Custom React hooks
│   └── use-convex-query.js       # Convex query wrapper
│
├── lib/                          # Utilities
│   └── utils.js
│
├── public/                       # Static assets
├── scripts/                      # Development & test scripts
├── vercel.json                   # Vercel deployment config
└── .env.local                    # Local environment (git-ignored)
```

---

## 🧮 Core Business Logic

### Split Algorithms

| Mode | Description | Validation |
|------|-------------|-----------|
| **Equal** | `total ÷ N` with remainder to first participant | Always valid |
| **Exact** | Each participant specifies their share | `sum(shares) == total` |
| **Percentage** | Each participant specifies a percentage | `sum(%) == 100` |
| **Ratio** | Arbitrary weights (e.g. 2:1:1) | Always valid |

All amounts are rounded to **2 decimal places** using integer-cents math:
```js
const cents = Math.round(amount * 100);
const share = Math.round(cents / n) / 100;
```

### Immutable Ledger Model

```
Edit Expense:
  1. ctx.db.patch(oldId, { isDeleted: true, supersededBy: newId })
  2. ctx.db.insert("expenses", { ...newData, reversesExpenseId: oldId })

Delete Expense:
  1. ctx.db.patch(id, { isDeleted: true, deletedAt: Date.now() })

Balance Query:
  expenses.filter(e => !e.isDeleted)  // deletions auto-reverse balances
```

### Debt Simplification Algorithm

```
Input:  netBalance[user] = Σ(paid) − Σ(owed)
Step 1: creditors = users where netBalance > 0 (sorted desc)
Step 2: debtors   = users where netBalance < 0 (sorted asc)
Step 3: Greedy match — largest debtor pays largest creditor
Result: at most N−1 transactions for N participants
```

### Placeholder Friend Flow

```
1. User A adds "Rahul Singh (+91 98765)" → creates placeholder user
2. Rahul joins Splitr with +91 98765 → users.store() detects match
3. Placeholder is updated: isPlaceholder = false, tokenIdentifier = Rahul's Clerk ID
4. All historic expenses, groups, and balances carry over automatically
```

---

## 🗄️ Database Schema

```
users
  ├── tokenIdentifier   (indexed: by_token)
  ├── email             (indexed: by_email)
  ├── phone             (indexed: by_phone)
  ├── name, imageUrl
  └── isPlaceholder

groups
  ├── name, description, currency
  ├── createdBy, createdAt
  ├── isArchived
  └── members[]         { userId, role, joinedAt }

expenses                (indexed: by_group, by_user_and_group, by_date)
  ├── description, amount, category, date
  ├── paidByUserId, splitType
  ├── splits[]          { userId, amount, paid }
  ├── payments[]        { userId, amount }   ← multi-payer
  ├── groupId, notes, receiptUrl, currency
  ├── isDeleted, deletedAt
  └── reversesExpenseId, supersededBy

settlements             (indexed: by_user_and_group)
  ├── amount, date, note
  ├── paidByUserId, receivedByUserId
  ├── groupId, relatedExpenseIds
  └── createdBy

activityLogs            (indexed: by_group, by_user, by_timestamp)
  ├── action, description
  ├── userId, groupId
  └── timestamp
```

---

## 📡 API Reference

All backend functions are Convex queries and mutations — no REST endpoints.

### Key Mutations

| Function | File | Description |
|----------|------|-------------|
| `expenses:createExpense` | `convex/expenses.js` | Create expense with split validation |
| `expenses:editExpense` | `convex/expenses.js` | Immutable edit via reversal pattern |
| `expenses:deleteExpense` | `convex/expenses.js` | Soft delete with balance auto-reversal |
| `settlements:createSettlement` | `convex/settlements.js` | Record a payment between two users |
| `groups:leaveGroup` | `convex/groups.js` | Leave if net balance == 0 |
| `groups:deleteGroup` | `convex/groups.js` | Archive group (soft delete) |
| `contacts:createGroup` | `convex/contacts.js` | Create group with members |
| `users:createPlaceholderUser` | `convex/users.js` | Add non-Splitr user by phone |

### Key Queries

| Function | File | Description |
|----------|------|-------------|
| `dashboard:getUserBalances` | `convex/dashboard.js` | Aggregated owe/owed totals |
| `groups:getGroupExpenses` | `convex/groups.js` | Group ledger with simplified debts |
| `settlements:getSettlementData` | `convex/settlements.js` | Balance data for settlement page |
| `activity:getActivities` | `convex/activity.js` | Paginated activity log |
| `users:searchUsers` | `convex/users.js` | Search registered users by name/email |

---

## 🚢 Deployment

### Vercel + Convex (Recommended)

1. **Connect repository** to Vercel from [vercel.com/new](https://vercel.com/new)

2. **Set all environment variables** in Vercel Dashboard → Settings → Environment Variables (see [Environment Variables](#-environment-variables) section)

3. **Override the build command** in Vercel settings:
   ```
   npx convex deploy --cmd 'npm run build'
   ```
   Or use the included `vercel.json` — it configures this automatically.

4. **Add `CONVEX_DEPLOY_KEY`** from [Convex Dashboard → Settings → Deploy Keys](https://dashboard.convex.dev)

5. Push to `main` — Vercel and Convex deploy simultaneously.

### Manual Deployment

```bash
# Deploy Convex backend
npx convex deploy

# Build Next.js
npm run build

# Start production server
npm start
```

---

## 🧪 Testing

### Automated Backend Tests

A comprehensive test suite (`scripts/comprehensive_test.mjs`) validates all 52 core business logic checks:

```bash
node scripts/comprehensive_test.mjs
```

**Test coverage:**
- ✅ User management & placeholder logic (4 tests)
- ✅ Group creation with 5+ members (2 tests)
- ✅ Duplicate expense prevention (3 tests)
- ✅ Split algorithm validation — all 4 modes (7 tests)
- ✅ Immutable history & ledger reversal (4 tests)
- ✅ Activity logging — all 6 event types (8 tests)
- ✅ Group leave balance enforcement (5 tests)
- ✅ Group archiving (5 tests)
- ✅ Settlement & debt simplification (4 tests)
- ✅ Schema completeness & indexes (10 tests)

**Result: 52/52 tests passing**

### Seed Test Data

```bash
# Create 5 placeholder test users
node scripts/seed_users_http.mjs

# Run full test suite
node scripts/comprehensive_test.mjs
```

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feat/your-feature-name`
3. **Commit** your changes using [Conventional Commits](https://www.conventionalcommits.org):
   ```
   feat: add receipt OCR parsing
   fix: correct percentage split rounding
   docs: update API reference
   ```
4. **Push** to your fork: `git push origin feat/your-feature-name`
5. **Open a Pull Request** against `main`

### Coding Standards

- All business logic goes in **Convex mutations/queries** (never trust the client)
- Use **fixed-decimal cents math** for all monetary values
- Every write mutation must call **`logActivityInternal`** for audit trail
- Follow the **immutable ledger pattern** — no direct balance overwrites

---

## 📄 License

Distributed under the MIT License. See [`LICENSE`](LICENSE) for details.

---

<div align="center">

Built with ❤️ by [Vaibhavi Agrawal](https://github.com/vaibhavi466)

⭐ Star this repo if you found it useful!

</div>
