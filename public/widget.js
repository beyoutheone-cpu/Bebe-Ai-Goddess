/* Bebe AI floating widget.
   Shopify theme.liquid, before </body>:
   <script src="https://YOUR-BEBE-DEPLOYMENT/widget.js" defer></script>
   The host page must be listed in EMBED_ORIGINS on the server. */
(function () {
  if (window.__bebeWidget) return; window.__bebeWidget = true;
  var me = document.currentScript, origin = new URL(me ? me.src : location.href).origin;
  var phoneQ = window.matchMedia("(max-width: 640px)");
  var css = ""
    + "#bebe-btn{position:fixed;right:20px;bottom:20px;z-index:2147483000;width:62px;height:62px;padding:0;border:2px solid #D4AF37;border-radius:50%;background:radial-gradient(circle at 35% 30%,#1d3266,#0B1A3A);color:#D4AF37;font-size:28px;line-height:1;cursor:pointer;box-shadow:0 6px 24px rgba(11,26,58,.5),0 0 18px rgba(212,175,55,.35);display:grid;place-items:center}"
    + "#bebe-btn:focus-visible{outline:3px solid #fff;outline-offset:2px}"
    + "#bebe-panel{position:fixed;right:20px;bottom:94px;z-index:2147483000;width:min(400px,calc(100vw - 24px));height:min(640px,calc(100vh - 120px));height:min(640px,calc(100dvh - 120px));border:1px solid #D4AF37;border-radius:18px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.45);display:none;background:#0B1A3A}"
    + "#bebe-panel.open{display:block}"
    + "#bebe-panel iframe{width:100%;height:100%;border:0;display:block}"
    + "#bebe-close{display:none;position:absolute;z-index:2;top:8px;right:8px;width:44px;height:44px;border:0;border-radius:12px;background:#0B1A3A;color:#f0d77a;font-size:28px;line-height:1;cursor:pointer;border:1px solid #D4AF37}"
    + "@media(max-width:640px){"
    + "#bebe-btn{width:56px;height:56px;right:max(12px,env(safe-area-inset-right));bottom:calc(76px + env(safe-area-inset-bottom))}"
    + "#bebe-panel.open{top:0;left:0;right:0;bottom:0;width:100vw;height:100vh;height:100dvh;max-width:none;max-height:none;border:0;border-radius:0;box-shadow:none}"
    + "#bebe-panel.open #bebe-close{display:grid;place-items:center;top:calc(8px + env(safe-area-inset-top));right:calc(8px + env(safe-area-inset-right))}"
    + "#bebe-panel.open~#bebe-btn{visibility:hidden;pointer-events:none}"
    + "}";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  var btn = document.createElement("button");
  btn.id = "bebe-btn"; btn.type = "button";
  btn.setAttribute("aria-label", "Chat with Bebe, Star's AI style assistant");
  btn.setAttribute("aria-expanded", "false");
  btn.textContent = "\u2726";
  var panel = document.createElement("div");
  panel.id = "bebe-panel"; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "false"); panel.setAttribute("aria-label", "Bebe AI chat");
  var closeBtn = document.createElement("button");
  closeBtn.id = "bebe-close"; closeBtn.type = "button"; closeBtn.setAttribute("aria-label", "Close chat"); closeBtn.textContent = "\u00d7";
  panel.appendChild(closeBtn);
  var loaded = false, locked = false, scrollY = 0;
  function phone() { return phoneQ.matches; }
  function lockScroll(on) {
    if (on && !locked) {
      scrollY = window.scrollY || window.pageYOffset || 0;
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.top = (-scrollY) + "px";
      document.body.style.left = "0";
      document.body.style.right = "0";
      document.body.style.width = "100%";
      locked = true;
    } else if (!on && locked) {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      document.body.style.width = "";
      window.scrollTo(0, scrollY);
      locked = false;
    }
  }
  function setOpen(open) {
    if (open && !loaded) {
      var f = document.createElement("iframe");
      f.src = origin + "/?embed=1"; f.title = "Bebe AI chat";
      // Permissions-Policy on the chat page is microphone=(self). This allow
      // delegates the microphone into that frame from the storefront.
      f.allow = "microphone"; f.setAttribute("allow", "microphone");
      panel.appendChild(f); loaded = true;
    }
    panel.classList.toggle("open", open);
    btn.setAttribute("aria-expanded", String(open));
    btn.textContent = open && !phone() ? "\u00d7" : "\u2726";
    panel.setAttribute("aria-modal", open && phone() ? "true" : "false");
    lockScroll(open && phone());
    if (!open) closeBtn.blur();
  }
  btn.addEventListener("click", function () { setOpen(!panel.classList.contains("open")); });
  closeBtn.addEventListener("click", function () { setOpen(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && panel.classList.contains("open")) setOpen(false); });
  phoneQ.addEventListener("change", function () {
    if (panel.classList.contains("open")) setOpen(true);
  });
  document.body.appendChild(panel);
  document.body.appendChild(btn);
})();
