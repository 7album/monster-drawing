/* Image Avatar mode — Live2D-like mesh warp driven by ml5.faceMesh */

let avatarImage = null;
let avatarSourceRaw = null;
let avatarSourceKps = null;
let avatarFaces = [];
let avatarTriangles = null;
let faceMeshModel = null;
let faceMeshReady = false;
let faceMeshStarting = false;
let avatarMessage = "";
let avatarAnalyzing = false;
let avatarDefaultLoading = false;
let avatarDragOver = false;
let avatarFaceSmooth = null;
let avatarDisplay = { x: 0, y: 0, w: 0, h: 0, scale: 1 };

const DEFAULT_AVATAR_FILE = "Dunet&TinYan03.png";
const DEFAULT_AVATAR_URL = "Dunet%26TinYan03.png";
const AVATAR_MAX_EDGE = 1600;
const AVATAR_PORTRAIT_RATIO = 1.28;

const FACE_MESH_OPTS = { maxFaces: 1, refineLandmarks: true, flipHorizontal: false };

function resetAvatarSmoothing() {
  avatarFaceSmooth = null;
}

function ensureFaceMesh(onReady) {
  if (typeof ml5 === "undefined" || !ml5.faceMesh) {
    avatarMessage = "Face mesh library failed to load";
    if (onReady) onReady(false);
    return;
  }
  if (faceMeshModel && faceMeshReady) {
    if (onReady) onReady(true);
    return;
  }
  if (faceMeshStarting) return;
  faceMeshStarting = true;
  avatarMessage = "Loading face model…";
  try {
    faceMeshModel = ml5.faceMesh(FACE_MESH_OPTS, () => {
      faceMeshReady = true;
      faceMeshStarting = false;
      avatarTriangles = faceMeshModel.getTriangles();
      avatarMessage = "";
      if (onReady) onReady(true);
    });
  } catch (e) {
    faceMeshStarting = false;
    avatarMessage = "Could not load face model";
    if (onReady) onReady(false);
  }
}

function stopAvatarFaceDetect() {
  if (faceMeshModel && faceMeshModel.detectStop) {
    try {
      faceMeshModel.detectStop();
    } catch (e) {
      /* ignore */
    }
  }
  avatarFaces = [];
}

function startAvatarFaceDetect(videoSource) {
  if (!faceMeshModel || !faceMeshReady || !videoSource) return;
  stopAvatarFaceDetect();
  const src = videoSource.elt || videoSource;
  faceMeshModel.detectStart(src, gotAvatarFaces);
}

function gotAvatarFaces(results) {
  avatarFaces = results || [];
}

/**
 * Tall portraits: crop from the top so the face region is larger in pixel space for mesh detection.
 * Then downscale so the longest edge is at most AVATAR_MAX_EDGE (keeps quality, saves memory).
 */
function prepareAvatarWorkingImage(src, opts = {}) {
  if (!src || !src.width) return src;
  const cropPortrait = opts.cropPortrait !== false;
  let sx = 0;
  let sy = 0;
  let cw = src.width;
  let ch = src.height;

  if (cropPortrait && ch / cw > AVATAR_PORTRAIT_RATIO) {
    ch = min(ch, max(cw * 1.05, ch * 0.48));
    sy = 0;
  }

  let dw = cw;
  let dh = ch;
  const long = max(dw, dh);
  if (long > AVATAR_MAX_EDGE) {
    const s = AVATAR_MAX_EDGE / long;
    dw = floor(cw * s);
    dh = floor(ch * s);
  } else {
    dw = floor(dw);
    dh = floor(dh);
  }

  const g = createGraphics(dw, dh);
  g.image(src, 0, 0, dw, dh, sx, sy, cw, ch);
  return g.get();
}

function prepareAvatarScaledOnly(src) {
  return prepareAvatarWorkingImage(src, { cropPortrait: false });
}

function setAvatarFromSourceImage(src) {
  if (!src || !src.width) return;
  avatarSourceRaw = src;
  avatarImage = prepareAvatarWorkingImage(src);
  avatarSourceKps = null;
  avatarMessage = "";
  resetAvatarSmoothing();
  layoutAvatarDisplay();
  analyzeAvatarImage();
  if (!cameraMode) redraw();
}

