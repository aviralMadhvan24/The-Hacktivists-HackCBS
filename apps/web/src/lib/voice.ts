// Browser voice: speech-to-text (Web Speech API) and text-to-speech
// (speechSynthesis), plus a live 0..1 "level" for the orb. Free, on-device where
// the browser supports it; best in Chrome/Edge. Everything degrades to text chat.
import { useCallback, useEffect, useRef, useState } from 'react';

type Rec = any; // SpeechRecognition (not in TS DOM lib everywhere)

export type VoiceLang = 'en-IN' | 'hi-IN';

export function speechSupport() {
  const w = window as any;
  return {
    listen: Boolean(w.SpeechRecognition || w.webkitSpeechRecognition),
    speak: 'speechSynthesis' in window,
  };
}

/** Text tuned for speech: rupee sign, lakh/crore shorthand, stray symbols. */
function forSpeech(text: string) {
  return text
    .replace(/₹\s?([\d,]+(?:\.\d+)?)\s?L\b/g, '$1 lakh rupees')
    .replace(/₹\s?([\d,]+(?:\.\d+)?)\s?Cr\b/g, '$1 crore rupees')
    .replace(/₹\s?([\d,]+(?:\.\d+)?)/g, '$1 rupees')
    .replace(/[*_#`>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickVoice(lang: VoiceLang): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const prefs = lang === 'hi-IN'
    ? [/hi-IN/i, /hindi/i, /en-IN/i]
    : [/en-IN/i, /India/i, /hi-IN/i, /en-GB/i, /en-US/i];
  for (const p of prefs) {
    const v = voices.find((x) => p.test(x.lang) || p.test(x.name));
    if (v) return v;
  }
  return voices[0] || null;
}

export function useVoice() {
  const levelRef = useRef(0);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Rec | null>(null);
  const audio = useRef<{ ctx: AudioContext; stream: MediaStream; raf: number } | null>(null);
  const speakToken = useRef(0);
  const decay = useRef<number | null>(null);

  // Load voices (Chrome populates them asynchronously).
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.getVoices();
    const h = () => window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', h);
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', h);
  }, []);

  const stopMeter = useCallback(() => {
    if (!audio.current) return;
    cancelAnimationFrame(audio.current.raf);
    audio.current.stream.getTracks().forEach((t) => t.stop());
    audio.current.ctx.close().catch(() => {});
    audio.current = null;
    levelRef.current = 0;
  }, []);

  const startMeter = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      const buf = new Uint8Array(an.fftSize);
      const tick = () => {
        an.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        levelRef.current = Math.min(1, Math.sqrt(sum / buf.length) * 5);
        if (audio.current) audio.current.raf = requestAnimationFrame(tick);
      };
      audio.current = { ctx, stream, raf: requestAnimationFrame(tick) };
    } catch {
      // Level meter is cosmetic; recognition can still work.
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    speakToken.current++;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setSpeaking(false);
    levelRef.current = 0;
  }, []);

  /** Listens once; resolves with the final transcript ('' if nothing heard). */
  const listen = useCallback((lang: VoiceLang) => new Promise<string>((resolve) => {
    const w = window as any;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) { setError('Voice input needs Chrome or Edge. You can still type.'); resolve(''); return; }
    stopSpeaking();
    setError(null);
    setInterim('');
    const r: Rec = new Ctor();
    r.lang = lang;
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;
    let finalText = '';
    r.onresult = (e: any) => {
      let text = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t; else text += t;
      }
      setInterim((finalText + ' ' + text).trim());
    };
    r.onerror = (e: any) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setError('Microphone permission was denied. Allow it in the browser address bar.');
      else if (e.error === 'no-speech') setError("Didn't catch that. Tap the mic and try again.");
      else if (e.error !== 'aborted') setError(`Voice input error: ${e.error}`);
    };
    r.onend = () => {
      setListening(false);
      stopMeter();
      rec.current = null;
      resolve(finalText.trim());
    };
    rec.current = r;
    setListening(true);
    startMeter();
    try { r.start(); } catch { setListening(false); stopMeter(); resolve(''); }
  }), [startMeter, stopMeter, stopSpeaking]);

  const stopListening = useCallback(() => { rec.current?.stop(); }, []);

  /** Speaks text sentence by sentence (avoids Chrome's long-utterance cut-off). */
  const speak = useCallback((text: string, lang: VoiceLang) => new Promise<void>((resolve) => {
    if (!('speechSynthesis' in window)) { resolve(); return; }
    stopSpeaking();
    const token = ++speakToken.current;
    const parts = forSpeech(text).match(/[^.!?।]+[.!?।]?/g)?.map((s) => s.trim()).filter(Boolean) || [];
    const voice = pickVoice(lang);
    setSpeaking(true);
    let i = 0;
    const next = () => {
      if (token !== speakToken.current) { resolve(); return; }
      if (i >= parts.length) { setSpeaking(false); levelRef.current = 0; resolve(); return; }
      const u = new SpeechSynthesisUtterance(parts[i++]);
      if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = lang;
      u.rate = 1.02;
      u.pitch = 1;
      // Pulse the orb on each word; decay in between.
      u.onboundary = () => {
        levelRef.current = 0.55 + Math.random() * 0.45;
        if (decay.current) cancelAnimationFrame(decay.current);
        const fall = () => { levelRef.current *= 0.9; if (levelRef.current > 0.08) decay.current = requestAnimationFrame(fall); };
        decay.current = requestAnimationFrame(fall);
      };
      u.onend = next;
      u.onerror = next;
      window.speechSynthesis.speak(u);
    };
    next();
  }), [stopSpeaking]);

  useEffect(() => () => { rec.current?.abort?.(); stopMeter(); stopSpeaking(); }, [stopMeter, stopSpeaking]);

  return { levelRef, listening, speaking, interim, error, setError, listen, stopListening, speak, stopSpeaking, support: speechSupport() };
}
