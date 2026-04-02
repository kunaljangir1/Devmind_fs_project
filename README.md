# DevMind FS Project

DevMind is a full-stack AI-assisted developer platform with:

- A Next.js frontend (chat UI + multi-agent analyzer)
- An Express backend (auth + persistent chat history)
- SQLite storage via better-sqlite3
- Raiden AI API integration

## Monorepo Structure

```text
Devmind_fs_project/
	backend/   # Express API, auth, SQLite persistence
	frontend/  # Next.js App Router UI and AI endpoints
```

## Tech Stack

- Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS, shadcn/ui
- Backend: Node.js, Express 5, JWT auth, bcrypt
- Database: SQLite (better-sqlite3)
- AI: Raiden API

## Features

- User registration and login (JWT-based auth)
- Persistent chat sessions and messages per user
- Chat endpoint integrated with AI response generation
- Multi-agent code analysis page with 4 parallel agents:
	- Complexity Analyst
	- Security Auditor
	- Refactor Advisor
	- Documentation Generator
- Frontend health-check endpoint for AI API connectivity

## Prerequisites

- Node.js 18+
- npm 9+

## Installation

Install dependencies for both apps:

```bash
cd backend
npm install

cd ../frontend
npm install
```

## Environment Variables



Create `backend/.env`:

```env
PORT=3001
JWT_SECRET=replace_with_a_strong_secret
RAIDEN_API_URL=https://api.raiden.ovh/ai/generate
```

Notes:

- `PORT` is required. Backend will exit if missing.
- `JWT_SECRET` is required. Backend will exit if missing.
- `RAIDEN_API_URL` is used for AI message generation in chat routes.


Notes:

- These values are used by Next.js API routes under `frontend/app/api/*`.
- If not provided, defaults are used from `frontend/lib/config.ts`.

## Run Locally

Open two terminals.

### Terminal 1: Backend

```bash
cd backend
npm run dev
```

Backend runs on `http://localhost:3001`.

### Terminal 2: Frontend

```bash
cd frontend
npm run dev
```

Frontend runs on `http://localhost:3002`.

## Available Scripts

### Backend (`backend/package.json`)

- `npm run dev` - Run Express server with nodemon
- `npm start` - Run Express server with node

### Frontend (`frontend/package.json`)

- `npm run dev` - Run Next.js dev server on port 3002
- `npm run build` - Build production bundle
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## API Overview

### Backend API (Express)

Base URL: `http://localhost:3001/api`

- `POST /auth/register` - Register user
- `POST /auth/login` - Login user
- `GET /chats` - Get current user chats (auth required)
- `POST /chats` - Create chat (auth required)
- `GET /chats/:id/messages` - Get chat messages (auth required)
- `POST /chats/:id/messages` - Add user message + generate AI reply (auth required)

Auth header format:

```http
Authorization: Bearer <jwt_token>
```

### Frontend API Routes (Next.js)

- `POST /api/chat` - Streaming chat response orchestration
- `POST /api/agents` - Parallel multi-agent analysis
- `GET /api/health` - AI provider health check

## Database

SQLite database file is created automatically at:

- `backend/devminds.db`

Tables initialized on server startup:

- `users`
- `chats`
- `messages`

## Typical Dev Flow

1. Start backend on port 3001
2. Start frontend on port 3002
3. Register or login from the frontend
4. Create chat sessions and exchange messages
5. Use Agents page to run parallel code analysis

## Troubleshooting

- Backend crashes on startup:
	- Ensure `backend/.env` contains valid `PORT` and `JWT_SECRET`.
- Chat requests fail with auth errors:
	- Ensure token is present in browser localStorage and being sent in `Authorization` header.
- AI responses fail:
	- Verify `RAIDEN_API_URL` (backend) and `RAIDEN_API_BASE_URL` (frontend) are reachable.
- Port conflict:
	- Change backend `PORT` or update `frontend/lib/api.ts` base URL accordingly.


