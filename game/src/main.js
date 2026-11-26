// Boot and the one loop: input is read every frame, the plane and the mission advance
// in fixed 1/60 s steps, and the renderer paints what is there. The game moves between
// five screens: title, play, paused, mission over and mission done.
//
// ?seed=N fixes the valley. ?shot=title|rings|mail|landing (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady.
import { BEST_KEY, MISSIONS, STEP, WORLD_SEED } from './config.js';
import { createTerrain } from './terrain.js';
import { createPlane, EVENT_CRASH, EVENT_LANDED, EVENT_RING, EVENT_STALL } from './plane.js';
import { createMission, MISSION_DONE, MISSION_FAILED } from './missions.js';
import { createAudio } from './audio.js';
import {
  ACTION_CONFIRM,
  ACTION_DROP,
  ACTION_MISSION_1,
  ACTION_MISSION_2,
  ACTION_MISSION_3,
  ACTION_MUTE,
  ACTION_PAUSE,
  ACTION_RESTART,
  createInput,
} from './input.js';
import {
  SCREEN_DONE,
  SCREEN_OVER,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  createRenderer,
} from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : WORLD_SEED;

const canvas = document.getElementById('game');
const status = document.getElementById('status');

// One world: the terrain, the plane and the active mission, reset together.
const terrain = createTerrain();
const plane = createPlane(terrain);
let mission = createMission(MISSIONS[0].id, terrain, plane);
const renderer = createRenderer(canvas, terrain);
const audio = createAudio();

const world = {
  terrain,
  plane,
  get mission() {
    return mission;
  },
  reset() {
    plane.reset();
    mission = createMission(mission.def.id, terrain, plane);
    mission.start();
  },
  setMission(id) {
    mission = createMission(id, terrain, plane);
    plane.reset();
    mission.start();
  },
};

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const staged = stageShot(name, world);
  const best = readBest();
  let painted = 0;
  function paint() {
    renderer.draw({
      p: plane.state,
      mission: staged.mission,
      missions: MISSIONS,
      screen: staged.screen,
      best,
      time: 12,
    });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let elapsed = 0;
  let muted = false;

  function announce(message) {
    status.textContent = message;
  }

  function startMission(id) {
    audio.ensure();
    world.setMission(id);
    screen = SCREEN_PLAY;
    announce(`${mission.def.name}. ${mission.def.blurb}`);
  }

  function endMission(done) {
    screen = done ? SCREEN_DONE : SCREEN_OVER;
    if (mission.state.score > best) {
      best = mission.state.score;
      saveBest(best);
    }
    announce(done
      ? `Sortie complete. Score ${mission.state.score}.`
      : `Down in the valley. Score ${mission.state.score}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_MISSION_1) startMission('rings');
      else if (actions & ACTION_MISSION_2) startMission('mail');
      else if (actions & ACTION_MISSION_3) startMission('hop');
      else if (actions & ACTION_CONFIRM) startMission('rings');
      return;
    }
    if (actions & ACTION_RESTART && (screen === SCREEN_PLAY || screen === SCREEN_PAUSED || screen === SCREEN_OVER || screen === SCREEN_DONE)) {
      startMission(mission.def.id);
      return;
    }
    if (screen === SCREEN_OVER || screen === SCREEN_DONE) {
      if (actions & ACTION_CONFIRM) {
        screen = SCREEN_TITLE;
        world.reset();
        announce('Sky Courier. Pick a sortie: 1, 2 or 3.');
      }
      return;
    }
    if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
    if (actions & ACTION_DROP && screen === SCREEN_PLAY) {
      plane.state.dropRequested = true;
    }
  }

  function step() {
    if (screen !== SCREEN_PLAY) return;
    const stick = input.stick();
    const events = plane.step(stick, STEP);
    const result = mission.update(events, plane.state, STEP);
    if (events & EVENT_RING) audio.ring();
    if (events & EVENT_LANDED) audio.land();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_STALL) audio.stallWarn();
    plane.state.dropRequested = false; // one press, one judgement, then it is spent
    audio.update(plane.state.throttle, plane.state.speed, !plane.state.onGround);
    if (result === MISSION_DONE) endMission(true);
    else if (result === MISSION_FAILED) endMission(false);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    elapsed += dt;
    handleActions();
    if (screen === SCREEN_PLAY) {
      accumulator += dt;
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
      // The title screen keeps the valley alive behind the cards.
      if (screen === SCREEN_TITLE) {
        plane.step({ pitch: 0, roll: 0, throttle: 0 }, STEP);
      }
    }
    renderer.draw({
      p: plane.state,
      mission,
      missions: MISSIONS,
      screen,
      best,
      time: elapsed,
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Sky Courier. Pick a sortie: press 1, 2 or 3.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
