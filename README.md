<div align="center">

# 🚆 RailRoute

### Smart Indian Railways Journey Planner — Split Routes, Direct Trains & Real-Time Availability

**RailRoute** is a production-ready, full-stack Indian Railways travel planner. It solves the critical problem where no direct trains have available seats between two stations by discovering, enriching, and ranking **optimal 2-leg and multi-leg split routes** via intermediate hubs — with live provider availability and clear data confidence badging.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-railroute--project.vercel.app-blue?style=for-the-badge&logo=vercel)](https://railroute-project.vercel.app)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript)](https://github.com/garv-sys/railroute-project)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js)](https://nextjs.org)

</div>

---

## 🌟 Features

- **Direct Train Engine** — Displays all direct train options with real-time seat availability and fare lookup.
- **Split Journey Engine (Up to 15 Options)** — Automatically computes candidate 2-leg split routes via major railway hubs (e.g., Agra, Kanpur, Prayagraj, Jhansi, Delhi) and enriches up to 15 verified/ranked options.
- **Multi-Leg Split Engine** — Intelligently computes 3-leg connection options when 2-leg options are sparse.
- **Honest Data Confidence Badging** — Distinguishes between provider-verified seat availability (`VERIFIED`) and estimated mock fallbacks (`ESTIMATED — NOT CONFIRMED`) so users never rely on stale guesses.
- **7,000+ Station Database** — Fast fuzzy search supporting station names and Indian Railways station codes.
- **PNR & Live Running Status** — Check PNR status predictions, live train position, route schedules, and coach composition layouts.
- **Interactive Route Map** — Visualizes connection hubs and route geography with Leaflet maps.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | Next.js 14 / 16 (App Router) |
| **Language** | TypeScript |
| **Styling & UI** | Tailwind CSS + shadcn/ui + Framer Motion |
| **Database** | Prisma (SQLite for local dev / PostgreSQL for prod) |
| **Cache & Rate Limiting** | Redis / In-Memory Rate Limiter |
| **Train Data Provider** | IRCTC API Integration / `irctc-connect` |
| **Deployment** | Vercel Serverless Functions |

---

## 🚀 Getting Started

### 1. Clone & Install

```bash
git clone https://github.com/garv-sys/railroute-project.git
cd railroute-project
npm install
```

### 2. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and set your credentials:
```env
IRCTC_API_KEY=your_irctc_api_key_here
DATABASE_URL="file:./dev.db"
REDIS_URL="redis://localhost:6379"
NEXT_PUBLIC_API_URL="http://localhost:3000"
```

### 3. Initialize Database & Run Development Server

```bash
# Run database migrations
npx prisma migrate dev

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🐳 Docker Setup (Optional Local Services)

If you prefer running a local PostgreSQL database and Redis server via Docker:

```bash
docker-compose up -d
```

This starts:
- **PostgreSQL 15** on port `5432` (`postgres:password@localhost:5432/railroute`)
- **Redis Alpine** on port `6379` (`redis://localhost:6379`)

---

## 📂 Project Structure

```
src/
├── app/              # Next.js App Router pages and API routes
│   ├── api/          # /search-direct, /search-split, /pnr, /status
│   └── ...           # Application routes & layouts
├── components/       # React UI components (shadcn, maps, search tools)
├── lib/              # Routing logic, confidence scoring, station database
└── services/         # IRCTC provider integration & train lookup engine
prisma/
└── schema.prisma     # Database schema & migrations
```

---

## 🌍 Live Deployment

Deployed at: **[https://railroute-project.vercel.app](https://railroute-project.vercel.app)**

---

<div align="center">

Built with ❤️ by [Garv Tandon](https://linkedin.com/in/garvtandon)

</div>
