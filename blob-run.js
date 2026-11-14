// Nobody is there until you press the MIDDLE MOUSE BUTTON (the game's hook key), or triple-tap on a phone or iPad: then the crowd comes
// out for about 25 seconds, and each further press keeps them out longer; when time is up they run off the nearest edge and the page is clear again.
// Six blobs bunny-hop along the top of the taskbar, Counter-Strike style: long constant-airtime jumps, no friction, a bit more speed
// on every landing, and air-strafing S-curves that weave them in and out of depth. Nothing is scripted: each is a little agent that
// runs about, turns round at random, hunts down another, grabs it, tugs it in while it fights back, then flings it off or lets go. They pass straight
// through each other. Every jump makes a runner faster; being grabbed (or grabbing) drops it back to a sprint; a grab can end
// with the two circling each other (a circle in the floor plane, so from the side it reads as running back and forth in depth). Ravn sometimes
// crosses the screen in two huge leaps, and Mikey sometimes gets grabbed by the viewer instead.
// Uses the game's blob shader (blob_vertex/blob_frag.glsl, ported 1:1). Every blob gets a new random colour each time it appears.
// Page options: ?cam=1 forces Mikey's viewer-grab, ?runT=<seconds> jumps to a fixed moment (for checking).
(function () {
  if (!window.THREE || !THREE.GLTFLoader || !window.BLOB_GLB) return;
  const PX = 40;                       // pixels per world unit; the blob is about 1.76 units, so about 70px tall
  const H = 200;                       // canvas height in px
  const TASKBAR = 30;                  // the taskbar's height: they run along its top edge

  // The game's blob shader (assets/shaders/blob_vertex.glsl, blob_frag.glsl) with the "beach" map's lighting; colour is used raw.
  const VERT = "varying vec3 Normal;" +
    "void main(){ Normal = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position,1.0); }";
  const FRAG = "precision highp float; varying vec3 Normal;" +
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
  function paint(m, css) { const c = new THREE.Color(css); m.uniforms.colour.value.set(c.r, c.g, c.b); }

  const canvas = document.createElement("canvas");     // full width, sitting on the taskbar, never catches the pointer
  canvas.style.cssText = "position:fixed;left:0;bottom:" + TASKBAR + "px;width:100%;height:" + H + "px;pointer-events:none;z-index:3000";
  document.body.appendChild(canvas);
  // The hands: the game's grabbed.png (split in two), redrawn as dithered pixel art in four tones of Mikey's own shaded colour.
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], CELL = 5;
  const handSrc = {}, handDrawn = { rgb: null };
  const hands = ["left", "right"].map(side => {
    const cv = document.createElement("canvas");
    cv.style.cssText = "position:fixed;top:0;height:100vh;width:auto;image-rendering:pixelated;pointer-events:none;z-index:3100;will-change:transform;" +
      "opacity:0;transition:opacity .2s linear;" + side + ":0;";
    document.body.appendChild(cv);
    const im = new Image(); im.onload = () => { if (handDrawn.rgb) drawHands(handDrawn.rgb); }; im.src = "images/grabbed-" + side + ".png"; handSrc[side] = im;
    return cv;
  });
  function drawHands(rgb) {                                                         // rgb: Mikey's shaded colour, [r,g,b]
    handDrawn.rgb = rgb;
    const tones = [0.5, 0.74, 1, 1.3].map(k => rgb.map(c => Math.round(Math.min(255, k <= 1 ? c * k : c + (255 - c) * (k - 1) * 1.2)))), dark = [0x2a, 0x08, 0x08];
    ["left", "right"].forEach((side, n) => {
      const img = handSrc[side]; if (!img || !img.complete || !img.naturalWidth) return;
      const w = Math.floor(img.naturalWidth / CELL), h = Math.floor(img.naturalHeight / CELL), q = document.createElement("canvas"); q.width = w; q.height = h;
      const qx = q.getContext("2d"); qx.drawImage(img, 0, 0, w, h); const src = qx.getImageData(0, 0, w, h).data;
      const solid = new Uint8Array(w * h), lum = new Float32Array(w * h), all = [];
      for (let i = 0; i < w * h; i++) if (src[i * 4 + 3] > 110) { solid[i] = 1; lum[i] = 0.299 * src[i * 4] + 0.587 * src[i * 4 + 1] + 0.114 * src[i * 4 + 2]; all.push(lum[i]); }
      all.sort((a, b) => a - b); const lo = all[Math.floor(all.length * 0.06)], hi = all[Math.floor(all.length * 0.97)];
      const c = hands[n]; c.width = w; c.height = h; const x = c.getContext("2d"), out = x.createImageData(w, h), at = (i, j) => (i < 0 || j < 0 || i >= w || j >= h) ? 0 : solid[j * w + i];
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const k = j * w + i, o = k * 4; if (!solid[k]) continue;
        let col;
        if (!at(i - 1, j) || !at(i + 1, j) || !at(i, j - 1) || !at(i, j + 1)) col = dark;                       // a dark outline, like the page's pixel art
        else { const l = Math.max(0, Math.min(1, (lum[k] - lo) / (hi - lo))), lvl = Math.max(0, Math.min(3, Math.floor(l * 4 + ((BAYER[(j % 4) * 4 + (i % 4)] + 0.5) / 16 - 0.5) * 1.3))); col = tones[lvl]; }
        out.data[o] = col[0]; out.data[o + 1] = col[1]; out.data[o + 2] = col[2]; out.data[o + 3] = 255;
      }
      x.putImageData(out, 0, 0);
    });
  }
  let handsShown = false;
  let curPull = 0, wantFull = false;                                                                 // how far the hands have been dragged inward (0..1)
  function showHands(on) { hands.forEach(im => { im.style.opacity = on ? "1" : "0"; }); }      // the hands never move: they just appear where they are once his arms have reached the edges
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0, 0);
  const scene = new THREE.Scene();
  // A view angle without any tilt: the camera sits above the floor but looks straight ahead and the lens is shifted down, so every
  // vertical stays vertical (a camera pitched down would make the blobs lean toward the edges of the screen).
  const FOV = 4, RISE = 0.31;                                   // degrees of lens; how steeply we look down at the floor (a slope)
  const cam = new THREE.PerspectiveCamera(FOV, 1, 0.1, 400);
  let span = 40, layoutVersion = 0;                              // span: how many world units fit across the screen
  let full = false, V = null;                                    // full: the canvas covers the whole screen (while Mikey grows to fill it); V: the camera set-up
  function applyView() {                                         // same camera, same scale on the floor line; only the window onto the scene gets taller
    const W = V.W, Hc = full ? window.innerHeight : H, bottomPx = full ? 0 : TASKBAR;
    canvas.style.height = Hc + "px"; canvas.style.bottom = bottomPx + "px";
    renderer.setPixelRatio(window.devicePixelRatio || 1); renderer.setSize(W, Hc, false);
    const yb = V.yb + (bottomPx - TASKBAR) / PX, yt = yb + Hc / PX, near = V.near, right = near * V.t * (W / H);
    cam.position.set(0, V.camY, V.d);
    cam.projectionMatrix.makePerspective(-right, right, near * (yt - V.camY) / V.d, near * (yb - V.camY) / V.d, near, 400); cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  }
  function resize() {
    layoutVersion++;
    const W = document.documentElement.clientWidth;
    const vh = H / PX, target = new THREE.Vector3(0, vh / 2 - 0.1, 0);
    const t = Math.tan(FOV * Math.PI / 360), near = 0.1, d = (vh / 2) / t;
    V = { W, t, near, d, camY: target.y + d * RISE, yb: target.y - vh / 2 };
    applyView();
    span = W / PX + 4;
  }
  resize(); window.addEventListener("resize", resize);

  const E = { rx: 0.40, ry: 0.88, cy: 0.88 };                    // the body ellipsoid (the arms stay outside it)
  const _v = new THREE.Vector3(), _rest = new THREE.Vector3(), _inv = new THREE.Matrix4();
  let glb = null, font = false;

  // The shadow is an ellipse of ordered-dither dots: solid in the middle, thinning to nothing at the edge, drawn crisp.
  let _shadowTex = null;
  function shadowTex() {
    if (_shadowTex) return _shadowTex;
    const N = 40, c = document.createElement("canvas"); c.width = c.height = N; const x = c.getContext("2d"), img = x.createImageData(N, N);
    const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const d = Math.hypot((i + 0.5 - N / 2) / (N / 2), (j + 0.5 - N / 2) / (N / 2)), cover = Math.max(0, 1 - d) * 1.6, th = (bayer[(j % 4) * 4 + (i % 4)] + 0.5) / 16;
      const k = (j * N + i) * 4; img.data[k] = 0x2a; img.data[k + 1] = 0x08; img.data[k + 2] = 0x08; img.data[k + 3] = cover > th ? 255 : 0;
    }
    x.putImageData(img, 0, 0);
    _shadowTex = new THREE.CanvasTexture(c); _shadowTex.magFilter = THREE.NearestFilter; _shadowTex.minFilter = THREE.NearestFilter; return _shadowTex;
  }

  // One runner = a blob (body + visor from the GLB), two verlet-rope arms hanging from the shoulders, a shadow and a name tag.
  function Runner(name) {
    const r = { name, yaw: Math.PI / 2, snap: true, pivot: new THREE.Group(), mats: [], arms: [], tag: null, on: false };
    r.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, opacity: 0.2, depthWrite: false }));
    scene.add(r.shadow);
    scene.add(r.pivot);
    return r;
  }
  function build(r) {
    const body = glb.clone(true);
    body.traverse(o => { if (o.isMesh) { const visor = o.name === "visor"; o.material = mat(visor ? "#3B3944" : "#808080"); if (!visor) r.mats.push(o.material); } });
    const am = body.getObjectByName("arms"); if (am) am.parent.remove(am);      // the GLB's fixed arms are replaced by the rope arms
    r.pivot.add(body);
    const N = 30, YTOP = 1.07, YHAND = 0.22, R = 0.052, RH = 0.08;
    [-1, 1].forEach(side => {
      const t = (YTOP - E.cy) / E.ry, bx = E.rx * Math.sqrt(1 - t * t);
      const anchor = new THREE.Vector3(side * (bx + 0.4 * R), YTOP, 0), pts = [], beads = [], rest = [];
      for (let i = 0; i < N; i++) {
        const rad = i === N - 1 ? RH : R, m = mat("#808080"); r.mats.push(m);
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), m); mesh.scale.setScalar(rad); scene.add(mesh);
        beads.push(mesh); pts.push({ p: new THREE.Vector3(), q: new THREE.Vector3(), r: rad });
        const yy = YTOP + (YHAND - YTOP) * i / (N - 1), tt = (yy - E.cy) / E.ry;
        rest.push(new THREE.Vector3(side * (E.rx * Math.sqrt(Math.max(0, 1 - tt * tt)) + 0.4 * rad), yy, 0));      // where the bead hangs on the flank
      }
      r.arms.push({ anchor, pts, beads, rest, len: (YTOP - YHAND) / (N - 1), len0: (YTOP - YHAND) / (N - 1), init: false, pinW: 0, pinTarget: null });
    });
  }
  function link(a, root) {                                 // keep neighbouring beads one segment apart, with the shoulder fixed
    a.pts[0].p.copy(root);
    for (let i = 1; i < a.pts.length; i++) {
      const A = a.pts[i - 1], B = a.pts[i]; _v.subVectors(B.p, A.p); const d = _v.length() || 1e-6, k = (d - a.len) / d;
      if (i === 1) B.p.addScaledVector(_v, -k); else { A.p.addScaledVector(_v, k * 0.5); B.p.addScaledVector(_v, -k * 0.5); }
    }
    a.pts[0].p.copy(root);
  }
  function stepArms(r, dt) {
    _inv.copy(r.pivot.matrixWorld).invert();
    r.arms.forEach(a => {
      const pw = a.pinW, pt = a.pinTarget, pinned = pw > 0 && pt;                      // pinned: the hand is reaching for pt
      a.len = a.len0 * (1 + (a.reachK || 2.2) * pw);                                   // a reaching arm stretches out
      const root = a.anchor.clone().applyMatrix4(r.pivot.matrixWorld);
      if (!a.init) { a.pts.forEach((s, i) => { s.p.copy(root); s.p.y -= i * a.len; s.q.copy(s.p); }); a.init = true; }
      a.pts.forEach((s, i) => {
        if (i === 0) { s.p.copy(root); s.q.copy(root); return; }
        const vx = (s.p.x - s.q.x) * 0.97, vy = (s.p.y - s.q.y) * 0.97, vz = (s.p.z - s.q.z) * 0.97;
        s.q.copy(s.p); s.p.x += vx * 0.6; s.p.y += vy * 0.6 - 20 * dt * dt; s.p.z += vz * 0.6;
        s.p.lerp(_rest.copy(a.rest[i]).applyMatrix4(r.pivot.matrixWorld), 0.5 * (1 - pw));   // spring back to the flank
      });
      const hand = a.pts[a.pts.length - 1];
      if (pinned) hand.p.lerp(pt, pw);
      for (let it = 0; it < 12; it++) {
        link(a, root);
        if (pinned) hand.p.lerp(pt, Math.min(1, pw * 1.5));
        for (let i = 1; i < a.pts.length; i++) {            // stay outside the body
          const s = a.pts[i], l = s.p.clone().applyMatrix4(_inv), ex = E.rx + s.r * 0.6, ey = E.ry + s.r * 0.6;
          const k = Math.hypot(l.x / ex, (l.y - E.cy) / ey, l.z / ex);
          if (k < 1) { const f = 1 / Math.max(k, 1e-4); l.set(l.x * f, E.cy + (l.y - E.cy) * f, l.z * f); s.p.copy(l.applyMatrix4(r.pivot.matrixWorld)); }
        }
      }
      const tether = () => { if (pinned) return; a.pts.forEach((s, i) => {          // a bead may only drift a little from its place on the body
        _rest.copy(a.rest[i]).applyMatrix4(r.pivot.matrixWorld);
        const lim = 0.04 + 0.2 * i / (a.pts.length - 1);
        _v.subVectors(s.p, _rest); const d = _v.length(); if (d > lim) s.p.copy(_rest).addScaledVector(_v, lim / d);
      }); };
      tether();
      for (let it = 0; it < 4; it++) link(a, root);
      tether();
      const long = a.len > a.len0 * 1.6;                                               // a stretched arm: each bead lengthens along the arm so it stays one solid rope
      a.pts.forEach((s, i) => {
        const m = a.beads[i]; m.position.copy(s.p);
        if (long && i < a.pts.length - 1) { m.lookAt(a.pts[i + 1].p); m.scale.set(s.r, s.r, Math.max(s.r, a.len * 0.62)); }
        else { m.rotation.set(0, 0, 0); m.scale.setScalar(s.r); }
      });
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
    s.scale.set(w * 0.8 / PX, h * 0.8 / PX, 1); return s;
  }

  // ---- the crowd ---------------------------------------------------------------------------------------------------
  const HALF_PI = Math.PI / 2, FACE_R = HALF_PI - 0.45, FACE_L = -HALF_PI + 0.45;      // turned a little toward the camera
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x)), ease = x => x * x * (3 - 2 * x), sgn = x => (x < 0 ? -1 : 1);
  const params = new URLSearchParams(location.search);
  const fixedT = params.has("runT") ? +params.get("runT") : null, forceCam = params.has("cam");
  let rs = fixedT !== null ? 12345 : (Date.now() & 0xffffff);
  const rnd = () => { rs = (rs + 0x6D2B79F5) >>> 0; let t = rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const rr = (lo, hi) => lo + (hi - lo) * rnd();
  let simT = 0, handsOn = false, activeUntil = fixedT !== null ? Infinity : 0;      // when the crowd must be gone again (?runT= checks always have them out)
  const grabTarget = new THREE.Vector3();

  const runners = ["Mikey", "Sean", "Brodus", "Jess", "Ravn", "Oskii"].map(Runner);
  const BASE = { Mikey: 7.5, Sean: 8.2, Brodus: 8.8, Jess: 7.0, Ravn: 7.8, Oskii: 7.6 };   // everyone starts at a sprint (world units per second)

  function place(r, p) {
    r.pivot.position.set(p.x, p.y, p.z);
    let d = p.yaw - r.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); r.yaw += d * (r.snap ? 1 : 0.35); r.snap = false;   // turn smoothly
    r.pivot.rotation.set(0, r.yaw, 0);                                                // always upright: only a speed, no tilt
    const big = p.big || 1;                                                           // big: Mikey growing to fill the screen
    r.pivot.scale.set(big / Math.sqrt(p.sq), big * p.sq, big * (1 / Math.sqrt(p.sq)) * (p.stretch || 1));      // stretch: streaked along the run at speed
    r.pivot.updateMatrixWorld(true);
  }

  // st: gone | run | hunt | grab (holding someone) | grabbed | orbit (circling the other) | dazed | leap (Ravn) | cam (Mikey, grabbed by the viewer)
  const crowd = runners.map((r, i) => ({ r, name: r.name, base: BASE[r.name], x: 0, y: 0, z: 0, vx: 0, vy: 0, st: "gone", t: 0.4 + i * 0.5 + rnd() * 0.7,
    free: 0, cd: 0, dir: 1, turn: 1, zt: 0, yawT: FACE_R, sq: 1, stretch: 1, land: 0, tgt: null, par: null, side: 1, d0: 2, dur: 1, out: "",
    hopK: 0.86 + rnd() * 0.3, back: 0, sp: 0, hd: 0, sw: 1, lunged: false, oc: 0, oz: 0, oR: 1, oth: 0, ow: 8, ot: 0, od: 1, ct: 0, camDone: false, lt: 0, ldir: 1, lx0: 0, camAfter: 0, pinK: 0 }));
  const mul = a => 1 + Math.min(a.free * 0.22, 2);
  const topSpeed = a => a.base * mul(a);
  const similar = (a, o) => Math.abs(topSpeed(a) - topSpeed(o)) < 0.22 * Math.max(topSpeed(a), topSpeed(o));      // they only go for each other when they are running at about the same speed                                 // every jump on the run adds speed (a.free counts them)

  function litCss(c) {                                                             // the colour the shader shows where a surface faces the camera
    const n = new THREE.Vector3(0.2, -0.1, 1).normalize(), ndl = Math.max(n.dot(LIGHT.to_light), 0), wrap = Math.max((n.dot(LIGHT.to_light) + 0.25) / 1.25, 0), k = ndl + (wrap - ndl) * 0.35, t = n.y * 0.5 + 0.5;
    const ch = (v, g, am, lc) => { const x = v * (g + (am - g) * t + lc * k); return Math.round(255 * clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0, 1)); };
    return "rgb(" + [ch(c.r, LIGHT.ambient_ground.x, LIGHT.ambient.x, LIGHT.light_colour.x), ch(c.g, LIGHT.ambient_ground.y, LIGHT.ambient.y, LIGHT.light_colour.y), ch(c.b, LIGHT.ambient_ground.z, LIGHT.ambient.z, LIGHT.light_colour.z)].join(",") + ")";
  }
  function spawn(a) {
    const col = a.col = new THREE.Color().setHSL(rnd(), rr(0.55, 0.85), rr(0.42, 0.6)); a.r.mats.forEach(m => paint(m, col));      // a new colour every time
    const side = rnd() < 0.5 ? -1 : 1;
    a.x = side * (span / 2 + 1.5); a.z = rr(-0.6, 0.7); a.dir = -side; a.vx = a.dir * a.base; a.sp = a.base; a.hd = 0; a.sw = rnd() < 0.5 ? 1 : -1; a.y = rr(0, 0.5); a.vy = rr(-3, 6);   // each starts at its own point in a bounce
    a.camPlan = a.name === "Mikey" && rnd() < 0.2; a.st = "run"; a.free = 0; a.cd = 0.8; a.turn = rr(0.8, 2.2); a.zt = rr(-0.7, 0.8); a.stretch = 1; a.par = a.tgt = null;
  }
  function hop(a, dt, moving, small) {                      // gravity, and a jump again the instant it lands (a bunny-hop). Returns true on landing
    a.vy -= 19 * a.hopK * dt; a.y += a.vy * dt;             // constant gravity: the same long airtime at any speed, so faster means longer leaps. Each has its own rhythm (hopK)
    let landed = false;
    if (a.y <= 0) {
      landed = true; a.y = 0; if (a.vy < -2) a.land = 0.1;
      if (moving && !small) a.free += 1;                    // a clean hop: another bit of speed, and nothing slows it on the ground
      a.vy = moving ? (small ? rr(2.4, 3.8) : rr(4.8, 5.6)) : 0;
    }
    a.land = Math.max(0, a.land - dt);
    return landed;
  }
  const onScreen = a => a.st !== "gone" && Math.abs(a.x) < span / 2;
  function leave(a) { a.st = "gone"; a.t = rr(0.6, 2.2); a.par = a.tgt = null; }                // off one side of the screen; back later from either side
  function dazed(a, t) { a.back = 0; a.st = "dazed"; a.t = t; a.free = 0; a.par = null; }
  function release(g, T, kind) {                                                   // how a grab ends: flung past, thrown off, or tossed high
    const s = g.side; g.cd = T.cd = 2.6; g.free = T.free = 0; g.par = T.par = null; g.pinK = 0;
    if (kind === "yank") { T.vx = -s * rr(16, 22); T.vy = 6; T.dir = -s; dazed(T, 0.3); g.vx = -s * 2; g.vy = 4; g.dir = s; dazed(g, 0.4); }
    else if (kind === "break") { T.vx = s * rr(14, 19); T.vy = 6.5; T.dir = s; dazed(T, 0.4); g.vx = -s * rr(6, 9); g.vy = 5; g.dir = -s; dazed(g, 0.4); }
    else {                                                                         // they circle each other in the floor plane for a moment
      const cx = clamp((g.x + T.x) / 2, -span / 2 + 2.5, span / 2 - 2.5), cz = (g.z + T.z) / 2, R = Math.max(Math.abs(T.x - g.x) / 2, 0.9), w = (rnd() < 0.5 ? -1 : 1) * rr(7, 9), od = rr(0.9, 1.6);
      for (const a of [g, T]) { a.st = "orbit"; a.oc = cx; a.oz = cz; a.oR = R; a.ow = w; a.ot = 0; a.od = od; a.oth = Math.atan2(a.z - cz, a.x - cx); a.vy = 3; }
      T.oth = g.oth + Math.PI; T.x = cx + R * Math.cos(T.oth); g.x = cx + R * Math.cos(g.oth);
    }
  }
  function startGrab(g, T) {
    g.back = T.back = 0; g.st = "grab"; T.st = "grabbed"; g.par = T; T.par = g; g.t = 0; g.dur = rr(1.0, 1.9); g.side = sgn(T.x - g.x);
    g.d0 = clamp(Math.abs(T.x - g.x), 1.3, 2.6); const q = rnd(); g.out = q < 0.25 ? "yank" : q < 0.5 ? "break" : "circle";
    g.free = T.free = 0; g.vx = 0; g.tgt = null;
  }

  function step(dt) {
    simT += dt;
    for (const a of crowd) {
      a.cd = Math.max(0, a.cd - dt);
      if (a.st === "gone") {
        a.t -= dt; a.camAfter = Math.max(0, a.camAfter - dt);
        if (a.t <= 0 && simT < activeUntil && !window.tightfitSunriseOn) spawn(a);
        continue;
      }
      const spanH = span / 2 + 2;
      if (a.st === "run" || a.st === "hunt") {
        a.back = Math.max(0, a.back - dt);
        let v = a.base * mul(a) * (a.back > 0 ? 1.7 : 1);                       // Ravn, running backwards, is even faster
        const retire = simT > activeUntil;                                          // time is up: head for the nearest edge and leave
        if (retire) { a.dir = sgn(a.x); if (a.st === "hunt") { a.st = "run"; a.tgt = null; } }
        if (a.st === "hunt") {
          const T = a.tgt;
          if (!T || !onScreen(T) || (T.st !== "run" && T.st !== "hunt") || !similar(a, T)) { a.st = "run"; a.tgt = null; a.cd = 0.8; }
          else {
            a.back = 0; const dx = T.x - a.x; a.dir = sgn(dx); v = a.base * 1.5 * mul(a); a.zt = T.z;
            if (Math.abs(dx) < 4 && !a.lunged && a.y === 0) { a.lunged = true; a.vy = 7.5; a.sp = 24; }           // the lunge
            if (Math.abs(dx) <= 2.7 && Math.abs(a.z - T.z) < 0.9 && T.cd <= 0) { startGrab(a, T); continue; }
            a.t -= dt; if (a.t <= 0) { a.st = "run"; a.tgt = null; a.cd = 1; }
          }
        } else {
          a.turn -= dt;
          if (a.turn <= 0) { a.turn = rr(0.5, 1.7) / Math.sqrt(mul(a)); if (!retire && rnd() < 0.55) a.dir = -a.dir; a.zt = rr(-0.7, 0.8); }
          if (!retire && a.cd <= 0 && rnd() < 0.1 * dt) {                                   // feels like grabbing someone
            let best = null, bd = 1e9; for (const o of crowd) if (o !== a && o.st === "run" && o.cd <= 0 && onScreen(o) && similar(a, o)) { const d = Math.abs(o.x - a.x); if (d < bd) { bd = d; best = o; } }
            if (best) { a.st = "hunt"; a.tgt = best; a.t = rr(2.0, 3.5); a.lunged = false; }
          }
          if (!retire && a.name === "Ravn" && a.back <= 0 && rnd() < 0.08 * dt) a.back = rr(2.5, 4.5);      // now and then Ravn runs facing backwards, faster
          if (!retire && a.name === "Ravn" && a.cd <= 0 && rnd() < 0.045 * dt) { a.back = 0; a.st = "leap"; a.lt = 0; a.lx0 = a.x; a.ldir = a.dir; a.free = 0; }
          if (!retire && a.name === "Mikey" && !a.camDone && (forceCam ? simT > 3.4 : a.camPlan && a.free > 6 && rnd() < 0.6 * dt) && Math.abs(a.x) < span * 0.12) { a.st = "cam"; a.ct = 0; a.pull = 0; a.big = 1; a.handsDrawn = false; a.handsReady = false; a.reach = 0; a.camDone = forceCam; }
        }
        if (a.st === "run" || a.st === "hunt") {
          a.sp += (v - a.sp) * Math.min(1, dt * 3);                                  // speed carries from hop to hop
          const hdT = clamp((a.zt - a.z) * 0.5, -0.45, 0.45) + a.sw * 0.14 / Math.sqrt(mul(a));   // air-strafe: an S-curve that swaps sides on every hop
          a.hd += clamp(hdT - a.hd, -5 * dt, 5 * dt);
          a.vx = a.dir * a.sp * Math.cos(a.hd); a.z = clamp(a.z + a.sp * Math.sin(a.hd) * dt, -1.1, 1.2); a.x += a.vx * dt;
          if (a.x * a.dir > 0 && Math.abs(a.x) > span / 2 + 0.5) { if (!retire && rnd() < 0.7) a.dir = -a.dir; else leave(a); }    // at an edge: usually turn back, sometimes run off
          if (a.st === "gone") continue;
          if (hop(a, dt, true, false)) a.sw = -a.sw;
          a.yawT = Math.atan2(a.vx, a.sp * Math.sin(a.hd)) + (a.vx > 0 ? -0.45 : 0.45) + (a.back > 0 ? Math.PI : 0); a.stretch = 1;                // face the way it is really going
        }
      } else if (a.st === "grab") {                                              // plants its feet and reels the other one in
        const T = a.par; a.t += dt; const k = clamp(a.t / a.dur, 0, 1);
        a.vx = 0; hop(a, dt, a.y > 0, false);
        a.yawT = a.side > 0 ? FACE_R : FACE_L; a.pinK = clamp(a.t / 0.22, 0, 1);
        const d = a.d0 + (0.85 - a.d0) * ease(k) + 0.26 * Math.sin(a.t * 16) * (1 - k);         // reeled in by jerks while it fights
        T.x = a.x + a.side * d; T.z += (a.z - T.z) * Math.min(1, dt * 3);
        T.yawT = a.side > 0 ? FACE_R : FACE_L; T.vx = 0;
        hop(T, dt, true, true);                                                  // the victim digs in with little hops
        if (k >= 1) release(a, T, a.out);
      } else if (a.st === "orbit") {                                             // running a circle in the floor plane, facing along it
        a.ot += dt; a.oth += a.ow * dt;
        a.x = a.oc + a.oR * Math.cos(a.oth); a.z = a.oz + a.oR * Math.sin(a.oth);
        const tx = -a.oR * a.ow * Math.sin(a.oth), tz = a.oR * a.ow * Math.cos(a.oth);                 // the way it is heading right now
        a.yawT = Math.atan2(tx, tz); a.stretch = 1;
        hop(a, dt, true, true);
        if (a.ot >= a.od) { a.st = "run"; a.free = 0; a.cd = 2.6; a.sp = Math.max(a.base, Math.hypot(tx, tz)); a.hd = 0; a.dir = sgn(tx); a.zt = clamp(a.z, -0.7, 0.8); a.turn = rr(0.8, 1.6); }
      } else if (a.st === "dazed") {
        a.t -= dt; a.vx *= Math.exp(-dt * 3); a.x += a.vx * dt;
        if (Math.abs(a.x) > spanH) { leave(a); continue; }
        hop(a, dt, false, false);
        a.yawT = (a.dir > 0 ? FACE_R : FACE_L) + 0.6 * Math.sin(a.t * 18);
        if (a.t <= 0) { a.st = "run"; a.free = 0; a.sp = a.base; a.hd = 0; a.turn = rr(0.4, 1.2); a.yawT = a.dir > 0 ? FACE_R : FACE_L; }
      } else if (a.st === "leap") {                                              // Ravn: two enormous jumps across the screen
        a.lt += dt; const d1 = 0.34, gp = 0.10, d2 = 0.32, dr = a.ldir, xm = a.lx0 + dr * span * 0.42, xe = a.lx0 + dr * span * 0.9;
        if (a.lt < d1) { const k = a.lt / d1; a.x = a.lx0 + (xm - a.lx0) * k; a.y = 2.3 * 4 * k * (1 - k); a.sq = 1; a.stretch = 1.9; }
        else if (a.lt < d1 + gp) { a.x = xm; a.y = 0; a.stretch = 1; a.sq = 0.7; }
        else if (a.lt < d1 + gp + d2) { const k = (a.lt - d1 - gp) / d2; a.x = xm + (xe - xm) * k; a.y = 2.1 * 4 * k * (1 - k); a.sq = 1; a.stretch = 1.9; }
        else { a.st = "run"; a.cd = 4; a.stretch = 1; a.dir = dr; a.sp = a.base; a.hd = 0; a.vy = 0; a.turn = rr(0.8, 2); }
        a.yawT = dr > 0 ? FACE_R : FACE_L; a.z = 0.35;
      } else if (a.st === "cam") {                                               // Mikey: stops, faces the camera, reaches out, is hauled toward the viewer and vanishes
        a.ct += dt; const v = a.ct;
        a.vx *= Math.exp(-dt * 9); a.x += a.vx * dt; a.yawT = 0;
        if (!a.handsDrawn) { a.handsDrawn = true; drawHands(litCss(a.col).match(/\d+/g).map(Number)); }
        a.pinK = clamp((v - 0.35) / 0.5, 0, 1);                                  // the arms come up...
        a.reach = clamp((v - 0.9) / 1.5, 0, 1); a.reach = a.reach * a.reach * (3 - 2 * a.reach);   // ...then stretch out to both edges of the screen (slowly)
        a.handsReady = v >= 2.45;                                                // the hands slide in only once the arms are at the edges
        if (v < 0.3) hop(a, dt, false, false);
        else if (v < 3.9) { a.vy = 0; a.y += (0.36 + 0.03 * Math.sin(v * 5) - a.y) * Math.min(1, dt * 7); }   // he stops hopping and hangs about halfway up a jump while he reaches and pulls
        else { const u = Math.min(1, (v - 3.9) / 3.6), kp = Math.pow(u, 2.3); 
          a.z = 0.8 * V.d * kp; a.big = 1 + 9.5 * kp;                              // tiny to giant: he comes toward the camera and swells until his model fills the whole screen
          const yc = V.yb - TASKBAR / PX + window.innerHeight / PX / 2;           // world height of the screen's middle at his depth
          a.y = 0.36 + (V.camY + (yc - V.camY) * (V.d - a.z) / V.d - 0.88 * a.big - 0.36) * kp;
          a.x -= a.x * Math.min(1, dt * (1.2 + 4 * u)); }                         // drifting to the middle of the screen as he grows, so he stays in view; slow at first, then faster and faster
        a.pull = 0;                                                                  // the hands and the arm ends stay put at the screen edges
        if (v >= 7.5) { a.st = "gone"; a.t = rr(2, 3.5); a.camAfter = 0.5; a.pinK = 0; a.z = 0; if (window.tightfitAfterGrab) window.tightfitAfterGrab(litCss(a.col)); }   // the screen fills with his colour, goes black, then the crash
      }
    }
  }

  function placeAll() {
    for (const a of crowd) {
      const r = a.r;
      if (a.st === "gone") { place(r, { x: 999, y: 0, z: 0, yaw: FACE_R, sq: 1 }); r.on = false; continue; }
      const sq = a.st === "leap" ? a.sq : a.y > 0.02 ? 1 + 0.04 * Math.max(0, a.vy) / 8 : 1 - 0.26 * (a.land / 0.14);      // stretch in the air, squash on landing
      place(r, { x: a.x, y: a.y, z: a.z, yaw: a.yawT, sq, stretch: a.stretch, big: a.st === "cam" ? a.big : 1 });
      r.on = true;
    }
    // arms: whoever is grabbing reaches for its victim; Mikey reaches for the viewer
    handsOn = false; curPull = 0; wantFull = false;
    for (const a of crowd) {
      a.r.arms.forEach(x => { x.pinW = 0; });
      if (a.st === "grab" && a.par && a.pinK > 0) {
        grabTarget.set(0, 0.95, 0); a.par.r.pivot.localToWorld(grabTarget);
        let best = 0, bz = -1e9; a.r.arms.forEach((x, i) => { _v.copy(x.anchor).applyMatrix4(a.r.pivot.matrixWorld); if (_v.z > bz) { bz = _v.z; best = i; } });   // reach with the arm nearer the camera
        const arm = a.r.arms[best]; arm.pinW = a.pinK; arm.pinTarget = (arm.pinTarget || new THREE.Vector3()).copy(grabTarget);
      } else if (a.st === "cam" && a.pinK > 0) {
        const edge = Math.max(2, span / 2 - 2), e = a.reach;                      // world x of the screen edge on Mikey's floor line
        a.r.arms.forEach((x, i) => {
          const sd = i ? 1 : -1, tx = (a.x + sd * 0.65) + (sd * (edge - a.pull * 0.06 * Math.max(1, span - 4)) - (a.x + sd * 0.65)) * e, ty = a.y + 1.5 + 3.2 * e, tz = a.z + 2.3 - 1.6 * e;
          x.pinW = a.pinK; x.pinTarget = (x.pinTarget || new THREE.Vector3()).set(tx, ty, tz);
          _v.copy(x.anchor).applyMatrix4(a.r.pivot.matrixWorld); const dist = _v.distanceTo(x.pinTarget);
          x.reachK = Math.max(2.2, 1.03 * dist / ((x.pts.length - 1) * x.len0) - 1);       // long enough to span the whole way
        });
      }
      if ((a.st === "cam" && a.ct > 3.6) || a.camAfter > 0) wantFull = true;
      if ((a.st === "cam" && a.handsReady) || a.camAfter > 0) { handsOn = true; curPull = a.pull || 0; }
    }
    runners.forEach(r => { if (r.on && !r.wasOn) r.arms.forEach(x => { x.init = false; }); r.wasOn = r.on; });   // arms start hanging from the body
  }

  let last = 0, wasOn = false, warmed = false, seenLayout = -1, sunHide = false;
  function frame(ms) {
    requestAnimationFrame(frame);
    if (document.hidden) { last = ms; return; } 
    if (window.tightfitSunriseOn) {                                              // the Sunrise secret: the whole crowd is switched off while it plays
      crowd.forEach(a => { if (a.st !== "gone") { a.st = "gone"; a.t = rr(1, 2); a.camAfter = 0; a.pinK = 0; a.z = 0; a.big = 1; } });
      handsOn = false; wantFull = false; if (!sunHide) { sunHide = true; canvas.style.visibility = "hidden"; }
    } else if (sunHide) { sunHide = false; canvas.style.visibility = ""; }
    if (handsOn !== handsShown) { handsShown = handsOn; showHands(handsOn); }
    if (wantFull !== full) { full = wantFull; applyView(); }                    // the canvas covers the whole screen while Mikey grows into it

    if (layoutVersion !== seenLayout) { seenLayout = layoutVersion; warmed = false; runners.forEach(r => r.arms.forEach(a => { a.init = false; })); }
    const dt = Math.min(0.033, (ms - last) / 1000 || 0.016); last = ms;
    if (fixedT !== null) {                                                      // a fixed moment, for checking: simulate up to it from the start
      if (!warmed) {
        warmed = true; simT = 0; rs = 12345; crowd.forEach((a, i) => { a.st = "gone"; a.t = 0.4 + i * 0.5; a.free = 0; a.camDone = false; });
        while (simT < fixedT) { step(1 / 60); if (simT > fixedT - 1.5) { placeAll(); runners.forEach(r => r.on && stepArms(r, 1 / 60)); } }
        placeAll();
      }
    } else {
      for (let i = 0; i < 3; i++) { step(dt / 3); placeAll(); runners.forEach(r => r.on && stepArms(r, dt / 3)); }
    }
    runners.forEach(r => {
      if (!r.tag && font) { r.tag = makeTag(r.name); scene.add(r.tag); }
      r.pivot.visible = r.on; r.arms.forEach(a => a.beads.forEach(m => { m.visible = r.on; }));
      if (r.tag) { r.tag.visible = r.on && r.pivot.position.z < 3; r.tag.position.set(r.pivot.position.x, Math.max(r.pivot.position.y, 0) + 2.0, r.pivot.position.z); }
      const sh = 1 / (1 + 0.45 * Math.max(0, r.pivot.position.y));
      r.shadow.position.set(r.pivot.position.x, 0.02, r.pivot.position.z); r.shadow.scale.set(sh, 1, sh); r.shadow.visible = r.on;
    });
    const on = runners.some(r => r.on);
    if (on || wasOn || fixedT !== null) renderer.render(scene, cam);   // one last render clears the canvas once everyone has left
    wasOn = on;
  }

  function summon() {                                                            // bring the crowd out (or keep it out another 25s)
    if (window.tightfitMayaActive && window.tightfitMayaActive()) return;
    activeUntil = simT + 25;
    for (const a of crowd) if (a.st === "gone" && a.camAfter <= 0) a.t = Math.min(a.t, rr(0.1, 1.4));      // they pour out one after another
  }
  window.tightfitCrowdActive = () => simT < activeUntil || crowd.some(a => a.st !== "gone" || a.camAfter > 0);       // Big Dog and the Maya windows wait for this to be false
  window.addEventListener("mousedown", e => { if (e.button === 1) { e.preventDefault(); summon(); } });      // middle mouse button (and no autoscroll circle)
  let taps = [];                                                                 // on a phone or iPad, three quick taps in the same spot do the same
  window.addEventListener("pointerdown", e => {
    if (e.pointerType !== "touch" || !e.isPrimary) return;
    const now = performance.now();
    taps = taps.filter(t => now - t.t < 700 && Math.hypot(e.clientX - t.x, e.clientY - t.y) < 60); taps.push({ t: now, x: e.clientX, y: e.clientY });
    if (taps.length >= 3) { taps = []; summon(); }
  });
  document.documentElement.style.touchAction = "manipulation";                  // so a quick double or triple tap is not taken as a zoom
  new THREE.GLTFLoader().parse(Uint8Array.from(atob(window.BLOB_GLB), c => c.charCodeAt(0)).buffer, "", g => {
    glb = g.scene; runners.forEach(build);
    (document.fonts && document.fonts.load ? document.fonts.load("16px MGPixel") : Promise.resolve()).catch(() => {}).then(() => { font = true; });
    requestAnimationFrame(frame);
  }, () => {});
})();
