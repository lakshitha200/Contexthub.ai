"use client";

import { create } from "zustand";
import { browserSpeak, browserStopSpeaking, TTS_SUPPORTED } from "../voice/browser-speech";
import { VOICE_ENABLED, VOICE_PROVIDER } from "../voice/config";

interface VoiceState {
  /**
   * The message currently being read aloud, or null. Reading is always started
   * by the user pressing the speaker on a specific answer — nothing is ever
   * spoken automatically.
   */
  speakingId: string | null;
  /** Increments on every spoken word; drives the indicator animation. */
  pulse: number;
  ttsSupported: boolean;
  /** Read one message. Speaking a different one replaces what is playing. */
  speak: (messageId: string, text: string) => void;
  stop: () => void;
  /** Read `id` if it is silent, stop it if it is already playing. */
  toggle: (messageId: string, text: string) => void;
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
  speakingId: null,
  pulse: 0,
  ttsSupported: VOICE_ENABLED && VOICE_PROVIDER === "browser" && TTS_SUPPORTED,

  speak(messageId, text) {
    if (!get().ttsSupported) return;
    // Option A: browser TTS. (Option B: fetch audio from /voice/tts and play.)
    browserSpeak(text, {
      onStart: () => set({ speakingId: messageId, pulse: 0 }),
      onWord: () => set((s) => ({ pulse: s.pulse + 1 })),
      onEnd: () => {
        // A late `end` from speech we already replaced must not clear the new one.
        if (get().speakingId === messageId) set({ speakingId: null });
      },
    });
  },

  stop() {
    browserStopSpeaking();
    set({ speakingId: null });
  },

  toggle(messageId, text) {
    if (get().speakingId === messageId) get().stop();
    else get().speak(messageId, text);
  },
}));