function loadDefaultAvatarAsset() {
  avatarDefaultLoading = true;
  avatarMessage = "Loading artwork…";
  loadImage(
    DEFAULT_AVATAR_URL,
    (img) => {
      avatarDefaultLoading = false;
      setAvatarFromSourceImage(img);
    },
    () => {
      avatarDefaultLoading = false;
      avatarMessage = "Default artwork not found (" + DEFAULT_AVATAR_FILE + ")";
      if (!cameraMode) redraw();
    }
  );
}

function acceptAvatarFile(file) {
  if (!file || !file.type || !file.type.startsWith("image/")) {
    avatarMessage = "Use a PNG or JPG image";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    loadImage(
      reader.result,
      (img) => setAvatarFromSourceImage(img),
      () => {
        avatarMessage = "Could not read that image";
      }
    );
  };
  reader.readAsDataURL(file);
}

function runFaceDetectOnImage(img, onDone) {
  faceMeshModel.detect(img, (faces) => {
    onDone(faces && faces.length && faces[0].keypoints ? faces[0].keypoints : null);
  });
}

function analyzeAvatarImage() {
  if (!avatarImage) return;
  avatarAnalyzing = true;
  avatarMessage = "Finding face in image…";
  ensureFaceMesh((ok) => {
    if (!ok || !faceMeshModel) {
      avatarAnalyzing = false;
      return;
    }
    runFaceDetectOnImage(avatarImage, (kps) => {
      if (kps) {
        avatarAnalyzing = false;
        avatarSourceKps = cloneKeypoints(kps);
        avatarMessage = "";
        layoutAvatarDisplay();
        if (!cameraMode) redraw();
        return;
      }
      const fallbackImg = avatarSourceRaw
        ? prepareAvatarScaledOnly(avatarSourceRaw)
        : null;
      if (!fallbackImg) {
        avatarAnalyzing = false;
        avatarSourceKps = null;
        avatarMessage = "No face found — try another photo or upload";
        if (!cameraMode) redraw();
        return;
      }
      runFaceDetectOnImage(fallbackImg, (kps2) => {
        avatarAnalyzing = false;
        if (kps2) {
          avatarImage = fallbackImg;
          avatarSourceKps = cloneKeypoints(kps2);
          avatarMessage = "";
        } else {
          avatarSourceKps = null;
          avatarMessage = "No face found — try a clear front-facing photo";
        }
        layoutAvatarDisplay();
        if (!cameraMode) redraw();
      });
    });
  });
}

function cloneKeypoints(kps) {
  const out = new Array(kps.length);
  for (let i = 0; i < kps.length; i++) {
    out[i] = { x: kps[i].x, y: kps[i].y, z: kps[i].z || 0 };
  }
  return out;
}

function layoutAvatarDisplay() {
  if (!avatarImage) return;
  const pad = 0.08;
  const maxW = width * (1 - pad * 2);
  const maxH = height * (1 - pad * 2);
  const s = min(maxW / avatarImage.width, maxH / avatarImage.height);
  avatarDisplay.scale = s;
  avatarDisplay.w = avatarImage.width * s;
  avatarDisplay.h = avatarImage.height * s;
  avatarDisplay.x = (width - avatarDisplay.w) / 2;
  avatarDisplay.y = (height - avatarDisplay.h) / 2;
}

function sourceKpToCanvas(i) {
  const kp = avatarSourceKps[i];
  return {
    x: avatarDisplay.x + kp.x * avatarDisplay.scale,
    y: avatarDisplay.y + kp.y * avatarDisplay.scale,
  };
}

function liveKpToCanvas(face) {
  if (!video || !video.width) return null;
  const out = new Array(face.keypoints.length);
  for (let i = 0; i < face.keypoints.length; i++) {
    const kp = face.keypoints[i];
    const p = vidToCanvas(kp.x, kp.y);
    out[i] = { x: p.x, y: p.y };
  }
  return out;
}

function smoothLiveKeypoints(raw) {
  if (!raw) return null;
  if (!avatarFaceSmooth) {
    avatarFaceSmooth = cloneKeypoints(raw);
    return avatarFaceSmooth;
  }
  const a = 0.45;
  for (let i = 0; i < raw.length; i++) {
    avatarFaceSmooth[i].x = lerp(avatarFaceSmooth[i].x, raw[i].x, a);
    avatarFaceSmooth[i].y = lerp(avatarFaceSmooth[i].y, raw[i].y, a);
  }
  return avatarFaceSmooth;
}

