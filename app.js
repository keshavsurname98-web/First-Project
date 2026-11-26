"use strict";

const canvas = document.querySelector("#field");
const context = canvas.getContext("2d");
const scenery = document.querySelector("#field-grid");
const sceneryContext = scenery.getContext("2d");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const presetInput = document.querySelector("#preset");
const speedInput = document.querySelector("#speed");
const speedValue = document.querySelector("#speed-value");
const trailsInput = document.querySelector("#trails");
const playButton = document.querySelector("#play");
const playLabel = document.querySelector("#play-label");
const resetButton = document.querySelector("#reset");
const bodyList = document.querySelector("#bodies");
const status = document.querySelector("#state");
const notice = document.querySelector("#notice");
const count = document.querySelector("#count");
const description = document.querySelector("#preset-description");
const sandboxMode = document.querySelector("#sandbox-mode");
const missionMode = document.querySelector("#mission-mode");
const courseInput = document.querySelector("#course");
const courseDescription = document.querySelector("#course-description");
const checkpoints = document.querySelector("#checkpoints");
const progressTrack = checkpoints.parentElement;
const checkpointCount = document.querySelector("#checkpoint-count");
const attemptLabel = document.querySelector("#attempt");
const recordLabel = document.querySelector("#record");
const telemetry = document.querySelector("#telemetry");
const telemetryLabel = document.querySelector("#telemetry-label");
const fieldHelp = document.querySelector("#field-help");
const gravityInput = document.querySelector("#gravity");
const headingText = document.querySelector("#title-text");
const introCopy = document.querySelector("#intro-copy");
const sandboxSettings = document.querySelector("#sandbox-settings");
const missionSettings = document.querySelector("#mission-settings");
const rosterSection = document.querySelector(".body-section");
const titleEffect = window.mountTechText?.(document.querySelector("#title-effect"), {
  text: headingText.textContent,
  fontWeight: 500,
  fontSize: 92,
  letterSpacing: -0.065,
  align: "left",
  paddingX: 10,
  accentColor: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(),
  intro: "metrics",
  introDuration: 0.65,
  sweep: false,
  labels: false,
  draggable: false,
  bounce: 0.16,
  specks: 5
});

const standardGravity = 1_260_000;
let gravity = standardGravity;
const starRadius = 20;
const escapeDistance = 700;
const bodyLimit = 12;
const timestep = 1 / 120;
const maxFrameDelta = 0.15;
const speeds = [0.25, 0.5, 1, 2, 4];
const colors = ["#a6cab5", "#dfa07d", "#a7bde0", "#e1c688", "#c7a9d5"];
const padRadius = 24;
const recordKey = "orbit-lab-flight-records-v1";
const courses = [
  {
    name: "First Orbit", description: "Make a wide turn around Sol and collect three checkpoints.",
    pad: { x: -108, y: 0 }, reference: { vx: 0, vy: -108 }, aim: { vx: 8, vy: -105 },
    samples: [1.3, 2.9, 4.9], gateRadius: 18, limit: 9
  },
  {
    name: "Inside Track", description: "Drop into a tighter orbit to reach the inner checkpoints.",
    pad: { x: -153, y: 0 }, reference: { vx: 20, vy: -76 }, aim: { vx: 24, vy: -88 },
    samples: [1.2, 2.35, 3.2, 4.45], gateRadius: 15, limit: 10
  },
  {
    name: "The Slingshot", description: "Dive past Sol and reach the outer checkpoint before time runs out.",
    pad: { x: -178, y: 64 }, reference: { vx: 108, vy: -111 }, aim: { vx: 108, vy: -103 },
    samples: [0.7, 1.25, 1.55, 1.95, 2.45], gateRadius: 13, limit: 7
  }
];
const presets = {
  orbits: {
    description: "Two planets in steady orbits around the star.",
    bodies: [
      { name: "Aster", x: -97, y: -43, circular: true },
      { name: "Cinder", x: 143, y: 93, circular: true }
    ]
  },
  flyby: {
    description: "A fast planet bends around the star and escapes.",
    bodies: [{ name: "Drifter", x: -202, y: -95, vx: 165, vy: 14 }]
  },
  collision: {
    description: "A planet with too little sideways speed falls into the star.",
    bodies: [{ name: "Ember", x: 152, y: -72, vx: -33, vy: 12 }]
  },
  empty: {
    description: "Start with Sol and build your own planetary system.",
    bodies: []
  }
};

