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
| **Image avatar** | Upload or drag-drop a **PNG/JPG** (front-facing face or character). Press **C** to animate: ml5 **faceMesh** tracks your face and warps the image with a triangular mesh. |

Switch modes with the **Monster / Image avatar** buttons or **M**.

### Image avatar — how it works

1. Upload an image (**Upload** button, **U**, or drag onto the canvas).
2. The app runs face mesh detection once on the image to lock landmark positions in the artwork.
3. With the camera on, live face landmarks are aligned to your photo (scaled by eye distance) and each mesh triangle is drawn with a **piecewise affine warp** (same topology as ml5’s `faceMesh.getTriangles()`).
4. Blink, mouth open, and head turn come from the live mesh — no Live2D Cubism SDK, just canvas texture mapping.
5. If your shoulders are visible, a simple lower-body layer shifts slightly with body pose (optional polish).

If no image is loaded, a **generated placeholder** silhouette is shown (no bundled character art).

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
- `style.css` — layout and controls

## Tips for best avatars

- Use a clear, front-facing face with even lighting.
- Crop clutter so the face fills a good portion of the frame.
- Full-body characters work for the face warp; the lower body may follow pose lightly if your torso is in frame.
