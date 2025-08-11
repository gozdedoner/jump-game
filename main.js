(() => {
  // ===== Settings
  const CANVAS_W = 800;
  const CANVAS_H = 300;
  const GROUND_Y = 230;
  const GRAVITY = 0.65;
  const JUMP_VELOCITY = -11.5;
  const DOUBLE_JUMP_VELOCITY = -10;
  const OBSTACLE_SPEED_START = 6;
  const SPEED_RAMP = 0.00095;
  const COIN_SCORE = 50;
  const MAX_LEADERBOARD = 5;
  const DAY_NIGHT_SECS = 32; // full cycle in seconds

  // ===== Canvas / UI
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;

  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const coinsEl = document.getElementById('coins');
  const overlay = document.getElementById('overlay');
  const restartBtn = document.getElementById('restartBtn');
  const continueBtn = document.getElementById('continueBtn');
  const shareBtn = document.getElementById('shareBtn');
  const themeBtn = document.getElementById('themeBtn');
  const soundBtn = document.getElementById('soundBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const boardEl = document.getElementById('board');
  const achEl = document.getElementById('achievements');

  const btnJump = document.getElementById('btnJump');
  const btnSlide = document.getElementById('btnSlide');

  // ===== Theme
  const savedTheme = localStorage.getItem('sr-theme') || 'dark';
  if(savedTheme === 'light') document.body.classList.add('light');
  themeBtn.addEventListener('click', () => {
    document.body.classList.toggle('light');
    localStorage.setItem('sr-theme', document.body.classList.contains('light') ? 'light' : 'dark');
  });

  // ===== Sound
  let soundOn = (localStorage.getItem('sr-sound') ?? '1') === '1';
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const audio = AudioCtx ? new AudioCtx() : null;
  const beep = (freq = 520, time = 0.06, vol = 0.03, type='sine') => {
    if (!soundOn || !audio) return;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g); g.connect(audio.destination);
    o.start();
    setTimeout(() => { o.stop(); }, time * 1000);
  };
  function setSoundUI() {
    soundBtn.classList.toggle('muted', !soundOn);
    soundBtn.textContent = soundOn ? '🔊' : '🔈';
  }
  setSoundUI();
  soundBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    localStorage.setItem('sr-sound', soundOn ? '1' : '0');
    setSoundUI();
    if (soundOn) beep(840, 0.08, 0.05, 'square');
  });

  // ===== Entities
  class Runner {
    constructor() {
      this.baseW = 34;
      this.baseH = 46;
      this.slideH = 26;
      this.w = this.baseW;
      this.h = this.baseH;
      this.x = 80;
      this.y = GROUND_Y - this.h;
      this.vy = 0;
      this.grounded = true;
      this.jumpsLeft = 2;
      this.sliding = false;
      this.animTick = 0;
      this.hasShield = false;
      this.shieldTimer = 0; // frames
    }
    jump() {
      if (this.jumpsLeft > 0) {
        this.vy = (this.jumpsLeft === 2) ? JUMP_VELOCITY : DOUBLE_JUMP_VELOCITY;
        this.grounded = false;
        this.jumpsLeft--;
        this.sliding = false; // cancel slide on jump
        beep(720 + (this.jumpsLeft*50), 0.06, 0.045);
      }
    }
    setSlide(on) {
      if (on && !this.grounded) return; // only slide on ground
      this.sliding = on;
      this.h = on ? this.slideH : this.baseH;
      // adjust y so feet stay on ground
      this.y = GROUND_Y - this.h;
    }
    update() {
      this.vy += GRAVITY;
      this.y += this.vy;
      if (this.y >= GROUND_Y - this.h) {
        this.y = GROUND_Y - this.h;
        this.vy = 0;
        if (!this.grounded) {
          // landed
          this.grounded = true;
          this.jumpsLeft = 2;
        }
      } else {
        this.grounded = false;
      }
      if (this.shieldTimer > 0) {
        this.shieldTimer--;
        if (this.shieldTimer === 0) this.hasShield = false;
      }
      this.animTick++;
    }
    giveShield(frames = 60 * 8) {
      this.hasShield = true;
      this.shieldTimer = frames;
    }
    draw(ctx) {
      // shield glow
      if (this.hasShield) {
        ctx.save();
        const glow = 6 + Math.sin(this.animTick*0.2)*2;
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath();
        ctx.roundRect(this.x-4, this.y-16, this.w+8, this.h+22, glow);
        ctx.fill();
        ctx.restore();
      }
      // body
      ctx.fillStyle = '#0ea5e9';
      ctx.fillRect(this.x, this.y, this.w, this.h);
      // head or visor depending on slide
      ctx.fillStyle = '#38bdf8';
      if (!this.sliding) {
        ctx.fillRect(this.x + 6, this.y - 14, 22, 14);
      } else {
        ctx.fillRect(this.x + 4, this.y + 4, 26, 10);
      }
      // legs animation
      ctx.fillStyle = '#0369a1';
      const swing = Math.sin(this.animTick * 0.4) * 4;
      ctx.fillRect(this.x + 4, this.y + this.h - 8, 10, 8);
      ctx.fillRect(this.x + this.w - 14, this.y + this.h - 8 + swing, 10, 8);
    }
    bounds() { return {x:this.x, y:this.y, w:this.w, h:this.h}; }
  }

  class Obstacle {
    constructor(x, w=26, h=26) {
      this.type = 'cactus';
      this.x = x; this.w = w; this.h = h;
      this.y = GROUND_Y - h;
    }
    update(speed) { this.x -= speed; }
    draw(ctx) {
      ctx.fillStyle = '#16a34a';
      ctx.fillRect(this.x, this.y, this.w, this.h);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(this.x + 4, this.y - 8, 6, 10);
    }
    offscreen(){ return this.x + this.w < -10; }
    bounds(){ return {x:this.x, y:this.y, w:this.w, h:this.h}; }
  }

  class HighBar {
    constructor(x, w=36, gapY=GROUND_Y-90) {
      this.type = 'bar';
      this.x = x; this.w = w;
      this.y = gapY; // top bar y
      this.h = 10;
    }
    update(speed){ this.x -= speed; }
    draw(ctx){
      ctx.fillStyle = '#16a34a';
      ctx.fillRect(this.x, this.y, this.w, this.h);
      // posts
      ctx.fillRect(this.x, this.y, 4, 36);
      ctx.fillRect(this.x+this.w-4, this.y, 4, 36);
    }
    offscreen(){ return this.x + this.w < -10; }
    bounds(){ return {x:this.x, y:this.y, w:this.w, h:this.h+26}; } // thicker hitzone
  }

  class Bird {
    constructor(x, y) {
      this.type = 'bird';
      this.x = x; this.y = y;
      this.w = 28; this.h = 20;
      this.anim = 0;
    }
    update(speed){ this.x -= speed*1.15; this.anim++; }
    draw(ctx){
      ctx.fillStyle = '#1f2937';
      // simple flapping wings
      const wing = Math.sin(this.anim*0.4)*6;
      ctx.fillRect(this.x, this.y, this.w, this.h);
      ctx.fillRect(this.x-6, this.y+2+wing, 10, 6);
      ctx.fillRect(this.x+this.w-4, this.y+2-wing, 10, 6);
    }
    offscreen(){ return this.x + this.w < -10; }
    bounds(){ return {x:this.x, y:this.y, w:this.w, h:this.h}; }
  }

  class Coin {
    constructor(x, y) {
      this.type = 'coin';
      this.x = x; this.y = y;
      this.r = 8; this.spin = 0;
    }
    update(speed){ this.x -= speed; this.spin += 0.25; }
    draw(ctx){
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(Math.sin(this.spin)*0.2);
      const grd = ctx.createLinearGradient(-this.r,0,this.r,0);
      grd.addColorStop(0,'#fef08a'); grd.addColorStop(0.5,'#fde047'); grd.addColorStop(1,'#f59e0b');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(0,0,this.r,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }
    offscreen(){ return this.x + this.r < -10; }
    bounds(){ return {x:this.x-this.r, y:this.y-this.r, w:this.r*2, h:this.r*2}; }
  }

  class PowerUp {
    constructor(x, y, kind='shield') {
      this.type = 'power';
      this.kind = kind;
      this.x = x; this.y = y;
      this.r = 10; this.t = 0;
    }
    update(speed){ this.x -= speed; this.t++; }
    draw(ctx){
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = this.kind==='shield' ? '#93c5fd' : '#a7f3d0';
      ctx.beginPath(); ctx.arc(0,0,this.r+2*Math.sin(this.t*0.15),0,Math.PI*2); ctx.fill();
      ctx.fillStyle = '#1d4ed8';
      ctx.beginPath(); ctx.arc(0,0,this.r*0.6,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }
    offscreen(){ return this.x + this.r < -10; }
    bounds(){ return {x:this.x-this.r, y:this.y-this.r, w:this.r*2, h:this.r*2}; }
  }

  class Particle {
    constructor(x,y,vx,vy,life=40) {
      this.x=x; this.y=y; this.vx=vx; this.vy=vy; this.life=life; this.t=0;
    }
    update(){ this.x+=this.vx; this.y+=this.vy; this.vy+=0.08; this.t++; }
    draw(ctx){
      ctx.globalAlpha = Math.max(0, 1 - this.t/this.life);
      ctx.fillStyle = '#fde68a';
      ctx.fillRect(this.x, this.y, 2, 2);
      ctx.globalAlpha = 1;
    }
    dead(){ return this.t>=this.life; }
  }

  // ===== Helpers
  const rand = (min, max) => Math.random() * (max - min) + min;
  const chance = (p) => Math.random() < p;
  const rectsCollide = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  // ===== Game State
  let player, obstacles, flyers, coins, powers, particles, speed, score, best, coinCount, spawnTimer, birdTimer, started, state, timeTick;
  // state: 'playing' | 'paused' | 'over'

  // ===== Achievements
  const ACH_KEYS = [
    {key:'s100', label:'Reach 100 score', test: () => score >= 100},
    {key:'s300', label:'Reach 300 score', test: () => score >= 300},
    {key:'s600', label:'Reach 600 score', test: () => score >= 600},
    {key:'c10', label:'Collect 10 coins (lifetime)', test: () => (Number(localStorage.getItem('sr-coins-total')||0) >= 10)},
  ];

  function getAchievements(){ try{ return JSON.parse(localStorage.getItem('sr-ach')||'{}'); } catch{ return {}; } }
  function setAchievements(obj){ localStorage.setItem('sr-ach', JSON.stringify(obj)); }
  function updateAchievementUI(){
    const saved = getAchievements();
    achEl.innerHTML = '';
    for (const a of ACH_KEYS) {
      const done = saved[a.key] ? true : false;
      const li = document.createElement('li');
      li.className = done ? 'done' : 'todo';
      li.textContent = a.label;
      achEl.appendChild(li);
    }
  }

  function pushLeaderboard(sc) {
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem('sr-leaderboard')||'[]'); } catch {}
    arr.push({score: sc, t: Date.now()});
    arr.sort((a,b) => b.score - a.score);
    arr = arr.slice(0, MAX_LEADERBOARD);
    localStorage.setItem('sr-leaderboard', JSON.stringify(arr));
  }
  function renderLeaderboard() {
    boardEl.innerHTML = '';
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem('sr-leaderboard')||'[]'); } catch {}
    if (arr.length === 0) {
      const li = document.createElement('li'); li.textContent = 'No scores yet — be the first!';
      boardEl.appendChild(li); return;
    }
    arr.forEach((it,i) => {
      const date = new Date(it.t).toLocaleString();
      const li = document.createElement('li');
      li.textContent = `#${i+1} — ${it.score} pts • ${date}`;
      boardEl.appendChild(li);
    });
  }

  // ===== Reset / Pause / End
  function reset() {
    player = new Runner();
    obstacles = [];
    flyers = [];
    coins = [];
    powers = [];
    particles = [];
    speed = OBSTACLE_SPEED_START;
    score = 0;
    coinCount = 0;
    best = Number(localStorage.getItem('sr-best') || 0);
    spawnTimer = 0;
    birdTimer = 180;
    started = false;
    state = 'playing';
    timeTick = 0;

    scoreEl.textContent = 'Score: 0';
    coinsEl.textContent = '🪙 0';
    bestEl.textContent = 'Best: ' + best;
    overlay.classList.add('hidden');
    pauseBtn.classList.remove('paused');
    updateAchievementUI();
  }
  function endGame() {
    state = 'over';
    if (score > best) {
      best = score;
      localStorage.setItem('sr-best', String(best));
    }
    localStorage.setItem('sr-coins-total', String(Number(localStorage.getItem('sr-coins-total')||0) + coinCount));
    // Achievements
    const ach = getAchievements();
    for (const a of ACH_KEYS) {
      if (a.test()) ach[a.key] = true;
    }
    setAchievements(ach);

    document.getElementById('best').textContent = 'Best: ' + best;
    document.getElementById('stateTitle').textContent = 'Game Over';
    document.getElementById('stateMsg').innerHTML = 'Score: <strong>' + score + '</strong> • Coins: <strong>'+coinCount+'</strong>';
    renderLeaderboard();
    pushLeaderboard(score);
    renderLeaderboard();
    overlay.classList.remove('hidden');
    beep(240, 0.12, 0.06, 'sawtooth');
  }
  function togglePause(force) {
    if (state === 'over') return;
    if (typeof force === 'string') { state = force; }
    else state = (state === 'paused') ? 'playing' : 'paused';
    document.getElementById('stateTitle').textContent = state === 'paused' ? 'Paused' : 'Game Over';
    document.getElementById('stateMsg').textContent = state === 'paused'
      ? 'Press P to continue. R to restart.'
      : document.getElementById('stateMsg').textContent;
    overlay.classList.toggle('hidden', state !== 'paused');
    pauseBtn.classList.toggle('paused', state === 'paused');
  }

  // ===== Spawning
  function spawnObstacle() {
    const lastX = obstacles.length ? obstacles[obstacles.length - 1].x : CANVAS_W;
    if (lastX < CANVAS_W - rand(320, 520)) {
      if (chance(0.25)) {
        // High bar requires sliding
        obstacles.push(new HighBar(CANVAS_W + 10 + rand(0, 40), Math.round(rand(40, 68)), GROUND_Y - Math.round(rand(80, 110))));
      } else {
        const h = Math.round(rand(22, 44));
        const w = Math.round(rand(18, 30));
        obstacles.push(new Obstacle(CANVAS_W + 20, w, h));
      }
      spawnTimer = rand(50, 110);
      // sometimes spawn coins above obstacle
      if (chance(0.5)) {
        const baseY = GROUND_Y - Math.round(rand(70, 120));
        for (let i=0;i<Math.floor(rand(2,5));i++) {
          coins.push(new Coin(CANVAS_W + 40 + i*18, baseY + Math.sin(i)*8));
        }
      }
      // sometimes spawn a power-up
      if (chance(0.12)) {
        powers.push(new PowerUp(CANVAS_W + Math.round(rand(80, 140)), GROUND_Y - Math.round(rand(70, 120)), 'shield'));
      }
    }
  }
  function spawnBird() {
    if (birdTimer-- <= 0) {
      flyers.push(new Bird(CANVAS_W + 30, rand(GROUND_Y - 120, GROUND_Y - 60)));
      birdTimer = rand(220, 360);
    }
  }

  // ===== Background
  function drawBackground() {
    // day/night
    const t = (timeTick / 60) % DAY_NIGHT_SECS;
    const phase = (t / DAY_NIGHT_SECS) * Math.PI * 2;
    const skyTop = `rgba(${120 + 80*Math.sin(phase)}, ${200 + 40*Math.sin(phase)}, ${255 - 50*Math.sin(phase)}, 1)`;
    const skyMid = `rgba(${170 + 60*Math.sin(phase)}, ${210 + 30*Math.sin(phase)}, ${255 - 20*Math.sin(phase)}, 1)`;
    const grd = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    grd.addColorStop(0, skyTop);
    grd.addColorStop(0.35, skyMid);
    grd.addColorStop(0.36, '#86efac');
    grd.addColorStop(1, '#86efac');
    ctx.fillStyle = grd;
    ctx.fillRect(0,0,CANVAS_W,CANVAS_H);

    // parallax hills
    const baseY = 236;
    ctx.fillStyle = '#34d399';
    ctx.fillRect(0, baseY-6, CANVAS_W, 6);
    ctx.fillStyle = '#14532d';
    ctx.fillRect(0, baseY, CANVAS_W, CANVAS_H-baseY);

    // distant mountains
    ctx.fillStyle = 'rgba(15,23,42,0.25)';
    const off = (timeTick * 0.3) % (CANVAS_W*2);
    for (let i=-1;i<3;i++){
      const x = -off + i*260;
      triangle(x, baseY-30, x+80, baseY-100, x+160, baseY-30);
    }
    // stars at night
    if (Math.sin(phase) < -0.2) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i=0;i<20;i++){
        ctx.fillRect((i*41 + (timeTick*0.5))%CANVAS_W, 20+(i*7)%120, 1,1);
      }
    }
  }
  function triangle(x1,y1,x2,y2,x3,y3){ ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.lineTo(x3,y3); ctx.closePath(); ctx.fill(); }

  // ===== Update-Draw Loop
  function update() {
    requestAnimationFrame(update);
    if (state !== 'playing') return;

    timeTick++;

    if (started) speed += SPEED_RAMP;

    // Clear & background
    ctx.clearRect(0,0, CANVAS_W, CANVAS_H);
    drawBackground();

    // clouds are implicit in background now

    // Player
    player.update();
    player.draw(ctx);

    // Spawning
    if (spawnTimer > 0) spawnTimer--;
    if (spawnTimer <= 0) spawnObstacle();
    spawnBird();

    // Obstacles & flyers
    obstacles.forEach(o => o.update(speed));
    obstacles = obstacles.filter(o => !o.offscreen());
    obstacles.forEach(o => o.draw(ctx));

    flyers.forEach(b => b.update(speed));
    flyers = flyers.filter(b => !b.offscreen());
    flyers.forEach(b => b.draw(ctx));

    // Coins / Powerups / Particles
    coins.forEach(c => c.update(speed));
    coins = coins.filter(c => !c.offscreen());
    coins.forEach(c => c.draw(ctx));

    powers.forEach(p => p.update(speed));
    powers = powers.filter(p => !p.offscreen());
    powers.forEach(p => p.draw(ctx));

    particles.forEach(p => p.update());
    particles = particles.filter(p => !p.dead());
    particles.forEach(p => p.draw(ctx));

    // Score
    if (started) {
      score += 1;
      scoreEl.textContent = 'Score: ' + score;
    }

    // Collisions
    const pb = player.bounds();
    // obstacle collisions
    for (const ob of obstacles) {
      if (rectsCollide(pb, ob.bounds())) {
        if (player.hasShield) {
          player.hasShield = false; player.shieldTimer = 0;
          // explode particles
          for (let i=0;i<12;i++) particles.push(new Particle(pb.x+pb.w/2, pb.y+pb.h/2, rand(-2,2), rand(-2,0), 30));
          beep(480,0.07,0.06,'triangle');
          // push obstacle slightly away
          ob.x -= 10;
        } else {
          endGame(); return;
        }
      }
    }
    // bird collisions
    for (const b of flyers) {
      if (rectsCollide(pb, b.bounds())) {
        if (player.hasShield) {
          player.hasShield = false; player.shieldTimer = 0;
          for (let i=0;i<12;i++) particles.push(new Particle(pb.x+pb.w/2, pb.y+pb.h/2, rand(-2,2), rand(-2,0), 30));
          beep(500,0.07,0.06,'triangle');
          b.x = -999;
        } else {
          endGame(); return;
        }
      }
    }
    // coins
    for (let i=coins.length-1; i>=0; i--) {
      const c = coins[i];
      if (rectsCollide(pb, c.bounds())) {
        coins.splice(i,1);
        coinCount++;
        coinsEl.textContent = '🪙 ' + coinCount;
        for (let j=0;j<10;j++) particles.push(new Particle(c.x, c.y, rand(-1.5,1.5), rand(-2,-0.5), 26));
        beep(980, 0.05, 0.05, 'square');
        score += COIN_SCORE;
      }
    }
    // powerups
    for (let i=powers.length-1; i>=0; i--) {
      const p = powers[i];
      if (rectsCollide(pb, p.bounds())) {
        powers.splice(i,1);
        if (p.kind === 'shield') {
          player.giveShield(60*8);
          beep(680, 0.12, 0.05, 'sine');
        }
      }
    }
  }

  // ===== Controls
  function handleJump() { if (!started) started = true; player.jump(); }
  function handleSlide(on) { player.setSlide(on); }

  // keyboard
  document.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); handleJump(); }
    if (k === 's' || e.code === 'ArrowDown') { handleSlide(true); }
    if (k === 'r' || e.key === 'Enter') { reset(); }
    if (k === 'p') { togglePause(); }
    if (k === 'm') { soundBtn.click(); }
  });
  document.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k === 's' || e.code === 'ArrowDown') { handleSlide(false); }
  });

  // pointer HUD
  btnJump.addEventListener('pointerdown', () => handleJump());
  btnSlide.addEventListener('pointerdown', () => handleSlide(true));
  btnSlide.addEventListener('pointerup', () => handleSlide(false));
  btnSlide.addEventListener('pointercancel', () => handleSlide(false));
  btnSlide.addEventListener('pointerleave', () => handleSlide(false));

  // overlay buttons
  restartBtn.addEventListener('click', () => { reset(); });
  continueBtn.addEventListener('click', () => { togglePause('playing'); overlay.classList.add('hidden'); });
  pauseBtn.addEventListener('click', () => togglePause());

  shareBtn.addEventListener('click', async () => {
    const text = `I scored ${score} and collected ${coinCount} coins in Sky Runner Deluxe! Can you beat me?`;
    try {
      await navigator.clipboard.writeText(text);
      shareBtn.textContent = 'Copied!';
      setTimeout(() => shareBtn.textContent = 'Share', 1500);
    } catch {
      alert(text);
    }
  });

  // start
  reset();
  update();
})();