let bodies = [];
let running = false;
let frameRequest = 0;
let previousTime = null;
let accumulator = 0;
let trailClock = 0;
let launchCount = 0;
let drag = null;
let keyboardPoint = null;
let keyboardActive = false;
let view = { width: 0, height: 0, scale: 1 };
let mission = null;
const pulses = [];
let records = {};
try {
  const saved = JSON.parse(localStorage.getItem(recordKey));
  if (saved && typeof saved === "object" && !Array.isArray(saved)) records = saved;
} catch {
  // Progress is still tracked for this tab when browser storage is unavailable.
}

function orbitalVelocity({ x, y }) {
  const distance = Math.hypot(x, y);
  const speed = Math.sqrt(gravity / distance);
  return { vx: -y / distance * speed, vy: x / distance * speed };
}

// Velocity Verlet keeps circular orbits steady at every playback speed.
function advance(body, step) {
  const distance = Math.max(Math.hypot(body.x, body.y), starRadius);
  const factor = -gravity / distance ** 3;
  const halfX = body.vx + body.x * factor * step / 2;
  const halfY = body.vy + body.y * factor * step / 2;
  body.x += halfX * step;
  body.y += halfY * step;
  const nextDistance = Math.max(Math.hypot(body.x, body.y), starRadius);
  const nextFactor = -gravity / nextDistance ** 3;
  body.vx = halfX + body.x * nextFactor * step / 2;
  body.vy = halfY + body.y * nextFactor * step / 2;
}

function makeBody(source, color) {
  const velocity = source.circular ? orbitalVelocity(source) : { vx: source.vx, vy: source.vy };
  const body = { ...source, ...velocity, previousX: source.x, previousY: source.y, radius: 5, color, trail: [] };
  if (source.circular) {
    const past = { ...body };
    for (let step = 0; step < 420; step += 1) {
      advance(past, -timestep);
      if (step % 10 === 0) body.trail.push({ x: past.x, y: past.y });
    }
    body.trail.reverse();
  }
  return body;
}

function createGates(course) {
  // Sample each course from a playable trajectory using the same flight integrator.
  const reference = { ...course.pad, ...course.reference };
  let step = 0;
  return course.samples.map(time => {
    const target = Math.round(time / timestep);
    while (step < target) {
      advance(reference, timestep);
      step += 1;
    }
    return { x: reference.x, y: reference.y };
  });
}

function showFlightControls() {
  sandboxMode.setAttribute("aria-pressed", String(!mission));
  missionMode.setAttribute("aria-pressed", String(Boolean(mission)));
  sandboxSettings.hidden = Boolean(mission);
  missionSettings.hidden = !mission;
  rosterSection.hidden = Boolean(mission);
  const heading = mission ? "Flight School" : "Gravity Sandbox";
  if (headingText.textContent === heading) return;
  headingText.textContent = heading;
  document.title = "Orbit Lab — " + heading;
  titleEffect?.update({ text: heading });
  titleEffect?.replayIntro();
  introCopy.textContent = mission
    ? "Fly through every checkpoint in order and beat your best attempt."
    : "Launch a planet and see where gravity takes it.";
  window.revealAnimatedContent?.(introCopy);
  window.revealAnimatedContent?.(mission ? missionSettings : sandboxSettings, { distance: 0, opacity: 0.55, duration: 260 });
}

function updateLabel(element, value) {
  if (element.textContent === value) return;
  element.textContent = value;
  if (value) window.revealAnimatedContent?.(element, { distance: 0, opacity: 0.6, duration: 200 });
}

function addPulse(x, y, radius, color) {
  if (reducedMotion.matches) return;
  if (pulses.length >= 6) pulses.shift();
  pulses.push({ x, y, radius, color, started: performance.now() });
}

