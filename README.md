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

Contract used by both local stub and HF Space:
- endpoint: `POST /detect`
- JSON body: `{ "text": "..." }`
- short input (`<80` words): `200` with `ok:false` and validation message
- invalid shape: `422` (`text` missing)

Start only the detector stub (HF-compatible):

```bash
npm run detector:local
```

This starts the local detector at `http://127.0.0.1:8000/detect` and requires Python on `PATH`.

Start Next.js + detector together:

```bash
npm run dev:all
```

Probe the live HF endpoint from local machine:

```bash
npm run detector:probe:hf
```

The built-in local stub is at `services/detector/dev_server.py` and serves:
- `POST /detect`
- `GET /health`

If detector is down, `/api/ai-detector` returns `503` with a message to run `npm run detector:local` and verify `http://127.0.0.1:8000/detect` is reachable.
If detector times out, it returns `504`.
If Postgres is unavailable, it returns `503` with `DB_UNAVAILABLE`.

For local curl-style testing without login, set:

```bash
AI_DETECTOR_DEV_BYPASS_AUTH=1
```

This bypass is only active when `NODE_ENV !== "production"`.

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

## Document Study Generator

The chat workspace now includes a `Document Study` mode for signed-in users:

- Upload `PDF`, `DOCX`, or `PPTX`
- Extract text in the browser when possible
- Generate concise notes plus a bounded quiz from `/api/study/generate`

Cost controls are enforced server-side by plan:

- `basic`: 1 generation/day, 2 MB upload, 8,000 chars to model, max 5 quiz questions
- `pro`: 5 generations/day, 5 MB upload, 20,000 chars, max 10 quiz questions
- `ultra`: 12 generations/day, 10 MB upload, 35,000 chars, max 15 quiz questions

At least one AI provider key must be configured:

- `GROQ_API_KEY`
- `DEEPSEEK_API_KEY`
- `KIMI_API_KEY`

Notes:

- repeated identical requests are cached in-process to reduce duplicate AI spend
- PPTX extraction is best-effort and reads slide text from the presentation XML; speaker notes and complex embedded objects are not guaranteed

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
