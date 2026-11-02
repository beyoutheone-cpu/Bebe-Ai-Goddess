// Free, on-device voice via the Web Speech API. Muted by default.
export function createVoice({ onState }) {
  const synth = window.speechSynthesis;
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  let enabled = false;
  const pickVoice = () => (synth?.getVoices() || []).find(v => /en[-_]/i.test(v.lang) && /female|samantha|zira|aria|jenny|google us english/i.test(v.name)) || (synth?.getVoices() || []).find(v => /^en/i.test(v.lang));
  return {
    ttsSupported: Boolean(synth), sttSupported: Boolean(Rec),
    get enabled() { return enabled; },
    toggle() { enabled = !enabled; if (!enabled) synth?.cancel(); return enabled; },
    speak(text) {
      if (!enabled || !synth) return;
      synth.cancel();
      const clean = text.replace(/https?:\/\/\S+/g, "link").replace(/[*_#`>]/g, "").slice(0, 1200);
      const u = new SpeechSynthesisUtterance(clean);
      const v = pickVoice(); if (v) u.voice = v; u.rate = 1; u.pitch = 1.1;
      u.onstart = () => onState("speaking"); u.onend = u.onerror = () => onState("idle");
      synth.speak(u);
    },
    listen(onText, onEnd) {
      if (!Rec) return null;
      const r = new Rec(); r.lang = navigator.language || "en-US"; r.interimResults = false; r.maxAlternatives = 1;
      r.onresult = e => onText(e.results[0][0].transcript); r.onend = onEnd; r.onerror = onEnd;
      r.start(); return r;
    },
  };
}