function updateFlightStatus() {
  const { course, stage, phase, gates, reached, attempts, elapsed, aim } = mission;
  const best = records[stage];
  checkpoints.max = gates.length;
  checkpoints.value = reached;
  progressTrack.style.setProperty("--progress", reached / gates.length);
  checkpointCount.textContent = reached + " / " + gates.length;
  attemptLabel.textContent = phase === "ready" ? attempts + 1 : attempts;
  recordLabel.textContent = Number.isInteger(best) && best > 0
    ? best + (best === 1 ? " attempt" : " attempts")
    : "—";
  telemetryLabel.textContent = phase === "ready" ? "Launch speed" : "Time left";
  const velocity = drag ? startVelocity(drag.start, drag.end) : aim;
  const value = phase === "ready"
    ? Math.round(Math.hypot(velocity.vx, velocity.vy)) + " u/s"
    : Math.max(0, course.limit - elapsed).toFixed(1) + " s";
  if (telemetry.textContent !== value) telemetry.textContent = value;
  const instruction = {
    ready: "Drag from the launch pad to aim",
    flight: "Fly through the numbered checkpoints in order",
    lost: "Adjust your launch and try again",
    won: "Course complete"
  };
  updateLabel(fieldHelp, instruction[phase]);
  resetButton.textContent = "Reset course";
}

function loadCourse({ retry = false } = {}) {
  gravity = standardGravity;
  const stage = Number(courseInput.value);
  const course = courses[stage];
  const attempts = retry ? mission.attempts : 0;
  const aim = retry ? mission.aim : { ...course.aim };
  mission = { stage, course, gates: createGates(course), reached: 0, elapsed: 0, phase: "ready", attempts, aim };
  drag = null;
  pulses.length = 0;
  trailClock = 0;
  bodies = [];
  courseDescription.textContent = course.description;
  updateLabel(notice, "");
  showFlightControls();
  setRunning(false);
  updateBodies();
  window.revealAnimatedContent?.(canvas, { distance: 0, opacity: 0.52, duration: 270 });
}

function launchProbe(velocity) {
  if (mission.phase !== "ready") return;
  mission.aim = velocity;
  mission.phase = "flight";
  mission.attempts += 1;
  bodies = [makeBody({ ...mission.course.pad, ...velocity, name: "Probe" }, "#a6e6ce")];
  const { x, y } = mission.course.pad;
  addPulse(x, y, 10, "#a6e6ce");
  updateLabel(notice, "Probe launched. Head for checkpoint 1.");
  updateBodies();
  setRunning(true);
}

function endFlight(won, message) {
  mission.phase = won ? "won" : "lost";
  count.textContent = 0;
  if (won) {
    const { stage, attempts, course } = mission;
    const best = records[stage];
    const newBest = !Number.isInteger(best) || best < 1 || attempts < best;
    if (newBest) {
      records[stage] = attempts;
      try {
        localStorage.setItem(recordKey, JSON.stringify(records));
      } catch {
        // The in-memory record is available until the tab closes.
      }
    }
    updateLabel(notice, course.name + " complete." + (newBest ? " New personal best." : ""));
  } else {
    updateLabel(notice, message);
  }
  setRunning(false);
}

function checkFlight() {
  mission.elapsed += timestep;
  const [probe] = bodies;
  const distance = Math.hypot(probe.x, probe.y);
  if (distance <= starRadius + probe.radius) return endFlight(false, "The probe hit Sol. Try giving it more sideways speed.");
  if (distance > escapeDistance) return endFlight(false, "The probe escaped. Try a slower launch or aim closer to Sol.");
  const gate = mission.gates[mission.reached];
  if (Math.hypot(probe.x - gate.x, probe.y - gate.y) <= mission.course.gateRadius) {
    addPulse(gate.x, gate.y, mission.course.gateRadius, "#f2c878");
    mission.reached += 1;
    if (mission.reached === mission.gates.length) return endFlight(true);
    updateLabel(notice, "Checkpoint " + mission.reached + " reached. Next is " + (mission.reached + 1) + ".");
    updateFlightStatus();
  }
  if (mission.elapsed >= mission.course.limit) endFlight(false, "Time ran out. Try a different heading or speed.");
}

