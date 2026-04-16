export type VadConfig = {
  sliceMs: number;
  silenceMs: number;
  preSpeechPadMs: number;
  postSpeechPadMs: number;
  maxSegmentMs?: number;
};

export type RecorderSlice<T> = {
  value: T;
  hasSpeech: boolean;
};

export type SpeechSegment<T> = {
  sequenceIndex: number;
  slices: T[];
  sliceCount: number;
};

export function computeRms(samples: ArrayLike<number>) {
  const len = samples.length || 0;
  if (len === 0) return 0;

  let sum = 0;
  for (let i = 0; i < len; i += 1) {
    const value = Number(samples[i]) || 0;
    sum += value * value;
  }
  return Math.sqrt(sum / len);
}

export function createSpeechSegmenter<T>(config: VadConfig) {
  const sliceMs = Math.max(50, Math.round(config.sliceMs));
  const silenceMs = Math.max(sliceMs, Math.round(config.silenceMs));
  const preSpeechPadSlices = Math.max(0, Math.ceil(config.preSpeechPadMs / sliceMs));
  const postSpeechPadSlices = Math.max(0, Math.ceil(config.postSpeechPadMs / sliceMs));
  const maxSegmentSlices = config.maxSegmentMs ? Math.max(1, Math.ceil(config.maxSegmentMs / sliceMs)) : Number.POSITIVE_INFINITY;

  let preSpeech: T[] = [];
  let active: T[] = [];
  let trailingSilentSlices = 0;
  let nextSequenceIndex = 0;

  const finalizeActive = (keepTrailingSilentSlices: number) => {
    if (active.length === 0) return null;
    const trim = Math.max(0, trailingSilentSlices - keepTrailingSilentSlices);
    const kept = trim > 0 ? active.slice(0, Math.max(0, active.length - trim)) : active.slice();
    active = [];
    trailingSilentSlices = 0;
    if (kept.length === 0) return null;
    const segment: SpeechSegment<T> = {
      sequenceIndex: nextSequenceIndex,
      slices: kept,
      sliceCount: kept.length,
    };
    nextSequenceIndex += 1;
    return segment;
  };

  return {
    push(slice: RecorderSlice<T>) {
      if (slice.hasSpeech) {
        if (active.length === 0 && preSpeech.length > 0) {
          active.push(...preSpeech);
        }
        preSpeech = [];
        active.push(slice.value);
        trailingSilentSlices = 0;
        if (active.length >= maxSegmentSlices) {
          return finalizeActive(0);
        }
        return null;
      }

      if (active.length > 0) {
        active.push(slice.value);
        trailingSilentSlices += 1;
        if (active.length >= maxSegmentSlices) {
          return finalizeActive(postSpeechPadSlices);
        }
        if (trailingSilentSlices * sliceMs >= silenceMs + postSpeechPadSlices * sliceMs) {
          return finalizeActive(postSpeechPadSlices);
        }
        return null;
      }

      preSpeech.push(slice.value);
      if (preSpeech.length > preSpeechPadSlices) {
        preSpeech = preSpeech.slice(preSpeech.length - preSpeechPadSlices);
      }
      return null;
    },

    flush() {
      preSpeech = [];
      return finalizeActive(postSpeechPadSlices);
    },

    getSequenceIndex() {
      return nextSequenceIndex;
    },
  };
}
