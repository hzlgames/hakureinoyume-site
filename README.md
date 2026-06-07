# 博麗の夢

Personal website for `hakureinoyume.com`, built with Next.js App Router. The admin background manager uses dynamic API routes, so production should run `next start` behind Caddy.

## Commands

- `npm run dev`: start the local development server.
- `npm run build`: build the Next.js app.
- `npm run start`: start the production Next.js server.
- `npm run deploy`: build the app.

## Routes

- `/`: homepage.
- `/admin`: admin entry for changing the background image.
- `/tools`: tools placeholder.

Add new pages by creating folders under `src/app`, for example `src/app/about/page.tsx` or `src/app/tools/example/page.tsx`.

## Admin access token

Set `ADMIN_ACCESS_TOKEN` on the server to change the admin token. If it is not set, the temporary default is `hzlgames`.
Set `ADMIN_SESSION_SECRET` to a long random value in production so session cookies are signed independently from the access token.

## Production service

This server runs the app through `hakureinoyume-site.service`, installed from `deploy/hakureinoyume-site.service`.
Caddy reverse proxies `https://hakureinoyume.com` to `127.0.0.1:3000`.
