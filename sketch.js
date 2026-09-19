let seed = 1;
let genome;
let cameraMode = false;
let video;
let bodyPose;
let poses = [];
let poseSmooth = {};
let cameraReady = false;
let cameraError = "";
let cameraStarting = false;
let showThumb = true;

const PALETTES = [
  {
    body: [255, 176, 182],
    mid: [255, 142, 162],
    hi: [255, 214, 206],
    accent: [88, 158, 230],
    claw: [255, 128, 148],
  },
  {
    body: [168, 222, 200],
    mid: [138, 200, 178],
    hi: [214, 242, 224],
    accent: [255, 118, 152],
    claw: [118, 186, 164],
  },
  {
    body: [206, 184, 236],
    mid: [176, 154, 224],
    hi: [232, 216, 248],
    accent: [255, 132, 172],
    claw: [186, 158, 226],
  },
  {
    body: [255, 208, 150],
    mid: [255, 178, 118],
    hi: [255, 232, 192],
    accent: [86, 168, 226],
    claw: [255, 158, 108],
  },
  {
    body: [164, 204, 238],
    mid: [132, 180, 222],
    hi: [206, 228, 248],
    accent: [255, 128, 158],
    claw: [112, 170, 214],
  },
  {
    body: [255, 154, 176],
    mid: [242, 114, 152],
    hi: [255, 196, 208],
    accent: [86, 142, 224],
    claw: [232, 96, 136],
  },
  {
    body: [188, 222, 142],
    mid: [158, 200, 112],
    hi: [222, 240, 180],
    accent: [255, 138, 160],
    claw: [142, 188, 96],
  },
  {
    body: [255, 204, 214],
    mid: [255, 172, 192],
    hi: [255, 232, 234],
    accent: [126, 96, 210],
    claw: [255, 152, 182],
  },
  {
    body: [255, 186, 98],
    mid: [255, 154, 78],
    hi: [255, 214, 148],
    accent: [78, 158, 214],
    claw: [232, 132, 74],
  },
  {
    body: [186, 168, 236],
    mid: [156, 136, 216],
    hi: [216, 204, 248],
    accent: [255, 158, 108],
    claw: [166, 146, 226],
  },
];

const TYPES = [
  "totem",
  "cephalopod",
  "wader",
  "croucher",
  "dancer",
  "beast",
  "stout",
  "hopper",
  "cellblob",
];

function setup() {
  const { w, h } = artSize();
  const cnv = createCanvas(w, h);
  cnv.parent("canvas-wrap");
  cnv.style("background", "transparent");
  pixelDensity(min(2, displayDensity()));
  noLoop();
  seed = floor(Math.random() * 1e9);
  const btn = document.getElementById("camera-btn");
  if (btn) btn.addEventListener("click", () => toggleCamera());
}

function windowResized() {
  const { w, h } = artSize();
  resizeCanvas(w, h);
  if (!cameraMode) redraw();
}

function artSize() {
  const maxH = windowHeight - 72;
  const maxW = windowWidth - 36;
  let h = min(maxH, 940);
  let w = h * 0.75;
  if (w > maxW) {
    w = maxW;
    h = w / 0.75;
  }
  return { w: floor(w), h: floor(h) };
}

function draw() {
  randomSeed(seed);
  noiseSeed(seed);
  clear();
  if (cameraMode) {
    if (!genome) genome = makeGenome();
    drawCameraFrame();
    return;
  }
  genome = makeGenome();
  drawCreature();
}

function mousePressed() {
  if (mouseX < 0 || mouseY < 0 || mouseX > width || mouseY > height) return;
  if (cameraMode && showThumb && hitThumb(mouseX, mouseY)) return;
  summon();
}

function keyPressed() {
  if ((key === "v" || key === "V") && cameraMode) {
    showThumb = !showThumb;
    return false;
  }
  if (key === "c" || key === "C") {
    toggleCamera();
    return false;
  }
  if (key === " " || key === "Enter") {
    summon();
    return false;
  }
  if (key === "s" || key === "S") {
    saveCanvas("monster-" + seed, "png");
    return false;
  }
  if (keyCode === ESCAPE && cameraMode) {
    toggleCamera(false);
    return false;
  }
}

function summon() {
  seed = floor(Math.random() * 1e9);
  randomSeed(seed);
  noiseSeed(seed);
  genome = makeGenome();
  poseSmooth = {};
  if (!cameraMode) redraw();
}

function setCameraUi(on) {
  const btn = document.getElementById("camera-btn");
  const hint = document.getElementById("hint");
  if (btn) {
    btn.classList.toggle("on", on);
    btn.textContent = on ? "Exit camera" : "Camera";
  }
  if (hint) {
    hint.textContent = on
      ? "you are the monster · v preview · space new look · c exit · s save"
      : "click / space to summon another · c camera · s save";
  }
}

function toggleCamera(force) {
  const next = force === undefined ? !cameraMode : force;
  if (next === cameraMode) return;
  if (next) startCamera();
  else stopCamera();
}

function startCamera() {
  cameraMode = true;
  cameraError = "";
  cameraStarting = true;
  setCameraUi(true);
  if (!genome) {
    randomSeed(seed);
    genome = makeGenome();
  }
  loop();
  if (typeof ml5 === "undefined" || !ml5.bodyPose) {
    cameraError = "Pose library failed to load";
    cameraStarting = false;
    return;
  }

  window.clearTimeout(window.__camTimer);
  window.__camTimer = setTimeout(() => {
    if (cameraMode && cameraStarting && !cameraReady) {
      cameraError = "Allow camera access, then press Camera again";
      cameraStarting = false;
    }
  }, 12000);

  const attachStream = (stream) => {
    if (!video) {
      const elt = document.createElement("video");
      elt.setAttribute("playsinline", "true");
      elt.muted = true;
      elt.autoplay = true;
      elt.playsInline = true;
      elt.style.display = "none";
      document.body.appendChild(elt);
      video = { elt, width: 640, height: 480 };
      video.size = function (w, h) {
        this.width = w;
        this.height = h;
        this.elt.width = w;
        this.elt.height = h;
      };
      video.hide = function () {
        this.elt.style.display = "none";
      };
    }
    video.elt.srcObject = stream;
    const onReady = () => {
      const vw = video.elt.videoWidth || 640;
      const vh = video.elt.videoHeight || 480;
      video.size(vw, vh);
      boot();
    };
    if (video.elt.readyState >= 1 && video.elt.videoWidth) onReady();
    else video.elt.addEventListener("loadedmetadata", onReady, { once: true });
    video.elt.play().catch(() => {});
  };

  if (video && video.elt && video.elt.srcObject) {
    video.elt.play().catch(() => {});
    boot();
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    cameraError = "Camera is not supported in this browser";
    cameraStarting = false;
    return;
  }

  navigator.mediaDevices
    .getUserMedia({ video: { facingMode: "user" }, audio: false })
    .then(attachStream)
    .catch(() => {
      cameraError = "Allow the camera to become the monster";
      cameraStarting = false;
    });
}

