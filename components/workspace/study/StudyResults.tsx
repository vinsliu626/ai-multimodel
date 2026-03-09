"use client";

import { useMemo, useState } from "react";
import type { StudyQuizItem, StudyResult } from "./study-types";

type ResultTab = "notes" | "flashcards" | "quiz";
type QuizStage = "ready" | "taking" | "submitted" | "review";

type QuizGrade = {
  total: number;
  correct: number;
  percent: number;
  details: Array<{
    correct: boolean;
    userAnswer: string;
    correctAnswer: string;
  }>;
};

function hasTabContent(result: StudyResult, tab: ResultTab) {
  if (tab === "notes") return (result.notes?.length ?? 0) > 0;
  if (tab === "flashcards") return (result.flashcards?.length ?? 0) > 0;
  return (result.quiz?.length ?? 0) > 0;
}

function normalizeText(input: string) {
  return input.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,!?;:]/g, "");
}

function estimatedMinutes(questionCount: number) {
  return Math.max(1, Math.ceil((questionCount * 40) / 60));
}

function scoreBand(percent: number) {
  if (percent >= 90) {
    return {
      title: "Outstanding work!",
      message: "You crushed it — excellent accuracy and strong understanding.",
      vibe: "Celebration",
      icon: "*",
    };
  }
  if (percent >= 80) {
    return {
      title: "Great job!",
      message: "You did really well and showed solid understanding.",
      vibe: "Strong",
      icon: "+",
    };
  }
  if (percent >= 70) {
    return {
      title: "Nice progress!",
      message: "You understand a lot of the material, but there are still a few weak spots to review.",
      vibe: "Building",
      icon: "~",
    };
  }
  if (percent >= 60) {
    return {
      title: "Keep going!",
      message: "You’ve got part of it, but this topic still needs more review.",
      vibe: "Support",
      icon: "^",
    };
  }
  return {
    title: "Time for a comeback!",
    message: "This was a tough round, but now you know exactly what to study next.",
    vibe: "Recovery",
    icon: "!",
  };
}

function displayCorrectAnswer(item: StudyQuizItem) {
  if (item.type === "matching") {
    return item.pairs.map((pair) => `${pair.left} -> ${pair.right}`).join(" | ");
  }
  return item.answer;
}

function displayUserAnswer(item: StudyQuizItem, answer: string | string[]) {
  if (item.type === "matching") {
    if (!Array.isArray(answer)) return "No answer";
    return item.pairs.map((pair, idx) => `${pair.left} -> ${answer[idx] || "(blank)"}`).join(" | ");
  }
  if (Array.isArray(answer)) return answer.join(", ");
  return answer || "No answer";
}

function computeGrade(quiz: StudyQuizItem[], answers: Record<number, string | string[]>) {
  let correct = 0;
  const details = quiz.map((item, index) => {
    const answer = answers[index];

    if (item.type === "matching") {
      const userPairs = Array.isArray(answer) ? answer : [];
      const isCorrect = item.pairs.every((pair, pairIndex) => normalizeText(userPairs[pairIndex] || "") === normalizeText(pair.right));
      if (isCorrect) correct += 1;
      return {
        correct: isCorrect,
        userAnswer: displayUserAnswer(item, userPairs),
        correctAnswer: displayCorrectAnswer(item),
      };
    }

    const userAnswer = typeof answer === "string" ? answer : "";
    const isCorrect = normalizeText(userAnswer) === normalizeText(item.answer);
    if (isCorrect) correct += 1;

    return {
      correct: isCorrect,
      userAnswer: displayUserAnswer(item, userAnswer),
      correctAnswer: displayCorrectAnswer(item),
    };
  });

  const total = quiz.length;
  const percent = total > 0 ? Math.round((correct / total) * 100) : 0;
  return { total, correct, percent, details } satisfies QuizGrade;
}

