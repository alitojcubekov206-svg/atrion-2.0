# Atrion 2.0

> **From Idea to Intelligent Architecture**

Atrion 2.0 is an **AI Software Architect** — a SaaS application that transforms a raw product idea into a complete, professional technical plan: analysis, interview, architecture, database schema, API design, roadmap, and project scoring.

## Features

- **AI Project Discovery** — analyze an idea: product, audience, problem, competitors, potential
- **AI Interview Mode** — the AI asks clarifying questions before designing
- **Project Blueprint** — a full project document (overview, audience, problem, solution)
- **Architecture Generator** — frontend / backend / database / AI / storage stack
- **Database Designer** — tables, fields, relationships
- **API Architect** — endpoint list with descriptions
- **Roadmap Generator** — phased development plan with time estimates
- **Project Score** — Innovation / Difficulty / Market Potential / Cost / Risk
- **AI Critic Mode** — honest criticism, not agreement
- **Export System** — Markdown / JSON / PDF

## Tech Stack

- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS
- **3D & animation:** React Three Fiber, drei, Framer Motion
- **Database:** PostgreSQL via Prisma (Neon on Vercel)
- **Auth:** Auth.js (NextAuth)
- **AI:** OpenAI API

## Getting Started

```bash
npm install
npx prisma migrate dev
npm run dev
```

Copy `.env.example` to `.env` and fill in your keys. **Never commit `.env`.**

## Project Structure

```
Atrion 2.0/
  prisma/          # database schema & migrations
  src/
    app/           # Next.js App Router pages & API routes
    components/    # UI components (incl. 3D scenes)
    lib/           # AI engine, utilities
  docs/            # documentation
```