function boot() {
  try {
    if (bodyPose) {
      bodyPose.detectStart(video.elt || video, gotPoses);
      cameraReady = true;
      cameraStarting = false;
      return;
    }
    bodyPose = ml5.bodyPose(
      "MoveNet",
      { modelType: "SINGLEPOSE_LIGHTNING", flipped: false },
      () => {
        bodyPose.detectStart(video.elt || video, gotPoses);
        cameraReady = true;
        cameraStarting = false;
      }
    );
  } catch (err) {
    cameraError = "Could not start pose tracking";
    cameraStarting = false;
  }
}

function stopCamera() {
  cameraMode = false;
  cameraStarting = false;
  cameraReady = false;
  setCameraUi(false);
  window.clearTimeout(window.__camTimer);
  if (bodyPose && bodyPose.detectStop) {
    try {
      bodyPose.detectStop();
    } catch (e) {
      /* ignore */
    }
  }
  noLoop();
  redraw();
}

function gotPoses(results) {
  poses = results || [];
}

function vidToCanvas(x, y) {
  if (!video || !video.width) return { x, y };
  const s = max(width / video.width, height / video.height);
  const dw = video.width * s;
  const dh = video.height * s;
  const ox = (width - dw) / 2;
  const oy = (height - dh) / 2;
  return { x: (video.width - x) * s + ox, y: y * s + oy };
}

function collectPose() {
  if (!poses.length) return null;
  const raw = poses[0];
  const kps = raw.keypoints || [];
  const found = {};
  for (let i = 0; i < kps.length; i++) {
    const kp = kps[i];
    const conf = kp.confidence ?? kp.score ?? 0;
    if (conf < 0.25) continue;
    const name = String(kp.name || kp.part || i)
      .toLowerCase()
      .replace(/_/g, "");
    const p = vidToCanvas(kp.x, kp.y);
    found[name] = p;
  }
  const names = Object.keys(found);
  if (!names.length) return null;
  for (let i = 0; i < names.length; i++) {
    const n = names[i];
    const p = found[n];
    if (!poseSmooth[n]) poseSmooth[n] = { x: p.x, y: p.y };
    else {
      poseSmooth[n].x = lerp(poseSmooth[n].x, p.x, 0.4);
      poseSmooth[n].y = lerp(poseSmooth[n].y, p.y, 0.4);
    }
  }
  return poseSmooth;
}

