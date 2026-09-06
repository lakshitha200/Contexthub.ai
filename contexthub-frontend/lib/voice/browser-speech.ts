/**
 * Thin wrappers over the browser's Web Speech API (Option A).
 * SSR-safe: everything guards on `typeof window`.
 */

// --- Minimal Web Speech typings (not in lib.dom for all TS setups) -----------
interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
  resultIndex: number;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const STT_SUPPORTED = getRecognitionCtor() !== null;
export const TTS_SUPPORTED =
  typeof window !== "undefined" && "speechSynthesis" in window;

/** Create a configured SpeechRecognition instance, or null if unsupported. */
export function createRecognition(lang = "en-US"): SpeechRecognitionLike | null {
  const Ctor = getRecognitionCtor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = lang;
  // Keep the session open across pauses. With `continuous = false` the browser
  // ends recognition at the first natural pause, which cuts the user off
  // mid-thought; the hook decides when to stop instead (see use-voice-input).
  rec.continuous = true;
  rec.interimResults = true; // stream partial words for live feedback
  rec.maxAlternatives = 1;
  return rec;
}

export type { SpeechRecognitionLike, SpeechRecognitionEventLike };

// --- Text-to-speech ----------------------------------------------------------

/**
 * Speak text aloud with the browser voice. Cancels any in-progress speech.
 *
 * `onWord` fires on each spoken word via the utterance `boundary` event — the
 * one real-time signal the Web Speech API exposes during playback, and what
 * lets the indicator animate in time with the voice instead of on a timer.
 */
export function browserSpeak(
  text: string,
  handlers?: { onStart?: () => void; onEnd?: () => void; onWord?: () => void },
): void {
  if (!TTS_SUPPORTED || !text.trim()) return;
  window.speechSynthesis.cancel();

  const utter = new SpeechSynthesisUtterance(readable(text));
  utter.rate = 1.02;
  utter.pitch = 1;
  utter.onstart = () => handlers?.onStart?.();
  utter.onend = () => handlers?.onEnd?.();
  utter.onerror = () => handlers?.onEnd?.();
  utter.onboundary = (e) => {
    if (e.name === "word" || e.name === undefined) handlers?.onWord?.();
  };
  window.speechSynthesis.speak(utter);
}

/**
 * Strip what would be read out as noise: citation markers, markdown emphasis,
 * heading hashes, list bullets, code fences and link syntax.
 */
function readable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " code block ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(\d+)\]/g, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|\*|_)/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function browserStopSpeaking(): void {
  if (TTS_SUPPORTED) window.speechSynthesis.cancel();
}
