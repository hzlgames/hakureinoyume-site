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

## Production service

This server runs the app through `hakureinoyume-site.service`, installed from `deploy/hakureinoyume-site.service`.
Caddy reverse proxies `https://hakureinoyume.com` to `127.0.0.1:3000`.
