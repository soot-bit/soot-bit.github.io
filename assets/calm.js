const canvas = document.getElementById("calmCanvas");
const ctx = canvas.getContext("2d");
const resetBtn = document.getElementById("resetBtn");
const randomizeBtn = document.getElementById("randomizeBtn");
const introMessage = document.getElementById("introMessage");

const DPR = Math.min(window.devicePixelRatio || 1, 2);
const BASE_PARTICLES = 110;
const MAX_PARTICLES = 260;
const LINK_DISTANCE = 132;
const POINTER_RADIUS = 150;

let width = 0;
let height = 0;
let particles = [];
let animationFrame = null;
let pointer = { x: 0, y: 0, active: false };
let palette = null;

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function choosePalette() {
  const palettes = [
    { particle: "130, 170, 255", link: "120, 150, 255", glow: "16, 32, 61" },
    { particle: "128, 211, 190", link: "94, 234, 212", glow: "10, 45, 51" },
    { particle: "244, 208, 126", link: "253, 230, 138", glow: "48, 34, 13" },
  ];
  return palettes[Math.floor(Math.random() * palettes.length)];
}

function resize() {
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.floor(width * DPR);
  canvas.height = Math.floor(height * DPR);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}

function makeParticle(x = randomBetween(0, width), y = randomBetween(0, height)) {
  const angle = randomBetween(0, Math.PI * 2);
  const speed = randomBetween(0.08, 0.34);
  return {
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    size: randomBetween(1.2, 3.2),
    alpha: randomBetween(0.28, 0.82),
  };
}

function seedParticles(count = BASE_PARTICLES) {
  particles = Array.from({ length: count }, () => makeParticle());
}

function resetScene() {
  palette = choosePalette();
  seedParticles();
}

function randomizeScene() {
  palette = choosePalette();
  const nextCount = Math.floor(randomBetween(80, 170));
  seedParticles(nextCount);
}

function addBurst(x, y, count = 12) {
  const room = MAX_PARTICLES - particles.length;
  const burst = Math.min(count, room);
  for (let i = 0; i < burst; i += 1) {
    particles.push(
      makeParticle(
        x + randomBetween(-24, 24),
        y + randomBetween(-24, 24)
      )
    );
  }
}

function updateParticle(particle) {
  if (pointer.active) {
    const dx = particle.x - pointer.x;
    const dy = particle.y - pointer.y;
    const dist = Math.hypot(dx, dy) || 1;
    if (dist < POINTER_RADIUS) {
      const force = (1 - dist / POINTER_RADIUS) * 0.075;
      particle.vx += (dx / dist) * force;
      particle.vy += (dy / dist) * force;
    }
  }

  particle.x += particle.vx;
  particle.y += particle.vy;
  particle.vx *= 0.995;
  particle.vy *= 0.995;

  if (particle.x < -20) particle.x = width + 20;
  if (particle.x > width + 20) particle.x = -20;
  if (particle.y < -20) particle.y = height + 20;
  if (particle.y > height + 20) particle.y = -20;
}

function drawParticles() {
  ctx.clearRect(0, 0, width, height);

  const gradient = ctx.createRadialGradient(
    width * 0.5,
    height * 0.38,
    0,
    width * 0.5,
    height * 0.5,
    Math.max(width, height) * 0.7
  );
  gradient.addColorStop(0, `rgba(${palette.glow}, 0.16)`);
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < particles.length; i += 1) {
    const a = particles[i];
    for (let j = i + 1; j < particles.length; j += 1) {
      const b = particles[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.hypot(dx, dy);
      if (dist < LINK_DISTANCE) {
        const alpha = (1 - dist / LINK_DISTANCE) * 0.22;
        ctx.strokeStyle = `rgba(${palette.link}, ${alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }

  for (const particle of particles) {
    ctx.fillStyle = `rgba(${palette.particle}, ${particle.alpha})`;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function loop() {
  for (const particle of particles) {
    updateParticle(particle);
  }
  drawParticles();
  animationFrame = requestAnimationFrame(loop);
}

function pointerPosition(event) {
  return { x: event.clientX, y: event.clientY };
}

window.addEventListener("resize", () => {
  resize();
});

window.addEventListener("pointermove", (event) => {
  const pos = pointerPosition(event);
  pointer.x = pos.x;
  pointer.y = pos.y;
  pointer.active = true;
});

window.addEventListener("pointerleave", () => {
  pointer.active = false;
});

window.addEventListener("pointerdown", (event) => {
  const pos = pointerPosition(event);
  addBurst(pos.x, pos.y);
  pointer.x = pos.x;
  pointer.y = pos.y;
  pointer.active = true;
});

resetBtn.addEventListener("click", resetScene);
randomizeBtn.addEventListener("click", randomizeScene);

resize();
resetScene();
if (animationFrame) {
  cancelAnimationFrame(animationFrame);
}
animationFrame = requestAnimationFrame(loop);

setTimeout(() => {
  introMessage.classList.add("calm-message--hidden");
  setTimeout(() => {
    introMessage.remove();
  }, 1000);
}, 3000);