function updateBodies() {
  count.textContent = bodies.length;
  const roster = [{ color: "#b87a36", name: "Sol", role: "Star" }, ...bodies];
  bodyList.replaceChildren(...roster.map(({ color, name, role }) => {
    const row = document.createElement("li");
    row.className = "body-row";
    const dot = document.createElement("span");
    dot.className = "body-dot";
    dot.style.setProperty("--body-color", color);
    dot.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.textContent = name;
    const type = document.createElement("span");
    type.className = "body-role";
    type.textContent = role || "Planet";
    row.append(dot, label, type);
    return row;
  }));
}

function setRunning(value) {
  const changed = running !== value;
  running = value;
  previousTime = null;
  accumulator = 0;
  for (const body of bodies) {
    body.previousX = body.x;
    body.previousY = body.y;
  }
  updateLabel(status, {
    ready: "Ready to launch",
    won: "Course complete",
    lost: "Flight ended"
  }[mission?.phase] || (running ? "Running" : "Paused"));
  status.parentElement.classList.toggle("running", running);
  const action = {
    ready: "Launch probe",
    lost: "Retry flight",
    won: mission?.stage + 1 < courses.length ? "Next course" : "Play again"
  }[mission?.phase];
  updateLabel(playLabel, action || (running ? "Pause simulation" : "Run simulation"));
  if (mission) updateFlightStatus();
  if (changed) document.dispatchEvent(new CustomEvent("orbitlab:simulation-state", { detail: running }));
  scheduleFrame();
}

function loadPreset() {
  const preset = presets[presetInput.value];
  mission = null;
  gravity = standardGravity * Number(gravityInput.value);
  showFlightControls();
  resetButton.textContent = "Reset";
  updateLabel(fieldHelp, "Drag in the field to aim and launch");
  setRunning(false);
  trailClock = 0;
  launchCount = 0;
  drag = null;
  keyboardPoint = null;
  pulses.length = 0;
  description.textContent = preset.description;
  updateLabel(notice, "");
  bodies = preset.bodies.map((body, index) => makeBody(body, colors[index]));
  updateBodies();
  window.revealAnimatedContent?.(canvas, { distance: 0, opacity: 0.52, duration: 270 });
}

function simulate() {
  trailClock += timestep;
  const saveTrail = trailClock >= 1 / 12;
  if (saveTrail) trailClock -= 1 / 12;
  for (const body of bodies) {
    body.previousX = body.x;
    body.previousY = body.y;
    if (saveTrail) {
      body.trail.push({ x: body.x, y: body.y });
      if (body.trail.length > 108) body.trail.shift();
    }
    advance(body, timestep);
  }
}

function scheduleFrame() {
  if (!frameRequest && !document.hidden) frameRequest = requestAnimationFrame(tick);
}

function tick(time) {
  frameRequest = 0;
  if (document.hidden) return;
  const seconds = !running || previousTime === null ? 0 : Math.min((time - previousTime) / 1000, maxFrameDelta);
  previousTime = running ? time : null;
  accumulator += seconds * speeds[speedInput.value];
  const outcomes = [];
  while (accumulator >= timestep) {
    accumulator -= timestep;
    simulate();
    if (mission) {
      checkFlight();
      continue;
    }
    const before = outcomes.length;
    for (const body of bodies) {
      const distance = Math.hypot(body.x, body.y);
      if (distance <= starRadius + body.radius) {
        outcomes.push(body.name + " collided with Sol.");
        addPulse(body.x, body.y, body.radius + 2, body.color);
        body.finished = true;
      } else if (distance > escapeDistance) {
        outcomes.push(body.name + " left the orbital field.");
        body.finished = true;
      }
    }
    if (outcomes.length > before) bodies = bodies.filter(body => !body.finished);
  }
  if (outcomes.length) {
    updateLabel(notice, outcomes.join(" "));
    updateBodies();
  }
  draw(running ? accumulator / timestep : 1, time);
  if (running && mission?.phase === "flight") {
    const value = Math.max(0, mission.course.limit - mission.elapsed).toFixed(1) + " s";
    if (telemetry.textContent !== value) telemetry.textContent = value;
  }
  if (running || pulses.length) scheduleFrame();
}

