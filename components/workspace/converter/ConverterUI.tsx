"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  getFormatsByCategory,
  getTargetOptions,
  isConversionPairAllowed,
  normalizeConverterPlan,
  validateConverterRequest,
  type ConverterCategory,
  type ConverterFormatId,
} from "@/lib/converter/config";
import { convertFile, getConverterAccept, isFileCompatibleWithFormat, type ConverterResult } from "@/lib/converter/browser";

export type ConverterEntitlement = {
  plan: "basic" | "pro" | "ultra" | "gift";
  usedConverterCountToday?: number;
  converterConversionsPerDay?: number;
  converterMaxFileSizeBytes?: number;
  converterBatchMaxFiles?: number;
  converterAllowAdvancedVideo?: boolean;
  converterAllowLinkToAudio?: boolean;
  converterPriority?: "standard" | "fast" | "priority";
};

type TestModeConfig = {
  enabled: boolean;
  dailyUsageStorageKey: string;
  forceFailure?: boolean;
};

type Copy = {
  badge: string;
  title: string;
  subtitle: string;
  lockedTitle: string;
  lockedBody: string;
  from: string;
  to: string;
  swap: string;
  upload: string;
  limit: string;
  hint: string;
  pick: string;
  selected: string;
  ready: string;
  pairOff: string;
  invalid: string;
  empty: string;
  badFile: string;
  tooLarge: string;
  batch: string;
  plan: string;
  quota: string;
  pending: string;
  failed: string;
  convert: string;
  converting: string;
  done: string;
  done2: string;
  download: string;
  result: string;
  preview: string;
  usage: string;
  size: string;
  batching: string;
  speed: string;
  media: string;
  proc: string;
  local: string;
  formats: string;
  pair: string;
  desc: string;
  basic: string;
  pro: string;
  ultra: string;
  current: string;
  docs: string;
  imgs: string;
  audio: string;
  video: string;
  pdf: string;
  docx: string;
  txt: string;
  pptx: string;
  jpg: string;
  png: string;
  webp: string;
  mp3: string;
  wav: string;
  m4a: string;
  mp4: string;
  mov: string;
  extract: string;
  upgrade: string;
  soon: string;
  single: string;
  files: string;
  none: string;
  std: string;
  fast: string;
  prio: string;
  noVideo: string;
  limited: string;
  full: string;
};

