import * as THREE from "three";
import { fileForGenome, inflateSculpture, loadImage, skinPositions } from "./sculpt.js";

const stage = document.getElementById("puppet-stage");
const cache = new Map();
let renderer;
let scene;
let camera;
let mesh = null;
let sculpture = null;
let posed = null;
let currentFile = "";
let loading = null;
let lastW = 0;
let lastH = 0;

function mid(a, b, fallback) {
  if (a && b) return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
  return a || b || fallback;
}

function ensureScene() {
  if (renderer) return;
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(0, 800, 0, 1000, -4000, 4000);
  renderer = new THREE.WebGLRenderer({ canvas: stage, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  scene.add(new THREE.AmbientLight(0xfff6ee, 0.7));
  scene.add(new THREE.HemisphereLight(0xfff4ea, 0x3a2a22, 1.25));
  const key = new THREE.DirectionalLight(0xfff4e8, 1.85);
  key.position.set(240, -180, 800);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xd8e4ff, 0.7);
  fill.position.set(-320, 80, 520);
  scene.add(fill);
}

function resize(w, h) {
  if (!renderer || (w === lastW && h === lastH)) return;
  lastW = w;
  lastH = h;
  renderer.setSize(w, h, false);
  camera.left = 0;
  camera.right = w;
  camera.top = 0;
  camera.bottom = h;
  camera.position.set(0, 0, 900);
  camera.updateProjectionMatrix();
}

function liveBonesFromPose(pose, face, w, h) {
  const nose = pose.nose || (face && face.center);
  const ls = pose.leftshoulder;
  const rs = pose.rightshoulder;
  const lh = pose.lefthip;
  const rh = pose.righthip;
  if (!nose || (!ls && !rs)) return null;
  const chest = mid(ls, rs, { x: nose.x, y: nose.y + 70 });
  const hips = mid(lh, rh, { x: chest.x, y: chest.y + 150 });
  const shW = ls && rs ? Math.hypot(ls.x - rs.x, ls.y - rs.y) : 90;
  const head = {
    x: nose.x + (face ? face.yaw * shW * 0.12 : 0),
    y: nose.y + (face ? face.pitch * shW * 0.14 : 0),
  };
  const elbowL = pose.leftelbow || ls || chest;
  const elbowR = pose.rightelbow || rs || chest;
  const wristL = pose.leftwrist || elbowL;
  const wristR = pose.rightwrist || elbowR;
  const kneeL = pose.leftknee || lh || hips;
  const kneeR = pose.rightknee || rh || hips;
  const ankleL = pose.leftankle || kneeL;
  const ankleR = pose.rightankle || kneeR;
  const shL = ls || { x: chest.x - shW * 0.5, y: chest.y };
  const shR = rs || { x: chest.x + shW * 0.5, y: chest.y };
  const hipL = lh || { x: hips.x - shW * 0.28, y: hips.y };
  const hipR = rh || { x: hips.x + shW * 0.28, y: hips.y };
  const headTop = {
    x: head.x + (face ? Math.sin(face.roll || 0) * 18 : 0),
    y: head.y - shW * 0.42,
  };
  return [
    { ax: hips.x, ay: hips.y, bx: chest.x, by: chest.y },
    { ax: chest.x, ay: chest.y, bx: head.x, by: head.y },
    { ax: head.x, ay: head.y, bx: headTop.x, by: headTop.y },
    { ax: shL.x, ay: shL.y, bx: elbowL.x, by: elbowL.y },
    { ax: elbowL.x, ay: elbowL.y, bx: wristL.x, by: wristL.y },
    { ax: shR.x, ay: shR.y, bx: elbowR.x, by: elbowR.y },
    { ax: elbowR.x, ay: elbowR.y, bx: wristR.x, by: wristR.y },
    { ax: hipL.x, ay: hipL.y, bx: kneeL.x, by: kneeL.y },
    { ax: kneeL.x, ay: kneeL.y, bx: ankleL.x, by: ankleL.y },
    { ax: hipR.x, ay: hipR.y, bx: kneeR.x, by: kneeR.y },
    { ax: kneeR.x, ay: kneeR.y, bx: ankleR.x, by: ankleR.y },
  ];
}

async function loadSculpture(file) {
  if (cache.has(file)) return cache.get(file);
  if (loading === file) return null;
  loading = file;
  try {
    const img = await loadImage(file);
    const sc = await inflateSculpture(img);
    cache.set(file, sc);
    return sc;
  } catch (err) {
    console.warn(err);
    return null;
  } finally {
    if (loading === file) loading = null;
  }
}

function attachSculpture(sc) {
  if (mesh) scene.remove(mesh);
  sculpture = sc;
  mesh = sc.mesh;
  mesh.rotation.set(0, 0, 0);
  mesh.position.set(0, 0, 0);
  if (mesh.material) {
    mesh.material.emissiveIntensity = 0.62;
    mesh.material.roughness = 0.4;
  }
  posed = new Float32Array(sc.bindPos.length);
  posed.set(sc.bindPos);
  scene.add(mesh);
}

function poseCurrent(pose, face, w, h) {
  if (!sculpture || !mesh) return false;
  const live = liveBonesFromPose(pose, face, w, h);
  if (!live) return false;
  skinPositions(sculpture.bindPos, sculpture.bones, live, sculpture.skin, posed);
  const attr = mesh.geometry.getAttribute("position");
  attr.array.set(posed);
  attr.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  return true;
}

function hide() {
  if (stage) stage.style.visibility = "hidden";
  window.MonsterPuppetReady = false;
}

function showStage() {
  if (stage) stage.style.visibility = "visible";
}

async function tick() {
  requestAnimationFrame(tick);
  const live = window.MonsterLive;
  if (!live || !live.cameraOn) {
    hide();
    return;
  }
  ensureScene();
  resize(live.width || 800, live.height || 1000);
  const file = fileForGenome(live.genome && live.genome.type, live.seed || 0);
  if (file !== currentFile) {
    currentFile = file;
    window.MonsterPuppetReady = false;
    const sc = await loadSculpture(file);
    if (sc && currentFile === file) attachSculpture(sc);
  }
  if (!sculpture) {
    hide();
    return;
  }
  const ok = poseCurrent(live.pose, live.face, live.width, live.height);
  window.MonsterPuppetReady = ok;
  if (ok) {
    showStage();
    renderer.render(scene, camera);
  } else {
    hide();
  }
}

if (stage) {
  stage.style.visibility = "hidden";
  tick();
}
