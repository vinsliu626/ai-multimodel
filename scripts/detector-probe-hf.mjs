const BASE = "https://vins0629-py-detector.hf.space";

function sanitizeSnippet(input, max = 200) {
  const text = String(input ?? "").replace(/[^\x20-\x7E]+/g, " ").trim();
  return text.slice(0, max);
}

async function probe(method, path, body) {
  const started = Date.now();
  const url = `${BASE}${path}`;
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "ai-multimodel-detector/1.0",
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const raw = await res.text().catch(() => "");
    console.log(
      `${method} ${url} | STATUS=${res.status} | LATENCY_MS=${Date.now() - started} | BODY=${sanitizeSnippet(
        raw || res.statusText || `HTTP ${res.status}`
      )}`
    );
  } catch (error) {
    console.log(`${method} ${url} | ERROR=${sanitizeSnippet(error?.message ?? String(error))}`);
  }
}

const longText =
  "This is a test input with enough words to validate the detector behavior and confirm payload schema from this local probe script. We include many extra words so that minimum word count checks should pass and the endpoint can execute the main detection code path instead of returning short text validation responses. This additional sentence increases the total token count above the threshold. We now add more neutral words in a final sentence so the content stays clearly above the eighty word requirement used by the detector validation logic.";

await probe("POST", "/detect", { text: longText });
await probe("POST", "/detect", { text: "short payload" });
await probe("POST", "/detect", { inputs: "test" });
await probe("GET", "/", null);
await probe("GET", "/docs", null);
await probe("GET", "/openapi.json", null);
