// Galaxy shaders from the supplied React Bits component.
// This wrapper uses its transparent variant as the website backdrop.
(() => {
  "use strict";

  const MAX_LAYERS = 8;
  const MAX_COLORS = 4;
  const VERTEX = `#version 300 es
  in vec2 aPosition;
  void main() {
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }`;

  const FRAGMENT = `#version 300 es
  precision highp float;
  precision highp int;
  uniform float uTime;
  uniform vec2 uResolution;
  uniform vec2 uFocal;
  uniform vec2 uRotation;
  uniform float uGloss;
  uniform float uDepth;
  uniform float uDensity;
  uniform float uHueShift;
  uniform float uSpeed;
  uniform vec2 uMouse;
  uniform float uStarGlow;
  uniform float uFlareGain;
  uniform float uSquash;
  uniform float uSaturation;
  uniform float uMouseRepulsion;
  uniform float uTwinkleIntensity;
  uniform float uRotationAngle;
  uniform float uRepulsionStrength;
  uniform float uMouseActiveFactor;
  uniform float uAutoCenterRepulsion;
  uniform int uLayers;
  uniform vec3 uColors[${MAX_COLORS}];
  uniform int uColorCount;
  uniform float uWarp;
  uniform float uReveal;
  uniform float uMode;
  uniform vec3 uBackground;
  uniform float uOpacity;
  out vec4 outColor;

  #define STAR_COLOR_CUTOFF 0.2
  #define MAT45 mat2(0.7071, -0.7071, 0.7071, 0.7071)
  #define PERIOD 3.0

  float Hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float tri(float x) {
    return abs(fract(x) * 2.0 - 1.0);
  }

  float tris(float x) {
    float t = fract(x);
    return 1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0));
  }

  float trisn(float x) {
    float t = fract(x);
    return 2.0 * (1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0))) - 1.0;
  }

  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  float Star(vec2 uv, float flare, vec2 radial, float invReach) {
  #ifdef WARP
    float along = dot(uv, radial);
    float d = sqrt(max(dot(uv, uv) - uSquash * along * along, 0.0));
  #else
    float d = length(uv);
  #endif
    float m = uStarGlow / d;
    float rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
    m += rays * flare * uFlareGain;
    uv *= MAT45;
    rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
    m += rays * 0.3 * flare * uFlareGain;
    m *= smoothstep(1.0, 0.2, d * invReach);
  #ifdef WARP
    m *= mix(1.0, smoothstep(1.0, 0.55, length(uv) * invReach), min(uWarp * 4.0, 1.0));
  #endif
    return m;
  }

  vec3 StarLayer(vec2 uv, vec2 radial, vec2 repelAt, float pushCells, float spread) {
    vec3 col = vec3(0.0);
    vec2 gv = fract(uv) - 0.5;
    vec2 id = floor(uv);
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 offset = vec2(float(x), float(y));
        vec2 si = id + offset;
        float seed = Hash21(si);
        float size = fract(seed * 345.32);
        float glossLocal = tri(uGloss / (PERIOD * seed + 1.0));
        float flareSize = smoothstep(0.9, 1.0, size) * glossLocal;

  #ifdef PALETTE
        float pick = Hash21(si + 7.0) * float(uColorCount);
        vec3 base = uColors[int(min(floor(pick), float(uColorCount - 1)))];
  #else
        float red = smoothstep(STAR_COLOR_CUTOFF, 1.0, Hash21(si + 1.0)) + STAR_COLOR_CUTOFF;
        float blu = smoothstep(STAR_COLOR_CUTOFF, 1.0, Hash21(si + 3.0)) + STAR_COLOR_CUTOFF;
        float grn = min(red, blu) * seed;
        vec3 base = vec3(red, grn, blu);
        float hue = atan(base.g - base.r, base.b - base.r) / (2.0 * 3.14159) + 0.5;
        hue = fract(hue + uHueShift / 360.0);
        float sat = length(base - vec3(dot(base, vec3(0.299, 0.587, 0.114)))) * uSaturation;
        float val = max(max(base.r, base.g), base.b);
        base = hsv2rgb(vec3(hue, sat, val));
  #endif

        vec2 pad = vec2(tris(seed * 34.0 + uTime * uSpeed / 10.0), tris(seed * 38.0 + uTime * uSpeed / 30.0)) - 0.5;
        vec2 shift = vec2(0.0);
        float invReach = 1.0;
  #ifdef REPEL
        vec2 away = si + 0.5 + pad - repelAt;
        float dist = length(away);
        float q = dist * spread;
        float cells = pushCells * exp(-q * q);
        float moved = cells * inversesqrt(1.0 + cells * cells * 2.78);
        shift = away * (moved / max(dist, 0.0001));
        invReach = 1.0 / (1.0 - moved);
  #endif
        float star = Star(gv - offset - pad - shift, flareSize, radial, invReach);
        float twinkle = trisn(uTime * uSpeed + seed * 6.2831) * 0.5 + 1.0;
        twinkle = mix(1.0, twinkle, uTwinkleIntensity);
        col += star * twinkle * size * base;
      }
    }
    return col;
  }

  void main() {
    vec2 focalPx = uFocal * uResolution;
    vec2 uv = (gl_FragCoord.xy - focalPx) / uResolution.y;
    vec2 mouseNorm = uMouse - vec2(0.5);

    vec2 repelAt = vec2(0.0);
    float strength = 0.0;
    float push = 0.0;
    if (uAutoCenterRepulsion > 0.0) {
      strength = uAutoCenterRepulsion;
      push = strength * 0.05;
    } else if (uMouseRepulsion > 0.5) {
      repelAt = (uMouse * uResolution - focalPx) / uResolution.y;
      strength = max(uRepulsionStrength, 0.0);
      push = strength * 0.05 * uMouseActiveFactor;
    } else {
      uv += mouseNorm * 0.1 * uMouseActiveFactor;
    }
    float radius = 0.16 + 0.04 * strength;

    vec2 radial = length(uv) > 0.0001 ? normalize(uv) : vec2(1.0, 0.0);
    float angle = uRotationAngle;
    uv = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * uv;
    uv = mat2(uRotation.x, -uRotation.y, uRotation.y, uRotation.x) * uv;
    radial = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * radial;
    radial = mat2(uRotation.x, -uRotation.y, uRotation.y, uRotation.x) * radial;
    repelAt = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * repelAt;
    repelAt = mat2(uRotation.x, -uRotation.y, uRotation.y, uRotation.x) * repelAt;

    vec3 col = vec3(0.0);
    float layers = float(uLayers);
    for (int k = 0; k < ${MAX_LAYERS}; k++) {
      if (k >= uLayers) break;
      float i = float(k) / layers;
      float depth = fract(i + uDepth);
      float scale = mix(20.0 * uDensity, 0.5 * uDensity, depth);
      float fade = depth * smoothstep(1.0, 0.9, depth);
      vec2 offset = vec2(i * 453.32);
      col += StarLayer(uv * scale + offset, radial, repelAt * scale + offset, push * scale, 1.0 / (scale * radius)) * fade;
    }
    col *= uReveal;

    if (uMode > 1.5) {
      vec3 lit = col * smoothstep(0.0, 0.3, length(col));
      float energy = max(max(lit.r, lit.g), lit.b);
      vec3 tint = lit / max(energy, 0.0001);
      vec3 ink = tint * (0.16 / max(dot(tint, vec3(0.2126, 0.7152, 0.0722)), 0.16));
      float coverage = pow(min(energy * 1.3, 1.0), 1.3) * 0.92 * uOpacity;
      outColor = uMode > 2.5 ? vec4(ink * coverage, coverage) : vec4(mix(uBackground, ink, coverage), 1.0);
    } else if (uMode > 0.5) {
      float alpha = min(smoothstep(0.0, 0.3, length(col)), 1.0) * uOpacity;
      outColor = vec4(col * alpha, alpha);
    } else {
      outColor = vec4(mix(uBackground, col, uOpacity), 1.0);
    }
  }`;

  const start = (gl, palette, repel, warp) => {
    const defines = `${palette ? '#define PALETTE\n' : ''}${repel ? '#define REPEL\n' : ''}${warp ? '#define WARP\n' : ''}`;
    const program = gl.createProgram();
    const vertex = gl.createShader(gl.VERTEX_SHADER);
    const fragment = gl.createShader(gl.FRAGMENT_SHADER);
    if (!program || !vertex || !fragment) return null;
    gl.shaderSource(vertex, VERTEX);
    gl.shaderSource(fragment, FRAGMENT.replace('\n', `\n${defines}`));
    gl.compileShader(vertex);
    gl.compileShader(fragment);
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.bindAttribLocation(program, 0, 'aPosition');
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    return program;
  };

  const finish = (gl, program) => {
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
    const uniforms = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i);
      if (info) uniforms[info.name.replace('[0]', '')] = gl.getUniformLocation(program, info.name);
    }
    return { program, uniforms };
  };

  const canvas = document.querySelector("#galaxy-background");
  const backdrop = canvas.parentElement;
  const toggle = document.querySelector("#galaxy-toggle");
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let frameInterval = 1000 / 30;
  let draw = null;
  let elapsed = 0;
  let frame = 0;
  let last = null;
  let deadline = null;

  function createRenderer() {
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false
    });
    if (!gl) return null;

    // The ambient backdrop uses one shader variant and receives no game input.
    const program = start(gl, true, false, false);
    if (!program) return null;
    const linked = finish(gl, program);
    if (!linked) {
      gl.deleteProgram(program);
      return null;
    }
    const u = linked.uniforms;
    const geometry = gl.createVertexArray();
    const buffer = gl.createBuffer();
    gl.bindVertexArray(geometry);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.useProgram(program);
    gl.uniform2f(u.uFocal, 0.74, 0.65);
    gl.uniform2f(u.uRotation, 1, 0);
    gl.uniform1f(u.uDensity, 1.5);
    gl.uniform1f(u.uSpeed, 0.46);
    gl.uniform1f(u.uStarGlow, 0.012);
    gl.uniform1f(u.uFlareGain, 0.16);
    gl.uniform1f(u.uTwinkleIntensity, 0.24);
    gl.uniform1i(u.uLayers, 3);
    gl.uniform3fv(u.uColors, new Float32Array([1, 1, 1]));
    gl.uniform1i(u.uColorCount, 1);
    gl.uniform1f(u.uReveal, 1);
    gl.uniform1f(u.uMode, 1);
    gl.uniform1f(u.uOpacity, 0.72);

    return time => {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(u.uResolution, canvas.width, canvas.height);
      gl.uniform1f(u.uTime, time);
      gl.uniform1f(u.uGloss, 1 + time * 0.03);
      gl.uniform1f(u.uDepth, 0.12 + time * 0.011);
      gl.uniform1f(u.uRotationAngle, time * 0.004);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
  }

  function tick(time) {
    if (deadline === null || time + 0.8 >= deadline) {
      if (last !== null) elapsed += Math.min((time - last) / 1000, 0.1);
      last = time;
      deadline = deadline === null || time - deadline > frameInterval ? time + frameInterval : deadline + frameInterval;
      draw(elapsed);
    }
    frame = requestAnimationFrame(tick);
  }

  function sync() {
    backdrop.hidden = !toggle.checked;
    cancelAnimationFrame(frame);
    last = deadline = null;
    if (!draw || !toggle.checked || document.hidden) return;
    draw(elapsed);
    if (!motion.matches) frame = requestAnimationFrame(tick);
  }

  function resize() {
    if (draw) {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const scale = Math.min(1, Math.sqrt(480_000 / Math.max(1, width * height)));
      const pixelWidth = Math.max(1, Math.round(width * scale));
      const pixelHeight = Math.max(1, Math.round(height * scale));
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    }
    sync();
  }

  function initialize() {
    draw = createRenderer();
    backdrop.classList.toggle("galaxy-ready", Boolean(draw));
    resize();
  }

  canvas.addEventListener("webglcontextlost", event => {
    event.preventDefault();
    draw = null;
    backdrop.classList.remove("galaxy-ready");
    sync();
  });
  canvas.addEventListener("webglcontextrestored", initialize);
  document.addEventListener("visibilitychange", sync);
  document.addEventListener("orbitlab:simulation-state", event => {
    // Leave more of the frame budget for the orbital field during flight.
    frameInterval = 1000 / (event.detail ? 12 : 30);
    deadline = null;
  });
  window.addEventListener("resize", resize);
  toggle.addEventListener("change", sync);
  motion.addEventListener("change", sync);
  initialize();
})();