/** Scale & shift live points so inter-eye distance matches the uploaded image. */
function alignLiveToSource(liveCanvasKps) {
  if (!avatarSourceKps || !liveCanvasKps) return liveCanvasKps;
  const li = 33;
  const ri = 263;
  if (liveCanvasKps.length <= ri || avatarSourceKps.length <= ri) return liveCanvasKps;

  const srcL = sourceKpToCanvas(li);
  const srcR = sourceKpToCanvas(ri);
  const srcDist = dist(srcL.x, srcL.y, srcR.x, srcR.y);
  const liveDist = dist(liveCanvasKps[li].x, liveCanvasKps[li].y, liveCanvasKps[ri].x, liveCanvasKps[ri].y);
  if (liveDist < 8 || srcDist < 8) return liveCanvasKps;

  const scale = srcDist / liveDist;
  const srcMid = { x: (srcL.x + srcR.x) / 2, y: (srcL.y + srcR.y) / 2 };
  const liveMid = {
    x: (liveCanvasKps[li].x + liveCanvasKps[ri].x) / 2,
    y: (liveCanvasKps[li].y + liveCanvasKps[ri].y) / 2,
  };

  const aligned = new Array(liveCanvasKps.length);
  for (let i = 0; i < liveCanvasKps.length; i++) {
    aligned[i] = {
      x: srcMid.x + (liveCanvasKps[i].x - liveMid.x) * scale,
      y: srcMid.y + (liveCanvasKps[i].y - liveMid.y) * scale,
    };
  }
  return aligned;
}

function drawTexturedTriangle(img, sx0, sy0, sx1, sy1, sx2, sy2, dx0, dy0, dx1, dy1, dx2, dy2) {
  const ctx = drawingContext;
  const imgEl = img.canvas || img.elt;
  if (!imgEl) return;

  const denom = sx0 * (sy1 - sy2) + sx1 * (sy2 - sy0) + sx2 * (sy0 - sy1);
  if (Math.abs(denom) < 1e-4) return;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(dx0, dy0);
  ctx.lineTo(dx1, dy1);
  ctx.lineTo(dx2, dy2);
  ctx.closePath();
  ctx.clip();

  const a = (dx0 * (sy1 - sy2) + dx1 * (sy2 - sy0) + dx2 * (sy0 - sy1)) / denom;
  const b = (dy0 * (sy1 - sy2) + dy1 * (sy2 - sy0) + dy2 * (sy0 - sy1)) / denom;
  const c = (dx0 * (sx2 - sx1) + dx1 * (sx0 - sx2) + dx2 * (sx1 - sx0)) / denom;
  const d = (dy0 * (sx2 - sx1) + dy1 * (sx0 - sx2) + dy2 * (sx1 - sx0)) / denom;
  const e =
    (dx0 * (sx1 * sy2 - sx2 * sy1) + dx1 * (sx2 * sy0 - sx0 * sy2) + dx2 * (sx0 * sy1 - sx1 * sy0)) /
    denom;
  const f =
    (dy0 * (sx1 * sy2 - sx2 * sy1) + dy1 * (sx2 * sy0 - sx0 * sy2) + dy2 * (sx0 * sy1 - sx1 * sy0)) /
    denom;

  ctx.transform(a, b, c, d, e, f);
  ctx.drawImage(imgEl, 0, 0);
  ctx.restore();
}

function warpAvatarMesh(targetKps) {
  if (!avatarImage || !avatarSourceKps || !avatarTriangles || !targetKps) return;
  const img = avatarImage;
  for (let j = 0; j < avatarTriangles.length; j++) {
    const idx = avatarTriangles[j];
    const ia = idx[0];
    const ib = idx[1];
    const ic = idx[2];
    if (ia >= avatarSourceKps.length || ib >= avatarSourceKps.length || ic >= avatarSourceKps.length) continue;
    if (ia >= targetKps.length || ib >= targetKps.length || ic >= targetKps.length) continue;

    const sA = avatarSourceKps[ia];
    const sB = avatarSourceKps[ib];
    const sC = avatarSourceKps[ic];
    const tA = targetKps[ia];
    const tB = targetKps[ib];
    const tC = targetKps[ic];

    drawTexturedTriangle(
      img,
      sA.x,
      sA.y,
      sB.x,
      sB.y,
      sC.x,
      sC.y,
      tA.x,
      tA.y,
      tB.x,
      tB.y,
      tC.x,
      tC.y
    );
  }
}