export function StudyResults({ result }: { result: StudyResult }) {
  const availableTabs = useMemo(
    () => (["notes", "flashcards", "quiz"] as ResultTab[]).filter((tab) => hasTabContent(result, tab)),
    [result]
  );
  const [tab, setTab] = useState<ResultTab>(availableTabs[0] ?? "notes");

  const quizKey = `${result.meta.usedCharCount}-${result.meta.originalCharCount}-${result.quiz?.length ?? 0}-${result.meta.title ?? ""}`;

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-50">Study Output</h3>
          <p className="mt-1 text-xs text-slate-400">
            {result.meta.usedCharCount.toLocaleString()} / {result.meta.originalCharCount.toLocaleString()} chars used
            {result.meta.cached ? " - cached" : ""}
          </p>
        </div>
        <div className="flex rounded-full border border-white/10 bg-slate-950/60 p-1 text-xs">
          {availableTabs.map((value) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`rounded-full px-3 py-1.5 transition ${tab === value ? "bg-white text-black" : "text-slate-300"}`}
            >
              {value === "notes" ? "Notes" : value === "flashcards" ? "Flashcards" : "Quiz"}
            </button>
          ))}
        </div>
      </div>

      {result.meta.truncated && (
        <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          The extracted text was truncated to stay within your plan limit.
        </div>
      )}

      {tab === "notes" && (
        <div className="mt-5 space-y-3">
          {(result.notes ?? []).map((note, index) => (
            <div key={`${index}-${note.slice(0, 24)}`} className="rounded-2xl border border-white/8 bg-slate-950/60 px-4 py-3 text-sm text-slate-200">
              <span className="mr-2 text-slate-500">{String(index + 1).padStart(2, "0")}</span>
              {note}
            </div>
          ))}
        </div>
      )}

      {tab === "flashcards" && (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {(result.flashcards ?? []).map((card, index) => (
            <details key={`${index}-${card.front.slice(0, 24)}`} className="group rounded-2xl border border-white/8 bg-slate-950/60 p-4 text-sm text-slate-200">
              <summary className="list-none cursor-pointer">
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Front</p>
                <p className="mt-2 font-medium text-slate-50">
                  {index + 1}. {card.front}
                </p>
                <span className="mt-3 inline-flex rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.24em] text-slate-400">
                  Reveal back
                </span>
              </summary>
              <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-3">
                <p className="text-[11px] uppercase tracking-[0.24em] text-emerald-200/80">Back</p>
                <p className="mt-2 text-emerald-50">{card.back}</p>
              </div>
            </details>
          ))}
        </div>
      )}

      {tab === "quiz" && (
        <QuizPanel key={quizKey} result={result} />
      )}
    </div>
  );
}