function midPt(a, b) {
  if (!a) return b;
  if (!b) return a;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function drawCameraFrame() {
  const k = collectPose();
  if (cameraError) {
    drawCameraStatus(cameraError);
    drawCameraThumb();
    return;
  }
  if (cameraStarting && !k) {
    drawCameraStatus("Starting camera…");
    drawCameraThumb();
    return;
  }
  if (!k || !k.nose) {
    drawCameraStatus("Step into the camera");
    drawCameraThumb();
    return;
  }
  drawPoseMonster(k);
  drawCameraThumb();
}

function drawCameraStatus(msg) {
  fill(122, 113, 104, 200);
  noStroke();
  textAlign(CENTER, CENTER);
  textFont("Georgia");
  textSize(15);
  text(msg, width / 2, height * 0.5);
}

const POSE_BONES = [
  ["leftshoulder", "rightshoulder"],
  ["leftshoulder", "leftelbow"],
  ["leftelbow", "leftwrist"],
  ["rightshoulder", "rightelbow"],
  ["rightelbow", "rightwrist"],
  ["leftshoulder", "lefthip"],
  ["rightshoulder", "righthip"],
  ["lefthip", "righthip"],
  ["lefthip", "leftknee"],
  ["leftknee", "leftankle"],
  ["righthip", "rightknee"],
  ["rightknee", "rightankle"],
  ["leftshoulder", "leftwrist"],
  ["rightshoulder", "rightwrist"],
  ["nose", "lefteye"],
  ["nose", "righteye"],
  ["lefteye", "leftear"],
  ["righteye", "rightear"],
  ["lefteye", "righteye"],
];

function thumbRect() {
  const vw = (video && (video.width || (video.elt && video.elt.videoWidth))) || 640;
  const vh = (video && (video.height || (video.elt && video.elt.videoHeight))) || 480;
  const tw = min(210, width * 0.34);
  const th = tw * (vh / vw);
  const pad = 14;
  return { x: pad, y: height - th - pad, w: tw, h: th };
}

function hitThumb(mx, my) {
  const r = thumbRect();
  return mx >= r.x - 6 && mx <= r.x + r.w + 6 && my >= r.y - 6 && my <= r.y + r.h + 6;
}

function vidToThumb(vx, vy, r) {
  const vw = video.width || 640;
  const vh = video.height || 480;
  return {
    x: r.x + ((vw - vx) / vw) * r.w,
    y: r.y + (vy / vh) * r.h,
  };
}

function poseNameMap(pose) {
  const map = {};
  const kps = pose.keypoints || [];
  for (let i = 0; i < kps.length; i++) {
    const kp = kps[i];
    const conf = kp.confidence ?? kp.score ?? 0;
    if (conf < 0.2) continue;
    const name = String(kp.name || kp.part || i)
      .toLowerCase()
      .replace(/_/g, "");
    map[name] = kp;
    map[i] = kp;
  }
  return map;
}

function drawCameraThumb() {
  if (!showThumb || !cameraMode) return;
  const r = thumbRect();
  noStroke();
  fill(22, 20, 18, 230);
  rect(r.x - 5, r.y - 5, r.w + 10, r.h + 10, 10);

  if (video && video.elt && video.elt.readyState >= 2) {
    push();
    drawingContext.save();
    drawingContext.beginPath();
    if (drawingContext.roundRect) drawingContext.roundRect(r.x, r.y, r.w, r.h, 6);
    else drawingContext.rect(r.x, r.y, r.w, r.h);
    drawingContext.clip();
    translate(r.x + r.w, r.y);
    scale(-1, 1);
    try {
      image(video.elt, 0, 0, r.w, r.h);
    } catch (e) {
      /* video frame not ready */
    }
    drawingContext.restore();
    pop();
  } else {
    fill(40, 38, 36);
    rect(r.x, r.y, r.w, r.h, 6);
  }

  drawThumbSkeletons(r);

  noFill();
  stroke(255, 255, 255, 70);
  strokeWeight(1);
  rect(r.x, r.y, r.w, r.h, 6);
  noStroke();
  fill(255, 230);
  textAlign(LEFT, TOP);
  textFont("Georgia");
  textSize(10);
  text("camera  ·  v", r.x + 8, r.y + 7);
}

function drawThumbSkeletons(r) {
  if (!poses || !poses.length || !video) return;
  let pairs = null;
  if (bodyPose && typeof bodyPose.getSkeleton === "function") {
    try {
      pairs = bodyPose.getSkeleton();
    } catch (e) {
      pairs = null;
    }
  }

  for (let p = 0; p < poses.length; p++) {
    const pose = poses[p];
    const kps = pose.keypoints || [];
    const named = poseNameMap(pose);

    stroke(70, 230, 190, 220);
    strokeWeight(2);
    strokeCap(ROUND);
    if (pairs && pairs.length) {
      for (let i = 0; i < pairs.length; i++) {
        const a = kps[pairs[i][0]];
        const b = kps[pairs[i][1]];
        if (!a || !b) continue;
        if ((a.confidence ?? a.score ?? 0) < 0.2) continue;
        if ((b.confidence ?? b.score ?? 0) < 0.2) continue;
        const pa = vidToThumb(a.x, a.y, r);
        const pb = vidToThumb(b.x, b.y, r);
        line(pa.x, pa.y, pb.x, pb.y);
      }
    } else {
      for (let i = 0; i < POSE_BONES.length; i++) {
        const a = named[POSE_BONES[i][0]];
        const b = named[POSE_BONES[i][1]];
        if (!a || !b) continue;
        const pa = vidToThumb(a.x, a.y, r);
        const pb = vidToThumb(b.x, b.y, r);
        line(pa.x, pa.y, pb.x, pb.y);
      }
    }

    noStroke();
    for (let i = 0; i < kps.length; i++) {
      const kp = kps[i];
      if ((kp.confidence ?? kp.score ?? 0) < 0.2) continue;
      const pt = vidToThumb(kp.x, kp.y, r);
      fill(255, 90, 140, 230);
      circle(pt.x, pt.y, 5);
      fill(255, 240);
      circle(pt.x, pt.y, 2.2);
    }
  }
}

function drawPoseMonster(k) {
  const g = genome;
  const pal = g.pal;
  const body = C(pal.body);
  const mid = C(pal.mid);
  const hi = C(pal.hi);
  const claw = C(pal.claw);

  const ls = k.leftshoulder;
  const rs = k.rightshoulder;
  const lh = k.lefthip;
  const rh = k.righthip;
  const nose = k.nose;
  if (!nose || (!ls && !rs)) return;

  const midSh = midPt(ls, rs) || nose;
  const midHp = midPt(lh, rh) || { x: midSh.x, y: midSh.y + 140 };
  const shW = ls && rs ? dist(ls.x, ls.y, rs.x, rs.y) : 90;
  const torsoH = max(40, dist(midSh.x, midSh.y, midHp.x, midHp.y));
  const headW = constrain(shW * 0.72, 42, 110);
  const headH = headW * 1.05;
  const armW = constrain(shW * 0.22, 14, 36);
  const legW = constrain(shW * 0.26, 16, 42);

  const bodyCx = (midSh.x + midHp.x) / 2;
  const bodyCy = (midSh.y + midHp.y) / 2;

  const le = k.leftelbow;
  const re = k.rightelbow;
  const lw = k.leftwrist;
  const rw = k.rightwrist;
  const lk = k.leftknee;
  const rk = k.rightknee;
  const la = k.leftankle;
  const ra = k.rightankle;

  if (lh && lk) paintTube([createVector(lh.x, lh.y), createVector(lk.x, lk.y), createVector((la || lk).x, (la || lk).y)], legW, legW * 0.7, body, { hi });
  if (rh && rk) paintTube([createVector(rh.x, rh.y), createVector(rk.x, rk.y), createVector((ra || rk).x, (ra || rk).y)], legW, legW * 0.7, lerpColor(body, hi, 0.2), { hi });
  if (la) paintBlob(la.x, la.y + 6, legW * 2.1, 22, claw, { fast: true, id: 11 });
  if (ra) paintBlob(ra.x, ra.y + 6, legW * 2.1, 22, claw, { fast: true, id: 12 });

  if (g.type === "cephalopod") {
    const n = 5;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const base = { x: lerp(midHp.x - 30, midHp.x + 30, t), y: midHp.y };
      const sway = sin(millis() / 380 + i * 0.9) * 50;
      const end = {
        x: base.x + sway + (t - 0.5) * 160,
        y: base.y + 90 + abs(sin(millis() / 420 + i)) * 70,
      };
      paintTube(
        [
          createVector(base.x, base.y),
          createVector(base.x + sway * 0.4, base.y + 50),
          createVector(end.x, end.y),
        ],
        22,
        8,
        i % 2 ? body : mid,
        { hi }
      );
    }
  }

  paintBlob(bodyCx, bodyCy, shW * 1.55, torsoH * 1.25, body, { fast: true, id: 1 });
  if (g.fur) paintFur(bodyCx, bodyCy, shW * 1.55, torsoH * 1.25, mid, 40);

  if (ls && le) paintTube([createVector(ls.x, ls.y), createVector(le.x, le.y), createVector((lw || le).x, (lw || le).y)], armW, armW * 0.65, mid, { hi });
  if (rs && re) paintTube([createVector(rs.x, rs.y), createVector(re.x, re.y), createVector((rw || re).x, (rw || re).y)], armW, armW * 0.65, hi, { hi });
  if (lw) paintClaws(lw.x, lw.y, 3, 0.4, claw, 0);
  if (rw) paintClaws(rw.x, rw.y, 3, 0.4, claw, PI);

  randomSeed(seed + 80);
  if (g.tail && g.tail !== "none") {
    const side = g.tailSide || 1;
    paintTail(g.tail, midHp.x + side * 20, midHp.y, mid);
  }

  const hx = nose.x;
  const hy = nose.y;
  paintBlob(hx, hy, headW * 1.15, headH, mid, { fast: true, id: 2 });
  randomSeed(seed + 90);
  push();
  translate(hx, hy);
  paintEars(g.ears || (g.type === "hopper" ? "bunny" : "round"), -headH * 0.42, headW);
  if (g.tuft) paintTuft(0, -headH * 0.48, claw);
  pop();

  const eyeS = headW * 0.22;
  if (isSingleEye(g.eyes)) {
    paintEye(hx, hy - headH * 0.02, eyeS * 1.15, eyeS * 1.15, g.eyes);
  } else {
    paintEye(hx - headW * 0.18, hy - headH * 0.04, eyeS, eyeS, g.eyes);
    paintEye(hx + headW * 0.18, hy - headH * 0.03, eyeS * 0.95, eyeS * 0.95, g.eyes);
  }
  paintMouth(hx, hy + headH * 0.22, headW * 0.35, headH * 0.14, g.mouth);
  if (g.whiskers) paintWhiskers(hx, hy + headH * 0.18, headW * 0.4);
}

