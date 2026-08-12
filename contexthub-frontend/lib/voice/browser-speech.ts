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
  rec.continuous = false; // stop after a natural pause
  rec.interimResults = true; // stream partial words for live feedback
  rec.maxAlternatives = 1;
  return rec;
}

export type { SpeechRecognitionLike, SpeechRecognitionEventLike };

// --- Text-to-speech ----------------------------------------------------------

/** Speak text aloud with the browser voice. Cancels any in-progress speech. */
export function browserSpeak(
  text: string,
  handlers?: { onStart?: () => void; onEnd?: () => void },
): void {
  if (!TTS_SUPPORTED || !text.trim()) return;
  window.speechSynthesis.cancel();
  // Strip citation markers / markdown so they aren't read aloud.
  const clean = text.replace(/\[\d+\]/g, "").replace(/\*\*/g, "");
  const utter = new SpeechSynthesisUtterance(clean);
  utter.rate = 1.02;
  utter.pitch = 1;
  utter.onstart = () => handlers?.onStart?.();
  utter.onend = () => handlers?.onEnd?.();
  utter.onerror = () => handlers?.onEnd?.();
  window.speechSynthesis.speak(utter);
}

export function browserStopSpeaking(): void {
  if (TTS_SUPPORTED) window.speechSynthesis.cancel();
}
