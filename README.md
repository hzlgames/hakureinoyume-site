# 博麗の夢

Personal website for `hakureinoyume.com`, built with Next.js App Router. Authentication and admin features use dynamic API routes, Prisma, PostgreSQL, and Better Auth, so production should run `next start` behind Caddy.

## Commands

- `npm run dev`: start the local development server.
- `npm run build`: build the Next.js app.
- `npm run start`: start the production Next.js server.
- `npm run deploy`: build the app.

## Routes

- `/`: homepage.
- `/admin`: admin dashboard for background and account management.
- `/login`: account login.
- `/register`: account registration.
- `/forgot-password`: password reset request.
- `/reset-password`: password reset completion.
- `/tools`: tools placeholder.

Add new pages by creating folders under `src/app`, for example `src/app/about/page.tsx` or `src/app/tools/example/page.tsx`.

## Auth and data

Copy `.env.example` and set the database, Better Auth, SMTP, and admin email variables. `ADMIN_EMAILS` is a comma-separated list of emails that receive the `admin` role when accounts are created.

Run the Prisma migration against PostgreSQL before starting production.

## NetEase Cloud Music

The homepage player uses a server-side proxy under `/api/music/*`. Configure `NETEASE_API_BASE_URL` to point at a self-hosted NeteaseCloudMusicApi Enhanced or compatible service. The app defaults to `http://localhost:3010` for local development.

Each site user can bind their own NetEase account by QR login. NetEase cookies are encrypted before being stored in PostgreSQL with `NETEASE_COOKIE_SECRET`; if that variable is absent, `BETTER_AUTH_SECRET` is used. Visitors who are not logged in to this site can still use public/anonymous NetEase search and playback when the upstream API permits it.

## Production service

This server runs the app through `hakureinoyume-site.service`, installed from `deploy/hakureinoyume-site.service`.
Caddy reverse proxies `https://hakureinoyume.com` to `127.0.0.1:3000`.
