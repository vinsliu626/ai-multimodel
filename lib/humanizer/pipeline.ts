import { callGroqChat } from "@/lib/ai/groq";
import type { ChatMessage } from "@/lib/ai/openrouter";
import { analyzeHumanizerEdit, countHumanizerWords, normalizeHumanizerInput, postprocessHumanizerOutput } from "./text";

const HUMANIZER_MODEL = process.env.HUMANIZER_GROQ_MODEL?.trim() || "llama-3.1-8b-instant";
const HUMANIZER_PROMPT_VERSION = "2026-03-14-humanizer-v8";

function buildMessages(text: string, strictRetry = false): ChatMessage[] {
  const retryNote = strictRetry
    ? "Make the writing plainer, less polished, and less academic. Avoid upgraded vocabulary. You may still change the structure, but keep the original meaning, preserve more of the source wording where possible, and avoid turning the result into a near-total rewrite."
    : "";

  return [
    {
      role: "system",
      content:
        "You are a careful editor revising text so it sounds like normal human writing.\n" +
        "Do not act like an essay improver.\n" +
        "Do not make the writing more polished, advanced, academic, or impressive.\n" +
        "Do not upgrade vocabulary.\n" +
        "Prefer plain, common English.\n" +
        "Change structure only when needed, and only to make the writing feel more natural and less robotic.\n" +
        "Keep the meaning the same.\n" +
        "Add simple connectors when helpful.\n" +
        "Keep most of the original wording if it already sounds natural.\n" +
        "Avoid inflated or abstract wording.\n" +
        "Do not try to sound elegant.\n" +
        "The output should feel like a real person revised their own essay by hand, not like an AI rewrote it.\n" +
        "Return only the revised text.",
    },
    {
      role: "user",
      content:
        "Revise the text with a single consistent light-touch editing style.\n" +
        "Make the writing plainer, less polished, and less academic. Prefer plain common English and avoid upgraded vocabulary.\n" +
        "Change structure only when needed, add simple connectors when helpful, and keep most of the original wording when it already works.\n" +
        retryNote +
        "\n\n" +
        "TEXT START\n" +
        text +
        "\nTEXT END",
    },
  ];
}

export async function runHumanizerPipeline(input: { text: string }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("MISSING_GROQ_API_KEY");

  const preparedText = normalizeHumanizerInput(input.text);
  const inputWords = countHumanizerWords(preparedText);
  const maxTokens = Math.max(300, Math.min(1800, Math.round(inputWords * 1.8)));

  const firstPass = await callGroqChat({
    apiKey,
    modelId: HUMANIZER_MODEL,
    messages: buildMessages(preparedText, false),
    temperature: 0.2,
    maxTokens,
    timeoutMs: 45_000,
  });

  let output = postprocessHumanizerOutput(firstPass.content);
  if (!output) throw new Error("HUMANIZER_EMPTY_OUTPUT");

  let selectedModel = firstPass.modelUsed;
  let quality = analyzeHumanizerEdit(preparedText, output);
  let qualityRetryUsed = false;

  if (quality.tooAggressive) {
    console.warn("[humanizer] output changed too much; retrying with stricter minimal-edit instructions", {
      overlapRatio: quality.overlapRatio,
      lengthRatio: quality.lengthRatio,
      sentenceRatio: quality.sentenceRatio,
      paragraphDelta: quality.paragraphDelta,
      addedClicheCount: quality.addedClicheCount,
    });

    const retryPass = await callGroqChat({
      apiKey,
      modelId: HUMANIZER_MODEL,
      messages: buildMessages(preparedText, true),
      temperature: 0.1,
      maxTokens,
      timeoutMs: 45_000,
    });

    const retryOutput = postprocessHumanizerOutput(retryPass.content);
    if (retryOutput) {
      const retryQuality = analyzeHumanizerEdit(preparedText, retryOutput);
      qualityRetryUsed = true;

      const preferRetry =
        (!retryQuality.tooAggressive && quality.tooAggressive) ||
        retryQuality.overlapRatio > quality.overlapRatio ||
        (retryQuality.overlapRatio === quality.overlapRatio && retryQuality.addedClicheCount < quality.addedClicheCount) ||
        (retryQuality.overlapRatio === quality.overlapRatio && Math.abs(1 - retryQuality.sentenceRatio) < Math.abs(1 - quality.sentenceRatio));

      if (preferRetry) {
        output = retryOutput;
        quality = retryQuality;
        selectedModel = retryPass.modelUsed;
      }
    }
  }

  if (quality.overlapRatio < 0.4 || quality.sentenceRatio < 0.55 || quality.sentenceRatio > 1.7) {
    console.warn("[humanizer] output remained too aggressive after quality control; returning original text", {
      overlapRatio: quality.overlapRatio,
      lengthRatio: quality.lengthRatio,
      sentenceRatio: quality.sentenceRatio,
      retryUsed: qualityRetryUsed,
    });
    output = preparedText;
    quality = analyzeHumanizerEdit(preparedText, output);
  }

  return {
    output,
    usage: {
      inputWords,
      outputWords: countHumanizerWords(output),
    },
    meta: {
      provider: "groq" as const,
      model: selectedModel,
      version: HUMANIZER_PROMPT_VERSION,
      qualityControl: {
        overlapRatio: Number(quality.overlapRatio.toFixed(3)),
        lengthRatio: Number(quality.lengthRatio.toFixed(3)),
        sentenceRatio: Number(quality.sentenceRatio.toFixed(3)),
        retryUsed: qualityRetryUsed,
      },
    },
  };
}