function resize() {
  const { width, height } = canvas.getBoundingClientRect();
  if (!width || !height) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(2_000_000 / (width * height)));
  const pixelWidth = Math.max(1, Math.round(width * ratio));
  const pixelHeight = Math.max(1, Math.round(height * ratio));
  if (width === view.width && height === view.height && pixelWidth === canvas.width && pixelHeight === canvas.height) return;
  canvas.width = scenery.width = pixelWidth;
  canvas.height = scenery.height = pixelHeight;
  const scaleX = pixelWidth / width;
  const scaleY = pixelHeight / height;
  context.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  view = { width, height, scale: Math.min(width / 520, height / 420) };
  sceneryContext.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  drawGrid(sceneryContext);
  sceneryContext.translate(width / 2, height / 2);
  sceneryContext.scale(view.scale, view.scale);
  drawStar(sceneryContext);
  scheduleFrame();
}

function circle(x, y, radius, target = context) {
  target.beginPath();
  target.arc(x, y, radius, 0, Math.PI * 2);
}

function drawGrid(context) {
  const { width, height, scale } = view;
  context.strokeStyle = "rgba(172, 195, 185, 0.13)";
  context.lineWidth = 1;
  const unit = 42 * scale;
  context.beginPath();
  for (let x = (width / 2) % unit; x < width; x += unit) {
    context.moveTo(x, 0);
    context.lineTo(x, height);
  }
  for (let y = (height / 2) % unit; y < height; y += unit) {
    context.moveTo(0, y);
    context.lineTo(width, y);
  }
  context.stroke();
}

function drawStar(context) {
  context.lineWidth = 0.8;
  context.strokeStyle = "#697362";
  context.setLineDash([2, 6]);
  for (const radius of [54, 106, 171, 220]) {
    circle(0, 0, radius, context);
    context.stroke();
  }
  context.setLineDash([]);
  context.strokeStyle = "#8f7447";
  circle(0, 0, 27, context);
  context.stroke();
  const light = context.createRadialGradient(-7, -8, 0, 2, 2, 21);
  light.addColorStop(0, "#fff2c7");
  light.addColorStop(0.58, "#e9b870");
  light.addColorStop(1, "#b9783b");
  circle(0, 0, starRadius, context);
  context.fillStyle = light;
  context.fill();
  context.fillStyle = "#e3bf83";
  context.font = "13px Consolas, monospace";
  context.textAlign = "center";
  context.fillText("Sol", 0, 45);
}

function drawBody(body, fraction, showTrail) {
  const x = body.previousX + (body.x - body.previousX) * fraction;
  const y = body.previousY + (body.y - body.previousY) * fraction;
  if (showTrail && body.trail.length > 1) {
    const points = body.trail;
    context.strokeStyle = body.color;
    context.lineWidth = 1.5;
    for (let section = 0; section < 4; section += 1) {
      const first = Math.floor(section * points.length / 4);
      const last = Math.floor((section + 1) * points.length / 4);
      context.globalAlpha = 0.22 + section * 0.17;
      context.beginPath();
      context.moveTo(points[first].x, points[first].y);
      for (let index = first + 1; index <= last && index < points.length; index += 1) {
        context.lineTo(points[index].x, points[index].y);
      }
      if (last === points.length) context.lineTo(x, y);
      context.stroke();
    }
    context.globalAlpha = 1;
  }
  circle(x, y, body.radius + 3);
  context.strokeStyle = body.color;
  context.lineWidth = 0.7;
  context.stroke();
  circle(x, y, body.radius);
  context.fillStyle = body.color;
  context.fill();
}

function startVelocity(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 5) return mission ? mission.aim : orbitalVelocity(start);
  const speed = Math.min(distance * 2.65, 310);
  return { vx: dx / distance * speed, vy: dy / distance * speed };
}

function drawAim(start, velocity) {
  const valid = Math.hypot(start.x, start.y) > starRadius + 7;
  context.strokeStyle = valid ? "#f0dbab" : "#efa090";
  context.lineWidth = 1.2;
  circle(start.x, start.y, 7);
  context.stroke();
  if (!valid) return;

  const predicted = { ...start, ...velocity };
  context.setLineDash([3, 5]);
  context.beginPath();
  context.moveTo(start.x, start.y);
  const samples = mission ? 360 : 110;
  for (let index = 0; index < samples; index += 1) {
    advance(predicted, 1 / 60);
    if (Math.hypot(predicted.x, predicted.y) < starRadius + 5) break;
    context.lineTo(predicted.x, predicted.y);
  }
  context.stroke();
  context.setLineDash([]);
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(start.x + velocity.vx / 3, start.y + velocity.vy / 3);
  context.stroke();
}

