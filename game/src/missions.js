// Missions: what "done" means for each sortie, and the live objective line the HUD
// shows. The flight model reports raw events; this file turns them into progress,
// score and a finish. Pure logic — no drawing, no input.
import { MISSIONS, RINGS, MAIL, LANDING } from './config.js';
import { fieldById } from './terrain.js';
import { EVENT_CRASH, EVENT_LANDED } from './plane.js';

export const MISSION_DONE = 1;
export const MISSION_FAILED = 2;

function dist3(ax, ay, az, bx, by, bz) {
  const dx = ax - bx;
  const dy = ay - by;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function createMission(missionId, terrain, plane) {
  const def = MISSIONS.find((m) => m.id === missionId) ?? MISSIONS[0];
  const rings = terrain.rings.map((r) => ({ ...r, passed: false }));
  const zones = terrain.dropZones.map((z) => ({ ...z, delivered: false }));
  const stops = ['north', 'east'];
  const state = {
    def,
    score: 0,
    time: 0,
    timeLeft: def.par + 60,
    nextRing: 0,
    dropsDone: 0,
    stopsDone: [],
    parcels: 3,
    finished: false,
    failed: false,
    failReason: '',
    message: '',
    messageUntil: 0,
    lastEventScore: 0,
  };

  function say(text, seconds = 3) {
    state.message = text;
    state.messageUntil = state.time + seconds;
  }

  function start() {
    say(`${def.name} — ${def.blurb}`, 5);
  }

  function nextTarget() {
    if (def.id === 'rings') return rings[state.nextRing] ?? null;
    if (def.id === 'mail') {
      const zone = zones.find((z) => !z.delivered);
      if (zone) return { kind: 'drop', ...zone };
      return { kind: 'land', field: fieldById('home') };
    }
    const next = stops.find((id) => !state.stopsDone.includes(id));
    if (next) return { kind: 'land', field: fieldById(next) };
    return { kind: 'land', field: fieldById('home') };
  }

  function objectiveLine() {
    if (def.id === 'rings') return `Rings ${state.nextRing}/${rings.length}`;
    if (def.id === 'mail') {
      const left = zones.filter((z) => !z.delivered).length;
      return left > 0 ? `Deliver parcels: ${left} left — low & slow over the farm` : 'All parcels away — land at Kite Field';
    }
    const left = stops.filter((id) => !state.stopsDone.includes(id));
    if (left.length === 2) return 'Land at Pine Ridge, then River Bend';
    if (left.length === 1) return `Land at ${fieldById(left[0]).name}`;
    return 'Both strips done — land at Kite Field';
  }

  // Called every step with the plane's events and state. Returns MISSION_DONE /
  // MISSION_FAILED flags (0 while flying).
  function update(events, p, dt) {
    if (state.finished || state.failed) return 0;
    state.time += dt;
    state.timeLeft -= dt;
    if (state.timeLeft <= 0) {
      state.failed = true;
      state.failReason = 'Out of time — the sun set on this sortie.';
      return MISSION_FAILED;
    }
    if (events & EVENT_CRASH) {
      state.failed = true;
      state.failReason = p.fuel <= 0
        ? 'Out of fuel — she came down in the fields.'
        : 'Crashed — mind the hills and the river valley.';
      return MISSION_FAILED;
    }
    if (p.fuel <= 0 && !p.onGround) {
      state.failed = true;
      state.failReason = 'Out of fuel — she came down in the fields.';
      return MISSION_FAILED;
    }

    if (def.id === 'rings') {
      const ring = rings[state.nextRing];
      if (ring && dist3(p.x, p.y, p.z, ring.x, ring.y, ring.z) < ring.radius) {
        ring.passed = true;
        state.nextRing += 1;
        state.score += RINGS.score;
        state.timeLeft += RINGS.timeBonus;
        plane.refuel();
        say(`Ring ${state.nextRing}/${rings.length} — +${RINGS.score}, fuel topped up`);
        if (state.nextRing >= rings.length) {
          state.finished = true;
          state.score += Math.max(0, Math.floor(state.timeLeft)) * 5;
          say('Course complete — beautiful flying!', 5);
          return MISSION_DONE;
        }
      }
    }

    if (def.id === 'mail') {
      const zone = zones.find((z) => !z.delivered);
      if (zone && p.dropRequested) {
        p.dropRequested = false;
        const horizontal = Math.hypot(p.x - zone.x, p.z - zone.z);
        const heightAbove = p.y - terrain.heightAt(zone.x, zone.z);
        if (horizontal < zone.radius && heightAbove < MAIL.dropCeiling && p.speed < MAIL.dropMaxSpeed) {
          zone.delivered = true;
          state.dropsDone += 1;
          state.score += MAIL.score;
          state.parcels -= 1;
          say(`Parcel away over ${zone.name} — +${MAIL.score}`);
        } else if (horizontal < zone.radius) {
          say('Too high or too fast for a drop — slow down below 130 m', 2);
        }
      }
    }

    if (events & EVENT_LANDED) {
      const field = fieldById(p.landedField);
      if (def.id === 'hop') {
        if (stops.includes(p.landedField) && !state.stopsDone.includes(p.landedField)) {
          state.stopsDone.push(p.landedField);
          state.score += LANDING.score;
          plane.refuel();
          say(`Down safe at ${field.name} — +${LANDING.score}, tank full`);
          if (state.stopsDone.length === stops.length) say('Both strips done — bring her home to Kite Field', 4);
        } else if (p.landedField === 'home' && state.stopsDone.length === stops.length) {
          state.finished = true;
          state.score += LANDING.score + Math.max(0, Math.floor(state.timeLeft)) * 5;
          say('Island Hop complete — three perfect landings!', 5);
          return MISSION_DONE;
        } else if (p.landedField === 'home') {
          plane.refuel();
          say('Refuelled at Kite Field — off you go');
        }
      } else if (def.id === 'mail') {
        if (p.landedField === 'home' && state.dropsDone >= zones.length) {
          state.finished = true;
          state.score += LANDING.score + Math.max(0, Math.floor(state.timeLeft)) * 5;
          say('All parcels delivered and home safe!', 5);
          return MISSION_DONE;
        }
        if (p.landedField === 'home') {
          plane.refuel();
          say('Refuelled at Kite Field');
        }
      } else if (p.landedField === 'home') {
        plane.refuel();
      }
    }
    return 0;
  }

  return { def, state, rings, zones, start, nextTarget, objectiveLine, update };
}
