/** Voice feature configuration. */

export type VoiceProvider = "browser" | "cloud";

/** Master on/off for the voice UI (mic + read-aloud). */
export const VOICE_ENABLED =
  (process.env.NEXT_PUBLIC_VOICE_ENABLED ?? "true").toLowerCase() !== "false";

/**
 * Which engine powers speech-to-text + text-to-speech:
 *   - "browser" → Web Speech API (free, on-device, Chrome/Edge). ← implemented
 *   - "cloud"   → backend STT/TTS endpoints (natural voices, all browsers). ← later
 */
export const VOICE_PROVIDER: VoiceProvider =
  (process.env.NEXT_PUBLIC_VOICE_PROVIDER ?? "browser").toLowerCase() === "cloud"
    ? "cloud"
    : "browser";