function drawCourse() {
  context.save();
  const { course, reached, gates, phase } = mission;
  context.font = "600 15px Consolas, monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  gates.forEach(({ x, y }, index) => {
    const collected = index < reached;
    const active = index === reached;
    circle(x, y, course.gateRadius);
    context.fillStyle = "#192520";
    context.fill();
    context.lineWidth = active ? 2 : 1;
    context.strokeStyle = active ? "#f2c878" : collected ? "#9fcead" : "#9ba99d";
    if (!active && !collected) context.setLineDash([3, 3]);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = context.strokeStyle;
    context.fillText(collected ? "✓" : String(index + 1), x, y + 1);
  });
  if (phase === "ready") {
    const { x, y } = course.pad;
    circle(x, y, padRadius);
    context.fillStyle = "#1e3029";
    context.fill();
    context.strokeStyle = "#a6e6ce";
    context.lineWidth = 1;
    context.stroke();
    context.fillStyle = "#c2ead8";
    context.fillText("Launch pad", x, y + padRadius + 14);
  }
  context.restore();
}

function draw(fraction, time) {
  if (!view.width) return;
  context.clearRect(0, 0, view.width, view.height);
  context.save();
  context.translate(view.width / 2, view.height / 2);
  context.scale(view.scale, view.scale);
  if (mission) drawCourse();
  const showTrail = trailsInput.checked;
  for (const body of bodies) drawBody(body, fraction, showTrail);
  if (drag) drawAim(drag.start, startVelocity(drag.start, drag.end));
  else if (mission?.phase === "ready") drawAim(mission.course.pad, mission.aim);
  else if (!mission && keyboardActive && keyboardPoint) drawAim(keyboardPoint, orbitalVelocity(keyboardPoint));
  for (let index = pulses.length - 1; index >= 0; index -= 1) {
    const pulse = pulses[index];
    const progress = Math.max(0, (time - pulse.started) / 390);
    if (progress >= 1) {
      pulses.splice(index, 1);
      continue;
    }
    context.strokeStyle = pulse.color;
    context.globalAlpha = 0.76 * (1 - progress) ** 2;
    context.lineWidth = 2 - progress;
    circle(pulse.x, pulse.y, pulse.radius + 24 * (1 - (1 - progress) ** 3));
    context.stroke();
  }
  context.restore();
}

function pointFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left - view.width / 2) / view.scale,
    y: (event.clientY - rect.top - view.height / 2) / view.scale
  };
}

function launch(start, end) {
  if (Math.hypot(start.x, start.y) <= starRadius + 7) {
    updateLabel(notice, "Choose a launch point farther from Sol.");
    return;
  }
  if (bodies.length >= bodyLimit) {
    updateLabel(notice, "The field holds 12 planets. Reset or wait for a planet to leave.");
    return;
  }
  launchCount += 1;
  const name = "Planet " + launchCount;
  const color = colors[(launchCount + 1) % colors.length];
  bodies.push(makeBody({ ...start, ...startVelocity(start, end), name }, color));
  updateBodies();
  addPulse(start.x, start.y, 7, color);
  updateLabel(notice, name + " launched.");
  if (!running) setRunning(true);
}

canvas.addEventListener("pointerdown", event => {
  if (drag || event.button !== 0) return;
  canvas.focus({ preventScroll: true });
  keyboardActive = false;
  const point = pointFromEvent(event);
  if (mission) {
    if (mission.phase !== "ready") return;
    const pad = mission.course.pad;
    if (Math.hypot(point.x - pad.x, point.y - pad.y) > padRadius) {
      updateLabel(notice, "Start your drag inside the green launch pad.");
      return;
    }
    canvas.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, start: pad, end: pad, pointerStart: point };
    scheduleFrame();
    return;
  }
  canvas.setPointerCapture(event.pointerId);
  drag = { id: event.pointerId, start: point, end: point };
  scheduleFrame();
});
canvas.addEventListener("pointermove", event => {
  if (drag?.id !== event.pointerId) return;
  drag.end = dragEnd(event);
  if (mission) updateFlightStatus();
  scheduleFrame();
});