function makeGenome() {
  const type = pick(TYPES);
  const pal = pick(PALETTES);
  const g = {
    type,
    pal,
    light: random(-0.2, PI * 0.7),
    fur: random() < 0.35,
    scale: random(1.0, 1.16),
    lean: random(-0.04, 0.04),
    irisAccent: random() < 0.55,
    tailSide: random() < 0.5 ? 1 : -1,
  };

  if (type === "totem") {
    g.stack = floor(random(2, 4));
    g.eyes = pick(["spiral", "one", "two", "pit"]);
    g.mouth = pick(["smile", "cat", "tiny"]);
    g.arms = pick(["none", "thin", "none"]);
    g.legs = pick(["stubby", "thin"]);
    g.tuft = random() < 0.7;
  } else if (type === "cephalopod") {
    g.heads = floor(random(2, 4));
    g.eyes = pick(["pit", "two", "sleepy"]);
    g.mouth = pick(["smile", "cat", "tiny"]);
    g.arms = random(4, 7);
    g.fur = false;
  } else if (type === "wader") {
    g.eyes = pick(["pit", "two", "one"]);
    g.mouth = pick(["smile", "tiny", "cat"]);
    g.ears = pick(["round", "bunny", "none"]);
    g.tail = pick(["curl", "long"]);
    g.pose = pick(["wave", "drop"]);
  } else if (type === "croucher") {
    g.eyes = pick(["two", "pit", "sleepy"]);
    g.mouth = pick(["smile", "cat", "tiny"]);
    g.ears = pick(["bunny", "round"]);
    g.tail = pick(["none", "curl"]);
    g.fur = random() < 0.4;
  } else if (type === "dancer") {
    g.eyes = pick(["spiral", "one", "two"]);
    g.mouth = pick(["smile", "tiny", "cat"]);
    g.ears = pick(["round", "bunny", "none"]);
    g.fur = random() < 0.45;
  } else if (type === "beast") {
    g.eyes = pick(["sleepy", "pit", "two"]);
    g.mouth = pick(["smile", "cat", "tiny"]);
    g.ears = pick(["round", "bunny"]);
    g.tail = pick(["curl", "long"]);
  } else if (type === "stout") {
    g.eyes = pick(["sleepy", "pit", "two"]);
    g.mouth = pick(["smile", "tiny", "cat"]);
    g.ears = pick(["round", "none"]);
    g.blade = false;
    g.fur = random() < 0.4;
  } else if (type === "hopper") {
    g.eyes = pick(["two", "pit", "sleepy"]);
    g.mouth = pick(["smile", "tiny", "cat"]);
    g.ears = pick(["bunny", "triple"]);
    g.tail = pick(["curl", "none"]);
    g.whiskers = random() < 0.35;
  } else {
    g.eyes = pick(["two", "pit", "spiral"]);
    g.mouth = pick(["smile", "tiny", "cat"]);
    g.ears = pick(["round", "bunny"]);
    g.tail = pick(["rat", "curl"]);
    g.whiskers = random() < 0.55;
    g.fur = false;
  }
  return g;
}

function pick(arr) {
  return arr[floor(random(arr.length))];
}

function isSingleEye(kind) {
  return kind === "one" || kind === "spiral";
}

function C(rgb, a = 255) {
  return color(rgb[0], rgb[1], rgb[2], a);
}

function wob(amt) {
  return random(-amt, amt);
}

function drawCreature() {
  const g = genome;
  push();
  translate(width / 2, height * 0.55);
  scale((g.scale * height) / 780);
  rotate(g.lean);
  if (g.type === "totem") drawTotem(g);
  else if (g.type === "cephalopod") drawCephalopod(g);
  else if (g.type === "wader") drawWader(g);
  else if (g.type === "croucher") drawCroucher(g);
  else if (g.type === "dancer") drawDancer(g);
  else if (g.type === "beast") drawBeast(g);
  else if (g.type === "stout") drawStout(g);
  else if (g.type === "hopper") drawHopper(g);
  else drawCellblob(g);
  pop();
}

function paintBlob(x, y, w, h, col, opts = {}) {
  if (opts.id != null) {
    randomSeed(seed + opts.id * 9176);
    noiseSeed(seed + opts.id * 9176);
  }
  const dabs = opts.dabs ?? floor(constrain((abs(w) * abs(h)) / 150, 40, 380));
  const ang = opts.ang ?? random(-0.2, 0.5);
  const light = opts.light ?? genome.light;
  const dark = opts.under ?? color(red(col) * 0.78, green(col) * 0.78, blue(col) * 0.78);
  const hi = opts.hi ?? lerpColor(col, color(255, 248, 240), 0.42);
  const brushW = opts.bw ?? constrain(min(abs(w), abs(h)) * 0.09, 2.6, 10);
  const nOff = random(80);
  const lumps = 2;
  const lumpA = [random(TWO_PI), random(TWO_PI)];
  const lumpAmp = [random(0.04, 0.09), random(0.02, 0.06)];

  function edgeR(a) {
    let r = 1 + lumpAmp[0] * cos(2 * a + lumpA[0]) + lumpAmp[1] * cos(3 * a + lumpA[1]);
    r += 0.07 * (noise(nOff + cos(a) * 7, nOff + 12 + sin(a) * 7) - 0.5);
    r += 0.05 * (noise(nOff + 40 + cos(a) * 16, nOff + sin(a) * 16) - 0.5);
    return constrain(r, 0.84, 1.14);
  }

  function blobShape(scale, fillCol) {
    noStroke();
    fill(fillCol);
    beginShape();
    const steps = 36;
    for (let i = -1; i <= steps + 1; i++) {
      const a = (i / steps) * TWO_PI;
      const r = edgeR(a) * scale;
      curveVertex(x + (cos(a) * r * w) / 2, y + (sin(a) * r * h) / 2);
    }
    endShape();
  }

  blobShape(1, color(red(dark), green(dark), blue(dark), 220));
  blobShape(0.92, color(red(col), green(col), blue(col), 210));

  const live = cameraMode && !opts.still;
  const dabN = live ? floor(constrain(dabs * 0.28, 16, 58)) : dabs;

  if (opts.fast && !live) {
    const hairs = floor(constrain(min(abs(w), abs(h)) * 0.28, 8, 40));
    for (let i = 0; i < hairs; i++) {
      const a = (i / hairs) * TWO_PI + nOff;
      const er = edgeR(a);
      const x1 = x + (cos(a) * er * 0.92 * w) / 2;
      const y1 = y + (sin(a) * er * 0.92 * h) / 2;
      const len = 4 + 8 * noise(nOff, i * 0.3);
      stroke(red(col), green(col), blue(col), 90);
      strokeWeight(1.2);
      line(x1, y1, x1 + cos(a) * len, y1 + sin(a) * len);
    }
    noStroke();
    return;
  }

  let placed = 0;
  let tries = 0;
  while (placed < dabN && tries < dabN * 8) {
    tries++;
    const a = random(TWO_PI);
    const er = edgeR(a);
    const rr = er * sqrt(random()) * 0.92;
    const px = x + (cos(a) * rr * w) / 2;
    const py = y + (sin(a) * rr * h) / 2;
    const nx = (px - x) / max(0.001, w / 2);
    const ny = (py - y) / max(0.001, h / 2);
    const lit = nx * cos(light) + ny * sin(light);
    const t = constrain((lit + 1) * 0.5, 0, 1);
    let c = lerpColor(dark, col, 0.4 + t * 0.6);
    if (t > 0.62) c = lerpColor(c, hi, ((t - 0.62) / 0.38) * 0.65);
    fill(
      constrain(red(c) + random(-12, 12), 0, 255),
      constrain(green(c) + random(-12, 12), 0, 255),
      constrain(blue(c) + random(-12, 12), 0, 255),
      random(50, 120)
    );
    const size = brushW * random(0.7, 1.6);
    push();
    translate(px, py);
    rotate(ang + random(-0.4, 0.4));
    ellipse(0, 0, size, size * random(1.1, 1.8));
    pop();
    placed++;
  }

  const fringe = floor((live ? dabN : dabs) * (live ? 0.7 : 0.9));
  for (let i = 0; i < fringe; i++) {
    const a = random(TWO_PI);
    const er = edgeR(a);
    const rr = er * random(0.88, 1.18);
    fill(
      constrain(red(col) + random(-16, 16), 0, 255),
      constrain(green(col) + random(-16, 16), 0, 255),
      constrain(blue(col) + random(-16, 16), 0, 255),
      random(18, 90)
    );
    const px = x + (cos(a) * rr * w) / 2;
    const py = y + (sin(a) * rr * h) / 2;
    circle(px, py, random(1.2, 5.5));
  }

  const hairs = floor(constrain(min(abs(w), abs(h)) * (live ? 0.38 : 0.55), live ? 14 : 22, live ? 56 : 140));
  for (let i = 0; i < hairs; i++) {
    const a = random(TWO_PI);
    const er = edgeR(a);
    const x1 = x + (cos(a) * er * 0.92 * w) / 2;
    const y1 = y + (sin(a) * er * 0.92 * h) / 2;
    const len = random(5, 18);
    stroke(
      constrain(red(col) + random(-18, 18), 0, 255),
      constrain(green(col) + random(-18, 18), 0, 255),
      constrain(blue(col) + random(-18, 18), 0, 255),
      random(45, 120)
    );
    strokeWeight(random(0.7, 2.2));
    line(x1, y1, x1 + cos(a) * len, y1 + sin(a) * len);
  }
  noStroke();
}

