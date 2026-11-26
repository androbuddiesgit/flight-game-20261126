// Screenshot scenes: each one flies the real rules forward from a fresh start with a
// simple autopilot, so the frame is what a short game really looks like and the same
// seed always gives the same frame. ?shot=title|rings|mail|landing (&seed=N).
import { STEP, MISSIONS } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { MISSION_DONE, MISSION_FAILED } from './missions.js';

const SAMPLE = STEP;

/** Steer toward a world point at a target speed: bank into the heading error, pitch
 * for the height, work the throttle toward the speed. Returns a stick input. */
function autopilotTo(p, tx, ty, tz, targetSpeed) {
  const dx = tx - p.x;
  const dz = tz - p.z;
  const wantHeading = Math.atan2(dx, -dz);
  let err = wantHeading - p.heading;
  while (err > Math.PI) err -= Math.PI * 2;
  while (err < -Math.PI) err += Math.PI * 2;
  const roll = Math.max(-1, Math.min(1, err * 1.6));
  const heightErr = ty - p.y;
  const pitch = Math.max(-1, Math.min(1, heightErr * 0.02 + 0.12));
  const speedErr = targetSpeed - p.speed;
  const thr = Math.max(-0.8, Math.min(0.8, speedErr * 0.05));
  return { pitch, roll, throttle: thr };
}

/** Aim point 350 m past a ring along the course from the previous ring, so the
 * autopilot flies *through* the ring instead of orbiting it: with a ~160 m turn
 * radius, steering at the ring itself ends in a stable circle that never passes. */
function ringAim(rings, index) {
  const ring = rings[index];
  const prev = index === 0 ? { x: 0, z: 320 } : rings[index - 1];
  const dx = ring.x - prev.x;
  const dz = ring.z - prev.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: ring.x + (dx / len) * 350, y: ring.y, z: ring.z + (dz / len) * 350 };
}
function flyUntil(world, seconds, steer, until) {
  const steps = Math.floor(seconds / SAMPLE);
  for (let i = 0; i < steps; i += 1) {
    const input = steer(world.plane.state, world.mission);
    const events = world.plane.step(input, SAMPLE);
    const done = world.mission.update(events, world.plane.state, SAMPLE);
    if (done === MISSION_DONE || done === MISSION_FAILED || world.plane.state.crashed) break;
    if (until && until(world.plane.state, world.mission)) break;
  }
}

function takeOff(world) {
  // Full throttle down the home strip, rotate at 46 m/s, climb to 130 m.
  flyUntil(world, 30, (p) => {
    if (p.onGround) return { pitch: p.speed > 46 ? 0.55 : 0, roll: 0, throttle: 1 };
    return autopilotTo(p, p.x + Math.sin(p.heading) * 400, 130, p.z - Math.cos(p.heading) * 400, 55);
  }, (p) => !p.onGround && p.y > 120);
}

/**
 * Stage the named scene on a fresh world and return the screen to draw over it.
 * title: parked on the home strip, mission cards up.
 * rings: mid-course, banking through the ring line.
 * mail: low over the first farm, parcel just dropped.
 * landing: short final to the home strip, low and slow, runway ahead.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'rings' && name !== 'mail' && name !== 'landing') {
    // Title: sit on the strip, throttle idling, camera already settled behind.
    world.plane.step({ pitch: 0, roll: 0, throttle: 0 }, STEP);
    return { screen: SCREEN_TITLE, mission: world.mission };
  }

  if (name === 'rings') {
    world.setMission('rings');
    takeOff(world);
    // Chase the rings in order until the third is passed or time runs out: the
    // frame then catches the plane just after a ring, score fresh on the board.
    flyUntil(world, 150, (state, mission) => {
      const target = mission.nextTarget();
      if (!target) return { pitch: 0, roll: 0, throttle: 0 };
      const aim = ringAim(mission.rings, mission.state.nextRing);
      return autopilotTo(state, aim.x, aim.y, aim.z, 55);
    }, (state, mission) => mission.state.nextRing >= 3);
    return { screen: SCREEN_PLAY, mission: world.mission };
  }

  if (name === 'mail') {
    world.setMission('mail');
    takeOff(world);
    const zone = world.terrain.dropZones[0];
    const zoneGround = world.terrain.heightAt(zone.x, zone.z);
    // Steer straight at the farm: the approach from the north is long enough to
    // line up, and the drop window is the farm's own radius, so the first pass
    // crosses it. (Aiming past the farm instead put the orbit's closest point
    // outside the drop window.)
    flyUntil(world, 180, (state) => {
      const horizontal = Math.hypot(state.x - zone.x, state.z - zone.z);
      if (horizontal < 55 && state.y - zoneGround < 120 && state.speed < 48) {
        state.dropRequested = true;
      }
      return autopilotTo(state, zone.x, zoneGround + 85, zone.z, 42);
    }, (state, mission) => mission.state.dropsDone >= 1);
    return { screen: SCREEN_PLAY, mission: world.mission };
  }

  // Landing: a right-hand circuit — climb out north, turn downwind east of the field,
  // then turn onto final from the south. The last leg ends the moment the plane is
  // lined up on the runway (heading north, within 800 m of the threshold, low),
  // so the frame is a real final approach with the strip ahead.
  world.setMission('hop');
  takeOff(world);
  const homeGround = world.terrain.heightAt(0, 320);
  flyUntil(world, 70, (state) => autopilotTo(state, 500, homeGround + 150, -800, 55),
    (state) => Math.hypot(state.x - 500, state.z + 800) < 200);
  flyUntil(world, 70, (state) => autopilotTo(state, 500, homeGround + 120, 900, 50),
    (state) => Math.hypot(state.x - 500, state.z - 900) < 200);
  flyUntil(world, 100, (state) => autopilotTo(state, 0, homeGround + 24, 530, 42),
    (state) => {
      const dist = Math.hypot(state.x - 0, state.z - 530);
      const aligned = Math.abs(state.heading) < 0.45 || Math.abs(state.heading) > Math.PI * 2 - 0.45;
      return dist < 800 && aligned && state.y < homeGround + 60;
    });
  return { screen: SCREEN_PLAY, mission: world.mission };
}

export { MISSIONS };
