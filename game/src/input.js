// Keyboard and mouse: arrows (or WASD) fly the plane, Shift/Ctrl work the throttle,
// Space drops a parcel, the mouse steers when held. Actions are edge-triggered bits
// the main loop takes once per frame.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;
export const ACTION_DROP = 8;
export const ACTION_MUTE = 16;
export const ACTION_MISSION_1 = 32;
export const ACTION_MISSION_2 = 64;
export const ACTION_MISSION_3 = 128;

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseDown = false;
  let mouseX = 0;
  let mouseY = 0;

  function onKeyDown(event) {
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === 'Space' || event.code === 'Enter') {
      actions |= ACTION_CONFIRM;
      if (event.code === 'Space') actions |= ACTION_DROP;
      event.preventDefault();
    }
    if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
    if (event.code === 'KeyR') actions |= ACTION_RESTART;
    if (event.code === 'KeyM') actions |= ACTION_MUTE;
    if (event.code === 'Digit1') actions |= ACTION_MISSION_1;
    if (event.code === 'Digit2') actions |= ACTION_MISSION_2;
    if (event.code === 'Digit3') actions |= ACTION_MISSION_3;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault();
    }
  }
  function onKeyUp(event) {
    keys.delete(event.code);
  }
  function onMouseDown(event) {
    mouseDown = true;
    mouseX = event.clientX;
    mouseY = event.clientY;
  }
  function onMouseMove(event) {
    mouseX = event.clientX;
    mouseY = event.clientY;
  }
  function onMouseUp() {
    mouseDown = false;
  }
  function onBlur() {
    keys.clear();
    mouseDown = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('pointerdown', onMouseDown);
  window.addEventListener('pointermove', onMouseMove);
  window.addEventListener('pointerup', onMouseUp);

  function takeActions() {
    const taken = actions;
    actions = 0;
    return taken;
  }

  // Stick position each frame: -1..1 pitch (up = climb) and roll, from keys or mouse.
  function stick() {
    let pitch = 0;
    let roll = 0;
    if (keys.has('ArrowUp') || keys.has('KeyW')) pitch += 1;
    if (keys.has('ArrowDown') || keys.has('KeyS')) pitch -= 1;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) roll -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) roll += 1;
    if (mouseDown) {
      const rect = canvas.getBoundingClientRect();
      const nx = ((mouseX - rect.left) / rect.width) * 2 - 1;
      const ny = ((mouseY - rect.top) / rect.height) * 2 - 1;
      roll += Math.max(-1, Math.min(1, nx * 1.4));
      pitch += Math.max(-1, Math.min(1, -ny * 1.2));
    }
    let throttle = 0;
    if (keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('KeyE')) throttle += 1;
    if (keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyQ')) throttle -= 1;
    return {
      pitch: Math.max(-1, Math.min(1, pitch)),
      roll: Math.max(-1, Math.min(1, roll)),
      throttle,
    };
  }

  return { takeActions, stick };
}