function paintFur(x, y, w, h, col, n) {
  for (let i = 0; i < n * 0.45; i++) {
    const a = random(TWO_PI);
    const ex = cos(a) * (w / 2);
    const ey = sin(a) * (h / 2);
    const len = random(3, 9);
    stroke(red(col), green(col), blue(col), random(50, 110));
    strokeWeight(random(1.1, 2.2));
    line(x + ex * 0.92, y + ey * 0.92, x + ex * 0.92 + cos(a) * len, y + ey * 0.92 + sin(a) * len);
  }
}

function paintTube(pts, thickStart, thickEnd, col, opts = {}) {
  const hi = opts.hi ?? C(genome.pal.hi);
  if (pts.length < 2) return;
  noFill();
  strokeCap(ROUND);
  strokeJoin(ROUND);
  for (let i = 0; i < pts.length - 1; i++) {
    const t = i / (pts.length - 1);
    const th = lerp(thickStart, thickEnd, t);
    stroke(red(col), green(col), blue(col), 230);
    strokeWeight(th);
    line(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
    stroke(red(hi), green(hi), blue(hi), 80);
    strokeWeight(th * 0.5);
    line(pts[i].x - 1, pts[i].y - 1, pts[i + 1].x - 1, pts[i + 1].y - 1);
  }
  if (opts.id != null) randomSeed(seed + opts.id * 4243);

  const samples = [];
  if (!cameraMode) {
    for (let i = 0; i < pts.length; i++) {
      const ang =
        i < pts.length - 1
          ? atan2(pts[i + 1].y - pts[i].y, pts[i + 1].x - pts[i].x)
          : atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x);
      samples.push({
        x: pts[i].x,
        y: pts[i].y,
        th: lerp(thickStart, thickEnd, i / max(1, pts.length - 1)),
        ang,
      });
    }
  } else {
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      total += dist(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
    }
    let acc = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const d = dist(a.x, a.y, b.x, b.y);
      const n = max(1, ceil(d / 16));
      for (let s = 0; s < n; s++) {
        const u = s / n;
        const along = total < 1 ? 0 : (acc + d * u) / total;
        samples.push({
          x: lerp(a.x, b.x, u),
          y: lerp(a.y, b.y, u),
          th: lerp(thickStart, thickEnd, along),
          ang: atan2(b.y - a.y, b.x - a.x),
        });
      }
      acc += d;
    }
    const last = pts[pts.length - 1];
    const prev = pts[pts.length - 2];
    samples.push({
      x: last.x,
      y: last.y,
      th: thickEnd,
      ang: atan2(last.y - prev.y, last.x - prev.x),
    });
  }

  const nStroke = cameraMode ? 4 : 8;
  for (let i = 0; i < samples.length; i++) {
    const px = samples[i].x;
    const py = samples[i].y;
    const th = samples[i].th;
    const ang = samples[i].ang;
    const n = nStroke;
    for (let k = 0; k < n; k++) {
      const side = random() < 0.5 ? 1 : -1;
      const along = random(-th * 0.15, th * 0.15);
      const out = th * 0.42 + random(2, 9);
      const a = ang + side * HALF_PI;
      const x1 = px + cos(ang) * along + cos(a) * th * 0.38;
      const y1 = py + sin(ang) * along + sin(a) * th * 0.38;
      stroke(
        constrain(red(col) + random(-18, 18), 0, 255),
        constrain(green(col) + random(-18, 18), 0, 255),
        constrain(blue(col) + random(-18, 18), 0, 255),
        random(50, 120)
      );
      strokeWeight(random(0.6, 1.8));
      line(x1, y1, x1 + cos(a) * out * 0.45, y1 + sin(a) * out * 0.45);
      noStroke();
      fill(red(col), green(col), blue(col), 40);
      circle(x1, y1, random(1.5, 4));
    }
  }
  noStroke();
}

function bezierPts(a, c1, c2, b, n = 14) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(
      createVector(
        bezierPoint(a.x, c1.x, c2.x, b.x, t),
        bezierPoint(a.y, c1.y, c2.y, b.y, t)
      )
    );
  }
  return pts;
}

function limb(x1, y1, x2, y2, t0, t1, col, bow = 0) {
  const mx = (x1 + x2) / 2 + bow;
  const my = (y1 + y2) / 2 + wob(abs(bow) * 0.3 + 4);
  const pts = bezierPts(
    createVector(x1, y1),
    createVector(mx, my),
    createVector(mx, my),
    createVector(x2, y2),
    10
  );
  paintTube(pts, t0, t1, col);
  return { x: x2, y: y2 };
}

function paintGround(y, w) {}

function paintClaws(x, y, n, spread, col, dir = HALF_PI) {
  const hi = lerpColor(col, color(255, 240, 235), 0.35);
  paintBlob(x, y, 24, 18, col, { dabs: 22, hi });
  noStroke();
  const toes = constrain(floor(n), 2, 3);
  for (let i = 0; i < toes; i++) {
    const a = dir + map(i, 0, toes - 1, -0.45, 0.45);
    fill(red(hi), green(hi), blue(hi), 200);
    ellipse(x + cos(a) * 11, y + sin(a) * 9, 8, 8);
  }
}

