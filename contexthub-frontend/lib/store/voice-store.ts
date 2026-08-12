"use client";

import { create } from "zustand";
import { browserSpeak, browserStopSpeaking, TTS_SUPPORTED } from "../voice/browser-speech";
import { VOICE_ENABLED, VOICE_PROVIDER } from "../voice/config";

const READ_ALOUD_KEY = "ch.voice.readAloud";

interface VoiceState {
  /** Read assistant answers aloud automatically. */
  readAloud: boolean;
  /** True while an answer is being spoken. */
  speaking: boolean;
  ttsSupported: boolean;
  toggleReadAloud: () => void;
  speak: (text: string) => void;
  stopSpeaking: () => void;
}

function initialReadAloud(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(READ_ALOUD_KEY) === "true";
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
  readAloud: initialReadAloud(),
  speaking: false,
  ttsSupported: VOICE_ENABLED && VOICE_PROVIDER === "browser" && TTS_SUPPORTED,

  toggleReadAloud() {
    const next = !get().readAloud;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(READ_ALOUD_KEY, String(next));
    }
    if (!next) get().stopSpeaking();
    set({ readAloud: next });
  },

  speak(text) {
    if (!get().ttsSupported) return;
    // Option A: browser TTS. (Option B: fetch audio from /voice/tts and play.)
    browserSpeak(text, {
      onStart: () => set({ speaking: true }),
      onEnd: () => set({ speaking: false }),
    });
  },

  stopSpeaking() {
    browserStopSpeaking();
    set({ speaking: false });
  },
}));
