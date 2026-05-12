const drawCanvas = document.getElementById("drawCanvas");
const fourierCanvas = document.getElementById("fourierCanvas");
const drawCtx = drawCanvas.getContext("2d");
const fourierCtx = fourierCanvas.getContext("2d");

const componentCountInput = document.getElementById("componentCount");
const componentCountValue = document.getElementById("componentCountValue");
const clearBtn = document.getElementById("clearBtn");
const sampleBtn = document.getElementById("sampleBtn");
const playBtn = document.getElementById("playBtn");
const statusEl = document.getElementById("status");
const audioPlayer = document.getElementById("audioPlayer");

const VIEW_SIZE = drawCanvas.width;
const SAMPLE_COUNT = 512;
const LOOP_DURATION_SECONDS = 8;
const TARGET_AUDIO_PEAK = 0.82;
const AUDIO_SAMPLE_RATE = 48000;
const AUDIO_MIN_FREQUENCY = 90;
const AUDIO_MAX_FREQUENCY = 1800;

let rawPoints = [];
let normalizedPoints = [];
let coefficients = [];
let trace = [];
let drawing = false;
let currentAudioUrl = null;
let animationFrame = null;
let phase = 0;
let lastFrameAt = 0;
let isPlaying = false;

const examplePoints = (() => {
  const pts = [];
  const total = 420;
  for (let i = 0; i < total; i += 1) {
    const t = i / total;
    const angle = Math.PI * 2 * t;
    const r = 0.24 + 0.1 * Math.sin(5 * angle) + 0.05 * Math.sin(2 * angle);
    const x = 0.5 + r * Math.cos(angle);
    const y = 0.5 + r * Math.sin(angle) - 0.06 * Math.sin(3 * angle);
    pts.push({ x: x * VIEW_SIZE, y: y * VIEW_SIZE });
  }
  return pts;
})();

function setStatus(message) {
  statusEl.textContent = message;
}

function updateReadouts() {
  componentCountValue.value = componentCountInput.value;
}

function clearCanvas(ctx, canvas) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawGridCross(ctx, canvas) {
  ctx.save();
  ctx.strokeStyle = "rgba(127, 127, 127, 0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, 0);
  ctx.lineTo(canvas.width / 2, canvas.height);
  ctx.moveTo(0, canvas.height / 2);
  ctx.lineTo(canvas.width, canvas.height / 2);
  ctx.stroke();
  ctx.restore();
}

function drawInputPath() {
  clearCanvas(drawCtx, drawCanvas);
  drawGridCross(drawCtx, drawCanvas);
  if (rawPoints.length < 2) {
    return;
  }

  drawCtx.save();
  drawCtx.strokeStyle = "#0b57d0";
  drawCtx.lineWidth = 2;
  drawCtx.lineJoin = "round";
  drawCtx.lineCap = "round";
  drawCtx.beginPath();
  drawCtx.moveTo(rawPoints[0].x, rawPoints[0].y);
  for (let i = 1; i < rawPoints.length; i += 1) {
    drawCtx.lineTo(rawPoints[i].x, rawPoints[i].y);
  }
  drawCtx.stroke();
  drawCtx.restore();
}

function complex(re, im) {
  return { re, im };
}

function complexAdd(a, b) {
  return complex(a.re + b.re, a.im + b.im);
}