function paintEye(x, y, w, h, kind) {
  const pal = genome.pal;
  const accent = C(pal.accent);
  const hi = C(pal.hi);
  const n1 = noise(seed * 0.001, x * 0.02, y * 0.02);
  const n2 = noise(x * 0.018, seed * 0.002 + 4, y * 0.016);
  const ox = x + (n1 - 0.5) * w * 0.1;
  const oy = y + (n2 - 0.5) * h * 0.08;
  const ww = w * (0.92 + n1 * 0.2);
  const hh = h * (0.78 + n2 * 0.28);
  const socket = color(18 + n1 * 10, 8, 12);
  const iris = genome.irisAccent ? accent : hi;
  const dabs = cameraMode ? 16 : 32;

  noStroke();

  if (kind === "sleepy" || kind === "slit") {
    paintBlob(ox, oy, ww * 1.55, hh * 0.85, socket, {
      dabs,
      under: color(8, 4, 8),
      hi: color(30, 16, 20),
    });
    fill(8, 4, 8, 230);
    ellipse(ox, oy, ww * 1.2, hh * 0.36);
    fill(red(iris), green(iris), blue(iris), 40);
    ellipse(ox + ww * 0.08, oy + hh * 0.02, ww * 0.35, hh * 0.1);
    return;
  }

  if (kind === "spiral") {
    paintBlob(ox, oy, ww * 1.35, hh * 1.25, socket, {
      dabs,
      under: color(6, 2, 8),
      hi: color(28, 12, 22),
    });
    const col = C(pal.accent, 210);
    noFill();
    stroke(col);
    strokeWeight(constrain(min(ww, hh) * 0.08, 1.6, 3.2));
    strokeCap(ROUND);
    beginShape();
    for (let a = 0; a < 6.4 * PI; a += 0.14) {
      const rr = map(a, 0, 6.4 * PI, max(ww, hh) * 0.46, 1.4);
      vertex(ox + cos(a + n1) * rr, oy + sin(a + n1) * rr);
    }
    endShape();
    noStroke();
    fill(red(col), green(col), blue(col), 160);
    circle(ox, oy, max(3, min(ww, hh) * 0.12));
    return;
  }

  if (kind === "pit") {
    paintBlob(ox, oy, ww * 1.3, hh * 1.15, socket, {
      dabs,
      under: color(4, 2, 6),
      hi: color(24, 10, 16),
    });
    fill(6, 2, 8, 235);
    ellipse(ox, oy + hh * 0.04, ww * 0.7, hh * 0.58);
    fill(red(iris), green(iris), blue(iris), 28);
    ellipse(ox, oy + hh * 0.1, ww * 0.28, hh * 0.16);
    return;
  }

  paintBlob(ox, oy, ww * 1.2, hh * 1.12, socket, {
    dabs,
    under: color(6, 2, 8),
    hi: color(32, 14, 20),
  });
  fill(8, 3, 10, 220);
  ellipse(ox, oy + hh * 0.02, ww * 0.92, hh * 0.86);

  const ctx = drawingContext;
  ctx.save();
  ctx.shadowColor = `rgba(${red(iris)},${green(iris)},${blue(iris)},0.8)`;
  ctx.shadowBlur = cameraMode ? 12 : 22;
  fill(iris);
  noStroke();
  ellipse(ox + (n2 - 0.5) * 2, oy + hh * 0.04, ww * 0.82, hh * 0.76);
  ctx.restore();

  fill(lerpColor(iris, color(255, 70, 30), 0.45));
  ellipse(ox, oy + hh * 0.06, ww * 0.52, hh * 0.48);

  fill(10, 4, 8, 210);
  ellipse(ox + ww * 0.06, oy + hh * 0.1, ww * 0.14, hh * 0.16);

  fill(255, 236, 210, 140);
  ellipse(ox - ww * 0.18, oy - hh * 0.16, ww * 0.09, hh * 0.07);
}

function paintMouth(x, y, w, h, kind) {
  if (kind === "none") return;
  w = min(abs(w), 58);
  h = min(abs(h), 26);
  noFill();
  stroke(90, 50, 65, 200);
  strokeWeight(2.6);
  strokeCap(ROUND);

  if (kind === "tiny") {
    strokeWeight(2.2);
    line(x - w * 0.16, y, x + w * 0.16, y);
    return;
  }

  if (kind === "cat") {
    line(x, y - 2, x, y + h * 0.35);
    arc(x - w * 0.22, y + h * 0.12, w * 0.44, h * 0.7, 0, PI);
    arc(x + w * 0.22, y + h * 0.12, w * 0.44, h * 0.7, 0, PI);
    return;
  }

  arc(x, y, w * 0.9, h * 1.15, 0.2, PI - 0.2);
}

function paintEars(kind, y, headW) {
  const pal = genome.pal;
  const col = C(pal.mid);
  const hi = C(pal.hi);
  if (kind === "none") return;
  if (kind === "bunny" || kind === "triple") {
    const n = kind === "triple" ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const x = lerp(-headW * 0.32, headW * 0.32, t) + wob(6);
      const h = random(72, 120);
      const lean = (x / headW) * 0.4 + wob(0.1);
      push();
      translate(x, y);
      rotate(lean);
      paintBlob(0, -h * 0.28, random(22, 38), h, col, {
        dabs: 90,
        ang: -HALF_PI + lean,
        hi,
      });
      pop();
    }
  } else if (kind === "round") {
    paintBlob(-headW * 0.42, y - 8, 46, 42, col, { dabs: 55, hi });
    paintBlob(headW * 0.42, y - 6, 44, 40, col, { dabs: 55, hi });
  } else if (kind === "crown" || kind === "spike") {
    const n = kind === "crown" ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const x = lerp(-headW * 0.42, headW * 0.42, t);
      const h = random(28, 58);
      paintBlob(x, y - h * 0.35, 16 + wob(6), h, col, { dabs: 40, ang: -HALF_PI, hi });
    }
  } else if (kind === "horn") {
    paintBlob(-headW * 0.38, y - 18, 34, 56, col, { dabs: 45, ang: -0.8, hi });
    paintBlob(headW * 0.4, y - 16, 32, 54, col, { dabs: 45, ang: 0.8, hi });
  }
}

function paintTuft(x, y, col) {
  paintBlob(x, y - 10, 16, 26, col, { dabs: 24, ang: -HALF_PI, hi: lerpColor(col, color(255), 0.3) });
  paintBlob(x - 8, y - 4, 12, 16, col, { dabs: 16, ang: -1.1 });
  paintBlob(x + 8, y - 4, 12, 16, col, { dabs: 16, ang: 1.1 });
}

function paintWhiskers(x, y, spread) {
  const col = C(genome.pal.claw, 90);
  stroke(col);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      strokeWeight(random(0.6, 1.1));
      const y2 = y + map(i, 0, 2, -8, 10);
      line(x + side * 8, y, x + side * (spread * 0.55 + random(12)), y2 + wob(4));
    }
  }
}

function paintTail(kind, x, y, col) {
  if (kind === "none" || !kind) return;
  const hi = C(genome.pal.hi);
  if (kind === "x") {
    const acc = C(genome.pal.accent);
    paintBlob(x, y, 36, 14, acc, { dabs: 35, ang: 0.7, hi: acc });
    paintBlob(x, y, 36, 14, acc, { dabs: 35, ang: -0.7, hi: acc });
    return;
  }
  if (kind === "rat") {
    const pts = bezierPts(
      createVector(x, y),
      createVector(x + 40, y + 20),
      createVector(x + 90, y + 10),
      createVector(x + 120, y + 48),
      12
    );
    paintTube(pts, 10, 3, col, { hi });
    return;
  }
  const side = genome.tailSide != null ? genome.tailSide : random() < 0.5 ? 1 : -1;
  const lift = kind === "curl" ? -160 : 40;
  const pts = bezierPts(
    createVector(x, y),
    createVector(x + side * 40, y - 20),
    createVector(x + side * 90, y + lift * 0.2),
    createVector(x + side * (kind === "curl" ? 70 : 140), y + lift),
    16
  );
  paintTube(pts, kind === "curl" ? 28 : 22, 10, random() < 0.35 ? C(genome.pal.accent) : col, {
    hi,
    dabs: 36,
  });
}

