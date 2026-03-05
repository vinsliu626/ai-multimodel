#!/usr/bin/env python3
import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def score_text(text: str) -> float:
    words = [w for w in text.strip().split() if w]
    if not words:
        return 0.0
    punctuation_density = sum(1 for ch in text if ch in ",.;:!?") / max(len(text), 1)
    long_word_rate = sum(1 for w in words if len(w) >= 8) / len(words)
    return max(0.0, min(100.0, round((punctuation_density * 900 + long_word_rate * 70), 2)))


class DetectorHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/detect":
            self._json(404, {"ok": False, "error": "NOT_FOUND"})
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(content_length or 0)

        try:
            payload = json.loads(body.decode("utf-8") if body else "{}")
        except json.JSONDecodeError:
            self._json(400, {"ok": False, "error": "INVALID_JSON"})
            return

        text = str(payload.get("text") or "")
        score = score_text(text)
        response = {
            "ok": True,
            "result": [
                {
                    "AI overall": score,
                    "source": "local-dev-stub",
                },
                "Local dev detector response",
            ],
        }
        self._json(200, response)

    def do_GET(self):
        if self.path == "/health":
            self._json(200, {"ok": True, "service": "detector-dev", "path": "/detect"})
            return
        self._json(404, {"ok": False, "error": "NOT_FOUND"})

    def log_message(self, format, *args):
        return

    def _json(self, status: int, body: dict):
        encoded = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


def main():
    parser = argparse.ArgumentParser(description="Local dev detector service")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), DetectorHandler)
    print(f"detector dev server listening on http://{args.host}:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
