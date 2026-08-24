# ISKCON Live Quiz Platform

Simple MVP monorepo:

- `frontend`: Next.js App Router, TypeScript, Tailwind CSS
- `backend`: Node.js, Express, Socket.IO, Prisma, PostgreSQL

## Environment

Backend `.env`:

```bash
cp backend/.env.example backend/.env
```

Frontend `.env.local`:

```bash
cp frontend/.env.example frontend/.env.local
```

Required variables:

- `DATABASE_URL`
- `FRONTEND_URL`
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_SOCKET_URL`
- `ADMIN_SECRET`
- `JWT_SECRET`
- `PORT`

## Install

```bash
cd backend && npm install
cd ../frontend && npm install
```

## Database

Start PostgreSQL, set `backend/.env`, then:

```bash
cd backend
npm run prisma:generate
npm run migrate
npm run seed
```

## Run Locally

Backend:

```bash
cd backend
npm run dev
```

Frontend:

```bash
cd frontend
npm run dev
```

Open `http://localhost:3000`.

## Admin Setup

There is no user table for the MVP. Set a strong `ADMIN_SECRET` in the backend environment, then log in at:

```text
/admin/login
```

## Run A Test Quiz

1. Log in at `/admin/login`.
2. Create a quiz or open the seeded `ISKCON Event Quiz`.
3. Ensure all 6 questions are saved.
4. Create a room.
5. Display the QR code or share `/join/ROOM_CODE`.
6. Participants enter their names and join.
7. Click `Start quiz`.
8. Click `Start question`.
9. End each question with `End question`, then start the next.
10. After question 6, click `End question` or `Finish` to persist results.

## Tests

```bash
cd backend
npm run test
```

## Load Test

Create a room first, keep the backend running, then:

```bash
cd backend
ROOM_CODE=ABC123 PARTICIPANTS=100 npm run load:test
```

Increase `PARTICIPANTS` later to `500`, `1000`, or `5000` after sizing the backend and database.

## Deploy Frontend To Vercel

1. Import the repository in Vercel.
2. Set root directory to `quiz-platform/frontend`.
3. Add environment variables:
   - `NEXT_PUBLIC_API_URL=https://your-backend.example.com`
   - `NEXT_PUBLIC_SOCKET_URL=https://your-backend.example.com`
4. Build command: `npm run build`.
5. Output is managed by Next.js.

## Deploy Backend To Railway Or Render

1. Create a PostgreSQL database.
2. Create a Node service with root directory `quiz-platform/backend`.
3. Add environment variables:
   - `DATABASE_URL`
   - `FRONTEND_URL=https://your-vercel-domain.vercel.app`
   - `ADMIN_SECRET`
   - `JWT_SECRET`
   - `PORT`
4. Build command:

```bash
npm install && npm run prisma:generate && npm run build
```

5. Start command:

```bash
npm run migrate:deploy && npm run start
```

6. Run seed once from the service shell:

```bash
npm run seed
```

## Health Check

```text
GET /health
```

Returns:

```json
{ "status": "ok" }
```