function drawTotem(g) {
  const pal = g.pal;
  const body = C(pal.body);
  const mid = C(pal.mid);
  const hi = C(pal.hi);
  paintGround(268, 210);

  const footY = 248;
  if (g.legs === "thin") {
    limb(-36 + wob(6), 90, -42 + wob(8), footY, 28, 18, body, wob(18));
    limb(40 + wob(6), 90, 38 + wob(8), footY, 28, 18, lerpColor(body, C(pal.hi), 0.2), wob(18));
    paintBlob(-44, footY + 8, 54, 22, mid, { dabs: 40, hi });
    paintBlob(40, footY + 8, 56, 22, mid, { dabs: 40, hi });
  } else {
    paintBlob(-32, 170, 50, 110, body, { dabs: 80, ang: 0.1, hi });
    paintBlob(34, 170, 52, 112, lerpColor(body, hi, 0.15), { dabs: 80, ang: -0.1, hi });
    paintBlob(-34, 230, 64, 36, mid, { dabs: 45, hi });
    paintBlob(36, 230, 66, 36, mid, { dabs: 45, hi });
  }

  paintBlob(wob(8), 48, 250, 190, body, { dabs: 240, ang: 0.15, hi });
  if (g.fur) paintFur(0, 48, 250, 190, mid, 70);

  let y = -20;
  const rs = [];
  for (let i = 0; i < g.stack; i++) {
    const r = map(i, 0, max(1, g.stack - 1), 96, 52) + wob(8);
    rs.push(r);
    y -= r * 0.86;
    paintBlob(wob(10), y, r * 2.1, r * 1.85, i % 2 ? mid : body, {
      dabs: 130,
      ang: random(-0.4, 0.4),
      hi,
    });
    if (i === 0) {
      if (isSingleEye(g.eyes)) {
        paintEye(wob(6), y, 32, 32, g.eyes);
      } else {
        paintEye(-r * 0.28, y - 4, 26, 26, g.eyes);
        paintEye(r * 0.3, y - 2, 26, 26, g.eyes);
      }
    }
  }
  const headY = y;
  if (g.mouth !== "none") paintMouth(wob(6), 8, 92, 42, g.mouth);
  if (g.tuft) paintTuft(wob(8), headY - rs[rs.length - 1] * 0.7, C(pal.claw));

  if (g.arms === "cactus") {
    for (const side of [-1, 1]) {
      limb(side * 100, 20, side * (130 + random(20)), -40, 16, 10, C(pal.claw), side * 20);
      limb(side * 118, -8, side * 128, 30, 12, 8, C(pal.claw), side * -10);
    }
  } else if (g.arms === "thin") {
    limb(-108, 10, -150, 90, 18, 10, mid, -30);
    limb(110, 8, 148, 86, 18, 10, mid, 30);
    paintClaws(-150, 92, 3, 0.5, C(pal.claw), PI * 0.6);
    paintClaws(148, 88, 3, 0.5, C(pal.claw), PI * 0.4);
  }
}

function drawCephalopod(g) {
  const pal = g.pal;
  const body = C(pal.body);
  const mid = C(pal.mid);
  const hi = C(pal.hi);
  const n = floor(g.arms);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x1 = lerp(-70, 70, t);
    const x2 = lerp(-250, 250, t) + wob(30);
    const y2 = random(180, 340);
    const pts = bezierPts(
      createVector(x1, 50),
      createVector(x1 + wob(70), 130),
      createVector(x2 + wob(50), 200),
      createVector(x2, y2),
      16
    );
    paintTube(pts, 48, 16, i % 2 ? body : mid, { hi, dabs: 34 });
    paintClaws(x2, y2, 3, 0.45, C(pal.claw), HALF_PI + wob(0.3));
  }

  paintBlob(0, 28, 240, 100, body, { dabs: 180, ang: 0.05, hi });
  paintMouth(0, 22, 150, 50, g.mouth);

  for (let i = 0; i < g.heads; i++) {
    const x = map(i, 0, g.heads - 1, -70, 70) + wob(8);
    paintBlob(x, -86 + wob(10), 92, 150, i === 1 ? lerpColor(body, C(pal.hi), 0.15) : mid, {
      dabs: 150,
      ang: -HALF_PI + wob(0.2),
      hi,
    });
    paintEye(x + wob(4), -108, 34, 40, g.eyes);
  }
}

function drawWader(g) {
  const pal = g.pal;
  const body = C(pal.body);
  const mid = C(pal.mid);
  const hi = C(pal.hi);
  paintGround(270, 180);

  limb(-18, 90, -28, 250, 32, 22, body, -12);
  limb(22, 90, 36, 248, 32, 22, lerpColor(body, hi, 0.25), 14);
  paintBlob(-32, 258, 70, 24, mid, { dabs: 40, hi });
  paintBlob(40, 256, 74, 24, mid, { dabs: 40, hi });

  paintBlob(wob(6), 20, 128, 168, body, { dabs: 220, ang: 0.2, hi });
  if (g.fur) paintFur(0, 20, 128, 168, mid, 80);

  paintBlob(wob(4), -110, 46, 110, mid, { dabs: 90, ang: -0.1, hi });
  paintBlob(wob(8), -188, 92, 78, body, { dabs: 140, hi });
  paintEars(g.ears, -220, 92);
  if (isSingleEye(g.eyes)) {
    paintEye(0, -192, 32, 32, g.eyes);
  } else {
    paintEye(-18, -196, 28, 28, g.eyes);
    paintEye(22, -194, 26, 26, g.eyes);
  }
  paintMouth(2, -168, 48, 22, g.mouth);

  if (g.pose === "wave") {
    limb(48, -40, 120, -110, 22, 14, mid, 20);
    paintClaws(122, -112, 3, 0.5, C(pal.claw), -PI * 0.2);
    limb(-50, -20, -40, 80, 20, 16, mid, -8);
  } else {
    limb(50, -30, 70, 70, 22, 14, mid, 16);
    limb(-52, -24, -80, 64, 22, 14, mid, -16);
  }
  paintTail(g.tail, 36, 90, mid);
}

function drawCroucher(g) {
  const pal = g.pal;
  const body = C(pal.body);
  const mid = C(pal.mid);
  const hi = C(pal.hi);
  paintGround(250, 240);

  paintBlob(10, 70, 170, 150, body, { dabs: 240, ang: 0.25, hi });
  paintBlob(-10, 10, 150, 140, mid, { dabs: 180, ang: -0.2, hi });
  if (g.fur) paintFur(0, 30, 190, 180, C(pal.claw), 110);

  limb(-70, -10, -120, 210, 36, 24, mid, -18);
  limb(50, 0, 70, 215, 34, 24, lerpColor(body, hi, 0.3), 22);
  paintBlob(-128, 222, 80, 32, C(pal.claw), { dabs: 50, hi: C(pal.claw) });
  paintBlob(78, 222, 78, 32, C(pal.claw), { dabs: 50 });
  paintClaws(-128, 234, 4, 0.55, C(pal.hi), HALF_PI);
  paintClaws(80, 234, 4, 0.55, C(pal.hi), HALF_PI);

  paintBlob(40, 120, 90, 70, lerpColor(body, hi, 0.2), { dabs: 90, hi });
  paintTail(g.tail, 80, 90, hi);

  paintBlob(wob(6), -130, 100, 120, lerpColor(mid, C(pal.hi), 0.15), {
    dabs: 160,
    ang: -0.15,
    hi,
  });
  paintEars(g.ears, -190, 90);
  paintEye(-18, -138, 24, 24, g.eyes);
  paintEye(20, -136, 22, 22, g.eyes);
  paintMouth(2, -108, 36, 48, g.mouth);
}

