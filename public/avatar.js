// Procedural gothic-kawaii chibi. three.js is the self-hosted MIT build in /vendor.
// No model download. If WebGL or the module fails, the CSS star mascot stays.
export async function initAvatar(container) {
  const state = { mode: "idle", set(m) { this.mode = m; container.dataset.mode = m; } };
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  container.dataset.motion = reduce ? "reduce" : "full";
  const probe = document.createElement("canvas");
  const gl = probe.getContext("webgl2", { antialias: false, failIfMajorPerformanceCaveat: false })
    || probe.getContext("webgl", { antialias: false, failIfMajorPerformanceCaveat: false });
  if (!gl) return state;
  let THREE;
  try { THREE = await import("/vendor/three.module.min.js"); }
  catch { return state; }

  let renderer;
  try {
    const mobile = matchMedia("(max-width: 720px)").matches;
    renderer = new THREE.WebGLRenderer({ canvas: probe, context: gl, antialias: !mobile, alpha: true, powerPreference: "low-power" });
    renderer.setPixelRatio(mobile ? 1 : Math.min(devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x000000, 0);
  } catch { return state; }

  container.querySelector(".avatar-fallback")?.remove();
  container.appendChild(probe);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 30);
  camera.position.set(0, 0.42, 4.7);
  camera.lookAt(0, 0.12, 0);
  scene.add(new THREE.AmbientLight(0xfff4ea, 0.85));
  const key = new THREE.DirectionalLight(0xfff1d0, 1.35);
  key.position.set(2.2, 3.2, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0xff9ad5, 0.35);
  rim.position.set(-2.5, 1.2, -2); scene.add(rim);

  const skin = new THREE.MeshLambertMaterial({ color: 0xf3c7b6 });
  const hairM = new THREE.MeshLambertMaterial({ color: 0x140e1c });
  const dressM = new THREE.MeshLambertMaterial({ color: 0x0b1a3a });
  const goldM = new THREE.MeshLambertMaterial({ color: 0xd4af37, emissive: 0x5c4816 });
  const pinkM = new THREE.MeshLambertMaterial({ color: 0xff9ad5 });
  const whiteM = new THREE.MeshBasicMaterial({ color: 0xfff8f4 });
  const irisM = new THREE.MeshBasicMaterial({ color: 0x3a2158 });
  const lineM = new THREE.MeshBasicMaterial({ color: 0x1a1020 });

  const bebe = new THREE.Group();
  scene.add(bebe);
  const add = (obj, x, y, z) => { if (x != null) obj.position.set(x, y, z); bebe.add(obj); return obj; };

  const head = add(new THREE.Mesh(new THREE.SphereGeometry(0.72, 24, 18), skin), 0, 0.72, 0);
  head.scale.set(1, 1.06, 0.92);

  const hair = add(new THREE.Mesh(new THREE.SphereGeometry(0.76, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.58), hairM), 0, 0.9, -0.02);
  const bangs = add(new THREE.Mesh(new THREE.SphereGeometry(0.46, 16, 10), hairM), 0, 1.05, 0.38);
  bangs.scale.set(1.45, 0.42, 0.55);
  const fringe = add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), hairM), 0.22, 0.95, 0.55);
  fringe.scale.set(0.7, 1.1, 0.45);

  function tail(x) {
    const g = new THREE.Group();
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), hairM);
    const lock = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), hairM);
    lock.scale.set(0.72, 1.7, 0.65); lock.position.y = -0.42;
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.035, 6, 14), pinkM);
    bow.rotation.y = Math.PI / 2; bow.position.set(0, -0.02, 0.12);
    g.add(bun, lock, bow); g.position.set(x, 0.78, 0.22); g.rotation.z = x > 0 ? 0.35 : -0.35; bebe.add(g); return g;
  }
  const tails = [tail(-0.78), tail(0.78)];

  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.045 : 0.13, a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    i ? starShape.lineTo(x, y) : starShape.moveTo(x, y);
  }
  const star = add(new THREE.Mesh(new THREE.ExtrudeGeometry(starShape, { depth: 0.05, bevelEnabled: false }), goldM), 0.46, 1.18, 0.62);
  star.scale.setScalar(1.35);

  function eye(x) {
    const g = new THREE.Group();
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), whiteM);
    white.scale.set(1.15, 1.35, 0.45);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.078, 12, 8), irisM);
    iris.position.z = 0.07;
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), lineM);
    pupil.position.z = 0.1;
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.026, 6, 6), whiteM);
    shine.position.set(0.035, 0.04, 0.12);
    g.add(white, iris, pupil, shine);
    g.position.set(x, 0.78, 0.58);
    bebe.add(g);
    return g;
  }
  const eyes = [eye(-0.26), eye(0.26)];

  const mouth = add(new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), new THREE.MeshBasicMaterial({ color: 0xc45b73 })), 0, 0.46, 0.64);
  mouth.scale.set(1.5, 0.42, 0.35);
  const mouthBaseY = 0.42;
  add(new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff9ad5, transparent: true, opacity: 0.7 })), -0.4, 0.58, 0.6).scale.set(1.2, 0.65, 0.25);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff9ad5, transparent: true, opacity: 0.7 })), 0.4, 0.58, 0.6).scale.set(1.2, 0.65, 0.25);

  const dress = add(new THREE.Mesh(new THREE.ConeGeometry(0.78, 1.2, 22), dressM), 0, -0.42, 0);
  const hem = add(new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.028, 6, 28), goldM), 0, -0.98, 0);
  hem.rotation.x = Math.PI / 2;
  const choker = add(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.028, 6, 18), goldM), 0, 0.12, 0.16);
  choker.rotation.x = Math.PI / 2.2;
  const bow = add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), pinkM), 0, 0.16, 0.36);
  bow.scale.set(1.6, 0.7, 0.5);

  function arm(x) {
    const a = add(new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.42, 8), skin), x, -0.02, 0.1);
    a.rotation.z = x > 0 ? -0.4 : 0.4;
    return a;
  }
  arm(-0.5); arm(0.5);

  const shadow = add(new THREE.Mesh(new THREE.CircleGeometry(0.7, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 })), 0, -1.08, 0);
  shadow.rotation.x = -Math.PI / 2;

  function fit() {
    const w = container.clientWidth || 240, h = container.clientHeight || 260;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  }
  fit();
  if (window.ResizeObserver) new ResizeObserver(fit).observe(container);
  else addEventListener("resize", fit);

  let onScreen = true, pageVisible = true;
  new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; }).observe(container);
  document.addEventListener("visibilitychange", () => { pageVisible = !document.hidden; });

  const clock = new THREE.Clock();
  let blinkAt = 1.6;
  function pose(t) {
    const m = state.mode;
    const sway = reduce ? 0 : Math.sin(t * 0.7) * 0.12;
    bebe.rotation.y = sway;
    bebe.position.y = reduce ? 0 : Math.sin(t * 1.5) * 0.035;
    tails.forEach((g, i) => { g.rotation.z = reduce ? 0 : Math.sin(t * 1.1 + i) * 0.06; });
    star.rotation.z = reduce ? 0 : t * (m === "thinking" ? 1.6 : 0.35);
    const talk = m === "speaking" && !reduce;
    mouth.scale.y = talk ? 0.35 + Math.abs(Math.sin(t * 14)) * 1.15 : 0.42;
    mouth.position.y = talk ? mouthBaseY - 0.01 : mouthBaseY;
    if (!reduce && t > blinkAt) {
      const shut = t < blinkAt + 0.12;
      eyes.forEach((e) => { e.scale.y = shut ? 0.08 : 1; });
      if (!shut) blinkAt = t + 2.4 + Math.random() * 2.8;
    }
  }
  pose(0);
  renderer.render(scene, camera);
  if (!reduce) {
    renderer.setAnimationLoop(() => {
      if (!onScreen || !pageVisible) return;
      pose(clock.getElapsedTime());
      renderer.render(scene, camera);
    });
  } else {
    const prev = state.set.bind(state);
    state.set = (m) => { prev(m); pose(0); renderer.render(scene, camera); };
  }
  return state;
}