function drawAvatarPlaceholder() {
  layoutAvatarDisplay();
  const cx = width / 2;
  const cy = height * 0.46;
  const r = min(width, height) * 0.22;

  noStroke();
  fill(235, 228, 218);
  rect(avatarDisplay.x, avatarDisplay.y, avatarDisplay.w || width * 0.72, avatarDisplay.h || height * 0.65, 16);

  fill(216, 206, 192);
  ellipse(cx, cy - r * 0.08, r * 1.35, r * 1.55);
  fill(198, 188, 176);
  ellipse(cx - r * 0.38, cy - r * 0.12, r * 0.22, r * 0.14);
  ellipse(cx + r * 0.38, cy - r * 0.12, r * 0.22, r * 0.14);
  fill(180, 170, 158);
  arc(cx, cy + r * 0.18, r * 0.35, r * 0.18, 0, PI);

  fill(122, 113, 104, 180);
  textAlign(CENTER, CENTER);
  textFont("Georgia");
  textSize(14);
  text("Drop a PNG/JPG here or click Upload", cx, cy + r * 0.95);
  textSize(11);
  fill(122, 113, 104, 130);
  text("Default: " + DEFAULT_AVATAR_FILE, cx, cy + r * 1.18);
}

function drawAvatarStaticImage() {
  layoutAvatarDisplay();
  push();
  drawingContext.save();
  drawingContext.beginPath();
  if (drawingContext.roundRect) {
    drawingContext.roundRect(avatarDisplay.x, avatarDisplay.y, avatarDisplay.w, avatarDisplay.h, 12);
  } else {
    drawingContext.rect(avatarDisplay.x, avatarDisplay.y, avatarDisplay.w, avatarDisplay.h);
  }
  drawingContext.clip();
  image(avatarImage, avatarDisplay.x, avatarDisplay.y, avatarDisplay.w, avatarDisplay.h);
  drawingContext.restore();
  pop();

  noFill();
  stroke(216, 206, 192);
  strokeWeight(1);
  if (drawingContext.roundRect) {
    drawingContext.beginPath();
    drawingContext.roundRect(avatarDisplay.x, avatarDisplay.y, avatarDisplay.w, avatarDisplay.h, 12);
    drawingContext.stroke();
  } else {
    rect(avatarDisplay.x, avatarDisplay.y, avatarDisplay.w, avatarDisplay.h, 12);
  }
  noStroke();
}

function drawAvatarStatus(msg) {
  fill(122, 113, 104, 200);
  noStroke();
  textAlign(CENTER, CENTER);
  textFont("Georgia");
  textSize(14);
  text(msg, width / 2, height * 0.88);
}

function drawAvatarFrame() {
  layoutAvatarDisplay();

  if (avatarAnalyzing) {
    if (avatarImage) drawAvatarStaticImage();
    else drawAvatarPlaceholder();
    drawAvatarStatus(avatarMessage || "Analyzing…");
    drawCameraThumb();
    return;
  }

  if (!avatarImage) {
    drawAvatarPlaceholder();
    if (avatarDragOver) {
      noFill();
      stroke(88, 158, 230, 160);
      strokeWeight(2);
      rect(width * 0.06, height * 0.06, width * 0.88, height * 0.76, 18);
    }
    drawAvatarStatus(cameraError || avatarMessage || "Upload an image, then use the camera");
    drawCameraThumb();
    return;
  }

  if (!avatarSourceKps) {
    drawAvatarStaticImage();
    drawAvatarStatus(avatarMessage || "Need a detectable face in the image");
    drawCameraThumb();
    return;
  }

  if (cameraError) {
    drawAvatarStaticImage();
    drawAvatarStatus(cameraError);
    drawCameraThumb();
    return;
  }

  if (cameraStarting && !avatarFaces.length) {
    drawAvatarStaticImage();
    drawAvatarStatus("Starting camera…");
    drawCameraThumb();
    return;
  }

  if (!avatarFaces.length || !avatarFaces[0].keypoints) {
    drawAvatarStaticImage();
    drawAvatarStatus("Look at the camera to animate");
    drawCameraThumb();
    return;
  }

  const rawLive = liveKpToCanvas(avatarFaces[0]);
  const aligned = alignLiveToSource(rawLive);
  const target = smoothLiveKeypoints(aligned);

  push();
  drawingContext.save();
  drawingContext.beginPath();
  if (drawingContext.roundRect) {
    drawingContext.roundRect(avatarDisplay.x - 4, avatarDisplay.y - 4, avatarDisplay.w + 8, avatarDisplay.h + 8, 14);
  } else {
    drawingContext.rect(avatarDisplay.x - 4, avatarDisplay.y - 4, avatarDisplay.w + 8, avatarDisplay.h + 8);
  }
  drawingContext.clip();
  applySimpleBodyLayer();
  warpAvatarMesh(target);
  drawingContext.restore();
  pop();

  noFill();
  stroke(216, 206, 192, 120);
  strokeWeight(1);
  rect(avatarDisplay.x, avatarDisplay.y, avatarDisplay.w, avatarDisplay.h, 12);
  noStroke();

  drawCameraThumb();
}

