// Bebe 3D avatar: procedural star-orb (navy #0B1A3A + gold #D4AF37). No external models.
// Lazy-loads the self-hosted three.js only when WebGL is available; otherwise a CSS fallback stays visible.
export async function initAvatar(container) {
  const state = { mode: "idle", set(m) { this.mode = m; container.dataset.mode = m; } };
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!gl) return state; // CSS fallback (.avatar-fallback) remains
  let THREE;
  try { THREE = await import("/vendor/three.module.min.js"); } catch { return state; }
  const size = () => container.clientWidth || 160;
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.setSize(size(), size());
  container.querySelector(".avatar-fallback")?.remove();
  container.appendChild(canvas);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  camera.position.set(0, 0, 7);
  const navy = 0x0b1a3a, gold = 0xd4af37;
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const key = new THREE.PointLight(0xfff1c4, 40, 30); key.position.set(3, 3, 5); scene.add(key);
  const bebe = new THREE.Group(); scene.add(bebe);
  // Head/body orb
  const orb = new THREE.Mesh(new THREE.SphereGeometry(1.2, 32, 24), new THREE.MeshStandardMaterial({ color: navy, roughness: 0.35, metalness: 0.4, emissive: navy, emissiveIntensity: 0.4 }));
  bebe.add(orb);
  // Eyes
  const eyeMat = new THREE.MeshBasicMaterial({ color: gold });
  const eyes = [-0.38, 0.38].map(x => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), eyeMat); e.position.set(x, 0.15, 1.1); bebe.add(e); return e; });
  // Mouth (scales while speaking)
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.04, 8, 24, Math.PI), eyeMat);
  mouth.rotation.z = Math.PI; mouth.position.set(0, -0.25, 1.12); bebe.add(mouth);
  // Gold star crown
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.22 : 0.5, a = (i / 10) * Math.PI * 2 + Math.PI / 2; i ? shape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  const star = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 }),
    new THREE.MeshStandardMaterial({ color: gold, metalness: 0.9, roughness: 0.25, emissive: gold, emissiveIntensity: 0.25 }));
  star.position.set(0, 1.55, 0); bebe.add(star);
  // Halo ring + glow
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.03, 8, 64), new THREE.MeshBasicMaterial({ color: gold, transparent: true, opacity: 0.6 }));
  ring.rotation.x = Math.PI / 2.4; bebe.add(ring);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(1.45, 24, 16), new THREE.MeshBasicMaterial({ color: gold, transparent: true, opacity: 0.08, side: THREE.BackSide }));
  bebe.add(glow);
  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(container);
  document.addEventListener("visibilitychange", () => { visible = !document.hidden; });
  addEventListener("resize", () => renderer.setSize(size(), size()));
  const clock = new THREE.Clock(); let blink = 0;
  renderer.setAnimationLoop(() => {
    if (!visible) return;
    const t = clock.getElapsedTime(), m = state.mode;
    bebe.position.y = reduce ? 0 : Math.sin(t * 1.2) * 0.12;
    bebe.rotation.y = reduce ? 0 : Math.sin(t * 0.5) * 0.25;
    star.rotation.y = t * (m === "thinking" ? 3 : 0.8);
    ring.rotation.z = t * (m === "thinking" ? 1.5 : 0.3);
    const pulse = m === "idle" ? 0.08 : 0.18 + Math.sin(t * (m === "speaking" ? 10 : 5)) * 0.08;
    glow.material.opacity = pulse; orb.material.emissiveIntensity = 0.3 + pulse;
    mouth.scale.y = m === "speaking" ? 1 + Math.abs(Math.sin(t * 14)) * 1.6 : 1;
    if (t > blink) { eyes.forEach(e => (e.scale.y = 0.1)); if (t > blink + 0.12) { eyes.forEach(e => (e.scale.y = 1)); blink = t + 2.5 + Math.random() * 3; } }
    renderer.render(scene, camera);
  });
  return state;
}
