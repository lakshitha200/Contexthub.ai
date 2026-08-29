"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useVoiceStore } from "../store/voice-store";
import { createMicMeter, type MicMeter } from "./audio-level";
import { STT_SUPPORTED, createRecognition, type SpeechRecognitionLike } from "./browser-speech";
import { VOICE_ENABLED, VOICE_PROVIDER } from "./config";

interface VoiceInput {
  /** Whether speech-to-text is available in this browser/provider. */
  supported: boolean;
  listening: boolean;
  /** Live partial transcript while the user speaks. */
  interim: string;
  /** Current loudness, 0–1, for the visualiser. Stable across renders. */
  getLevel: () => number;
  start: () => void;
  stop: () => void;
}

interface Options {
  onResult: (text: string) => void;
  /** Called with a human-readable reason when listening fails. */
  onError?: (message: string) => void;
}

/**
 * A cough, a door, a throat-clear — all produce a one- or two-character final
 * transcript. Dropping them keeps junk out of the composer.
 */
const MIN_TRANSCRIPT_CHARS = 2;

/**
 * Stop on our own terms after this long with nothing said. Long enough to think
 * mid-sentence, short enough that a forgotten open mic closes itself.
 */
const SILENCE_MS = 7000;

/**
 * Safety valve on the restart loop. A browser that ends recognition instantly
 * and repeatedly must not become an infinite `start()` spin.
 */
const MAX_RESTARTS = 50;

/** Errors that mean "stop and tell the user" rather than "restart". */
const FATAL_ERRORS = new Set([
  "not-allowed",
  "service-not-allowed",
  "audio-capture",
  "network",
]);

/** What each SpeechRecognition error code should tell the user. */
const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "Microphone access was blocked. Allow it in your browser settings.",
  "service-not-allowed": "Microphone access was blocked by your browser.",
  "audio-capture": "No microphone found. Check that one is connected.",
  network: "Speech recognition needs a connection and couldn't reach the service.",
};

/**
 * Speech-to-text hook. Calls `onResult(text)` with each final transcript.
 * Option A (browser) is implemented; Option B (cloud) is wired via the same
 * shape — swap the implementation behind VOICE_PROVIDER === "cloud" later.
 *
 * The browser wants to end recognition constantly: at the first pause, after a
 * few seconds of quiet, sometimes for no stated reason at all. Left alone that
 * cuts the user off mid-sentence. So the session is treated as something *this
 * hook* owns — recognition is restarted underneath whenever the browser drops
 * it, and listening only really ends when the user stops it, a fatal error
 * arrives, or nothing has been said for SILENCE_MS.
 *
 * Alongside recognition it runs a microphone level meter, purely so the
 * visualiser can react to the real voice — the Web Speech API exposes no audio.
 */
export function useVoiceInput({ onResult, onError }: Options): VoiceInput {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const meterRef = useRef<MicMeter | null>(null);
  /** True while the user still wants to be heard — survives browser restarts. */
  const wantRef = useRef(false);
  const silenceRef = useRef<number | null>(null);
  const restartsRef = useRef(0);
  /** Lets a session's `onend` restart the next one without self-reference. */
  const spawnRef = useRef<() => boolean>(() => false);

  // Mirrored into refs so `start` doesn't have to be rebuilt when a caller
  // passes a fresh closure on every render.
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onResultRef.current = onResult;
    onErrorRef.current = onError;
  });

  // Only the browser provider is implemented for now.
  const supported = VOICE_ENABLED && VOICE_PROVIDER === "browser" && STT_SUPPORTED;

  /** Tear everything down and leave the "not listening" state. */
  const finish = useCallback(() => {
    wantRef.current = false;
    if (silenceRef.current) window.clearTimeout(silenceRef.current);
    silenceRef.current = null;

    recRef.current?.abort();
    recRef.current = null;

    meterRef.current?.stop();
    meterRef.current = null;

    setListening(false);
    setInterim("");
  }, []);

  /** Restart the countdown to auto-stop; called on every scrap of speech. */
  const armSilenceTimer = useCallback(() => {
    if (silenceRef.current) window.clearTimeout(silenceRef.current);
    silenceRef.current = window.setTimeout(finish, SILENCE_MS);
  }, [finish]);

  /**
   * Create and start one recognition session, wiring it to restart itself for
   * as long as the user still wants to be heard.
   */
  const spawn = useCallback((): boolean => {
    const rec = createRecognition();
    if (!rec) return false;
    recRef.current = rec;

    rec.onresult = (e) => {
      armSilenceTimer();

      let finalText = "";
      let partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const transcript = res[0]?.transcript ?? "";
        if (res.isFinal) finalText += transcript;
        else partial += transcript;
      }
      setInterim(partial);

      const clean = finalText.trim();
      // Ignore noise that recognised as a stray syllable.
      if (clean.length >= MIN_TRANSCRIPT_CHARS) onResultRef.current(clean);
    };

    rec.onerror = (e) => {
      if (FATAL_ERRORS.has(e.error)) {
        onErrorRef.current?.(ERROR_MESSAGES[e.error]);
        finish();
        return;
      }
      // "no-speech" and "aborted" are routine — `onend` fires next and decides
      // whether to restart. Reporting them would nag the user for pausing.
    };

    rec.onend = () => {
      // The browser ended the session. If the user hasn't stopped, start a new
      // one so a pause doesn't end their turn.
      if (!wantRef.current) {
        finish();
        return;
      }
      if (++restartsRef.current > MAX_RESTARTS) {
        finish();
        return;
      }
      setInterim("");
      // A synchronous restart from inside onend throws InvalidStateError in
      // Chrome; yielding a tick lets the old session finish tearing down.
      window.setTimeout(() => {
        if (!wantRef.current) return;
        if (!spawnRef.current()) finish();
      }, 120);
    };

    try {
      rec.start();
      return true;
    } catch {
      recRef.current = null;
      return false;
    }
  }, [armSilenceTimer, finish]);

  useEffect(() => {
    spawnRef.current = spawn;
  }, [spawn]);

  useEffect(() => finish, [finish]);

  /** Read by the visualiser every frame; 0 when the meter is unavailable. */
  const getLevel = useCallback(() => meterRef.current?.level() ?? 0, []);

  const start = useCallback(() => {
    if (!supported || wantRef.current) return;

    // Barge-in: never talk over the user. If an answer is being read aloud,
    // stop it the moment the mic opens.
    useVoiceStore.getState().stop();

    wantRef.current = true;
    restartsRef.current = 0;
    setInterim("");

    if (!spawn()) {
      finish();
      return;
    }

    setListening(true);
    armSilenceTimer();

    // The meter is a bonus: if a second mic stream is refused, recognition
    // still works and the visualiser falls back to its idle motion.
    const meter = createMicMeter();
    meterRef.current = meter;
    void meter.start().then((ok) => {
      if (!ok && meterRef.current === meter) meterRef.current = null;
    });
  }, [supported, spawn, finish, armSilenceTimer]);

  return { supported, listening, interim, getLevel, start, stop: finish };
}
