/**
 * Live microphone loudness, for driving the listening visualiser.
 *
 * The Web Speech API gives us a transcript and nothing else — no audio, no
 * levels. So the visualiser opens its own `getUserMedia` stream purely to
 * measure amplitude. That is what makes the wave respond to *your* voice
 * instead of animating on a timer like most implementations.
 *
 * Everything degrades: if the browser refuses a second stream, or the tab has
 * no permission, `start()` resolves false and the caller falls back to a gentle
 * idle animation.
 */

export interface MicMeter {
  /** Opens the stream. Resolves false when levels are unavailable. */
  start(): Promise<boolean>;
  stop(): void;
  /** Smoothed loudness, 0–1. Safe to call every frame. */
  level(): number;
}

/**
 * Rise fast, fall slow. A meter that tracks decay as quickly as attack reads as
 * jitter; a slow release is what makes it feel like a physical needle.
 */
const ATTACK = 0.35;
const RELEASE = 0.08;

/** Speech RMS rarely exceeds ~0.25, so scale up before clamping. */
const GAIN = 4.5;

export function createMicMeter(): MicMeter {
  let context: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let analyser: AnalyserNode | null = null;
  let buffer: Uint8Array<ArrayBuffer> | null = null;
  let smoothed = 0;

  return {
    async start() {
      if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        return false;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        const Ctx =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!Ctx) return false;

        context = new Ctx();
        // Autoplay policy can hand back a suspended context.
        if (context.state === "suspended") await context.resume();

        analyser = context.createAnalyser();
        analyser.fftSize = 512;
        // Some smoothing in the node, the rest in our own envelope below.
        analyser.smoothingTimeConstant = 0.5;
        buffer = new Uint8Array(new ArrayBuffer(analyser.fftSize));

        context.createMediaStreamSource(stream).connect(analyser);
        return true;
      } catch {
        this.stop();
        return false;
      }
    },

    stop() {
      stream?.getTracks().forEach((t) => t.stop());
      void context?.close().catch(() => {});
      stream = null;
      context = null;
      analyser = null;
      buffer = null;
      smoothed = 0;
    },

    level() {
      if (!analyser || !buffer) return 0;

      // Time-domain samples are 0–255 centred on 128; RMS of the deviation is
      // a good stand-in for perceived loudness and is cheap to compute.
      analyser.getByteTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) {
        const deviation = (buffer[i] - 128) / 128;
        sum += deviation * deviation;
      }
      const rms = Math.sqrt(sum / buffer.length);
      const target = Math.min(1, rms * GAIN);

      smoothed += (target - smoothed) * (target > smoothed ? ATTACK : RELEASE);
      return smoothed;
    },
  };
}
