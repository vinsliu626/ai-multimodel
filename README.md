This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Local AI Detector Dev

`/api/ai-detector` uses a detector service URL from:
1. `DETECTOR_URL` (preferred)
2. `PY_DETECTOR_URL` (backward compatible)
3. default `http://127.0.0.1:8000` (with `/detect` path auto-appended)

Start only the detector stub:

```bash
npm run detector:dev
```

Start Next.js + detector together:

```bash
npm run dev:all
```

The built-in local stub is at `services/detector/dev_server.py` and serves:
- `POST /detect`
- `GET /health`

If detector is down, `/api/ai-detector` now returns `503` with a message to run `npm run detector:dev`.
If detector times out, it returns `504`.
If Postgres is unavailable, it returns `503` with `DB_UNAVAILABLE`.

### Local validation

Use an authenticated cookie from `.cookie.header.txt`, then run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/test-ai-detector-local.ps1 -ExpectedStatus 200
powershell -ExecutionPolicy Bypass -File scripts/test-ai-detector-local.ps1 -ExpectedStatus 503
powershell -ExecutionPolicy Bypass -File scripts/test-ai-detector-local.ps1 -ExpectedStatus 503
```

Run them in these states:
1. Next + detector + Postgres running (`200`)
2. Detector stopped (`503`, `DETECTOR_UNAVAILABLE`)
3. Postgres stopped (`503`, `DB_UNAVAILABLE`)

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
