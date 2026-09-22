# Animal Printing — Monster Generator & Image Avatar

Procedural painted monsters in **Monster** mode, plus a **Image Avatar** mode that warps an uploaded photo like a lightweight Live2D-style puppet using your webcam face.

## Run locally

This project is static HTML/JS (p5.js + ml5.js from CDN). Browsers block camera access on `file://` URLs, so use a local static server:

```bash
# Python 3
python3 -m http.server 8080

# or Node (npx, no install)
npx --yes serve -p 8080
```

Open `http://localhost:8080` (or the port your server prints).

## Modes

| Mode | What you see |
|------|----------------|
| **Monster** | Click or press Space to generate a new creature. Press **C** for camera: your body pose drives a procedural monster (MoveNet via ml5). |
| **Image avatar** | Default art **`Dunet&TinYan03.png`** loads automatically; upload/drag to replace. Press **C** to animate with ml5 **faceMesh**. |

Switch modes with the **Monster / Image avatar** buttons or **M**.

### Image avatar — how it works

On load, the app automatically fetches **`Dunet&TinYan03.png`** at the repo root (Shepherd’s artwork). You can replace it anytime via **Upload**, **U**, or drag-and-drop.

1. The image is prepared for detection: very tall portraits are **cropped from the top** (~upper 48% or up to ~1.05× width) so the face region is larger for the mesh, then scaled so the longest side is at most **1600px** for stable ml5 performance.
2. Face mesh runs once on that working image to store landmark positions.
3. With the camera on, live landmarks warp the same mesh (piecewise affine triangles via `faceMesh.getTriangles()`). Live face alignment uses inter-eye scaling; blinks and mouth motion follow your webcam.
4. If your shoulders are visible, a simple lower-body layer shifts slightly with body pose (optional polish).

If the default file is missing, a **generated placeholder** silhouette is shown until you upload.

### Camera & permissions

- The first time you press **Camera**, the browser asks for **webcam permission**. Allow it; if you deny, press **Camera** again after changing site settings.
- Use **HTTPS** or **localhost** — remote HTTP without TLS often blocks the camera.
- **V** toggles the small camera preview (both modes when camera is on).
- **S** saves a PNG of the canvas.
- **Esc** exits camera mode.

## Files

- `index.html` — page shell and CDN scripts (p5 1.11.3, ml5 1.2.1)
- `sketch.js` — monster generator, camera/pose, mode switching
- `pose3d.js` — shaded 3D-style pose monster (camera)
- `avatar.js` — image upload, face mesh warp, avatar UI
- `Dunet&TinYan03.png` — default Image Avatar source artwork
- `style.css` — layout and controls

## Tips for best avatars

- Use a clear, front-facing face with even lighting.
- Crop clutter so the face fills a good portion of the frame.
- Full-body characters work for the face warp; the lower body may follow pose lightly if your torso is in frame.
