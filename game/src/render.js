// Everything the eye sees: sky, sun and ridge, the projected heightfield, rings and
// drop zones, the chase-view Kite MK-II, and the full HUD with instruments. One file,
// one job: turn a game state into a 1280x720 frame. No input, no rules, no sound.
import { VIEW, CAMERA, PLANE, TERRAIN } from './config.js';
import { AIRFIELDS, fieldById } from './terrain.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_DONE = 'done';

const W = VIEW.width;
const H = VIEW.height;
const FOCAL = (H / 2) / Math.tan((VIEW.fov * Math.PI) / 360);
const SKY_TOP = [84, 148, 205];
const SKY_HORIZON = [186, 214, 232];
const FOG = [186, 214, 232];

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function fmt(n, digits = 0) {
  return n.toFixed(digits);
}
function mmss(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function createRenderer(canvas, terrain) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  // Smoothed camera: the chase camera trails the plane's attitude, so the view never
  // snaps when the stick moves.
  const cam = { heading: 0, pitch: 0, roll: 0, x: 0, y: 0, z: 0, ready: false };

  function updateCamera(p) {
    const fx = Math.sin(p.heading);
    const fz = -Math.cos(p.heading);
    const tx = p.x - fx * CAMERA.behind;
    const ty = p.y + CAMERA.above;
    const tz = p.z - fz * CAMERA.behind;
    if (!cam.ready) {
      cam.x = tx;
      cam.y = ty;
      cam.z = tz;
      cam.heading = p.heading;
      cam.pitch = p.pitch * CAMERA.pitchFollow;
      cam.roll = p.roll * CAMERA.rollFollow;
      cam.ready = true;
      return;
    }
    const k = 1 - Math.pow(0.0001, 1 / 60);
    cam.x = lerp(cam.x, tx, k);
    cam.y = lerp(cam.y, ty, k);
    cam.z = lerp(cam.z, tz, k);
    let dh = p.heading - cam.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    cam.heading += dh * k;
    cam.pitch = lerp(cam.pitch, p.pitch * CAMERA.pitchFollow, k);
    cam.roll = lerp(cam.roll, p.roll * CAMERA.rollFollow, k);
  }

  // World point -> screen point, or null behind the camera.
  function project(x, y, z) {
    const vx = x - cam.x;
    const vy = y - cam.y;
    const vz = z - cam.z;
    const sy = Math.sin(cam.heading);
    const cy = Math.cos(cam.heading);
    const cx = vx * cy + vz * sy;
    // Depth is the distance along the camera's forward vector (sin h, 0, -cos h):
    // a point straight ahead of a northbound plane (smaller z) must be positive.
    const cz = vx * sy - vz * cy;
    const depth = cz;
    if (depth < 2) return null;
    const cp = Math.cos(cam.pitch);
    const sp = Math.sin(cam.pitch);
    const y2 = vy * cp - depth * sp;
    const z2 = vy * sp + depth * cp;
    if (z2 < 2) return null;
    const cr = Math.cos(cam.roll);
    const sr = Math.sin(cam.roll);
    const x3 = cx * cr - y2 * sr;
    const y3 = cx * sr + y2 * cr;
    return { x: W / 2 + (x3 * FOCAL) / z2, y: H / 2 - (y3 * FOCAL) / z2, depth: z2 };
  }

  function drawSky(p, time) {
    // Base fill first: with a hard bank the rotated sky rect leaves the corners
    // bare, and the page background behind them reads as night.
    ctx.fillStyle = `rgb(${SKY_HORIZON[0]},${SKY_HORIZON[1]},${SKY_HORIZON[2]})`;
    ctx.fillRect(0, 0, W, H);
    const horizonY = H / 2 - Math.tan(cam.pitch) * FOCAL;
    ctx.save();
    ctx.translate(W / 2, horizonY);
    ctx.rotate(cam.roll);
    ctx.translate(-W / 2, -horizonY);
    const grad = ctx.createLinearGradient(0, -H * 0.6, 0, horizonY + 40);
    grad.addColorStop(0, `rgb(${SKY_TOP[0]},${SKY_TOP[1]},${SKY_TOP[2]})`);
    grad.addColorStop(1, `rgb(${SKY_HORIZON[0]},${SKY_HORIZON[1]},${SKY_HORIZON[2]})`);
    ctx.fillStyle = grad;
    ctx.fillRect(-W, -H, W * 3, horizonY + H + 40);
    // Sun: fixed in the west, low enough to warm the light.
    const sun = project(cam.x + Math.sin(4.4) * 4000, cam.y + 1500, cam.z - Math.cos(4.4) * 4000);
    if (sun) {
      const glow = ctx.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, 130);
      glow.addColorStop(0, 'rgba(255,244,200,0.95)');
      glow.addColorStop(0.25, 'rgba(255,220,140,0.55)');
      glow.addColorStop(1, 'rgba(255,220,140,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sun.x - 140, sun.y - 140, 280, 280);
      ctx.fillStyle = '#fff6cf';
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, 26, 0, Math.PI * 2);
      ctx.fill();
    }
    // Far ridge: a jagged silhouette that sits on the horizon in every direction.
    ctx.beginPath();
    ctx.moveTo(-W, horizonY + 30);
    for (let sx = -W; sx <= W * 2; sx += 24) {
      const a = Math.atan2(sx - W / 2, FOCAL) + cam.heading;
      const ridge = Math.sin(a * 3.1 + 1.3) * 0.5 + Math.sin(a * 7.7 + 4.0) * 0.3 + Math.sin(a * 13.3) * 0.2;
      const ry = horizonY - (ridge * 0.5 + 0.55) * 120 + 30;
      ctx.lineTo(sx, ry);
    }
    ctx.lineTo(W * 2, horizonY + 30);
    ctx.closePath();
    ctx.fillStyle = 'rgb(122,148,178)';
    ctx.fill();
    ctx.restore();
  }

  // World point -> camera space (x right, y up, z forward), unclipped.
  function toCamera(x, y, z) {
    const vx = x - cam.x;
    const vy = y - cam.y;
    const vz = z - cam.z;
    const sy = Math.sin(cam.heading);
    const cy = Math.cos(cam.heading);
    const cx = vx * cy + vz * sy;
    // Depth is the distance along the camera's forward vector (sin h, 0, -cos h).
    const cz = vx * sy - vz * cy;
    const cp = Math.cos(cam.pitch);
    const sp = Math.sin(cam.pitch);
    const y2 = vy * cp - cz * sp;
    const z2 = vy * sp + cz * cp;
    const cr = Math.cos(cam.roll);
    const sr = Math.sin(cam.roll);
    return { x: cx * cr - y2 * sr, y: cx * sr + y2 * cr, z: z2 };
  }

  function toScreen(c) {
    return { x: W / 2 + (c.x * FOCAL) / c.z, y: H / 2 - (c.y * FOCAL) / c.z };
  }

  // Clip a camera-space triangle against the near plane (z >= 2) so ground right
  // under the camera still paints the bottom of the screen instead of vanishing.
  function clipTriangle(tri) {
    const NEAR = 2;
    let poly = tri;
    const out = [];
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const aIn = a.z >= NEAR;
      const bIn = b.z >= NEAR;
      if (aIn) out.push(a);
      if (aIn !== bIn) {
        const t = (NEAR - a.z) / (b.z - a.z);
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: NEAR });
      }
    }
    return out;
  }

  function drawTerrain() {
    const { cell, count, half, heights, colors } = terrain;
    const range = 1500;
    const ix0 = Math.max(0, Math.floor((cam.x - range + half) / cell));
    const ix1 = Math.min(count - 1, Math.ceil((cam.x + range + half) / cell));
    const iz0 = Math.max(0, Math.floor((cam.z - range + half) / cell));
    const iz1 = Math.min(count - 1, Math.ceil((cam.z + range + half) / cell));
    // Camera-space vertices once, then paint cells far-to-near.
    const verts = new Map();
    for (let iz = iz0; iz <= iz1; iz += 1) {
      for (let ix = ix0; ix <= ix1; ix += 1) {
        const x = -half + ix * cell;
        const z = -half + iz * cell;
        verts.set(iz * count + ix, toCamera(x, heights[iz * count + ix], z));
      }
    }
    const tris = [];
    for (let iz = iz0; iz < iz1; iz += 1) {
      for (let ix = ix0; ix < ix1; ix += 1) {
        const a = verts.get(iz * count + ix);
        const b = verts.get(iz * count + ix + 1);
        const c = verts.get((iz + 1) * count + ix);
        const d = verts.get((iz + 1) * count + ix + 1);
        const depth = (a.z + b.z + c.z + d.z) / 4;
        if (depth < 4) continue;
        const o = (iz * count + ix) * 3;
        tris.push({ poly: [a, b, d], depth, rgb: [colors[o], colors[o + 1], colors[o + 2]] });
        tris.push({ poly: [a, d, c], depth, rgb: [colors[o], colors[o + 1], colors[o + 2]] });
      }
    }
    // The strips themselves: the 60 m grid is wider than a 34 m runway, so its
    // asphalt rarely lands on a vertex. Draw each strip as its own depth-sorted
    // quads — asphalt, a dashed centreline and threshold bars — so a runway is
    // always there to land on.
    for (const field of AIRFIELDS) {
      const sh = Math.sin(field.heading);
      const ch = Math.cos(field.heading);
      const gy = terrain.heightAt(field.x, field.z) + 0.4;
      const corner = (along, across) => toCamera(
        field.x + sh * along + ch * across,
        gy,
        field.z + ch * along - sh * across,
      );
      const quad = (along0, along1, across0, across1, rgb) => {
        const a = corner(along0, across0);
        const b = corner(along1, across0);
        const c = corner(along0, across1);
        const d = corner(along1, across1);
        const depth = (a.z + b.z + c.z + d.z) / 4;
        if (depth < 4) return;
        tris.push({ poly: [a, b, d], depth, rgb });
        tris.push({ poly: [a, d, c], depth, rgb });
      };
      const L = field.length / 2;
      const Wd = field.width / 2;
      // The asphalt in 40 m segments, each with its own depth, so every segment
      // sorts against the terrain right beside it instead of the whole strip
      // sorting as one piece and losing its near half under nearer ground.
      for (let s = -L; s < L; s += 40) {
        quad(s, Math.min(L, s + 40), -Wd, Wd, [74, 74, 78]);
      }
      for (let s = -L + 20; s < L - 20; s += 40) {
        quad(s, s + 22, -1.6, 1.6, [232, 232, 220]);
      }
      quad(-L, -L + 8, -Wd + 2, Wd - 2, [238, 238, 225]);
      quad(L - 8, L, -Wd + 2, Wd - 2, [238, 238, 225]);
    }
    tris.sort((m, n) => n.depth - m.depth);
    for (const tri of tris) {
      const clipped = clipTriangle(tri.poly);
      if (clipped.length < 3) continue;
      const fogT = clamp((tri.depth - 480) / 1150, 0, 0.85);
      const r = Math.round(lerp(tri.rgb[0], FOG[0], fogT));
      const g = Math.round(lerp(tri.rgb[1], FOG[1], fogT));
      const bl = Math.round(lerp(tri.rgb[2], FOG[2], fogT));
      ctx.fillStyle = `rgb(${r},${g},${bl})`;
      ctx.beginPath();
      clipped.forEach((v, i) => {
        const s = toScreen(v);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawClouds(time) {
    for (const cloud of terrain.clouds) {
      const drift = time * 1.5;
      const p = project(cloud.x + drift, cloud.y, cloud.z);
      if (!p || p.depth < 10) continue;
      const scale = FOCAL / p.depth;
      const size = cloud.size * scale;
      if (size < 4) continue;
      ctx.fillStyle = 'rgba(255,255,255,0.82)';
      for (let i = 0; i < cloud.puffs; i += 1) {
        const px = p.x + Math.sin(cloud.seed + i * 2.3) * size * 0.55;
        const py = p.y + Math.cos(cloud.seed + i * 1.7) * size * 0.16;
        const pr = size * (0.32 + 0.1 * Math.sin(cloud.seed * 3 + i));
        ctx.beginPath();
        ctx.ellipse(px, py, pr, pr * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawRings(mission, time) {
    if (!mission) return;
    const rings = mission.rings;
    for (let i = 0; i < rings.length; i += 1) {
      const ring = rings[i];
      // A ring already flown through stays out of the frame: at the moment of
      // passing it sits on the camera and paints a giant arc across the sky.
      if (ring.passed) continue;
      const p = project(ring.x, ring.y, ring.z);
      if (!p || p.depth < 8) continue;
      const scale = FOCAL / p.depth;
      const radiusPx = ring.radius * scale;
      if (radiusPx < 3) continue;
      const isNext = mission.def.id === 'rings' && i === mission.state.nextRing;
      const next = rings[Math.min(i + 1, rings.length - 1)];
      const nx = next.x - ring.x;
      const nz = next.z - ring.z;
      const nl = Math.hypot(nx, nz) || 1;
      const viewX = ring.x - cam.x;
      const viewZ = ring.z - cam.z;
      const vl = Math.hypot(viewX, viewZ) || 1;
      const facing = Math.abs((nx / nl) * (viewX / vl) + (nz / nl) * (viewZ / vl));
      const squash = clamp(facing, 0.18, 1);
      const pulse = isNext ? 1 + Math.sin(time * 5) * 0.08 : 1;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.globalAlpha = isNext ? 0.95 : 0.55;
      ctx.fillStyle = isNext ? 'rgba(255,150,40,0.13)' : 'rgba(255,255,255,0.10)';
      ctx.beginPath();
      ctx.ellipse(0, 0, radiusPx * pulse, radiusPx * squash * pulse, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = Math.max(2, radiusPx * 0.09);
      ctx.strokeStyle = isNext ? '#ff9a2e' : '#e8eef2';
      ctx.beginPath();
      ctx.ellipse(0, 0, radiusPx * pulse, radiusPx * squash * pulse, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (isNext) {
        ctx.fillStyle = '#ff9a2e';
        ctx.font = `700 ${Math.max(13, radiusPx * 0.32)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), 0, 1);
      }
      ctx.restore();
    }
  }

  function drawDropZones(mission, time) {
    if (!mission || mission.def.id !== 'mail') return;
    for (const zone of mission.zones) {
      const groundY = terrain.heightAt(zone.x, zone.z);
      const p = project(zone.x, groundY + 4, zone.z);
      if (!p || p.depth < 8) continue;
      const scale = FOCAL / p.depth;
      const radiusPx = zone.radius * scale;
      if (radiusPx < 4) continue;
      ctx.save();
      ctx.globalAlpha = zone.delivered ? 0.3 : 0.9;
      ctx.strokeStyle = zone.delivered ? '#4ddc78' : '#ffb02e';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, radiusPx, radiusPx * 0.32, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (!zone.delivered) {
        const bob = Math.sin(time * 3 + zone.x) * 6;
        ctx.fillStyle = '#ffb02e';
        ctx.font = `700 ${Math.max(13, radiusPx * 0.24)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('▼ DROP HERE ▼', p.x, p.y - radiusPx * 0.42 + bob);
      }
      ctx.restore();
    }
  }

  function drawTargetGuide(mission, p) {
    if (!mission || mission.state.finished || mission.state.failed) return;
    const target = mission.nextTarget();
    if (!target) return;
    let tx;
    let ty;
    let tz;
    let label;
    if (target.kind === 'drop') {
      tx = target.x;
      ty = terrain.heightAt(target.x, target.z) + 60;
      tz = target.z;
      label = `DROP · ${target.name.toUpperCase()}`;
    } else if (target.kind === 'land') {
      tx = target.field.x;
      ty = terrain.heightAt(target.field.x, target.field.z) + 30;
      tz = target.field.z;
      label = target.field.name.toUpperCase();
    } else {
      tx = target.x;
      ty = target.y;
      tz = target.z;
      label = `RING ${mission.state.nextRing + 1}`;
    }
    const proj = project(tx, ty, tz);
    const dist = Math.hypot(tx - p.x, tz - p.z);
    const distText = dist >= 1000 ? `${(dist / 1000).toFixed(1)} km` : `${Math.round(dist)} m`;
    if (proj && proj.x > 40 && proj.x < W - 40 && proj.y > 90 && proj.y < H - 120) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,176,46,0.9)';
      ctx.fillStyle = 'rgba(255,176,46,0.95)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(proj.x, proj.y, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(proj.x, proj.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '700 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      // Near the top of the screen the label goes under the marker, clear of the
      // HUD panels, instead of over them.
      const labelY = proj.y < 150 ? proj.y + 26 : proj.y - 24;
      ctx.fillText(`${label} · ${distText}`, proj.x, labelY);
      ctx.restore();
      return;
    }
    // Off-screen: a chevron on the screen edge pointing the way.
    const dx = tx - p.x;
    const dz = tz - p.z;
    const worldAngle = Math.atan2(dx, -dz);
    const rel = worldAngle - cam.heading;
    const edgeAngle = Math.atan2(Math.sin(rel), Math.cos(rel));
    const ex = W / 2 + Math.sin(edgeAngle) * (W / 2 - 70);
    const ey = H / 2 - Math.cos(edgeAngle) * (H / 2 - 110);
    ctx.save();
    ctx.translate(clamp(ex, 60, W - 60), clamp(ey, 100, H - 100));
    ctx.rotate(Math.atan2(Math.sin(edgeAngle), -Math.cos(edgeAngle)) + Math.PI);
    ctx.fillStyle = 'rgba(255,176,46,0.95)';
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.lineTo(12, 10);
    ctx.lineTo(-12, 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.fillStyle = 'rgba(255,176,46,0.95)';
    ctx.font = '700 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${label} · ${distText}`, clamp(ex, 90, W - 90), clamp(ey, 120, H - 60) + 30);
    ctx.restore();
  }

  function drawPlaneShadow(p) {
    const groundY = terrain.heightAt(p.x, p.z);
    const proj = project(p.x, groundY + 1, p.z);
    if (!proj || proj.depth < 4) return;
    const scale = FOCAL / proj.depth;
    const heightAbove = Math.max(0, p.y - groundY);
    const alpha = clamp(0.4 - heightAbove / 500, 0.05, 0.4);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#0a1410';
    ctx.beginPath();
    // The Kite's shadow is roughly her own footprint: ~11 m across, ~3 m deep.
    ctx.ellipse(proj.x, proj.y, 5.5 * scale, 1.6 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // The Kite MK-II from the chase view: cream fuselage, orange stripe, wide high wing,
  // red/green tip lights. Banked with the plane's roll, bobbing gently with the air.
  function drawPlane(p, time, yFraction = 0.72) {
    const bob = Math.sin(time * 2.1) * 2.5;
    const cx = W / 2;
    const cy = H * yFraction + bob;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(p.roll * 0.85);
    const scale = 1 + clamp(p.speed / PLANE.maxSpeed, 0, 1) * 0.08;
    ctx.scale(scale, scale);
    ctx.lineJoin = 'round';
    // Main wing.
    ctx.fillStyle = '#f4ead2';
    ctx.strokeStyle = '#3a2c1c';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-168, 6);
    ctx.lineTo(-150, -16);
    ctx.lineTo(-34, -20);
    ctx.lineTo(34, -20);
    ctx.lineTo(150, -16);
    ctx.lineTo(168, 6);
    ctx.lineTo(150, 12);
    ctx.lineTo(-150, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Orange wing tips.
    ctx.fillStyle = '#e86a1e';
    ctx.beginPath();
    ctx.moveTo(-168, 6);
    ctx.lineTo(-150, -16);
    ctx.lineTo(-128, -16);
    ctx.lineTo(-140, 8);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(168, 6);
    ctx.lineTo(150, -16);
    ctx.lineTo(128, -16);
    ctx.lineTo(140, 8);
    ctx.closePath();
    ctx.fill();
    // Fuselage, tapering away from the viewer.
    ctx.fillStyle = '#f7efdc';
    ctx.beginPath();
    ctx.moveTo(-26, 52);
    ctx.quadraticCurveTo(-30, -6, -16, -58);
    ctx.lineTo(16, -58);
    ctx.quadraticCurveTo(30, -6, 26, 52);
    ctx.quadraticCurveTo(0, 62, -26, 52);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Orange cheatline down the fuselage.
    ctx.fillStyle = '#e86a1e';
    ctx.beginPath();
    ctx.moveTo(-27, 18);
    ctx.lineTo(-19, -44);
    ctx.lineTo(-11, -44);
    ctx.lineTo(-17, 18);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(27, 18);
    ctx.lineTo(19, -44);
    ctx.lineTo(11, -44);
    ctx.lineTo(17, 18);
    ctx.closePath();
    ctx.fill();
    // Tailplane.
    ctx.fillStyle = '#f4ead2';
    ctx.beginPath();
    ctx.moveTo(-72, 46);
    ctx.lineTo(-58, 30);
    ctx.lineTo(58, 30);
    ctx.lineTo(72, 46);
    ctx.lineTo(58, 52);
    ctx.lineTo(-58, 52);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Vertical fin.
    ctx.fillStyle = '#e86a1e';
    ctx.beginPath();
    ctx.moveTo(-13, 34);
    ctx.lineTo(-9, -12);
    ctx.lineTo(9, -12);
    ctx.lineTo(13, 34);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Registration on the fin, and the courier's mark.
    ctx.fillStyle = '#fff3d6';
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SK', 0, 26);
    // Nav lights.
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath();
    ctx.arc(-166, -4, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#34d17b';
    ctx.beginPath();
    ctx.arc(166, -4, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(8,20,30,0.58)';
    rr(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawHud(view) {
    const { p, mission, time } = view;
    const altFt = Math.round((p.y - terrain.heightAt(p.x, p.z)) * 3.281 + terrain.heightAt(p.x, p.z) * 3.281);
    const altAgl = Math.max(0, Math.round((p.y - terrain.heightAt(p.x, p.z)) * 3.281));
    const spdKt = Math.round(p.speed * 1.944);
    const hdg = Math.round(((p.heading * 180) / Math.PI + 360) % 360);
    void altFt;

    // Top-left: the three numbers the brief demands — altitude, speed, heading.
    panel(18, 16, 300, 96);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText('ALTITUDE', 34, 38);
    ctx.fillText('AIRSPEED', 134, 38);
    ctx.fillText('HEADING', 234, 38);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 30px ui-monospace, monospace';
    ctx.fillText(String(Math.round(p.y * 3.281)), 34, 74);
    ctx.fillText(String(spdKt), 134, 74);
    ctx.fillText(String(hdg).padStart(3, '0') + '°', 234, 74);
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillText('ft MSL', 34, 96);
    ctx.fillText('kt', 134, 96);
    ctx.fillText(`AGL ${altAgl} ft`, 234, 96);

    // Top-centre: compass strip. Ticks every 5 degrees; cardinal labels are placed
    // from the cardinals themselves, so a label never falls between ticks.
    const cx = W / 2;
    panel(cx - 190, 16, 380, 44);
    ctx.save();
    ctx.beginPath();
    rr(ctx, cx - 190, 16, 380, 44, 10);
    ctx.clip();
    const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (let d = -60; d <= 60; d += 5) {
      const deg = (hdg + d + 360) % 360;
      const x = cx + (d / 60) * 175;
      const major = deg % 45 === 0;
      const minor = deg % 15 === 0;
      ctx.strokeStyle = major ? '#ffffff' : 'rgba(255,255,255,0.45)';
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 26);
      ctx.lineTo(x, major ? 44 : minor ? 40 : 34);
      ctx.stroke();
    }
    for (let i = 0; i < 8; i += 1) {
      const card = i * 45;
      let d = (card - hdg + 540) % 360 - 180;
      if (Math.abs(d) > 60) continue;
      const x = cx + (d / 60) * 175;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(points[i], x, 52);
    }
    ctx.restore();
    ctx.fillStyle = '#ffb02e';
    ctx.beginPath();
    ctx.moveTo(cx, 20);
    ctx.lineTo(cx - 6, 10);
    ctx.lineTo(cx + 6, 10);
    ctx.closePath();
    ctx.fill();

    // Top-right: mission, score, clock.
    const m = mission.state;
    panel(W - 318, 16, 300, 96);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffb02e';
    ctx.font = '700 15px system-ui, sans-serif';
    ctx.fillText(mission.def.name.toUpperCase(), W - 34, 40);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText(mission.objectiveLine(), W - 34, 62);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 20px ui-monospace, monospace';
    ctx.fillText(`SCORE ${m.score}`, W - 34, 90);
    ctx.fillStyle = m.timeLeft < 30 ? '#ff5a4e' : 'rgba(255,255,255,0.75)';
    ctx.font = '600 13px ui-monospace, monospace';
    ctx.fillText(`⏱ ${mmss(m.timeLeft)}`, W - 34, 108 - 14 + 14);
    ctx.textAlign = 'left';

    // Bottom-left: fuel and throttle bars.
    panel(18, H - 96, 260, 78);
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText('FUEL', 34, H - 70);
    ctx.fillText('THROTTLE', 34, H - 38);
    const fuelW = 150 * clamp(p.fuel / 100, 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    rr(ctx, 110, H - 80, 150, 12, 6);
    ctx.fill();
    ctx.fillStyle = p.fuel < 20 ? '#ff5a4e' : p.fuel < 45 ? '#ffb02e' : '#4ddc78';
    rr(ctx, 110, H - 80, Math.max(6, fuelW), 12, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    rr(ctx, 110, H - 48, 150, 12, 6);
    ctx.fill();
    ctx.fillStyle = '#7fc4ff';
    rr(ctx, 110, H - 48, Math.max(6, 150 * p.throttle), 12, 6);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 12px ui-monospace, monospace';
    ctx.fillText(`${Math.round(p.fuel)}%`, 268 - 8, H - 68);
    ctx.fillText(`${Math.round(p.throttle * 100)}%`, 268 - 8, H - 36);

    // Bottom-right: artificial horizon.
    const hx = W - 92;
    const hy = H - 92;
    const hr = 62;
    ctx.save();
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(hx, hy);
    ctx.rotate(-p.roll);
    ctx.translate(0, p.pitch * 90);
    ctx.fillStyle = '#3f8fd2';
    ctx.fillRect(-hr - 4, -hr - 90, hr * 2 + 8, hr + 90);
    ctx.fillStyle = '#8a5a34';
    ctx.fillRect(-hr - 4, 0, hr * 2 + 8, hr + 90);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-hr - 4, -2, hr * 2 + 8, 4);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffb02e';
    ctx.beginPath();
    ctx.moveTo(hx - 26, hy);
    ctx.lineTo(hx - 8, hy);
    ctx.lineTo(hx, hy - 6);
    ctx.lineTo(hx + 8, hy);
    ctx.lineTo(hx + 26, hy);
    ctx.lineTo(hx + 8, hy + 4);
    ctx.lineTo(hx - 8, hy + 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ATTITUDE', hx, hy + hr + 16);

    // Warnings and messages.
    if (p.stall && !p.onGround) {
      ctx.fillStyle = Math.floor(time * 4) % 2 === 0 ? '#ff5a4e' : '#ffffff';
      ctx.font = '700 30px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⚠ STALL — NOSE DOWN, THROTTLE UP', W / 2, 150);
    } else if (p.fuel < 20 && p.fuel > 0) {
      ctx.fillStyle = Math.floor(time * 4) % 2 === 0 ? '#ffb02e' : '#ffffff';
      ctx.font = '700 24px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('LOW FUEL — LAND OR FINISH SOON', W / 2, 150);
    }
    if (m.message && time < m.messageUntil) {
      ctx.fillStyle = 'rgba(8,20,30,0.6)';
      ctx.font = '600 17px system-ui, sans-serif';
      const tw = ctx.measureText(m.message).width;
      rr(ctx, W / 2 - tw / 2 - 16, 168, tw + 32, 34, 17);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(m.message, W / 2, 191);
    }
    ctx.textAlign = 'left';
  }

  function drawTitle(view) {
    ctx.fillStyle = 'rgba(6,16,26,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffb02e';
    ctx.font = '700 20px system-ui, sans-serif';
    ctx.fillText('A  F L I G H T  G A M E', W / 2, 108);
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 84px system-ui, sans-serif';
    ctx.fillText('SKY COURIER', W / 2, 192);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '400 21px system-ui, sans-serif';
    ctx.fillText('Fly the Kite MK-II over the valley — rings, airmail and island hops.', W / 2, 232);
    const cards = view.missions;
    const cw = 330;
    const gap = 26;
    const x0 = W / 2 - (cw * 3 + gap * 2) / 2;
    cards.forEach((mission, i) => {
      const x = x0 + i * (cw + gap);
      const y = 288;
      ctx.fillStyle = 'rgba(10,26,40,0.82)';
      rr(ctx, x, y, cw, 168, 14);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,176,46,0.7)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#ffb02e';
      ctx.font = '700 15px system-ui, sans-serif';
      ctx.fillText(`PRESS ${mission.key}`, x + cw / 2, y + 34);
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 26px system-ui, sans-serif';
      ctx.fillText(mission.name, x + cw / 2, y + 70);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = '400 15px system-ui, sans-serif';
      const words = mission.blurb.split(' ');
      let line = '';
      let ly = y + 100;
      for (const word of words) {
        if (ctx.measureText(line + word).width > cw - 36) {
          ctx.fillText(line.trim(), x + cw / 2, ly);
          line = '';
          ly += 20;
        }
        line += `${word} `;
      }
      ctx.fillText(line.trim(), x + cw / 2, ly);
    });
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '400 16px system-ui, sans-serif';
    ctx.fillText('↑ ↓ pitch · ← → bank · Shift / Ctrl throttle · Space drop parcel · P pause · M mute', W / 2, 512);
    ctx.fillText('Mouse: hold and drag to steer. Land gently on a strip to refuel.', W / 2, 540);
    if (view.best > 0) {
      ctx.fillStyle = '#ffb02e';
      ctx.font = '700 18px system-ui, sans-serif';
      ctx.fillText(`BEST SCORE  ${view.best}`, W / 2, 580);
    }
    ctx.textAlign = 'left';
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(6,16,26,0.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 56px system-ui, sans-serif';
    ctx.fillText('PAUSED', W / 2, H / 2 - 10);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '400 20px system-ui, sans-serif';
    ctx.fillText('Press P to keep flying · R to restart the sortie', W / 2, H / 2 + 34);
    ctx.textAlign = 'left';
  }

  function drawOver(view) {
    ctx.fillStyle = 'rgba(20,8,6,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff6a5e';
    ctx.font = '800 54px system-ui, sans-serif';
    ctx.fillText('DOWN IN THE VALLEY', W / 2, 250);
    ctx.fillStyle = '#ffffff';
    ctx.font = '400 21px system-ui, sans-serif';
    ctx.fillText(view.mission.state.failReason, W / 2, 296);
    ctx.fillStyle = '#ffb02e';
    ctx.font = '700 30px system-ui, sans-serif';
    ctx.fillText(`SCORE  ${view.mission.state.score}`, W / 2, 356);
    if (view.best > 0) ctx.fillText(`BEST  ${view.best}`, W / 2, 396);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '400 18px system-ui, sans-serif';
    ctx.fillText('R — fly the sortie again · Enter — back to the title screen', W / 2, 452);
    ctx.textAlign = 'left';
  }

  function drawDone(view) {
    ctx.fillStyle = 'rgba(6,26,16,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#4ddc78';
    ctx.font = '800 54px system-ui, sans-serif';
    ctx.fillText('SORTIE COMPLETE', W / 2, 240);
    ctx.fillStyle = '#ffffff';
    ctx.font = '400 21px system-ui, sans-serif';
    ctx.fillText(`${view.mission.def.name} — flown in ${mmss(view.mission.state.time)}`, W / 2, 286);
    ctx.fillStyle = '#ffb02e';
    ctx.font = '700 34px system-ui, sans-serif';
    ctx.fillText(`SCORE  ${view.mission.state.score}`, W / 2, 344);
    if (view.best > 0) ctx.fillText(`BEST  ${view.best}`, W / 2, 388);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '400 18px system-ui, sans-serif';
    ctx.fillText('R — fly it again · Enter — back to the title screen', W / 2, 444);
    ctx.textAlign = 'left';
  }

  // The one call the loop makes: paint the world, the plane and the screen on top.
  function draw(view) {
    const { p, screen } = view;
    updateCamera(p);
    drawSky(p, view.time);
    drawTerrain();
    drawClouds(view.time);
    drawRings(view.mission, view.time);
    drawDropZones(view.mission, view.time);
    drawPlaneShadow(p);
    if (screen !== SCREEN_TITLE) {
      drawPlane(p, view.time);
      if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) {
        drawTargetGuide(view.mission, p);
        drawHud(view);
      }
    }
    if (screen === SCREEN_TITLE) {
      drawPlane(p, view.time, 0.82);
      drawTitle(view);
    }
    if (screen === SCREEN_PAUSED) drawPaused();
    if (screen === SCREEN_OVER) drawOver(view);
    if (screen === SCREEN_DONE) drawDone(view);
  }

  return { draw, project, updateCamera };
}
