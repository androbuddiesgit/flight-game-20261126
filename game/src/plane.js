// The flight model: arcade physics for the Kite MK-II — throttle sets a target speed,
// pitch trades speed for altitude, bank turns the nose, and a slow wing stops flying.
// One fixed step, pure arithmetic, so screenshots replay exactly from a seed.
import { PLANE, STEP } from './config.js';
import { fieldById } from './terrain.js';

export const EVENT_NONE = 0;
export const EVENT_CRASH = 1;
export const EVENT_LANDED = 2;
export const EVENT_RING = 4;
export const EVENT_DROPPED = 8;
export const EVENT_FUEL_LOW = 16;
export const EVENT_STALL = 32;

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}
function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function createPlane(terrain) {
  const home = fieldById('home');
  const state = {
    x: home.x,
    y: terrain.heightAt(home.x, home.z) + PLANE.groundClearance,
    z: home.z,
    heading: home.heading,
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    fuel: PLANE.fuelCapacity,
    onGround: true,
    crashed: false,
    landed: false,
    landedField: null,
    stall: false,
    distanceFlown: 0,
    dropRequested: false,
  };

  function reset() {
    state.x = home.x;
    state.y = terrain.heightAt(home.x, home.z) + PLANE.groundClearance;
    state.z = home.z;
    state.heading = home.heading;
    state.pitch = 0;
    state.roll = 0;
    state.speed = 0;
    state.throttle = 0;
    state.fuel = PLANE.fuelCapacity;
    state.onGround = true;
    state.crashed = false;
    state.landed = false;
    state.landedField = null;
    state.stall = false;
    state.distanceFlown = 0;
    state.dropRequested = false;
  }

  // input: { pitch: -1..1 (stick back = climb), roll: -1..1, throttle: -1..1 (change) }
  // Returns an event bitmask. The runway under the wheels is checked for landings.
  function step(input, dt = STEP) {
    if (state.crashed) return EVENT_NONE;
    let events = EVENT_NONE;

    if (state.fuel <= 0) state.throttle = 0;
    else state.throttle = clamp(state.throttle + input.throttle * dt * 0.9, 0, 1);
    const burn = PLANE.fuelBurnIdle + (PLANE.fuelBurn - PLANE.fuelBurnIdle) * state.throttle;
    const fuelBefore = state.fuel;
    state.fuel = Math.max(0, state.fuel - burn * dt);
    if (fuelBefore > 20 && state.fuel <= 20) events |= EVENT_FUEL_LOW;

    const targetSpeed = state.throttle * PLANE.maxSpeed;
    state.speed += (targetSpeed - state.speed) * Math.min(1, PLANE.accel * dt / Math.max(20, PLANE.maxSpeed));
    state.speed -= state.speed * PLANE.drag * dt * 0.25;

    const stalled = state.speed < PLANE.stallSpeed && !state.onGround;
    if (stalled && !state.stall) events |= EVENT_STALL;
    state.stall = stalled;

    state.roll = clamp(state.roll + input.roll * PLANE.rollRate * dt, -PLANE.maxRoll, PLANE.maxRoll);
    if (input.roll === 0) state.roll *= Math.max(0, 1 - 2.2 * dt);
    const pitchTarget = clamp(input.pitch * PLANE.maxPitch, -PLANE.maxPitch, PLANE.maxPitch);
    state.pitch += (pitchTarget - state.pitch) * Math.min(1, 3.2 * dt);
    if (state.onGround) state.pitch = Math.max(0, state.pitch);

    // Bank turns the nose; the turn tightens with speed. A left bank (negative roll)
    // turns the nose left, so heading follows the sign of the roll.
    state.heading = wrapAngle(state.heading + Math.sin(state.roll) * PLANE.turnRate * (state.speed / PLANE.cruiseSpeed) * dt);

    const forwardX = Math.sin(state.heading);
    const forwardZ = -Math.cos(state.heading);
    const climb = stalled
      ? -PLANE.sinkRate
      : Math.sin(state.pitch) * state.speed * PLANE.climbFactor;

    state.x += forwardX * state.speed * Math.cos(state.pitch) * dt;
    state.z += forwardZ * state.speed * Math.cos(state.pitch) * dt;
    state.distanceFlown += state.speed * dt;

    const newGround = terrain.heightAt(state.x, state.z);
    if (state.onGround) {
      // Rolling: the wheels stay glued to the ground until the wing is lifting.
      // Without this a dip followed by a rise reads as a crash on the next step.
      if (climb > 0.5 && state.speed > PLANE.stallSpeed) {
        state.y += climb * dt;
        state.onGround = false;
        state.landed = false;
        state.landedField = null;
      } else {
        state.y = newGround + PLANE.groundClearance;
        state.speed = Math.max(0, state.speed - 3.5 * dt);
      }
      return events;
    }

    state.y += climb * dt;
    if (state.y <= newGround + PLANE.groundClearance) {
      state.y = newGround + PLANE.groundClearance;
      const runway = runwayUnder(state.x, state.z);
      const sink = -climb;
      const gentle = sink <= 6 && Math.abs(state.roll) < 0.3 && state.speed < 58;
      if (runway && gentle) {
        state.onGround = true;
        state.landed = true;
        state.landedField = runway.field.id;
        state.pitch = 0;
        state.roll = 0;
        events |= EVENT_LANDED;
      } else {
        state.crashed = true;
        state.speed = 0;
        events |= EVENT_CRASH;
      }
    }
    return events;
  }

  function runwayUnder(x, z) {
    for (const field of [fieldById('home'), fieldById('north'), fieldById('east')]) {
      const dx = x - field.x;
      const dz = z - field.z;
      const along = dx * Math.sin(field.heading) + dz * Math.cos(field.heading);
      const across = dx * Math.cos(field.heading) - dz * Math.sin(field.heading);
      if (Math.abs(along) <= field.length / 2 + 12 && Math.abs(across) <= field.width / 2 + 6) {
        return { field, along, across };
      }
    }
    return null;
  }

  function refuel() {
    state.fuel = PLANE.fuelCapacity;
  }

  function headingDegrees() {
    return ((state.heading * 180) / Math.PI + 360) % 360;
  }

  return { state, reset, step, refuel, runwayUnder, headingDegrees };
}