function drawDancer(g) {
  const pal = g.pal;
  const body = C(pal.body);
  const mid = C(pal.mid);
  const hi = C(pal.hi);
  paintGround(250, 160);

  limb(-10, 80, -36, 230, 24, 14, mid, -20);
  limb(18, 80, 70, 210, 24, 14, lerpColor(body, hi, 0.25), 28);
  paintClaws(-36, 234, 3, 0.4, C(pal.claw), HALF_PI);
  paintClaws(72, 214, 3, 0.4, C(pal.claw), HALF_PI * 0.8);

  paintBlob(0, -10, 130, 170, body, { dabs: 240, ang: 0.35, hi });
  paintFur(0, -10, 140, 180, C(pal.claw), 160);

  limb(-48, -50, -170, 10, 20, 11, mid, -50);
  limb(40, -80, 150, -170, 20, 11, hi, 30);
  paintClaws(-172, 12, 4, 0.5, C(pal.claw), PI * 0.7);
  paintClaws(152, -174, 4, 0.5, C(pal.claw), -PI * 0.3);

  paintBlob(-8, -150, 86, 86, mid, { dabs: 140, hi });
  paintEars(g.ears, -188, 80);
  if (isSingleEye(g.eyes)) {
    paintEye(-6, -154, 36, 36, g.eyes);
  } else {
    paintEye(-18, -154, 26, 26, g.eyes);
    paintEye(18, -152, 26, 26, g.eyes);
  }
  paintMouth(0, -128, 28, 16, g.mouth);
  paintBlob(0, -134, 14, 12, hi, { dabs: 18 });
}

function drawBeast(g) {
  const pal = g.pal;
  const body = C(pal.body);
  const mid = C(pal.mid);
  const hi = C(pal.hi);
  paintGround(230, 260);

  paintBlob(10, 40, 250, 150, body, { dabs: 280, ang: 0.18, hi });
  paintBlob(-70, -20, 160, 140, mid, { dabs: 200, ang: -0.1, hi });
  if (g.fur) paintFur(-20, 10, 260, 180, C(pal.claw), 90);

  limb(-90, 70, -110, 200, 40, 28, body, -10);
  limb(-20, 80, -10, 205, 36, 26, mid, 8);
  limb(50, 70, 70, 200, 38, 26, body, 12);
  limb(110, 50, 130, 198, 36, 26, lerpColor(body, hi, 0.2), 10);
  paintBlob(-118, 212, 70, 28, hi, { dabs: 40 });
  paintBlob(-8, 214, 66, 26, hi, { dabs: 40 });
  paintBlob(72, 212, 64, 26, hi, { dabs: 40 });
  paintBlob(132, 210, 68, 26, hi, { dabs: 40 });

  paintEars(g.ears, -80, 150);
  paintEye(-110, -28, 32, 32, g.eyes);
  paintEye(-48, -30, 30, 30, g.eyes);
  paintMouth(-78, 18, 70, 48, g.mouth);
  paintTail(g.tail, 120, -10, random() < 0.5 ? C(pal.accent) : hi);
}

function drawStout(g) {
  const pal = g.pal;
  const body = C(pal.body);
  const mid = C(pal.mid);
  const hi = C(pal.hi);
  paintGround(230, 190);

  paintBlob(0, 80, 170, 160, body, { dabs: 240, ang: 0.2, hi });
  paintBlob(-36, 140, 58, 120, mid, { dabs: 90, ang: 0.1, hi });
  paintBlob(40, 142, 60, 118, body, { dabs: 90, ang: -0.1, hi });
  if (g.fur) paintFur(0, 70, 180, 170, mid, 100);

  paintBlob(wob(6), -70, 200, 130, mid, { dabs: 220, ang: 0.05, hi });
  paintEars(g.ears, -128, 170);
  paintEye(-48, -78, 42, 42, g.eyes);
  paintEye(50, -76, 40, 40, g.eyes);
  paintMouth(0, -28, 42, 22, g.mouth);
  paintFur(-2, -70, 210, 140, C(pal.claw), 40);

  if (g.blade) {
    const pts = [
      createVector(70, -10),
      createVector(110, -18),
      createVector(168, -28),
    ];
    paintTube(pts, 22, 8, C(pal.accent), { hi: color(80, 120, 220), dabs: 28 });
  }
}

function drawHopper(g) {
  const pal = g.pal;
  const body = C(pal.body);
  const mid = C(pal.mid);
  const hi = C(pal.hi);
  paintGround(210, 220);

  paintBlob(30, 90, 210, 150, body, { dabs: 240, ang: 0.2, hi });
  paintBlob(-50, -10, 160, 180, mid, { dabs: 220, ang: -0.15, hi });
  if (g.fur) paintFur(-10, 40, 250, 210, C(pal.claw), 70);

  paintBlob(-80, 175, 78, 44, C(pal.claw), { dabs: 50, hi: C(pal.hi) });
  paintBlob(-8, 182, 72, 40, C(pal.claw), { dabs: 50, hi: C(pal.hi) });
  paintClaws(-82, 192, 3, 0.4, C(pal.hi), HALF_PI);
  paintClaws(-6, 198, 3, 0.4, C(pal.hi), HALF_PI);

  paintEars(g.ears, -110, 120);
  paintEye(-78, -50, 36, 40, g.eyes);
  paintEye(-36, -48, 34, 38, g.eyes);
  paintMouth(-58, -8, 36, 18, g.mouth);
  if (g.whiskers) paintWhiskers(-20, -6, 50);
  paintTail(g.tail, 130, 40, C(pal.accent));
}

function drawCellblob(g) {
  const pal = g.pal;
  const cells = 22 + floor(random(12));
  const colors = [pal.body, pal.mid, pal.hi, pal.accent, pal.claw, [40, 180, 90], [220, 80, 40], [255, 60, 30], [60, 200, 160]];
  paintBlob(0, 0, 360, 270, C(pal.body), { dabs: 90 });
  for (let i = 0; i < cells; i++) {
    const a = random(TWO_PI);
    const d = random(0, 150);
    const x = cos(a) * d * random(0.4, 1.15);
    const y = sin(a) * d * 0.72;
    const r = random(36, 96);
    const col = C(pick(colors));
    paintBlob(x, y, r * 1.45, r * 1.25, col, {
      dabs: 80,
      hi: lerpColor(col, color(255, 200, 80), 0.35),
      ang: random(TWO_PI),
    });
  }
  paintEars(g.ears, -120, 220);
  paintEye(-62, -24, 72, 72, g.eyes);
  paintEye(66, -18, 68, 68, g.eyes);
  paintMouth(4, 48, 52, 34, g.mouth);
  if (g.whiskers) paintWhiskers(0, 24, 120);
  paintTail(g.tail, 120, 80, C(pal.mid));
}
