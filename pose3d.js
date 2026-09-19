function shadeSphere(x, y, rx, ry, col, opts = {}) {
  if (!rx || !ry) return;
  paintBlob(x, y, abs(rx) * 2.08, abs(ry) * 2.08, col, {
    id: opts.id,
    hi: opts.hi,
    ang: opts.ang,
    dabs: opts.dabs ?? floor(constrain(abs(rx) * abs(ry) / 18, 22, 70)),
  });
}

function shadeChain(pts, r0, r1, col, opts = {}) {
  if (!pts || pts.length < 2) return;
  const vecs = [];
  for (let i = 0; i < pts.length; i++) {
    vecs.push(createVector(pts[i].x, pts[i].y));
  }
  const under = [];
  for (let i = 0; i < vecs.length; i++) {
    under.push(createVector(vecs[i].x + 2.5, vecs[i].y + 3.5));
  }
  const shade = lerpColor(col, color(70, 48, 58), 0.28);
  paintTube(under, r0 * 2.08, r1 * 2.08, shade, { hi: col, id: (opts.id || 30) + 1 });
  paintTube(vecs, r0 * 2, r1 * 2, col, { hi: opts.hi, id: opts.id });
}

function shadeEars3d(kind, hx, hy, headW, headH) {
  push();
  translate(hx, hy);
  randomSeed(seed + 90);
  noiseSeed(seed + 90);
  paintEars(kind || "round", -headH * 0.42, headW);
  pop();
}

function shadePaw(x, y, r, col, dir, id) {
  randomSeed(seed + (id || 11) * 311);
  paintClaws(x, y, 3, 0.4, col, dir);
}

function drawPoseMonster(k) {
  const g = genome;
  const pal = g.pal;
  const body = C(pal.body);
  const midc = C(pal.mid);
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
  const torsoH = max(48, dist(midSh.x, midSh.y, midHp.x, midHp.y));
  const headR = constrain(shW * 0.44, 30, 74);
  const armR = constrain(shW * 0.2, 14, 34);
  const legR = constrain(shW * 0.24, 16, 38);

  const bodyCx = midSh.x * 0.45 + midHp.x * 0.55;
  const bodyCy = midSh.y * 0.4 + midHp.y * 0.6;
  const chestX = midSh.x;
  const chestY = midSh.y + torsoH * 0.12;

  const le = k.leftelbow;
  const re = k.rightelbow;
  const lw = k.leftwrist;
  const rw = k.rightwrist;
  const lk = k.leftknee;
  const rk = k.rightknee;
  const la = k.leftankle;
  const ra = k.rightankle;

  const leftArm = ls && le ? [ls, le, lw || le] : null;
  const rightArm = rs && re ? [rs, re, rw || re] : null;
  const leftLeg = lh && lk ? [lh, lk, la || lk] : null;
  const rightLeg = rh && rk ? [rh, rk, ra || rk] : null;

  const footY = max(la ? la.y : 0, ra ? ra.y : 0, midHp.y + 80);
  noStroke();
  fill(40, 30, 35, 28);
  ellipse(midHp.x, footY + 18, shW * 1.8, 22);

  if (g.tail && g.tail !== "none") {
    randomSeed(seed + 80);
    paintTail(g.tail, midHp.x + (g.tailSide || 1) * 20, midHp.y, midc);
  }

  if (g.type === "cephalopod") {
    const n = 5;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const base = { x: lerp(midHp.x - 28, midHp.x + 28, t), y: midHp.y + 8 };
      const sway = sin(millis() / 380 + i * 0.9) * 48;
      const end = {
        x: base.x + sway + (t - 0.5) * 150,
        y: base.y + 80 + abs(sin(millis() / 420 + i)) * 64,
      };
      shadeChain(
        [base, { x: base.x + sway * 0.35, y: base.y + 46 }, end],
        16,
        6,
        i % 2 ? body : midc,
        { hi, id: 200 + i * 13 }
      );
    }
  }

  const armA = { pts: leftArm, col: midc, r0: armR, r1: armR * 0.72, hand: lw, dir: 0, id: 40 };
  const armB = { pts: rightArm, col: hi, r0: armR, r1: armR * 0.72, hand: rw, dir: PI, id: 60 };
  const backArm = lw && rw && lw.y > rw.y ? armA : armB;
  const frontArm = backArm === armA ? armB : armA;

  if (backArm.pts) shadeChain(backArm.pts, backArm.r0, backArm.r1, backArm.col, { hi, id: backArm.id });
  if (leftLeg) shadeChain(leftLeg, legR, legR * 0.78, body, { hi, id: 80 });
  if (rightLeg) shadeChain(rightLeg, legR, legR * 0.78, lerpColor(body, hi, 0.18), { hi, id: 100 });
  if (frontArm.pts) shadeChain(frontArm.pts, frontArm.r0, frontArm.r1, frontArm.col, { hi, id: frontArm.id });

  shadeSphere(bodyCx, bodyCy + torsoH * 0.08, shW * 0.72, torsoH * 0.52, body, { id: 1, hi, dabs: 70 });
  if (g.fur) paintFur(bodyCx, bodyCy + torsoH * 0.08, shW * 1.44, torsoH * 1.04, midc, 40);
  shadeSphere(chestX, chestY, shW * 0.58, torsoH * 0.38, midc, { id: 3, hi, dabs: 48 });
  shadeChain([midSh, { x: nose.x, y: nose.y + headR * 0.55 }], armR * 0.7, headR * 0.45, midc, {
    hi,
    id: 120,
  });

  if (la) shadePaw(la.x, la.y + 6, legR * 0.95, claw, HALF_PI, 11);
  if (ra) shadePaw(ra.x, ra.y + 6, legR * 0.95, claw, HALF_PI, 12);
  if (backArm.hand) shadePaw(backArm.hand.x, backArm.hand.y, armR * 0.85, claw, backArm.dir, 13);
  if (frontArm.hand) shadePaw(frontArm.hand.x, frontArm.hand.y, armR * 0.85, claw, frontArm.dir, 14);

  const hx = nose.x;
  const hy = nose.y;
  const headW = headR * 2;
  const headH = headR * 2.05;
  shadeEars3d(g.ears || (g.type === "hopper" ? "bunny" : "round"), hx, hy, headW, headH);
  shadeSphere(hx, hy, headR * 1.05, headR * 1.12, midc, { id: 2, hi, dabs: 64 });
  if (g.tuft) {
    randomSeed(seed + 95);
    paintTuft(hx, hy - headR * 0.48, claw);
  }

  const eyeS = headR * 0.32;
  if (isSingleEye(g.eyes)) {
    paintEye(hx, hy - headR * 0.04, eyeS * 1.25, eyeS * 1.15, g.eyes);
  } else {
    paintEye(hx - headR * 0.32, hy - headR * 0.04, eyeS, eyeS * 0.92, g.eyes);
    paintEye(hx + headR * 0.32, hy - headR * 0.02, eyeS * 0.95, eyeS * 0.88, g.eyes);
  }
  paintMouth(hx, hy + headR * 0.42, headR * 0.7, headR * 0.28, g.mouth);
  if (g.whiskers) {
    randomSeed(seed + 110);
    paintWhiskers(hx, hy + headR * 0.32, headR * 0.9);
  }
}
