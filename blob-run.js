// Mikey and a friend run along the top of the taskbar, hopping faster and faster until they leave the right edge.
// Uses the game's blob shader (blob_vertex/blob_frag.glsl, ported 1:1). Mikey takes his colour from the selected swatch;
// the one chasing him wears the game's "other player" green.
(function () {
  if (!window.THREE || !THREE.GLTFLoader || !window.BLOB_GLB) return;
  const bar = document.querySelector(".taskbar");
  if (!bar) return;
  const PX = 17;                       // pixels per world unit; the blob is about 1.76 units, so about 30px tall
  const H = 96;                        // canvas height in px (room for the hops)

  const VERT = "varying vec3 Normal; varying vec3 WorldPos; varying float ViewDepth;" +
    "void main(){ vec4 world = modelMatrix * vec4(position,1.0); vec4 view = viewMatrix * world; WorldPos = world.xyz; ViewDepth = -view.z;" +
    "Normal = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * view; }";
  const FRAG = "precision highp float; varying vec3 Normal; varying vec3 WorldPos; varying float ViewDepth;" +
    "uniform vec3 colour; uniform vec3 to_light; uniform vec3 light_colour; uniform vec3 ambient; uniform vec3 ambient_ground;" +
    "vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0); }" +
    "void main(){ vec3 normal = normalize(Normal); float n_dot_l = max(dot(normal,to_light),0.0); float wrap = max((dot(normal,to_light)+0.25)/1.25,0.0);" +
    "vec3 diffuse = mix(ambient_ground, ambient, normal.y*0.5+0.5) + light_colour*mix(n_dot_l, wrap, 0.35);" +
    "gl_FragColor = vec4(aces(colour*diffuse),1.0); }";
  const LIGHT = { to_light: new THREE.Vector3(-0.55, 0.40, 0.30).normalize(), light_colour: new THREE.Vector3(2.4, 2.0, 1.55),
    ambient: new THREE.Vector3(0.30, 0.38, 0.55), ambient_ground: new THREE.Vector3(0.22, 0.17, 0.12) };
  function mat(css) {
    const m = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { colour: { value: new THREE.Vector3() },
      to_light: { value: LIGHT.to_light }, light_colour: { value: LIGHT.light_colour }, ambient: { value: LIGHT.ambient }, ambient_ground: { value: LIGHT.ambient_ground } } });
    paint(m, css); return m;
  }
  function paint(m, css) { const c = new THREE.Color(css); m.uniforms.colour.value.set(c.r, c.g, c.b); }   // raw value, as the game feeds it
  function swatchColour() { const s = document.querySelector('.swatches .sw[aria-pressed="true"]'); return s ? getComputedStyle(s).backgroundColor : "#809C94"; }

  const canvas = document.createElement("canvas");     // sits on the taskbar's top edge; they run on that edge
  canvas.style.cssText = "position:absolute;left:0;bottom:100%;width:100%;height:" + H + "px;pointer-events:none;z-index:60";
  bar.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0, 0);
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 40); cam.position.set(0, 0, 20);
  let W = 0, span = 40;
  function resize() {
    W = bar.clientWidth; renderer.setPixelRatio(window.devicePixelRatio || 1); renderer.setSize(W, H, false);
    cam.left = -W / PX / 2; cam.right = W / PX / 2; cam.top = H / PX - 0.1; cam.bottom = -0.1; cam.updateProjectionMatrix();
    span = W / PX + 4;
  }
  resize(); if (window.ResizeObserver) new ResizeObserver(resize).observe(bar);

  const E = { rx: 0.40, ry: 0.88, cy: 0.88 };
  const _v = new THREE.Vector3(), _inv = new THREE.Matrix4();
  let glb = null, font = false;

  // One runner = a blob (body + visor from the GLB), two dangling verlet-rope arms, and a name tag.
  function Runner(name, colourFn) {
    const r = { name, colourFn, yaw: Math.PI / 2, snap: true, pinW: 0, pinTarget: null, pivot: new THREE.Group(), mats: [], arms: [], tag: null, cycle: -1, on: false };
    r.pivot.rotation.order = "ZYX";    // turn to face right first, then tilt in the screen plane
    scene.add(r.pivot);
    return r;
  }
  function build(r) {
    const body = glb.clone(true);
    body.traverse(o => { if (o.isMesh) { const visor = o.name === "visor"; o.material = mat(visor ? "#3B3944" : r.colourFn()); if (!visor) r.mats.push(o.material); } });
    const am = body.getObjectByName("arms"); if (am) am.parent.remove(am);
    r.pivot.add(body);
    const N = 18, YTOP = 1.07, YHAND = 0.22, R = 0.052, RH = 0.08;
    [-1, 1].forEach(side => {
      const t = (YTOP - E.cy) / E.ry, bx = E.rx * Math.sqrt(1 - t * t);
      const anchor = new THREE.Vector3(side * (bx + 0.4 * R), YTOP, 0), pts = [], beads = [];
      for (let i = 0; i < N; i++) {
        const rad = i === N - 1 ? RH : R, m = mat(r.colourFn()); r.mats.push(m);
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), m); mesh.scale.setScalar(rad); scene.add(mesh);
        beads.push(mesh); pts.push({ p: new THREE.Vector3(), q: new THREE.Vector3(), r: rad });
      }
      r.arms.push({ anchor, pts, beads, len: (YTOP - YHAND) / (N - 1), init: false });
    });
  }
  function stepArms(r, dt) {
    _inv.copy(r.pivot.matrixWorld).invert();
    r.arms.forEach(a => {
      const root = a.anchor.clone().applyMatrix4(r.pivot.matrixWorld);
      if (!a.init) { a.pts.forEach((s, i) => { s.p.copy(root); s.p.y -= i * a.len; s.q.copy(s.p); }); a.init = true; }
      a.pts.forEach((s, i) => {
        if (i === 0) { s.p.copy(root); s.q.copy(root); return; }
        const vx = (s.p.x - s.q.x) * 0.97, vy = (s.p.y - s.q.y) * 0.97, vz = (s.p.z - s.q.z) * 0.97;
        s.q.copy(s.p); s.p.x += vx; s.p.y += vy - 20 * dt * dt; s.p.z += vz;
      });
      const hand = a.pts[a.pts.length - 1], pinned = r.pinW > 0 && r.pinTarget && a === r.arms[0];
      if (pinned) hand.p.lerp(r.pinTarget, r.pinW);
      for (let it = 0; it < 8; it++) {
        for (let i = 1; i < a.pts.length; i++) {
          const A = a.pts[i - 1], B = a.pts[i]; _v.subVectors(B.p, A.p); const d = _v.length() || 1e-6, k = (d - a.len) / d;
          if (i === 1) B.p.addScaledVector(_v, -k); else { A.p.addScaledVector(_v, k * 0.5); B.p.addScaledVector(_v, -k * 0.5); }
        }
        a.pts[0].p.copy(root);
        if (pinned) hand.p.lerp(r.pinTarget, Math.min(1, r.pinW * 1.5));
        for (let i = 1; i < a.pts.length; i++) {            // stay outside the body
          const s = a.pts[i], l = s.p.clone().applyMatrix4(_inv), ex = E.rx + s.r * 0.6, ey = E.ry + s.r * 0.6;
          const k = Math.hypot(l.x / ex, (l.y - E.cy) / ey, l.z / ex);
          if (k < 1) { const f = 1 / Math.max(k, 1e-4); l.set(l.x * f, E.cy + (l.y - E.cy) * f, l.z * f); s.p.copy(l.applyMatrix4(r.pivot.matrixWorld)); }
        }
      }
      a.pts.forEach((s, i) => a.beads[i].position.copy(s.p));
    });
  }

  // Name tag in the site's own pixel font, white with a black outline, floating above the head.
  function makeTag(name) {
    const c = document.createElement("canvas"), x = c.getContext("2d"), F = "16px 'MGPixel', monospace";
    x.font = F; const w = Math.ceil(x.measureText(name).width) + 10, h = 26; c.width = w; c.height = h;
    x.font = F; x.textBaseline = "middle"; x.fillStyle = "#000";
    for (const [dx, dy] of [[-2,-2],[0,-2],[2,-2],[-2,0],[2,0],[-2,2],[0,2],[2,2]]) x.fillText(name, 5 + dx, h / 2 + dy);
    x.fillStyle = "#fff"; x.fillText(name, 5, h / 2);
    const tx = new THREE.CanvasTexture(c); tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.NearestFilter;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthTest: false }));
    s.scale.set(w / 2 / PX, h / 2 / PX, 1); return s;
  }

  // The choreography. Mikey (A) runs in, speeding up. Sean (B) starts 2s later, sprints to catch up, leaps, grabs Mikey in
  // mid-air and pulls him back; they circle each other for about a second, then both run off to the right.
  const A_STRIDE = 2.0, B_STRIDE = 3.2, HOP_H = 1.0, B_START = 2.0, T1 = 4.8, PULL = 0.75, CIRCLE = 1.05, CYCLE = 17;
  const R0 = 0.5, R1 = 0.95, GAP = 1.2, RECOIL = 0.25, BODY_MID = 0.88;
  const runners = [Runner("Mikey", swatchColour), Runner("Sean", () => "#20C040")];
  const A = runners[0], B = runners[1];
  const ease = x => x * x * (3 - 2 * x), clamp01 = x => Math.max(0, Math.min(1, x));
  const grabTarget = new THREE.Vector3(), HALF_PI = Math.PI / 2;
  function place(r, p) {
    r.pivot.position.set(p.x, p.y, p.z);
    let d = p.yaw - r.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); r.yaw += d * (r.snap ? 1 : 0.35); r.snap = false;   // turn smoothly
    r.pivot.rotation.set(0, r.yaw, p.lean);
    r.pivot.scale.set(1 / Math.sqrt(p.sq), p.sq, 1 / Math.sqrt(p.sq));
    r.pivot.updateMatrixWorld(true);
  }
  const hopOf = (x, x0, stride) => { const ph = (((x - x0) / stride) % 1 + 1) % 1; return { h: Math.sin(ph * Math.PI), ph }; };
  const squash = h => 1 - 0.07 * Math.pow(1 - h, 6);
  const GONE = { x: 999, y: 0, z: 0, yaw: HALF_PI, lean: 0, sq: 1 };
  function poseAll(t) {
    const cyc = Math.floor(t / CYCLE), u = t - cyc * CYCLE;
    if (cyc !== A.cycle) { A.cycle = cyc; runners.forEach(r => { r.snap = true; r.yaw = HALF_PI; r.arms.forEach(a => a.init = false); }); }
    const x0 = -span / 2;
    // Mikey covers about half the bar before the grab, nudged so he is at the top of a hop at that moment
    const D = A_STRIDE * (Math.round(span / 2 / A_STRIDE - 0.5) + 0.5), acc = 0.5, v0 = (D - acc * T1 * T1) / T1;
    const xA = uu => x0 + v0 * uu + acc * uu * uu, xg = xA(T1), xT = xg - GAP;      // xT: where Sean is when he grabs
    const bEnd = xT - RECOIL, aEnd = xT + R0 * 2, cx = (aEnd + bEnd) / 2;           // positions after the pull, centre of the circle
    let aP, bP, pin = 0, live = true;
    if (u < T1) {                                                                   // 1. the chase
      const ha = hopOf(xA(u), x0, A_STRIDE);
      aP = { x: xA(u), y: ha.h * HOP_H, z: 0, yaw: HALF_PI, lean: -0.1 - 0.08 * Math.cos(ha.ph * Math.PI), sq: squash(ha.h) };
      if (u >= B_START) {
        const bx = x0 + (xT - x0) * clamp01((u - B_START) / (T1 - B_START)), hb = hopOf(bx, x0, B_STRIDE);
        const ls = clamp01((u - (T1 - 0.45)) / 0.45);                               // the last 0.45s are a leap
        bP = { x: bx, y: hb.h * HOP_H * (1 - ls) + 1.6 * Math.sin(Math.PI * ls), z: 0, yaw: HALF_PI, lean: -0.1 - 0.12 * ls, sq: squash(hb.h) };
        pin = clamp01((ls - 0.3) / 0.7);
      }
    } else if (u < T1 + PULL) {                                                     // 2. grabbed mid-air and hauled back
      const s = clamp01((u - T1) / PULL);
      aP = { x: xg + (aEnd - xg) * ease(s), y: HOP_H * (1 - ease(clamp01(s / 0.7))), z: 0, yaw: HALF_PI, lean: 0.3 * Math.sin(Math.PI * s), sq: 1 };
      bP = { x: xT + (bEnd - xT) * ease(s), y: 0, z: 0, yaw: HALF_PI, lean: -0.15 * (1 - s), sq: 1 - 0.1 * Math.max(0, 1 - s * 4) };
      pin = 1;
    } else if (u < T1 + PULL + CIRCLE) {                                            // 3. circling each other, flat on the screen (2D)
      const s = clamp01((u - T1 - PULL) / CIRCLE), th = 2 * Math.PI * s, bump = Math.sin(Math.PI * s);
      const R = R0 + (R1 - R0) * bump, cy = BODY_MID + 1.0 * bump;                  // swing up into the air and back down
      const at = (ang, phi) => ({ x: cx + R * Math.cos(ang) + BODY_MID * Math.sin(phi), y: cy + R * Math.sin(ang) - BODY_MID * Math.cos(phi) });
      const pa = at(th, th), pb = at(th + Math.PI, th);                             // each body tumbles once as it goes round
      aP = { x: pa.x, y: pa.y, z: 0, yaw: HALF_PI, lean: th, sq: 1 };
      bP = { x: pb.x, y: pb.y, z: 0, yaw: HALF_PI, lean: th, sq: 1 };
      pin = s < 0.65 ? 1 : clamp01((0.85 - s) / 0.2);                               // lets go near the end
    } else {                                                                        // 4. off to the right, one after the other
      const v = u - T1 - PULL - CIRCLE, vb = Math.max(0, v - 0.1), run = (x, vv) => x + 4 * vv + 9 * vv * vv;
      const ha = hopOf(run(aEnd, v), aEnd, A_STRIDE), hb = hopOf(run(bEnd, vb), bEnd, A_STRIDE);
      aP = { x: run(aEnd, v), y: ha.h * HOP_H * 0.9, z: 0, yaw: HALF_PI, lean: -0.12, sq: 1 };
      bP = { x: run(bEnd, vb), y: hb.h * HOP_H * 0.9, z: 0, yaw: HALF_PI, lean: -0.12, sq: 1 };
      live = Math.min(aP.x, bP.x) < span / 2 + 3;
    }
    place(A, aP); place(B, bP || GONE);
    A.on = aP.x < 900 && live; B.on = !!bP && live;
    if (pin > 0 && bP) { grabTarget.set(0, 0.95, -0.32); A.pivot.localToWorld(grabTarget); B.pinTarget = grabTarget; }
    B.pinW = bP ? pin : 0;
  }

  const params = new URLSearchParams(location.search), fixedT = params.has("runT") ? +params.get("runT") : null;
  let last = 0, lastColour = "", lastCheck = 0, wasOn = false, warmed = false;
  function frame(ms) {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    if (ms - lastCheck > 200) { lastCheck = ms; const c = swatchColour(); if (c !== lastColour) { lastColour = c; A.mats.forEach(m => paint(m, c)); } }
    const dt = Math.min(0.033, (ms - last) / 1000 || 0.016); last = ms;
    if (fixedT !== null) {
      if (!warmed) { warmed = true; for (let s = fixedT - 1.5; s < fixedT; s += 0.016) { poseAll(s); runners.forEach(r => stepArms(r, 0.016)); } }
      poseAll(fixedT);
    } else {
      const t = ms / 1000;
      for (let i = 1; i <= 3; i++) { poseAll(t - dt + dt * i / 3); runners.forEach(r => stepArms(r, dt / 3)); }
    }
    runners.forEach(r => {
      if (!r.tag && font) { r.tag = makeTag(r.name); scene.add(r.tag); }
      if (r.tag) r.tag.position.set(r.pivot.position.x, Math.max(r.pivot.position.y, 0) + 2.0, 0);
    });
    const on = runners.some(r => r.on);
    if (on || wasOn || fixedT !== null) renderer.render(scene, cam);   // one last render clears the canvas once everyone has left
    wasOn = on;
  }

  const gl = new THREE.GLTFLoader();
  gl.parse(Uint8Array.from(atob(window.BLOB_GLB), c => c.charCodeAt(0)).buffer, "", g => {
    glb = g.scene; runners.forEach(build);
    (document.fonts && document.fonts.load ? document.fonts.load("16px MGPixel") : Promise.resolve()).catch(() => {}).then(() => { font = true; });
    requestAnimationFrame(frame);
  }, () => {});
})();