/** Optional: subtle torso shift from body pose when shoulders are visible. */
function applySimpleBodyLayer() {
  const k = collectPose();
  if (!k || !k.leftshoulder || !k.rightshoulder || !avatarSourceKps) return;
  const ls = k.leftshoulder;
  const rs = k.rightshoulder;
  const midSh = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
  const li = 234;
  const ri = 454;
  if (avatarFaceSmooth && avatarFaceSmooth.length > ri) {
    const faceMid = {
      x: (avatarFaceSmooth[li].x + avatarFaceSmooth[ri].x) / 2,
      y: (avatarFaceSmooth[li].y + avatarFaceSmooth[ri].y) / 2,
    };
    const dx = midSh.x - faceMid.x;
    const dy = midSh.y - faceMid.y;
    if (abs(dx) < width * 0.35 && abs(dy) < height * 0.35) {
      push();
      translate(dx * 0.12, dy * 0.08);
      image(
        avatarImage,
        avatarDisplay.x,
        avatarDisplay.y + avatarDisplay.h * 0.42,
        avatarDisplay.w,
        avatarDisplay.h * 0.58,
        avatarDisplay.x,
        avatarDisplay.y + avatarDisplay.h * 0.42,
        avatarDisplay.w,
        avatarDisplay.h * 0.58
      );
      pop();
    }
  }
}

function drawAvatarStill() {
  if (avatarDefaultLoading) {
    drawAvatarPlaceholder();
    drawAvatarStatus(avatarMessage || "Loading artwork…");
    return;
  }
  if (avatarMessage && !avatarImage) {
    drawAvatarPlaceholder();
    drawAvatarStatus(avatarMessage);
    return;
  }
  if (!avatarImage) {
    drawAvatarPlaceholder();
    drawAvatarStatus("Press c for camera · u upload · m monster mode");
    return;
  }
  drawAvatarStaticImage();
  if (avatarMessage) drawAvatarStatus(avatarMessage);
  else if (!avatarSourceKps) drawAvatarStatus("Face not detected — try another photo");
  else drawAvatarStatus("Press c to animate with your webcam");
}

function setupAvatarUi() {
  const input = document.getElementById("avatar-upload");
  const btn = document.getElementById("upload-btn");
  if (btn && input) {
    btn.addEventListener("click", () => input.click());
    input.addEventListener("change", () => {
      if (input.files && input.files[0]) acceptAvatarFile(input.files[0]);
      input.value = "";
    });
  }

  const wrap = document.getElementById("canvas-wrap");
  if (!wrap) return;

  const onDrag = (e) => {
    if (appMode !== "avatar") return;
    e.preventDefault();
  };
  wrap.addEventListener("dragenter", (e) => {
    if (appMode !== "avatar") return;
    e.preventDefault();
    avatarDragOver = true;
    if (!cameraMode) redraw();
  });
  wrap.addEventListener("dragleave", (e) => {
    if (appMode !== "avatar") return;
    avatarDragOver = false;
    if (!cameraMode) redraw();
  });
  wrap.addEventListener("dragover", onDrag);
  wrap.addEventListener("drop", (e) => {
    if (appMode !== "avatar") return;
    e.preventDefault();
    avatarDragOver = false;
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) acceptAvatarFile(f);
  });

  loadDefaultAvatarAsset();
  ensureFaceMesh();
}