function QuizPanel({ result }: { result: StudyResult }) {
  const quizItems = useMemo(() => result.quiz ?? [], [result.quiz]);
  const [quizStage, setQuizStage] = useState<QuizStage>("ready");
  const [quizIndex, setQuizIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string | string[]>>({});
  const [grade, setGrade] = useState<QuizGrade | null>(null);

  const quizTypes = useMemo(() => {
    if (result.meta.selectedQuizTypes?.length) return result.meta.selectedQuizTypes;
    return Array.from(new Set(quizItems.map((item) => item.type)));
  }, [result.meta.selectedQuizTypes, quizItems]);

  const current = quizItems[quizIndex];
  const progressPct = quizItems.length > 0 ? Math.round(((quizIndex + 1) / quizItems.length) * 100) : 0;

  function setAnswer(index: number, value: string | string[]) {
    setAnswers((prev) => ({ ...prev, [index]: value }));
  }

  function startQuiz() {
    setQuizStage("taking");
    setQuizIndex(0);
    setAnswers({});
    setGrade(null);
  }

  function retryQuiz() {
    startQuiz();
  }

  function submitQuiz() {
    const computed = computeGrade(quizItems, answers);
    setGrade(computed);
    setQuizStage("submitted");
  }

  return (
    <div className="mt-5 space-y-4">
      {quizStage === "ready" && (
        <div className="rounded-2xl border border-white/8 bg-slate-950/60 p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Quiz Ready</p>
          <h4 className="mt-2 text-lg font-semibold text-slate-50">Test your understanding</h4>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-slate-300">
              <p className="text-slate-500">Total Questions</p>
              <p className="mt-1 text-slate-100 font-medium">{quizItems.length}</p>
            </div>
            <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-slate-300">
              <p className="text-slate-500">Quiz Types</p>
              <p className="mt-1 text-slate-100 font-medium">{quizTypes.map((t) => t.replace("_", " ")).join(", ")}</p>
            </div>
            <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-slate-300">
              <p className="text-slate-500">Difficulty</p>
              <p className="mt-1 text-slate-100 font-medium">{result.meta.difficulty ?? "mixed"}</p>
            </div>
            <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-slate-300">
              <p className="text-slate-500">Estimated Time</p>
              <p className="mt-1 text-slate-100 font-medium">~{estimatedMinutes(quizItems.length)} min</p>
            </div>
          </div>
          <button
            type="button"
            onClick={startQuiz}
            className="mt-4 h-10 rounded-full bg-white px-5 text-sm font-semibold text-black hover:brightness-95 transition"
          >
            Start Quiz
          </button>
        </div>
      )}

      {quizStage === "taking" && current && (
        <div className="rounded-2xl border border-white/8 bg-slate-950/60 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <p>
              {quizIndex + 1} / {quizItems.length}
            </p>
            <p>{progressPct}%</p>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-white/10">
            <div className="h-full rounded-full bg-white" style={{ width: `${progressPct}%` }} />
          </div>

          <p className="mt-4 text-[11px] uppercase tracking-[0.24em] text-slate-500">{current.type.replace("_", " ")}</p>
          <p className="mt-2 text-base font-medium text-slate-50">
            {quizIndex + 1}. {current.type === "matching" ? current.prompt : current.question}
          </p>

          {current.type === "multiple_choice" && (
            <div className="mt-4 grid gap-2">
              {current.options.map((option) => {
                const selected = answers[quizIndex] === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setAnswer(quizIndex, option)}
                    className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                      selected ? "border-white bg-white text-black" : "border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/10"
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          )}

          {current.type === "fill_blank" && (
            <input
              value={typeof answers[quizIndex] === "string" ? answers[quizIndex] : ""}
              onChange={(event) => setAnswer(quizIndex, event.target.value)}
              placeholder="Type your answer"
              className="mt-4 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-100 outline-none"
            />
          )}

          {current.type === "matching" && (
            <div className="mt-4 space-y-2">
              {current.pairs.map((pair, pairIndex) => {
                const selected = Array.isArray(answers[quizIndex]) ? answers[quizIndex][pairIndex] || "" : "";
                return (
                  <div key={`${pair.left}-${pairIndex}`} className="grid gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 md:grid-cols-[1fr_1fr]">
                    <p className="text-sm text-slate-100">{pair.left}</p>
                    <select
                      value={selected}
                      onChange={(event) => {
                        const next = Array.isArray(answers[quizIndex]) ? [...answers[quizIndex]] : Array(current.pairs.length).fill("");
                        next[pairIndex] = event.target.value;
                        setAnswer(quizIndex, next);
                      }}
                      className="rounded-lg border border-white/10 bg-slate-950/80 px-2 py-1.5 text-sm text-slate-100 outline-none"
                    >
                      <option value="">Select match</option>
                      {current.pairs.map((choice) => (
                        <option key={choice.right} value={choice.right}>
                          {choice.right}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setQuizIndex((prev) => Math.max(0, prev - 1))}
              disabled={quizIndex === 0}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 disabled:opacity-50"
            >
              Previous
            </button>
            {quizIndex < quizItems.length - 1 ? (
              <button
                type="button"
                onClick={() => setQuizIndex((prev) => Math.min(quizItems.length - 1, prev + 1))}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                onClick={submitQuiz}
                className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black"
              >
                Submit Quiz
              </button>
            )}
          </div>
        </div>
      )}

      {(quizStage === "submitted" || quizStage === "review") && grade && (
        <div className="rounded-2xl border border-white/8 bg-slate-950/60 p-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
            <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Quiz Result</p>
            <h4 className="mt-2 text-2xl font-bold text-slate-50">{grade.percent}%</h4>
            <p className="mt-1 text-sm text-slate-300">
              {grade.correct} / {grade.total} correct
            </p>
            <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-3">
              <p className="text-sm font-semibold text-slate-50">
                {scoreBand(grade.percent).title} {scoreBand(grade.percent).icon}
              </p>
              <p className="mt-1 text-sm text-slate-300">{scoreBand(grade.percent).message}</p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setQuizStage("review")}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200"
              >
                Review Answers
              </button>
              <button
                type="button"
                onClick={retryQuiz}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200"
              >
                Retry Quiz
              </button>
              <button
                type="button"
                onClick={() => setQuizStage("ready")}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200"
              >
                Back to Study Result
              </button>
            </div>
          </div>

          {quizStage === "review" && (
            <div className="mt-4 space-y-3">
              {quizItems.map((item, index) => (
                <div
                  key={`review-${index}`}
                  className={`rounded-xl border px-3 py-3 ${grade.details[index].correct ? "border-emerald-400/30 bg-emerald-400/10" : "border-red-400/30 bg-red-400/10"}`}
                >
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{item.type.replace("_", " ")}</p>
                  <p className="mt-1 text-sm font-medium text-slate-50">
                    {index + 1}. {item.type === "matching" ? item.prompt : item.question}
                  </p>
                  <p className="mt-2 text-xs text-slate-300">Your answer: {grade.details[index].userAnswer}</p>
                  <p className="mt-1 text-xs text-slate-200">Correct answer: {grade.details[index].correctAnswer}</p>
                  {item.explanation ? <p className="mt-1 text-xs text-slate-300">{item.explanation}</p> : null}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
