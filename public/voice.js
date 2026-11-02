// On-device Web Speech only. Starts muted until the speaker button is pressed.
const FEMALE = /female|samantha|victoria|karen|moira|serena|fiona|tessa|zira|aria|jenny|libby|sonia|hazel|susan|allison|ava|google uk english female|google us english female/i;

export function createVoice({ onState }) {
  const synth = window.speechSynthesis;
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  let enabled = false;
  let voices = [];
  const refresh = () => { voices = synth?.getVoices?.() || []; };
  refresh();
  if (synth) synth.addEventListener?.("voiceschanged", refresh);

  function pickVoice() {
    refresh();
    return voices.find((v) => /^en/i.test(v.lang) && FEMALE.test(`${v.name} ${v.voiceURI || ""}`))
      || voices.find((v) => /^en(-|_)?(US|GB|AU)?/i.test(v.lang) && /en-US|en_US|English/i.test(`${v.lang} ${v.name}`) && !/male/i.test(v.name))
      || voices.find((v) => /^en/i.test(v.lang));
  }

  return {
    ttsSupported: Boolean(synth),
    sttSupported: Boolean(Rec),
    get enabled() { return enabled; },
    toggle() {
      enabled = !enabled;
      if (!enabled) { synth?.cancel(); onState?.("idle"); }
      else synth?.resume?.();
      return enabled;
    },
    speak(text) {
      if (!enabled || !synth) return false;
      synth.resume?.();
      synth.cancel();
      const clean = String(text).replace(/https?:\/\/\S+/g, "link").replace(/[*_#`>\[\]]/g, "").replace(/\s+/g, " ").trim().slice(0, 1200);
      if (!clean) return false;
      const u = new SpeechSynthesisUtterance(clean);
      const v = pickVoice();
      if (v) u.voice = v;
      u.lang = v?.lang || "en-US";
      u.rate = 1;
      u.pitch = 1.08;
      u.onstart = () => onState?.("speaking");
      u.onend = () => onState?.("idle");
      u.onerror = () => onState?.("idle");
      synth.speak(u);
      return true;
    },
    listen({ onText, onEnd, onError } = {}) {
      if (!Rec) { onError?.("unsupported"); return null; }
      const r = new Rec();
      r.lang = (navigator.language || "en-US").startsWith("en") ? navigator.language : "en-US";
      r.interimResults = false;
      r.maxAlternatives = 1;
      let settled = false;
      const finish = () => { if (settled) return; settled = true; onEnd?.(); };
      r.onresult = (e) => { const said = e.results?.[0]?.[0]?.transcript || ""; if (said) onText?.(said); };
      r.onend = finish;
      r.onerror = (e) => { onError?.(e?.error || "error"); finish(); };
      try { r.start(); }
      catch (e) { onError?.(e?.name === "NotAllowedError" ? "not-allowed" : "error"); return null; }
      return r;
    },
  };
}
