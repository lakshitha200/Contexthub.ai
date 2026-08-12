"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { STT_SUPPORTED, createRecognition, type SpeechRecognitionLike } from "./browser-speech";
import { VOICE_ENABLED, VOICE_PROVIDER } from "./config";

interface VoiceInput {
  /** Whether speech-to-text is available in this browser/provider. */
  supported: boolean;
  listening: boolean;
  /** Live partial transcript while the user speaks. */
  interim: string;
  start: () => void;
  stop: () => void;
}

/**
 * Speech-to-text hook. Calls `onResult(text)` with the final transcript.
 * Option A (browser) is implemented; Option B (cloud) is wired via the same
 * shape — swap the implementation behind VOICE_PROVIDER === "cloud" later.
 */
export function useVoiceInput(onResult: (text: string) => void): VoiceInput {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  // Only the browser provider is implemented for now.
  const supported = VOICE_ENABLED && VOICE_PROVIDER === "browser" && STT_SUPPORTED;

  useEffect(() => {
    return () => {
      recRef.current?.abort();
      recRef.current = null;
    };
  }, []);

  const start = useCallback(() => {
    if (!supported || listening) return;
    const rec = createRecognition();
    if (!rec) return;
    recRef.current = rec;
    setInterim("");

    rec.onresult = (e) => {
      let finalText = "";
      let partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const transcript = res[0]?.transcript ?? "";
        if (res.isFinal) finalText += transcript;
        else partial += transcript;
      }
      setInterim(partial);
      if (finalText.trim()) {
        onResultRef.current(finalText.trim());
      }
    };
    rec.onerror = () => {
      setListening(false);
      setInterim("");
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
      recRef.current = null;
    };

    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, [supported, listening]);

  const stop = useCallback(() => {
    recRef.current?.stop();
    setListening(false);
  }, []);

  return { supported, listening, interim, start, stop };
}
