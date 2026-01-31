"use client";

type Mode = "single" | "team";
type SingleModelKey = "groq_fast" | "groq_quality" | "hf_deepseek" | "hf_kimi";

export function ModeSelector({
  mode,
  setMode,
  singleModelKey,
  setSingleModelKey,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
  singleModelKey: SingleModelKey;
  setSingleModelKey: (k: SingleModelKey) => void;
}) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="text-sm text-gray-500">Chat Mode</div>

      <div className="mt-2 flex gap-2">
        <button
          className={`rounded-xl px-3 py-2 text-sm font-medium ${
            mode === "single" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700"
          }`}
          onClick={() => setMode("single")}
        >
          Single
        </button>
        <button
          className={`rounded-xl px-3 py-2 text-sm font-medium ${
            mode === "team" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700"
          }`}
          onClick={() => setMode("team")}
        >
          Team (3-model)
        </button>
      </div>

      {mode === "single" ? (
        <div className="mt-3">
          <div className="text-xs text-gray-500">Single model does NOT consume chat quota.</div>
          <select
            className="mt-2 w-full rounded-xl border px-3 py-2 text-sm"
            value={singleModelKey}
            onChange={(e) => setSingleModelKey(e.target.value as any)}
          >
            <option value="groq_fast">Groq Fast (llama-3.1-8b)</option>
            <option value="groq_quality">Groq Quality (llama-3.3-70b)</option>
            <option value="hf_kimi">HF Kimi</option>
            <option value="hf_deepseek">HF DeepSeek R1</option>
          </select>
          <div className="mt-2 text-xs text-amber-700">
            HF models may return 503/overloaded. Your server should fallback to Groq automatically.
          </div>
        </div>
      ) : (
        <div className="mt-3 text-xs text-gray-600">
          Team mode uses multiple calls (DeepSeek + Kimi + Groq merge). ✅ This mode consumes chat quota.
        </div>
      )}
    </div>
  );
}