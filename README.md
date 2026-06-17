<div align="center">

# 🚆 RailRoute

### Find your way when there's no direct train.

**RailRoute** is a full-stack Indian Railways journey planner that finds optimal 2-leg split routes between cities with no direct connection — the problem that no official app solves.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-railroute--project.vercel.app-blue?style=for-the-badge&logo=vercel)](https://railroute-project.vercel.app)
[![TypeScript](https://img.shields.io/badge/TypeScript-97%25-3178C6?style=for-the-badge&logo=typescript)](https://github.com/garv-sys/railroute-project)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js)](https://nextjs.org)

</div>

---

## The Story

Every semester break, same thing — open IRCTC, type Jaipur to Patna,
and either no trains, or the one train that runs is fully booked weeks
in advance.

So I'd start guessing. Maybe go via Agra? Via Lucknow? Manually check
each intermediate station, open multiple tabs, cross-check timings.
45 minutes later, still no ticket.

There had to be a better way to find split routes. There wasn't.

So I built one.

---

## How It Works

Enter your origin and destination. RailRoute queries **7,000+ Indian stations**, finds trains that serve both legs of a split journey via an intermediate city, and ranks results by total travel time — all in one search.

```
Jaipur → [intermediate station] → Patna
         ↑ RailRoute finds this for you
```

---

## Features

- **Split Journey Search** — automatically finds 2-leg routes via intermediate stations
- **7,000+ Station Database** — fuzzy search so partial names and typos still work  
- **Real-time Schedule Data** — live train timings via RapidAPI Indian Railways
- **Smart Ranking** — results sorted by total travel time and layover duration
- **Clean UI** — built with shadcn/ui, works on mobile

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Database | Prisma + SQLite |
| UI | Tailwind CSS + shadcn/ui |
| Train Data | RapidAPI Indian Railways |
| Deployment | Vercel |

---

## Getting Started

```bash
# Clone the repo
git clone https://github.com/garv-sys/railroute-project.git
cd railroute-project

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Add your RapidAPI key to .env

# Run database migrations
npx prisma migrate dev

# Start development server
npm run dev
```

Open [https://railroute-project.vercel.app](https://railroute-project.vercel.app)

### Environment Variables

```env
RAPIDAPI_KEY=your_rapidapi_key_here
DATABASE_URL="file:./dev.db"
```

---

## Project Structure

```
src/
├── app/              # Next.js App Router pages & API routes
├── components/       # UI components
├── lib/              # Train search logic, station database
└── types/            # TypeScript types
prisma/
└── schema.prisma     # Database schema
```

---

---

<div align="center">

Built by [Garv Tandon](https://linkedin.com/in/garvtandon) · [LinkedIn](https://linkedin.com/in/garvtandon) · [GitHub](https://github.com/garv-sys)

</div>