const COPY: Record<"en" | "zh", Copy> = {
  en: {
    badge: "Converter",
    title: "Convert files with a clear FROM to TO flow",
    subtitle: "Supported live conversions currently focus on lightweight PDF and image workflows. Media paths stay visible but intentionally disabled until they are wired.",
    lockedTitle: "Sign in to open Converter",
    lockedBody: "Use a dedicated NexusDesk workspace for flexible file conversion with plan-aware limits and a cleaner upload flow.",
    from: "From",
    to: "To",
    swap: "Swap formats",
    upload: "Upload or drag and drop your file",
    limit: "Plan limit",
    hint: "Supported targets update automatically from the source format you choose.",
    pick: "Choose files",
    selected: "Selected files",
    ready: "Ready to convert this file.",
    pairOff: "This pair is disabled on your current plan or not wired yet.",
    invalid: "Choose another target format for this source.",
    empty: "Upload a file before converting.",
    badFile: "The uploaded file does not match the selected FROM format.",
    tooLarge: "Selected files exceed your current Converter file size limit.",
    batch: "This plan does not allow that many files in one conversion.",
    plan: "This conversion needs a higher plan.",
    quota: "You've used all Converter runs for today. Upgrade your plan or try again tomorrow.",
    pending: "Batch conversion is not wired yet. Upload one file at a time.",
    failed: "Unable to complete this conversion.",
    convert: "Convert file",
    converting: "Converting...",
    done: "Conversion complete",
    done2: "Your output is ready to download.",
    download: "Download result",
    result: "Result ready",
    preview: "Preview",
    usage: "Daily conversions",
    size: "Max file size",
    batching: "Batch processing",
    speed: "Processing speed",
    media: "Media support",
    proc: "Processing mode",
    local: "Supported live conversions run locally in your browser.",
    formats: "Supported formats",
    pair: "Current pair",
    desc: "Convert documents, images, audio, and common media formats",
    basic: "Basic",
    pro: "Pro",
    ultra: "Ultra",
    current: "Current",
    docs: "Documents",
    imgs: "Images",
    audio: "Audio",
    video: "Video / Media",
    pdf: "PDF",
    docx: "DOCX",
    txt: "TXT",
    pptx: "PPTX",
    jpg: "JPG",
    png: "PNG",
    webp: "WEBP",
    mp3: "MP3",
    wav: "WAV",
    m4a: "M4A",
    mp4: "MP4",
    mov: "MOV",
    extract: "Extract Audio",
    upgrade: "Upgrade for more",
    soon: "Coming soon",
    single: "Single file only",
    files: "files",
    none: "No batch",
    std: "Standard",
    fast: "Faster",
    prio: "Priority",
    noVideo: "No advanced video conversion",
    limited: "Limited media support",
    full: "Full common format support",
  },
  zh: {
    badge: "转换器",
    title: "按 FROM → TO 的清晰流程转换文件",
    subtitle: "当前已支持的在线转换以轻量 PDF 和图片流程为主。媒体路径会先展示，但在真正接入前仍保持禁用状态。",
    lockedTitle: "登录后使用转换器",
    lockedBody: "进入独立的 NexusDesk 转换工作区，按套餐限制进行更清晰的文件转换操作。",
    from: "源格式",
    to: "目标格式",
    swap: "交换格式",
    upload: "上传文件或直接拖拽到这里",
    limit: "套餐限制",
    hint: "选择源格式后，可用目标格式会自动更新。",
    pick: "选择文件",
    selected: "已选文件",
    ready: "可以开始转换这个文件。",
    pairOff: "当前套餐下此组合不可用，或该流程尚未接入。",
    invalid: "请为当前源格式选择其他目标格式。",
    empty: "请先上传文件再开始转换。",
    badFile: "上传文件与当前选择的源格式不匹配。",
    tooLarge: "所选文件超过当前转换器文件大小限制。",
    batch: "当前套餐不允许一次转换这么多文件。",
    plan: "此转换需要更高等级的套餐。",
    quota: "你今天的转换次数已用完。请升级套餐或明天再试。",
    pending: "批量转换尚未接入，请一次只上传一个文件。",
    failed: "暂时无法完成这次转换。",
    convert: "开始转换",
    converting: "转换中...",
    done: "转换完成",
    done2: "输出文件已可下载。",
    download: "下载结果",
    result: "结果已就绪",
    preview: "预览",
    usage: "今日转换次数",
    size: "最大文件大小",
    batching: "批量处理",
    speed: "处理速度",
    media: "媒体支持",
    proc: "处理方式",
    local: "当前已接入的在线转换会直接在浏览器本地运行。",
    formats: "支持格式",
    pair: "当前组合",
    desc: "转换文档、图片、音频和常见媒体格式",
    basic: "Basic",
    pro: "Pro",
    ultra: "Ultra",
    current: "当前套餐",
    docs: "文档",
    imgs: "图片",
    audio: "音频",
    video: "视频 / 媒体",
    pdf: "PDF",
    docx: "DOCX",
    txt: "TXT",
    pptx: "PPTX",
    jpg: "JPG",
    png: "PNG",
    webp: "WEBP",
    mp3: "MP3",
    wav: "WAV",
    m4a: "M4A",
    mp4: "MP4",
    mov: "MOV",
    extract: "提取音频",
    upgrade: "升级后可用",
    soon: "即将推出",
    single: "仅支持单文件",
    files: "个文件",
    none: "不支持批量",
    std: "标准",
    fast: "更快",
    prio: "优先",
    noVideo: "不支持高级视频转换",
    limited: "有限媒体支持",
    full: "支持完整常见格式",
  },
};

const CATEGORY_ORDER: ConverterCategory[] = ["documents", "images", "audio", "video"];

function formatFileSize(bytes?: number | null) {
  if (!bytes && bytes !== 0) return "--";
  if (bytes === 0) return "0 B";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb % 1 === 0 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
  const kb = bytes / 1024;
  return `${kb % 1 === 0 ? kb.toFixed(0) : kb.toFixed(1)} KB`;
}

function formatLabel(format: ConverterFormatId, copy: Copy) {
  return {
    pdf: copy.pdf,
    docx: copy.docx,
    txt: copy.txt,
    pptx: copy.pptx,
    jpg: copy.jpg,
    png: copy.png,
    webp: copy.webp,
    mp3: copy.mp3,
    wav: copy.wav,
    m4a: copy.m4a,
    mp4: copy.mp4,
    mov: copy.mov,
    extract_audio: copy.extract,
  }[format];
}