function dragEnd(event) {
  const point = pointFromEvent(event);
  const origin = drag.pointerStart || drag.start;
  return { x: drag.start.x + point.x - origin.x, y: drag.start.y + point.y - origin.y };
}

canvas.addEventListener("pointerup", event => {
  if (drag?.id !== event.pointerId) return;
  const start = drag.start;
  const end = dragEnd(event);
  drag = null;
  if (mission) launchProbe(startVelocity(start, end));
  else launch(start, end);
  scheduleFrame();
});
for (const eventName of ["pointercancel", "lostpointercapture"]) {
  canvas.addEventListener(eventName, event => {
    if (drag?.id !== event.pointerId) return;
    drag = null;
    if (mission) updateFlightStatus();
    scheduleFrame();
  });
}

canvas.addEventListener("keydown", event => {
  if (event.code === "Space") {
    event.preventDefault();
    if (!event.repeat && (!mission || mission.phase === "flight")) setRunning(!running);
    return;
  }
  const movement = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] };
  if (!Object.hasOwn(movement, event.key) && event.key !== "Enter") return;
  event.preventDefault();
  if (mission) {
    if (event.key === "Enter") {
      if (!event.repeat) primaryAction();
    } else if (mission.phase === "ready") {
      const [dx, dy] = movement[event.key];
      const { vx, vy } = mission.aim;
      const angle = Math.atan2(vy, vx) + dx * 0.005;
      const speed = Math.max(4, Math.min(310, Math.hypot(vx, vy) - dy / 3));
      mission.aim = { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
      updateFlightStatus();
      scheduleFrame();
    }
    return;
  }
  keyboardActive = true;
  keyboardPoint ??= { x: 80, y: -60 };
  if (event.key === "Enter") {
    if (!event.repeat) launch(keyboardPoint, keyboardPoint);
  } else {
    const [dx, dy] = movement[event.key];
    const xLimit = view.width / view.scale / 2 - 12;
    const yLimit = view.height / view.scale / 2 - 12;
    keyboardPoint.x = Math.max(-xLimit, Math.min(xLimit, keyboardPoint.x + dx));
    keyboardPoint.y = Math.max(-yLimit, Math.min(yLimit, keyboardPoint.y + dy));
  }
  scheduleFrame();
});
canvas.addEventListener("blur", () => {
  keyboardActive = false;
  scheduleFrame();
});
presetInput.addEventListener("change", loadPreset);
gravityInput.addEventListener("change", () => {
  gravity = standardGravity * Number(gravityInput.value);
  updateLabel(notice, "Star gravity changed to " + gravityInput.value + "×.");
  scheduleFrame();
});
sandboxMode.addEventListener("click", () => { if (mission) loadPreset(); });
missionMode.addEventListener("click", () => { if (!mission) loadCourse(); });
courseInput.addEventListener("change", () => loadCourse());
resetButton.addEventListener("click", () => { if (mission) loadCourse(); else loadPreset(); });
playButton.addEventListener("click", primaryAction);

function primaryAction() {
  if (!mission || mission.phase === "flight") setRunning(!running);
  else if (mission.phase === "ready") launchProbe(mission.aim);
  else if (mission.phase === "lost") loadCourse({ retry: true });
  else {
    courseInput.value = String((mission.stage + 1) % courses.length);
    loadCourse();
  }
}
trailsInput.addEventListener("change", scheduleFrame);
speedInput.addEventListener("input", () => {
  const speed = speeds[speedInput.value];
  speedValue.value = speed + "×";
  speedInput.setAttribute("aria-valuetext", speed + " times normal speed");
});
loadPreset();
new ResizeObserver(resize).observe(canvas);
window.addEventListener("resize", resize, { passive: true });
document.addEventListener("visibilitychange", () => {
  previousTime = null;
  if (document.hidden) {
    cancelAnimationFrame(frameRequest);
    frameRequest = 0;
    return;
  }
  scheduleFrame();
});
reducedMotion.addEventListener("change", () => {
  if (!reducedMotion.matches) return;
  pulses.length = 0;
  scheduleFrame();
});
