import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { DRAWINGS, inflateSculpture, loadImage } from "./sculpt.js";

const stage = document.getElementById("model-stage");
const thumbs = document.getElementById("model-thumbs");
const statusEl = document.getElementById("model-status");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");
const saveBtn = document.getElementById("save-btn");

let index = 0;
let currentMesh = null;
let renderer;
let scene;
let camera;
let controls;
const cache = new Map();

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
}

function initScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0b0c);
  scene.fog = new THREE.Fog(0x0b0b0c, 9, 20);

  camera = new THREE.PerspectiveCamera(32, 1, 0.05, 40);
  camera.position.set(0, 0.12, 4.4);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  stage.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.target.set(0, 0.05, 0);
  controls.addEventListener("start", () => {
    currentMesh && (currentMesh.userData.hold = true);
  });
  controls.addEventListener("end", () => {
    currentMesh && (currentMesh.userData.hold = false);
  });

  scene.add(new THREE.HemisphereLight(0xc4cce0, 0x1a1210, 1.18));
  const key = new THREE.DirectionalLight(0xfff2e0, 1.6);
  key.position.set(2.2, 3.4, 3.2);
  key.castShadow = true;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffd8c4, 0.48);
  fill.position.set(-2.2, 1.4, 2.6);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0x66e0ff, 0.42);
  rim.position.set(-3, 1.2, -2.4);
  scene.add(rim);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(3.2, 48),
    new THREE.MeshStandardMaterial({ color: 0x161416, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.34;
  ground.receiveShadow = true;
  scene.add(ground);

  window.addEventListener("resize", resize);
  resize();
  tick();
}

function resize() {
  if (!renderer || !stage) return;
  const w = stage.clientWidth || 400;
  const h = stage.clientHeight || 520;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

function tick() {
  requestAnimationFrame(tick);
  if (currentMesh && !currentMesh.userData.hold) currentMesh.rotation.y += 0.004;
  controls.update();
  renderer.render(scene, camera);
}

async function show(i) {
  index = (i + DRAWINGS.length) % DRAWINGS.length;
  const item = DRAWINGS[index];
  setStatus("Sculpting “" + item.title + "”…");
  highlightThumbs();
  let mesh = cache.get(item.file);
  if (!mesh) {
    const img = await loadImage(item.file);
    const sculpture = await inflateSculpture(img);
    mesh = sculpture.mesh;
    cache.set(item.file, mesh);
  }
  if (currentMesh) scene.remove(currentMesh);
  currentMesh = mesh;
  currentMesh.rotation.y = 0.18;
  scene.add(currentMesh);
  const box = new THREE.Box3().setFromObject(currentMesh);
  const size = box.getSize(new THREE.Vector3());
  const diag = size.length();
  const center = box.getCenter(new THREE.Vector3());
  controls.target.copy(center);
  camera.position.set(center.x + diag * 0.2, center.y + diag * 0.04, center.z + diag * 1.68);
  controls.minDistance = diag * 0.45;
  controls.maxDistance = diag * 8;
  setStatus(item.title + " · drag to turn");
}

function highlightThumbs() {
  thumbs.querySelectorAll("button").forEach((btn, i) => btn.classList.toggle("on", i === index));
}

function buildThumbs() {
  DRAWINGS.forEach((item, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "model-thumb";
    btn.title = item.title;
    const img = document.createElement("img");
    img.src = encodeURI(item.file);
    img.alt = item.title;
    btn.appendChild(img);
    btn.addEventListener("click", () => show(i));
    thumbs.appendChild(btn);
  });
}

async function saveGlb() {
  if (!currentMesh) return;
  setStatus("Exporting GLB…");
  const exporter = new GLTFExporter();
  const root = new THREE.Group();
  root.add(currentMesh.clone(true));
  exporter.parse(
    root,
    (result) => {
      const blob = new Blob([result], { type: "application/octet-stream" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = DRAWINGS[index].title.replace(/\s+/g, "-") + ".glb";
      a.click();
      setStatus("Saved " + a.download);
    },
    () => setStatus("Export failed"),
    { binary: true }
  );
}

prevBtn.addEventListener("click", () => show(index - 1));
nextBtn.addEventListener("click", () => show(index + 1));
saveBtn.addEventListener("click", () => saveGlb());
window.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") show(index - 1);
  if (e.key === "ArrowRight") show(index + 1);
});

buildThumbs();
initScene();
show(0).catch((err) => setStatus(err.message || "Could not build 3D model"));