function categoryLabel(category: ConverterCategory, copy: Copy) {
  return {
    documents: copy.docs,
    images: copy.imgs,
    audio: copy.audio,
    video: copy.video,
  }[category];
}

function planLabel(plan: ConverterEntitlement["plan"], copy: Copy) {
  const normalized = normalizeConverterPlan(plan);
  return normalized === "ultra" ? copy.ultra : normalized === "pro" ? copy.pro : copy.basic;
}

function speedLabel(priority: ConverterEntitlement["converterPriority"], copy: Copy) {
  return priority === "priority" ? copy.prio : priority === "fast" ? copy.fast : copy.std;
}

function mediaLabel(entitlement: ConverterEntitlement | null, copy: Copy) {
  const normalized = normalizeConverterPlan(entitlement?.plan);
  if (normalized === "ultra" && entitlement?.converterAllowAdvancedVideo) return copy.full;
  if (normalized === "pro") return copy.limited;
  return copy.noVideo;
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm text-slate-200">{value}</p>
    </div>
  );
}

export function ConverterUI({
  isZh,
  locked,
  entitlement,
  testMode,
}: {
  isZh: boolean;
  locked: boolean;
  entitlement: ConverterEntitlement | null;
  testMode?: TestModeConfig | null;
}) {
  const copy = isZh ? COPY.zh : COPY.en;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [fromFormat, setFromFormat] = useState<ConverterFormatId>("pdf");
  const [toFormat, setToFormat] = useState<ConverterFormatId>("jpg");
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"neutral" | "warning" | "success">("neutral");
  const [result, setResult] = useState<ConverterResult | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [usedToday, setUsedToday] = useState(entitlement?.usedConverterCountToday ?? 0);

  useEffect(() => {
    if (testMode?.enabled && typeof window !== "undefined") {
      const raw = window.localStorage.getItem(testMode.dailyUsageStorageKey);
      if (raw != null) {
        const parsed = Number.parseInt(raw, 10);
        setUsedToday(Number.isFinite(parsed) ? parsed : entitlement?.usedConverterCountToday ?? 0);
        return;
      }
    }
    setUsedToday(entitlement?.usedConverterCountToday ?? 0);
  }, [entitlement?.usedConverterCountToday, testMode?.dailyUsageStorageKey, testMode?.enabled]);

  const sourceGroups = useMemo(
    () => getFormatsByCategory(entitlement?.plan ?? "basic", !!entitlement?.converterAllowAdvancedVideo),
    [entitlement]
  );
  const targetOptions = useMemo(
    () => getTargetOptions(fromFormat, entitlement?.plan ?? "basic", !!entitlement?.converterAllowAdvancedVideo),
    [entitlement?.converterAllowAdvancedVideo, entitlement?.plan, fromFormat]
  );
  const enabledTarget = targetOptions.find((option) => option.enabled)?.id ?? null;
  const activeToFormat = targetOptions.some((option) => option.id === toFormat && option.enabled) ? toFormat : enabledTarget;
  const currentPairValid = !!activeToFormat && isConversionPairAllowed(fromFormat, activeToFormat, entitlement?.plan ?? "basic", !!entitlement?.converterAllowAdvancedVideo);
  const activePlan = normalizeConverterPlan(entitlement?.plan);
  const supportedFormatsValue = useMemo(
    () => CATEGORY_ORDER.flatMap((category) => sourceGroups[category].map((item) => formatLabel(item.id, copy))).join(" / "),
    [copy, sourceGroups]
  );

  function setFeedback(tone: "neutral" | "warning" | "success", nextMessage: string | null) {
    setMessageTone(tone);
    setMessage(nextMessage);
  }

  function persistUsedToday(nextUsedToday: number) {
    setUsedToday(nextUsedToday);
    if (testMode?.enabled && typeof window !== "undefined") {
      window.localStorage.setItem(testMode.dailyUsageStorageKey, String(nextUsedToday));
    }
  }

  function validationMessage(code: string) {
    if (code === "FILE_TOO_LARGE") return copy.tooLarge;
    if (code === "BATCH_LIMIT_EXCEEDED") return copy.batch;
    if (code === "PLAN_REQUIRED" || code === "ADVANCED_VIDEO_REQUIRED") return copy.plan;
    return copy.invalid;
  }

  function validate(files: File[]) {
    if (files.length === 0) return { ok: false as const, message: copy.empty };

    const maxBatchFiles = entitlement?.converterBatchMaxFiles ?? 1;
    if (files.length > 1 && maxBatchFiles > 1) {
      return { ok: false as const, message: copy.pending };
    }

    const validation = validateConverterRequest({
      plan: entitlement?.plan ?? "basic",
      allowAdvancedVideo: entitlement?.converterAllowAdvancedVideo,
      from: fromFormat,
      to: activeToFormat,
      fileCount: files.length,
      batchMaxFiles: maxBatchFiles,
      fileSizeBytes: files.reduce((max, file) => Math.max(max, file.size), 0),
      maxFileSizeBytes: entitlement?.converterMaxFileSizeBytes ?? 10 * 1024 * 1024,
    });

    if (!validation.ok) return { ok: false as const, message: validationMessage(validation.code) };
    if (files.some((file) => !isFileCompatibleWithFormat(file, fromFormat))) return { ok: false as const, message: copy.badFile };
    if ((entitlement?.converterConversionsPerDay ?? 0) > 0 && usedToday >= (entitlement?.converterConversionsPerDay ?? 0)) return { ok: false as const, message: copy.quota };
    return { ok: true as const };
  }

  async function handleSelectedFiles(nextFiles: FileList | null) {
    if (!nextFiles) return;
    const files = Array.from(nextFiles);
    setSelectedFiles(files);
    setResult(null);
    const validation = validate(files);
    setFeedback(validation.ok ? "neutral" : "warning", validation.ok ? copy.ready : validation.message);
  }

  async function handleConvert() {
    if (!activeToFormat) return setFeedback("warning", copy.invalid);
    const validation = validate(selectedFiles);
    if (!validation.ok) return setFeedback("warning", validation.message);

    setIsConverting(true);
    setResult(null);
    setFeedback("neutral", null);

    try {
      if (testMode?.forceFailure) throw new Error("FORCED_FAILURE");
      const nextResult = await convertFile({ file: selectedFiles[0], from: fromFormat, to: activeToFormat });
      setResult(nextResult);
      setFeedback("success", `${copy.done}. ${copy.done2}`);
      persistUsedToday(usedToday + 1);
    } catch (error) {
      console.error("[converter] conversion failed", error);
      setFeedback("warning", copy.failed);
    } finally {
      setIsConverting(false);
    }
  }

  function handleSwap() {
    if (!activeToFormat || !isConversionPairAllowed(activeToFormat, fromFormat, entitlement?.plan ?? "basic", !!entitlement?.converterAllowAdvancedVideo)) {
      return setFeedback("warning", copy.invalid);
    }
    setResult(null);
    setSelectedFiles([]);
    setFeedback("neutral", null);
    setFromFormat(activeToFormat);
    setToFormat(fromFormat);
  }

  useEffect(() => {
    setSelectedFiles([]);
    setResult(null);
    setFeedback("neutral", null);
  }, [fromFormat, toFormat]);

  if (locked) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-10 md:px-8">
        <div className="w-full max-w-4xl rounded-[34px] border border-white/10 bg-white/[0.04] p-8 shadow-[0_28px_120px_rgba(2,6,23,0.45)]">
          <p className="text-center text-[11px] uppercase tracking-[0.32em] text-slate-500">{copy.badge}</p>
          <h2 className="mt-4 text-center text-3xl font-semibold tracking-tight text-slate-50 md:text-4xl">{copy.lockedTitle}</h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-sm leading-7 text-slate-300">{copy.lockedBody}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-8 md:px-8 md:py-10" data-testid="converter-ui">
      <div className="mx-auto max-w-6xl">
        <section className="rounded-[38px] border border-white/10 bg-white/[0.04] px-5 py-8 shadow-[0_36px_120px_rgba(2,6,23,0.48)] md:px-8 md:py-10">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-[11px] uppercase tracking-[0.34em] text-slate-500">{copy.badge}</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-50 md:text-5xl">{copy.title}</h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-slate-300 md:text-[15px]">{copy.subtitle}</p>
          </div>

          <div className="mx-auto mt-8 max-w-4xl rounded-[30px] border border-white/10 bg-black/20 p-4 md:p-5">
            <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr_auto] md:items-end">
              <label className="block">
                <span className="mb-2 block text-left text-[11px] uppercase tracking-[0.24em] text-slate-500">{copy.from}</span>
                <select
                  value={fromFormat}
                  onChange={(event) => {
                    const nextFrom = event.target.value as ConverterFormatId;
                    const nextTo = getTargetOptions(nextFrom, entitlement?.plan ?? "basic", !!entitlement?.converterAllowAdvancedVideo).find((option) => option.enabled)?.id;
                    setFromFormat(nextFrom);
                    if (nextTo) setToFormat(nextTo);
                  }}
                  className="h-14 w-full rounded-[22px] border border-white/10 bg-white/[0.06] px-4 text-sm font-medium text-slate-100"
                  aria-label={copy.from}
                >
                  {CATEGORY_ORDER.map((category) =>
                    sourceGroups[category].length ? (
                      <optgroup key={category} label={categoryLabel(category, copy)}>
                        {sourceGroups[category].map((format) => (
                          <option key={format.id} value={format.id}>
                            {formatLabel(format.id, copy)}
                          </option>
                        ))}
                      </optgroup>
                    ) : null
                  )}
                </select>
              </label>

              <div className="flex items-center justify-center pb-1">
                <button type="button" onClick={handleSwap} className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-slate-200" aria-label={copy.swap}>
                  ⇄
                </button>
              </div>

              <label className="block">
                <span className="mb-2 block text-left text-[11px] uppercase tracking-[0.24em] text-slate-500">{copy.to}</span>
                <select value={activeToFormat ?? ""} onChange={(event) => setToFormat(event.target.value as ConverterFormatId)} className="h-14 w-full rounded-[22px] border border-white/10 bg-white/[0.06] px-4 text-sm font-medium text-slate-100" aria-label={copy.to}>
                  {targetOptions.map((option) => (
                    <option key={option.id} value={option.id} disabled={!option.enabled}>
                      {formatLabel(option.id, copy)}
                      {!option.enabled ? ` / ${option.comingSoon ? copy.soon : copy.upgrade}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <div className="pb-1 text-left md:text-right">
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{copy.pair}</p>
                <p className="mt-2 text-sm font-medium text-slate-100">
                  {formatLabel(fromFormat, copy)} → {activeToFormat ? formatLabel(activeToFormat, copy) : "--"}
                </p>
              </div>
            </div>

            <p className="mt-3 text-center text-[12px] text-slate-400">{currentPairValid ? copy.hint : copy.pairOff}</p>
          </div>

          <div
            onDragEnter={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              if (event.currentTarget === event.target) setDragActive(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              handleSelectedFiles(event.dataTransfer.files);
            }}
            data-testid="converter-dropzone"
            className={["mx-auto mt-6 max-w-4xl rounded-[32px] border border-dashed px-6 py-10 text-center md:px-8 md:py-12", dragActive ? "border-sky-300/50 bg-sky-400/5" : "border-white/12 bg-white/[0.02]"].join(" ")}
          >
            <input ref={inputRef} type="file" multiple hidden accept={getConverterAccept(fromFormat)} onChange={(event) => handleSelectedFiles(event.target.files)} data-testid="converter-file-input" />
            <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-50">{copy.upload}</h3>
            <p className="mt-2 text-sm text-slate-400">
              {copy.limit}: {formatFileSize(entitlement?.converterMaxFileSizeBytes)}
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button type="button" onClick={() => inputRef.current?.click()} className="h-12 rounded-full bg-gradient-to-r from-blue-500 via-sky-500 to-emerald-400 px-5 text-sm font-semibold text-white">
                {copy.pick}
              </button>
              <span className="text-[12px] text-slate-500">{copy.hint}</span>
            </div>

            {selectedFiles.length > 0 ? (
              <div className="mt-6 rounded-[24px] border border-white/8 bg-black/20 p-4 text-left">
                <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">{copy.selected}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {selectedFiles.map((file) => (
                    <div key={`${file.name}-${file.size}`} className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                      <p className="truncate text-sm font-medium text-slate-100">{file.name}</p>
                      <p className="mt-1 text-[12px] text-slate-400">{formatFileSize(file.size)}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button type="button" onClick={handleConvert} disabled={!currentPairValid || isConverting} className="h-12 rounded-full bg-white px-6 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500">
                {isConverting ? copy.converting : copy.convert}
              </button>
            </div>

            {message ? (
              <p className={["mt-5 text-sm", messageTone === "warning" ? "text-amber-300" : messageTone === "success" ? "text-emerald-300" : "text-slate-300"].join(" ")} role={messageTone === "warning" ? "alert" : "status"}>
                {message}
              </p>
            ) : (
              <p className="mt-5 text-sm text-slate-300">{currentPairValid ? copy.ready : copy.invalid}</p>
            )}

            {result ? (
              <div className="mt-6 rounded-[24px] border border-emerald-300/20 bg-emerald-400/5 p-4 text-left" data-testid="converter-result">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.24em] text-emerald-200/80">{copy.result}</p>
                    <h4 className="mt-2 text-lg font-semibold text-slate-50">{copy.done}</h4>
                    <p className="mt-1 text-sm text-slate-300">{result.fileName}</p>
                    <p className="mt-1 text-[12px] text-slate-400">{result.mimeType} / {formatFileSize(result.sizeBytes)}</p>
                  </div>
                  <a href={result.downloadUrl} download={result.fileName} className="inline-flex h-11 items-center justify-center rounded-full border border-emerald-300/20 bg-white px-5 text-sm font-semibold text-slate-950">
                    {copy.download}
                  </a>
                </div>
                {result.previewUrl ? (
                  <div className="mt-4">
                    <p className="mb-2 text-[10px] uppercase tracking-[0.24em] text-slate-500">{copy.preview}</p>
                    <img src={result.previewUrl} alt={result.fileName} className="max-h-64 rounded-2xl border border-white/10 object-contain" />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="mx-auto mt-5 grid max-w-4xl gap-3 md:grid-cols-3">
            <Meta label={copy.formats} value={supportedFormatsValue} />
            <Meta label={copy.limit} value={`${planLabel(entitlement?.plan ?? "basic", copy)} / ${formatFileSize(entitlement?.converterMaxFileSizeBytes)}`} />
            <Meta label={copy.proc} value={copy.local} />
          </div>
        </section>

        <section className="mt-5 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[30px] border border-white/10 bg-white/[0.04] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">{copy.badge}</p>
                <h3 className="mt-2 text-lg font-semibold text-slate-50">{planLabel(entitlement?.plan ?? "basic", copy)}</h3>
                <p className="mt-1 text-sm text-slate-400">{copy.desc}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-right">
                <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{copy.speed}</p>
                <p className="mt-1 text-sm font-semibold text-slate-100">{speedLabel(entitlement?.converterPriority, copy)}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Meta label={copy.usage} value={`${usedToday} / ${entitlement?.converterConversionsPerDay ?? "--"}`} />
              <Meta label={copy.size} value={formatFileSize(entitlement?.converterMaxFileSizeBytes)} />
              <Meta label={copy.batching} value={entitlement?.converterBatchMaxFiles && entitlement.converterBatchMaxFiles > 1 ? `${isZh ? "最多" : "up to"} ${entitlement.converterBatchMaxFiles} ${copy.files}` : copy.single} />
              <Meta label={copy.media} value={mediaLabel(entitlement, copy)} />
            </div>
          </div>

          <div className="rounded-[30px] border border-white/10 bg-white/[0.04] p-5">
            <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">{copy.current}</p>
            <div className="mt-4 space-y-3">
              {[
                { id: "basic", size: 10, day: 5, batch: 1, speed: copy.std, desc: isZh ? "已接入图片与 PDF 导出" : "Live image and PDF export" },
                { id: "pro", size: 50, day: 30, batch: 3, speed: copy.fast, desc: isZh ? "额度更高，媒体仍在分阶段接入" : "More quota, media still staged" },
                { id: "ultra", size: 200, day: 100, batch: 10, speed: copy.prio, desc: isZh ? "限制更高，高级媒体仍在分阶段接入" : "Higher limits, advanced media still staged" },
              ].map((plan) => (
                <div key={plan.id} className={["rounded-[24px] border px-4 py-4", plan.id === activePlan ? "border-sky-400/35 bg-sky-400/5" : "border-white/8 bg-black/20"].join(" ")}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-50">{plan.id === "basic" ? copy.basic : plan.id === "pro" ? copy.pro : copy.ultra}</p>
                      {plan.id === activePlan ? <span className="rounded-full border border-sky-300/20 bg-sky-300/10 px-2 py-0.5 text-[10px] text-sky-100">{copy.current}</span> : null}
                    </div>
                    <p className="text-[12px] text-slate-400">{plan.size} MB</p>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <Meta label={copy.usage} value={`${plan.day} ${isZh ? "次 / 天" : "daily conversions"}`} />
                    <Meta label={copy.batching} value={plan.batch > 1 ? `${isZh ? "最多" : "up to"} ${plan.batch}` : copy.none} />
                    <Meta label={copy.speed} value={plan.speed} />
                  </div>

                  <p className="mt-3 text-sm text-slate-300">{plan.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