function complexMul(a, b) {
  return complex(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
}

function complexScale(a, scalar) {
  return complex(a.re * scalar, a.im * scalar);
}

function complexExp(theta) {
  return complex(Math.cos(theta), Math.sin(theta));
}

function normalizePath(points) {
  if (points.length < 2) {
    return [];
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const scale = 0.82 / span;

  return points.map((point) => complex((point.x - cx) * scale, (point.y - cy) * scale));
}

function distance(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.hypot(dx, dy);
}

function resamplePoints(points, count) {
  if (points.length < 2) {
    return [];
  }

  const closed = [...points, points[0]];
  const lengths = [0];
  let total = 0;
  for (let i = 1; i < closed.length; i += 1) {
    total += distance(closed[i - 1], closed[i]);
    lengths.push(total);
  }

  if (!total) {
    return Array.from({ length: count }, () => ({ ...points[0] }));
  }

  const step = total / count;
  const sampled = [];
  let seg = 1;

  for (let i = 0; i < count; i += 1) {
    const target = i * step;
    while (seg < lengths.length - 1 && lengths[seg] < target) {
      seg += 1;
    }
    const start = closed[seg - 1];
    const end = closed[seg];
    const segStart = lengths[seg - 1];
    const segLength = lengths[seg] - segStart || 1;
    const alpha = (target - segStart) / segLength;
    sampled.push({
      x: start.x + (end.x - start.x) * alpha,
      y: start.y + (end.y - start.y) * alpha,
    });
  }

  return sampled;
}

function computeFourier(points) {
  const samples = points.length;
  const coeffs = [];

  for (let k = -Math.floor(samples / 2); k < Math.ceil(samples / 2); k += 1) {
    let sum = complex(0, 0);
    for (let n = 0; n < samples; n += 1) {
      const angle = (-2 * Math.PI * k * n) / samples;
      sum = complexAdd(sum, complexMul(points[n], complexExp(angle)));
    }
    const coef = complexScale(sum, 1 / samples);
    coeffs.push({
      freq: k,
      amp: Math.hypot(coef.re, coef.im),
      phase: Math.atan2(coef.im, coef.re),
      coef,
    });
  }

  coeffs.sort((a, b) => b.amp - a.amp);
  return coeffs;
}

function evaluateFourier(t, coeffs) {
  let sum = complex(0, 0);
  for (const { freq, coef } of coeffs) {
    const angle = 2 * Math.PI * freq * t;
    sum = complexAdd(sum, complexMul(coef, complexExp(angle)));
  }
  return sum;
}

function drawFourierFrame(now) {
  if (!coefficients.length) {
    clearCanvas(fourierCtx, fourierCanvas);
    drawGridCross(fourierCtx, fourierCanvas);
    return;
  }

  if (!lastFrameAt) {
    lastFrameAt = now;
  }

  const dt = Math.min(0.05, (now - lastFrameAt) / 1000);
  lastFrameAt = now;
  phase = (phase + dt / LOOP_DURATION_SECONDS) % 1;

  clearCanvas(fourierCtx, fourierCanvas);
  drawGridCross(fourierCtx, fourierCanvas);

  const selected = coefficients.slice(0, Number(componentCountInput.value));
  let current = complex(0, 0);

  fourierCtx.save();
  for (const component of selected) {
    const prev = current;
    const angle = 2 * Math.PI * component.freq * phase;
    current = complexAdd(current, complexMul(component.coef, complexExp(angle)));

    const cx = VIEW_SIZE / 2 + prev.re * VIEW_SIZE;
    const cy = VIEW_SIZE / 2 + prev.im * VIEW_SIZE;
    const nx = VIEW_SIZE / 2 + current.re * VIEW_SIZE;
    const ny = VIEW_SIZE / 2 + current.im * VIEW_SIZE;
    const radius = component.amp * VIEW_SIZE;

    fourierCtx.strokeStyle = "rgba(138, 180, 248, 0.35)";
    fourierCtx.lineWidth = 1;
    fourierCtx.beginPath();
    fourierCtx.arc(cx, cy, radius, 0, Math.PI * 2);
    fourierCtx.stroke();

    fourierCtx.strokeStyle = "rgba(244, 244, 245, 0.75)";
    fourierCtx.beginPath();
    fourierCtx.moveTo(cx, cy);
    fourierCtx.lineTo(nx, ny);
    fourierCtx.stroke();
  }
  fourierCtx.restore();

  trace.push(current);
  if (trace.length > SAMPLE_COUNT) {
    trace.shift();
  }

  fourierCtx.save();
  fourierCtx.strokeStyle = "#5eead4";
  fourierCtx.lineWidth = 2;
  fourierCtx.beginPath();
  for (let i = 0; i < trace.length; i += 1) {
    const px = VIEW_SIZE / 2 + trace[i].re * VIEW_SIZE;
    const py = VIEW_SIZE / 2 + trace[i].im * VIEW_SIZE;
    if (i === 0) {
      fourierCtx.moveTo(px, py);
    } else {
      fourierCtx.lineTo(px, py);
    }
  }
  fourierCtx.stroke();

  const headX = VIEW_SIZE / 2 + current.re * VIEW_SIZE;
  const headY = VIEW_SIZE / 2 + current.im * VIEW_SIZE;
  fourierCtx.fillStyle = "#22c55e";
  fourierCtx.beginPath();
  fourierCtx.arc(headX, headY, 4, 0, Math.PI * 2);
  fourierCtx.fill();
  fourierCtx.restore();

  animationFrame = requestAnimationFrame(drawFourierFrame);
}

function restartAnimation() {
  trace = [];
  phase = 0;
  lastFrameAt = 0;
  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
  }
  animationFrame = requestAnimationFrame(drawFourierFrame);
}

function wrapUnit(t) {
  return t - Math.floor(t);
}

function softClip(sample) {
  return Math.tanh(sample * 1.35);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function stopAudio() {
  audioPlayer.pause();
  audioPlayer.currentTime = 0;
  if (currentAudioUrl) {
    URL.revokeObjectURL(currentAudioUrl);
    currentAudioUrl = null;
    audioPlayer.removeAttribute("src");
    audioPlayer.load();
  }
  isPlaying = false;
  playBtn.textContent = "Play Audio";
}

function buildAudioFrames() {
  const frameCount = Math.floor(AUDIO_SAMPLE_RATE * LOOP_DURATION_SECONDS);
  const channelData = [new Float32Array(frameCount), new Float32Array(frameCount)];
  const selected = coefficients
    .slice(0, Number(componentCountInput.value))
    .filter((component) => component.freq !== 0);

  if (!selected.length) {
    return channelData;
  }

  const maxAmp = selected.reduce((acc, component) => Math.max(acc, component.amp), 1e-6);
  const maxFreq = selected.reduce((acc, component) => Math.max(acc, Math.abs(component.freq)), 1);
  let leftMean = 0;
  let rightMean = 0;

  for (let i = 0; i < frameCount; i += 1) {
    const t = i / AUDIO_SAMPLE_RATE;
    let left = 0;
    let right = 0;

    for (const component of selected) {
      const freqRatio = Math.abs(component.freq) / maxFreq;
      const audibleFrequency =
        AUDIO_MIN_FREQUENCY + freqRatio * (AUDIO_MAX_FREQUENCY - AUDIO_MIN_FREQUENCY);
      const amplitude = Math.pow(component.amp / maxAmp, 0.82);
      const pan = clamp(component.freq / maxFreq, -0.92, 0.92);
      const leftGain = Math.sqrt((1 - pan) * 0.5);
      const rightGain = Math.sqrt((1 + pan) * 0.5);
      const sample = amplitude * Math.sin(2 * Math.PI * audibleFrequency * t + component.phase);

      left += sample * leftGain;
      right += sample * rightGain;
    }

    channelData[0][i] = left;
    channelData[1][i] = right;
    leftMean += left;
    rightMean += right;
  }

  leftMean /= frameCount;
  rightMean /= frameCount;

  let peak = 1e-6;
  for (let i = 0; i < frameCount; i += 1) {
    channelData[0][i] = softClip(channelData[0][i] - leftMean);
    channelData[1][i] = softClip(channelData[1][i] - rightMean);
    peak = Math.max(peak, Math.abs(channelData[0][i]), Math.abs(channelData[1][i]));
  }

  const gain = TARGET_AUDIO_PEAK / peak;
  for (let i = 0; i < frameCount; i += 1) {
    channelData[0][i] *= gain;
    channelData[1][i] *= gain;
  }
  return channelData;
}

function encodeWav(channelData, sampleRate) {
  const numChannels = channelData.length;
  const numFrames = channelData[0].length;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numFrames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeString(offset, value) {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numFrames; i += 1) {
    for (let channel = 0; channel < numChannels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][i]));
      const pcm = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, pcm, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function buildAudioBlob() {
  return encodeWav(buildAudioFrames(), AUDIO_SAMPLE_RATE);
}

async function toggleAudio() {
  if (!coefficients.length) {
    setStatus("Draw a curve first.");
    return;
  }

  if (isPlaying) {
    stopAudio();
    setStatus("Audio stopped.");
    return;
  }

  try {
    stopAudio();
    currentAudioUrl = URL.createObjectURL(buildAudioBlob());
    audioPlayer.src = currentAudioUrl;
    audioPlayer.loop = true;
    audioPlayer.onended = () => {
      isPlaying = false;
      playBtn.textContent = "Play Audio";
    };
    await audioPlayer.play();
    isPlaying = true;
    playBtn.textContent = "Stop Audio";
    setStatus("Playing stereo Fourier loop.");
  } catch (error) {
    console.error(error);
    setStatus(`Audio error: ${error.message}`);
  }
}

async function refreshAudioPlayback() {
  if (!isPlaying) {
    return;
  }
  stopAudio();
  await toggleAudio();
}

function rebuild() {
  if (rawPoints.length < 2) {
    setStatus("Draw a path or load an SVG first.");
    return;
  }
  normalizedPoints = normalizePath(resamplePoints(rawPoints, SAMPLE_COUNT));
  coefficients = computeFourier(normalizedPoints);
  restartAnimation();
  setStatus(`Built ${coefficients.length} Fourier components from ${rawPoints.length} input points.`);
}

function usePoints(points, message) {
  rawPoints = resamplePoints(points, SAMPLE_COUNT);
  drawInputPath();
  rebuild();
  setStatus(message);
}

function getCanvasPoint(event) {
  const rect = drawCanvas.getBoundingClientRect();
  const source = event.touches ? event.touches[0] : event;
  const scaleX = drawCanvas.width / rect.width;
  const scaleY = drawCanvas.height / rect.height;
  return {
    x: (source.clientX - rect.left) * scaleX,
    y: (source.clientY - rect.top) * scaleY,
  };
}

function beginDrawing(event) {
  drawing = true;
  rawPoints = [getCanvasPoint(event)];
  stopAudio();
  drawInputPath();
  setStatus("Drawing...");
}

function continueDrawing(event) {
  if (!drawing) {
    return;
  }
  rawPoints.push(getCanvasPoint(event));
  drawInputPath();
}

function finishDrawing() {
  if (!drawing) {
    return;
  }
  drawing = false;
  if (rawPoints.length > 1) {
    rebuild();
  } else {
    setStatus("Path too short. Draw a longer stroke.");
  }
}

function sampleSvgPath(pathEl, count) {
  const length = pathEl.getTotalLength();
  const points = [];
  for (let i = 0; i < count; i += 1) {
    const point = pathEl.getPointAtLength((i / count) * length);
    points.push({ x: point.x, y: point.y });
  }
  return points;
}

function clearAll() {
  stopAudio();
  rawPoints = [];
  normalizedPoints = [];
  coefficients = [];
  trace = [];
  clearCanvas(drawCtx, drawCanvas);
  clearCanvas(fourierCtx, fourierCanvas);
  drawGridCross(drawCtx, drawCanvas);
  drawGridCross(fourierCtx, fourierCanvas);
  setStatus("Cleared.");
}

drawCanvas.addEventListener("pointerdown", (event) => {
  drawCanvas.setPointerCapture(event.pointerId);
  beginDrawing(event);
});
drawCanvas.addEventListener("pointermove", continueDrawing);
drawCanvas.addEventListener("pointerup", finishDrawing);
drawCanvas.addEventListener("pointerleave", finishDrawing);

componentCountInput.addEventListener("input", () => {
  updateReadouts();
  if (coefficients.length) {
    restartAnimation();
    refreshAudioPlayback();
  }
});

clearBtn.addEventListener("click", clearAll);
sampleBtn.addEventListener("click", () => usePoints(examplePoints, "Loaded built-in example curve."));
playBtn.addEventListener("click", () => {
  toggleAudio();
});

updateReadouts();
clearAll();
usePoints(examplePoints, "Loaded built-in example curve.");
