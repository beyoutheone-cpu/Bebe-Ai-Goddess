/* Bebe AI floating widget. NOT embedded anywhere yet.
   Later usage (e.g. Shopify theme.liquid before </body>):
   <script src="https://YOUR-BEBE-DEPLOYMENT/widget.js" defer></script>
   The host page must be listed in EMBED_ORIGINS on the server. */
(function () {
  if (window.__bebeWidget) return; window.__bebeWidget = true;
  var me = document.currentScript, origin = new URL(me ? me.src : location.href).origin;
  var css = "#bebe-btn{position:fixed;right:20px;bottom:20px;z-index:2147483000;width:62px;height:62px;border-radius:50%;border:2px solid #D4AF37;background:radial-gradient(circle at 35% 30%,#1d3266,#0B1A3A);color:#D4AF37;font-size:28px;cursor:pointer;box-shadow:0 6px 24px rgba(11,26,58,.5),0 0 18px rgba(212,175,55,.35)}" +
    "#bebe-btn:focus-visible{outline:3px solid #fff}#bebe-panel{position:fixed;right:20px;bottom:94px;z-index:2147483000;width:min(400px,calc(100vw - 24px));height:min(640px,calc(100vh - 120px));border:1px solid #D4AF37;border-radius:18px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.45);display:none;background:#0B1A3A}" +
    "#bebe-panel.open{display:block}#bebe-panel iframe{width:100%;height:100%;border:0}@media(max-width:480px){#bebe-panel{right:6px;left:6px;width:auto;bottom:88px;height:calc(100vh - 100px)}}";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  var btn = document.createElement("button"); btn.id = "bebe-btn"; btn.type = "button"; btn.setAttribute("aria-label", "Chat with Bebe, Star's AI style assistant"); btn.setAttribute("aria-expanded", "false"); btn.textContent = "\u2726";
  var panel = document.createElement("div"); panel.id = "bebe-panel"; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Bebe AI chat");
  var loaded = false;
  btn.addEventListener("click", function () {
    if (!loaded) {
      var f = document.createElement("iframe");
      f.src = origin + "/?embed=1"; f.title = "Bebe AI chat";
      // The chat page sends Permissions-Policy microphone=(self). This allow
      // delegates the mic into that cross-origin frame from the storefront.
      f.allow = "microphone"; f.setAttribute("allow", "microphone");
      panel.appendChild(f); loaded = true;
    }
    var open = panel.classList.toggle("open"); btn.setAttribute("aria-expanded", String(open)); btn.textContent = open ? "\u00d7" : "\u2726";
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && panel.classList.contains("open")) btn.click(); });
  document.body.appendChild(panel); document.body.appendChild(btn);
})();
