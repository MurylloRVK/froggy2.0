(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const COLS = 14;
  const ROWS = 12;
  const CELL = 50;
  const HOME_COLS = [1, 4, 7, 10, 12];
  const WATER_ROWS = [1, 2, 3];
  const ROAD_ROWS = [5, 6, 7, 8];
  const MODE_NAMES = { classic: 'MODO CLÁSSICO', time: 'CONTRA O TEMPO', challenge: 'MODO DESAFIO' };
  const THEME_NAMES = ['CIDADE • DIA', 'FLORESTA • RIO', 'RODOVIA • NOITE'];
  const THEMES = [
    { sky: '#b5e6ac', bank: '#6eae55', bankDark: '#488447', road: '#46535a', roadLine: '#f3d77a', water: '#287b83', waterLight: '#64b8a2', grass: '#6db557', grassDark: '#438349' },
    { sky: '#9bcf91', bank: '#6f9f50', bankDark: '#436f41', road: '#4e5144', roadLine: '#e2cc7b', water: '#255f60', waterLight: '#5da58b', grass: '#5f984b', grassDark: '#3f7444' },
    { sky: '#243d56', bank: '#537d61', bankDark: '#355a4b', road: '#252e3e', roadLine: '#a9a9a2', water: '#1c5368', waterLight: '#47859a', grass: '#467b59', grassDark: '#2d6049' }
  ];
  const ACHIEVEMENTS = [
    { id: 'first_home', icon: '🏡', title: 'Primeira chegada', desc: 'Complete sua primeira casa.' },
    { id: 'five_homes', icon: '🐸', title: 'Novo endereço', desc: 'Complete as cinco casas de uma fase.' },
    { id: 'coin_10', icon: '🪙', title: 'Poupador', desc: 'Colete dez moedas.' },
    { id: 'level_3', icon: '⭐', title: 'Sem medo da água', desc: 'Chegue à fase 3.' },
    { id: 'score_5000', icon: '🏆', title: 'Lenda do pulo', desc: 'Alcance 5.000 pontos em uma partida.' },
    { id: 'challenge_win', icon: '🔥', title: 'Desafio superado', desc: 'Complete uma fase no modo Desafio.' }
  ];

  const defaultSave = {
    records: { classic: [], time: [], challenge: [] },
    achievements: [],
    settings: { sound: true, reducedMotion: false }
  };

  function loadSave() {
    try {
      const data = JSON.parse(localStorage.getItem('froogy20-save') || 'null');
      if (!data || typeof data !== 'object') return structuredClone(defaultSave);
      return {
        records: { ...defaultSave.records, ...(data.records || {}) },
        achievements: Array.isArray(data.achievements) ? data.achievements : [],
        settings: { ...defaultSave.settings, ...(data.settings || {}) }
      };
    } catch (error) {
      return JSON.parse(JSON.stringify(defaultSave));
    }
  }

  let saveData = loadSave();
  let audioContext = null;
  let screen = 'menu';
  let mode = 'classic';
  let level = 1;
  let score = 0;
  let coins = 0;
  let lives = 3;
  let timeLeft = 40;
  let homes = [false, false, false, false, false];
  let lanes = [];
  let collectibles = [];
  let player = { x: 6, y: 11, move: null };
  let paused = false;
  let gameOver = false;
  let invulnerable = 0;
  let moveCooldown = 0;
  let pendingDirection = null;
  let heldDirections = [];
  let toastTimer = 0;
  let lastFrame = 0;
  let worldTime = 0;
  let totalRunTime = 0;
  let lastScoreMode = 'classic';

  const $ = (id) => document.getElementById(id);
  const menuScreen = $('menuScreen');
  const gameScreen = $('gameScreen');

  function persist() {
    try { localStorage.setItem('froogy20-save', JSON.stringify(saveData)); } catch (error) { /* armazenamento local indisponível */ }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function bestScore(which = mode) {
    const list = saveData.records[which] || [];
    return list.length ? list[0].score : 0;
  }

  function formatScore(value) {
    return Math.max(0, Math.floor(value)).toString().padStart(6, '0');
  }

  function beep(frequency = 440, duration = 0.07, type = 'square', volume = 0.035) {
    if (!saveData.settings.sound) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioContext) audioContext = new AudioCtx();
      if (audioContext.state === 'suspended') audioContext.resume();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
      gain.gain.setValueAtTime(volume, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration);
    } catch (error) { /* áudio é opcional */ }
  }

  function showToast(message, duration = 1.5) {
    const toast = $('toast');
    toast.textContent = message;
    toast.classList.add('show');
    toastTimer = duration;
  }

  function unlockAchievement(id) {
    if (saveData.achievements.includes(id)) return;
    const achievement = ACHIEVEMENTS.find((item) => item.id === id);
    if (!achievement) return;
    saveData.achievements.push(id);
    persist();
    showToast(`CONQUISTA: ${achievement.title.toUpperCase()}`, 2.2);
    beep(760, 0.12, 'triangle');
  }

  function checkAchievements() {
    if (score >= 5000) unlockAchievement('score_5000');
    if (coins >= 10) unlockAchievement('coin_10');
    if (level >= 3) unlockAchievement('level_3');
  }

  function getTheme() {
    return THEMES[Math.floor((level - 1) / 2) % THEMES.length];
  }

  function makeLane(row, kind, index, speedMultiplier) {
    const dir = index % 2 === 0 ? 1 : -1;
    const baseSpeed = kind === 'road' ? 1.05 + index * 0.12 : 0.48 + index * 0.07;
    const speed = baseSpeed * speedMultiplier * dir;
    const entities = [];
    const count = kind === 'road' ? (index % 2 === 0 ? 3 : 2) : 3;
    for (let i = 0; i < count; i += 1) {
      let width;
      let type;
      if (kind === 'road') {
        type = (index === 3 && i === 1) || (level > 2 && i === 0 && index === 1) ? 'truck' : 'car';
        width = type === 'truck' ? 1.85 : 1.25 + ((i + index) % 2) * 0.12;
      } else {
        type = (index + i) % 3 === 0 ? 'turtle' : 'log';
        width = type === 'turtle' ? 1.75 : 2.25 + ((index + i) % 2) * 0.5;
      }
      const spacing = COLS / count;
      const start = i * spacing + ((index * 1.7) % 2.2);
      entities.push({ x: dir > 0 ? start - (i === 0 ? width + 0.5 : 0) : COLS - start - width, w: width, type, phase: Math.random() * Math.PI * 2 });
    }
    return { row, kind, dir, speed, entities, offset: Math.random() * 10 };
  }

  function createWorld() {
    const multiplier = mode === 'challenge' ? 1.55 : mode === 'time' ? 1.12 : 1;
    const speedMultiplier = Math.min(2.15, multiplier * (1 + (level - 1) * 0.105));
    lanes = [];
    ROAD_ROWS.forEach((row, index) => lanes.push(makeLane(row, 'road', index, speedMultiplier)));
    WATER_ROWS.forEach((row, index) => lanes.push(makeLane(row, 'water', index + 1, Math.min(1.55, 0.9 + (level - 1) * 0.06))));
    collectibles = [];
    const used = new Set();
    for (let i = 0; i < 4; i += 1) {
      let x = Math.floor(Math.random() * COLS);
      let y = Math.random() < 0.6 ? 4 : 9;
      let key = `${x}-${y}`;
      let tries = 0;
      while (used.has(key) && tries < 20) {
        x = Math.floor(Math.random() * COLS);
        key = `${x}-${y}`;
        tries += 1;
      }
      used.add(key);
      collectibles.push({ x, y, active: true, phase: Math.random() * 6 });
    }
    $('themeTag').textContent = THEME_NAMES[Math.floor((level - 1) / 2) % THEME_NAMES.length];
  }

  function resetPlayer() {
    player = { x: 6, y: 11, move: null };
    moveCooldown = 0;
    pendingDirection = null;
    heldDirections = [];
    invulnerable = 0.75;
  }

  function startGame(selectedMode = $('modeSelect').value) {
    mode = ['classic', 'time', 'challenge'].includes(selectedMode) ? selectedMode : 'classic';
    lastScoreMode = mode;
    level = 1;
    score = 0;
    coins = 0;
    homes = [false, false, false, false, false];
    lives = mode === 'challenge' ? 1 : 3;
    timeLeft = mode === 'time' ? 120 : mode === 'challenge' ? 75 : 40;
    totalRunTime = 0;
    paused = false;
    gameOver = false;
    resetPlayer();
    createWorld();
    screen = 'game';
    menuScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    $('pauseOverlay').classList.add('hidden');
    $('endOverlay').classList.add('hidden');
    $('modeLabel').textContent = MODE_NAMES[mode];
    $('bestInline').textContent = `RECORDE: ${bestScore(mode).toLocaleString('pt-BR')}`;
    updateHud();
    beep(520, 0.1, 'triangle');
    canvas.focus?.();
  }

  function updateHud() {
    $('scoreValue').textContent = formatScore(score);
    $('coinValue').textContent = String(coins);
    $('levelValue').textContent = String(level);
    $('timeValue').textContent = `${Math.max(0, Math.ceil(timeLeft))}`;
    $('livesValue').textContent = lives > 0 ? '♥ '.repeat(lives).trim() : '—';
    $('homeCount').textContent = `${homes.filter(Boolean).length} / 5 CASAS`;
    $('homeProgress').querySelectorAll('i').forEach((item, index) => item.classList.toggle('filled', Boolean(homes[index])));
  }

  function getDirection() {
    if (pendingDirection) {
      const direction = pendingDirection;
      pendingDirection = null;
      return direction;
    }
    return heldDirections.length ? heldDirections[heldDirections.length - 1] : null;
  }

  function queueDirection(direction) {
    pendingDirection = direction;
    heldDirections = heldDirections.filter((item) => item !== direction);
    heldDirections.push(direction);
  }

  function releaseDirection(direction) {
    heldDirections = heldDirections.filter((item) => item !== direction);
  }

  function attemptMove(dx, dy) {
    if (screen !== 'game' || paused || gameOver || player.move || moveCooldown > 0) return;
    const tx = Math.round(player.x) + dx;
    const ty = Math.round(player.y) + dy;
    if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) return;
    if (ty === 0 && !HOME_COLS.includes(tx)) {
      beep(170, 0.04, 'square', 0.018);
      return;
    }
    if (ty === 0) {
      const homeIndex = HOME_COLS.indexOf(tx);
      if (homes[homeIndex]) return;
    }
    player.move = { sx: player.x, sy: player.y, tx, ty, elapsed: 0, duration: saveData.settings.reducedMotion ? 0.07 : 0.115 };
    moveCooldown = 0.14;
    beep(dy < 0 ? 520 : 360, 0.045, 'square', 0.018);
  }

  function arriveHome() {
    const homeIndex = HOME_COLS.indexOf(Math.round(player.x));
    if (homeIndex < 0 || homes[homeIndex]) return;
    homes[homeIndex] = true;
    score += 500 + level * 100;
    coins += 1;
    unlockAchievement('first_home');
    beep(720, 0.1, 'triangle');
    showToast('CASA ENCONTRADA! + PONTOS', 1.4);
    if (homes.every(Boolean)) {
      score += 1000 * level;
      unlockAchievement('five_homes');
      if (mode === 'challenge') unlockAchievement('challenge_win');
      showToast(`FASE ${level} COMPLETA! +${1000 * level}`, 2);
      level += 1;
      homes = [false, false, false, false, false];
      createWorld();
      if (mode === 'classic') timeLeft = 40;
      if (mode === 'challenge') timeLeft = Math.min(75, timeLeft + 8);
      beep(880, 0.18, 'triangle');
    }
    resetPlayer();
    checkAchievements();
    updateHud();
  }

  function playerDied(reason) {
    if (gameOver || invulnerable > 0) return;
    lives -= 1;
    beep(120, 0.22, 'sawtooth', 0.04);
    if (lives <= 0) {
      finishGame(false, reason);
      return;
    }
    resetPlayer();
    if (mode === 'classic') timeLeft = 40;
    showToast(reason === 'water' ? 'OPS! A CORRENTE TE LEVOU.' : 'CUIDADO COM O TRÂNSITO!', 1.7);
    updateHud();
  }

  function finishGame(won, reason = '') {
    gameOver = true;
    paused = false;
    saveRecord();
    $('pauseOverlay').classList.add('hidden');
    $('endOverlay').classList.remove('hidden');
    $('endKicker').textContent = won ? 'TRAVESSIA CONCLUÍDA' : 'FIM DE JOGO';
    $('endTitle').textContent = won ? 'MANDOU BEM, SAPINHO!' : 'BOA TENTATIVA!';
    $('endText').textContent = won ? 'Você dominou a travessia. Que venha o próximo desafio!' : (reason === 'time' ? 'O tempo acabou. Tente encontrar um caminho mais rápido.' : 'A próxima travessia pode ser ainda melhor.');
    $('finalScore').textContent = score.toLocaleString('pt-BR');
    $('bestInline').textContent = `RECORDE: ${bestScore(mode).toLocaleString('pt-BR')}`;
    updateHud();
  }

  function saveRecord() {
    const name = ($('playerName').value.trim() || 'JOGADOR').slice(0, 12).toUpperCase();
    const list = saveData.records[mode] || [];
    list.push({ name, score, level, date: new Date().toLocaleDateString('pt-BR') });
    list.sort((a, b) => b.score - a.score);
    saveData.records[mode] = list.slice(0, 5);
    persist();
  }

  function nextLevel() {
    level += 1;
    homes = [false, false, false, false, false];
    createWorld();
    resetPlayer();
    if (mode === 'classic') timeLeft = 40;
    updateHud();
  }

  function update(dt) {
    worldTime += dt;
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) $('toast').classList.remove('show');
    }
    if (screen !== 'game' || paused || gameOver) return;

    totalRunTime += dt;
    invulnerable = Math.max(0, invulnerable - dt);
    moveCooldown = Math.max(0, moveCooldown - dt);

    if (mode === 'time' || mode === 'challenge') {
      timeLeft -= dt;
      if (timeLeft <= 0) {
        timeLeft = 0;
        updateHud();
        finishGame(false, 'time');
        return;
      }
    } else {
      timeLeft -= dt;
      if (timeLeft <= 0) {
        playerDied('time');
        if (gameOver) return;
      }
    }

    const direction = getDirection();
    if (direction && !player.move && moveCooldown <= 0) {
      const map = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
      const vector = map[direction];
      if (vector) attemptMove(vector[0], vector[1]);
    }

    lanes.forEach((lane) => {
      lane.entities.forEach((entity) => {
        entity.x += lane.speed * dt;
        if (lane.speed > 0 && entity.x > COLS + 0.3) entity.x = -entity.w - 0.25;
        if (lane.speed < 0 && entity.x + entity.w < -0.3) entity.x = COLS + 0.25;
        entity.phase += dt * 2.5;
      });
    });

    if (player.move) {
      const move = player.move;
      move.elapsed += dt;
      const t = Math.min(1, move.elapsed / move.duration);
      const eased = t * t * (3 - 2 * t);
      player.x = move.sx + (move.tx - move.sx) * eased;
      player.y = move.sy + (move.ty - move.sy) * eased;
      if (t >= 1) {
        player.x = move.tx;
        player.y = move.ty;
        player.move = null;
        if (player.y === 0) {
          arriveHome();
          return;
        }
        collectCoin();
      }
    }

    if (player.move) {
      // Colisões durante o pulo também contam, como no arcade clássico.
      if (invulnerable <= 0 && isOnRoad() && collidesWithVehicle()) {
        playerDied('traffic');
        return;
      }
    } else {
      if (WATER_ROWS.includes(Math.round(player.y))) {
        const lane = lanes.find((item) => item.kind === 'water' && item.row === Math.round(player.y));
        const platform = lane && lane.entities.find((entity) => player.x + 0.18 >= entity.x && player.x + 0.18 <= entity.x + entity.w - 0.12);
        if (!platform) {
          playerDied('water');
          return;
        }
        player.x += lane.speed * dt;
        if (player.x < -0.2 || player.x > COLS - 0.8) {
          playerDied('water');
          return;
        }
      }
      if (invulnerable <= 0 && isOnRoad() && collidesWithVehicle()) {
        playerDied('traffic');
        return;
      }
    }

    collectCoin();
    if (score >= 5000) unlockAchievement('score_5000');
    updateHud();
  }

  function isOnRoad() {
    return ROAD_ROWS.some((row) => Math.abs(player.y - row) < 0.42);
  }

  function collidesWithVehicle() {
    const row = Math.round(player.y);
    const lane = lanes.find((item) => item.kind === 'road' && item.row === row);
    if (!lane) return false;
    const left = player.x + 0.15;
    const right = player.x + 0.85;
    return lane.entities.some((entity) => right > entity.x + 0.06 && left < entity.x + entity.w - 0.06);
  }

  function collectCoin() {
    const x = Math.round(player.x);
    const y = Math.round(player.y);
    const coin = collectibles.find((item) => item.active && item.x === x && item.y === y);
    if (!coin) return;
    coin.active = false;
    coins += 1;
    score += 50;
    beep(990, 0.08, 'triangle');
    showToast('+50 PONTOS • MOEDA!', 0.85);
    if (coins >= 10) unlockAchievement('coin_10');
    updateHud();
  }

  function draw() {
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, W, H);
    const theme = getTheme();
    for (let row = 0; row < ROWS; row += 1) drawRow(row, theme);
    drawHomes(theme);
    drawEntities(theme);
    drawCoins();
    drawPlayer();
    drawVignette();
  }

  function drawRow(row, theme) {
    const y = row * CELL;
    if (WATER_ROWS.includes(row)) {
      ctx.fillStyle = theme.water;
      ctx.fillRect(0, y, W, CELL);
      for (let x = -((worldTime * 25 + row * 31) % 120); x < W + 60; x += 120) {
        ctx.fillStyle = theme.waterLight;
        ctx.fillRect(Math.floor(x), y + 9 + ((row * 7) % 15), 38, 4);
        ctx.fillRect(Math.floor(x + 54), y + 31, 17, 3);
        ctx.fillStyle = '#c0e8ae33';
        ctx.fillRect(Math.floor(x + 26), y + 21, 9, 2);
      }
      return;
    }
    if (ROAD_ROWS.includes(row)) {
      ctx.fillStyle = theme.road;
      ctx.fillRect(0, y, W, CELL);
      ctx.fillStyle = '#111e25';
      ctx.fillRect(0, y, W, 3);
      ctx.fillRect(0, y + CELL - 3, W, 3);
      ctx.fillStyle = theme.roadLine;
      for (let x = 11; x < W; x += 92) ctx.fillRect(x + ((row % 2) * 24), y + 24, 36, 3);
      for (let x = 4; x < W; x += 101) {
        ctx.fillStyle = '#ffffff0a';
        ctx.fillRect(x, y + 5, 25, 2);
      }
      return;
    }
    ctx.fillStyle = row === 0 ? theme.bank : theme.grass;
    ctx.fillRect(0, y, W, CELL);
    ctx.fillStyle = theme.grassDark;
    for (let x = 8 + (row % 3) * 13; x < W; x += 67) {
      const speckY = y + 9 + ((x * 7 + row * 11) % 31);
      ctx.fillRect(x, speckY, 4, 3);
      ctx.fillRect(x + 5, speckY - 3, 2, 2);
    }
    if (row === 4 || row === 9) {
      ctx.fillStyle = '#d4e78a55';
      ctx.fillRect(0, y + 2, W, 3);
    }
    if (row === 10 || row === 11) {
      ctx.fillStyle = '#d8ed9b22';
      for (let x = 20; x < W; x += 85) ctx.fillRect(x, y + 16, 17, 3);
    }
  }

  function drawHomes(theme) {
    HOME_COLS.forEach((col, index) => {
      const x = col * CELL;
      const filled = homes[index];
      ctx.fillStyle = '#264d39';
      ctx.fillRect(x + 7, 5, 36, 39);
      ctx.fillStyle = filled ? '#d6ec88' : '#b5cf7c';
      ctx.fillRect(x + 11, 12, 28, 27);
      ctx.fillStyle = filled ? '#427c40' : '#8e7750';
      ctx.fillRect(x + 16, 27, 18, 12);
      ctx.fillStyle = '#365f3b';
      ctx.fillRect(x + 5, 7, 40, 6);
      ctx.fillRect(x + 10, 2, 30, 7);
      if (filled) {
        drawTinyFrog(x + 25, 19, 0.48);
        ctx.fillStyle = '#fff3a1';
        ctx.fillRect(x + 23, 3, 4, 4);
      } else {
        ctx.fillStyle = '#536f3d';
        ctx.fillRect(x + 22, 17, 6, 6);
      }
    });
    ctx.fillStyle = theme.bankDark;
    ctx.fillRect(0, 49, W, 2);
  }

  function drawEntities(theme) {
    lanes.forEach((lane) => {
      lane.entities.forEach((entity) => {
        const x = entity.x * CELL;
        const y = lane.row * CELL;
        if (lane.kind === 'road') drawVehicle(x, y, entity, theme);
        else if (entity.type === 'log') drawLog(x, y, entity);
        else drawTurtle(x, y, entity);
      });
    });
  }

  function drawVehicle(x, y, entity, theme) {
    const width = entity.w * CELL;
    const truck = entity.type === 'truck';
    const colors = ['#f06a4f', '#f4b844', '#73b9d0', '#b28bd2', '#e5e8cf'];
    const body = colors[Math.floor((entity.phase * 0 + x + y) / 31 + 20) % colors.length];
    const top = y + (truck ? 9 : 11);
    const height = truck ? 32 : 28;
    const wheelY = y + 34;
    ctx.fillStyle = '#0c171c';
    ctx.fillRect(x + 8, wheelY, 13, 10);
    ctx.fillRect(x + width - 21, wheelY, 13, 10);
    if (truck) ctx.fillRect(x + width * 0.56, wheelY, 12, 10);
    ctx.fillStyle = body;
    ctx.fillRect(x + 3, top + 5, width - 6, height - 7);
    ctx.fillRect(x + 9, top, width - 18, 9);
    if (truck) {
      ctx.fillStyle = '#d8d3b1';
      ctx.fillRect(x + 4, top + 6, width * 0.48, height - 9);
      ctx.fillStyle = '#9ed5d7';
      ctx.fillRect(x + width * 0.58, top + 4, width * 0.25, 12);
    } else {
      ctx.fillStyle = '#a9dce0';
      ctx.fillRect(x + width * 0.28, top + 3, width * 0.43, 10);
    }
    ctx.fillStyle = '#ffe89a';
    ctx.fillRect(x + (laneDirection(x, entity) ? width - 6 : 0), top + 13, 5, 5);
    ctx.fillStyle = '#ff7668';
    ctx.fillRect(x + (laneDirection(x, entity) ? 0 : width - 7), top + 13, 5, 5);
    ctx.fillStyle = '#ffffff28';
    ctx.fillRect(x + 12, top + 2, Math.max(4, width * 0.18), 2);
  }

  function laneDirection(x, entity) {
    const lane = lanes.find((item) => item.entities.includes(entity));
    return lane ? lane.dir > 0 : true;
  }

  function drawLog(x, y, entity) {
    const width = entity.w * CELL;
    ctx.fillStyle = '#3c2b1e';
    ctx.fillRect(x + 2, y + 12, width - 4, 26);
    ctx.fillStyle = '#98633a';
    ctx.fillRect(x + 6, y + 9, width - 12, 27);
    ctx.fillStyle = '#bd8950';
    ctx.fillRect(x + 12, y + 12, width - 24, 6);
    ctx.fillStyle = '#68452b';
    for (let px = x + 23; px < x + width - 12; px += 27) ctx.fillRect(px, y + 21, 3, 12);
    ctx.fillStyle = '#d39b5b';
    ctx.fillRect(x + 4, y + 16, 5, 14);
    ctx.fillRect(x + width - 9, y + 16, 5, 14);
  }

  function drawTurtle(x, y, entity) {
    const width = entity.w * CELL;
    const bob = Math.sin(entity.phase) * 2;
    const count = Math.max(2, Math.floor(entity.w / 0.75));
    for (let i = 0; i < count; i += 1) {
      const cx = x + (i + 0.5) * (width / count);
      const cy = y + 25 + bob;
      ctx.fillStyle = '#244b38';
      ctx.fillRect(cx - 14, cy + 10, 9, 7);
      ctx.fillRect(cx + 5, cy + 10, 9, 7);
      ctx.fillStyle = '#8dc36a';
      ctx.fillRect(cx - 15, cy - 9, 30, 22);
      ctx.fillStyle = '#426d42';
      ctx.fillRect(cx - 11, cy - 12, 22, 20);
      ctx.fillStyle = '#b2d77b';
      ctx.fillRect(cx - 5, cy - 8, 10, 11);
      ctx.fillStyle = '#1a342d';
      ctx.fillRect(cx + 7, cy - 3, 3, 3);
    }
  }

  function drawCoins() {
    collectibles.forEach((coin) => {
      if (!coin.active) return;
      const x = coin.x * CELL + 25;
      const y = coin.y * CELL + 25 + Math.sin(worldTime * 4 + coin.phase) * 3;
      ctx.fillStyle = '#805521';
      ctx.fillRect(x - 9, y - 11, 18, 22);
      ctx.fillStyle = '#f6c94d';
      ctx.fillRect(x - 7, y - 12, 14, 22);
      ctx.fillStyle = '#fff1a2';
      ctx.fillRect(x - 3, y - 8, 4, 14);
      ctx.fillStyle = '#d99035';
      ctx.fillRect(x + 3, y - 5, 2, 9);
    });
  }

  function drawPlayer() {
    if (invulnerable > 0 && Math.floor(worldTime * 15) % 2 === 0) return;
    const x = (player.x + 0.5) * CELL;
    const y = (player.y + 0.5) * CELL;
    const bob = player.move ? 0 : Math.sin(worldTime * 5) * 1.8;
    drawFrog(ctx, x, y + bob, 1);
  }

  function drawFrog(context, centerX, centerY, scale = 1) {
    const s = scale;
    context.save();
    context.translate(centerX, centerY);
    context.scale(s, s);
    context.fillStyle = '#173b2c';
    context.fillRect(-18, 15, 13, 8);
    context.fillRect(7, 15, 13, 8);
    context.fillStyle = '#347e3d';
    context.fillRect(-20, 7, 14, 14);
    context.fillRect(6, 7, 14, 14);
    context.fillStyle = '#79d34e';
    context.fillRect(-21, -9, 42, 30);
    context.fillRect(-17, -17, 34, 12);
    context.fillStyle = '#57ad45';
    context.fillRect(-17, 9, 34, 12);
    context.fillStyle = '#d9ed95';
    context.fillRect(-11, 6, 22, 11);
    context.fillStyle = '#91e35b';
    context.fillRect(-19, -24, 14, 16);
    context.fillRect(5, -24, 14, 16);
    context.fillStyle = '#eff5c5';
    context.fillRect(-16, -23, 9, 11);
    context.fillRect(7, -23, 9, 11);
    context.fillStyle = '#10251d';
    context.fillRect(-12, -20, 4, 7);
    context.fillRect(10, -20, 4, 7);
    context.fillStyle = '#2d6a37';
    context.fillRect(-7, 0, 14, 2);
    context.restore();
  }

  function drawTinyFrog(x, y, scale) {
    drawFrog(ctx, x, y, scale);
  }

  function drawVignette() {
    if (Math.floor((level - 1) / 2) % THEMES.length !== 2) return;
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, '#0a173b1f');
    gradient.addColorStop(1, '#09172c44');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);
  }

  function togglePause(force) {
    if (screen !== 'game' || gameOver) return;
    paused = typeof force === 'boolean' ? force : !paused;
    $('pauseOverlay').classList.toggle('hidden', !paused);
    if (paused) {
      heldDirections = [];
      pendingDirection = null;
    }
  }

  function goToMenu() {
    paused = false;
    gameOver = false;
    screen = 'menu';
    gameScreen.classList.add('hidden');
    menuScreen.classList.remove('hidden');
    $('pauseOverlay').classList.add('hidden');
    $('endOverlay').classList.add('hidden');
    updateMenuRecordPreview();
  }

  function openModal(title, html) {
    $('modalTitle').textContent = title;
    $('modalContent').innerHTML = html;
    $('modalBackdrop').classList.remove('hidden');
  }

  function closeModal() {
    $('modalBackdrop').classList.add('hidden');
  }

  function showHelp() {
    openModal('COMO JOGAR', `
      <p><strong>Seu objetivo:</strong> leve o sapinho até as cinco casas no alto do cenário. Complete todas para avançar de fase.</p>
      <ul>
        <li><strong>WASD ou setas:</strong> pule uma casa por vez. No celular, use os botões direcionais.</li>
        <li><strong>Estrada:</strong> atravesse sem encostar nos carros e caminhões.</li>
        <li><strong>Rio:</strong> fique sobre troncos e tartarugas para não cair na água. As plataformas levam você junto.</li>
        <li><strong>Moedas:</strong> pegue as moedas douradas para ganhar 50 pontos.</li>
        <li><strong>Vidas:</strong> no Clássico você começa com três. Cada fase aumenta o ritmo do jogo.</li>
      </ul>
      <p><strong>Dica:</strong> observe o movimento dos veículos e das plataformas antes de pular. Nem sempre o caminho mais rápido é o mais seguro.</p>
      <p class="small-note">P ou Esc pausa o jogo. Recordes e conquistas são salvos neste navegador.</p>
    `);
  }

  function showRecords() {
    let html = '';
    const labels = [['classic', 'CLÁSSICO'], ['time', 'CONTRA O TEMPO'], ['challenge', 'DESAFIO']];
    labels.forEach(([key, label]) => {
      const list = saveData.records[key] || [];
      html += `<h3 style="font:10px var(--pixel);color:#9be34f;letter-spacing:1px;margin:16px 0 4px">${label}</h3>`;
      if (!list.length) {
        html += '<p class="small-note">Nenhum recorde registrado ainda. Sua vez!</p>';
      } else {
        list.forEach((entry, index) => {
          html += `<div class="record-row"><span>${index + 1}. ${escapeHtml(entry.name)} <small style="color:#839c8b">· fase ${entry.level}</small></span><strong>${entry.score.toLocaleString('pt-BR')}</strong></div>`;
        });
      }
    });
    openModal('QUADRO DE RECORDES', html);
  }

  function showAchievements() {
    const html = ACHIEVEMENTS.map((item) => {
      const unlocked = saveData.achievements.includes(item.id);
      return `<div class="achievement-row ${unlocked ? '' : 'locked'}"><span class="achievement-icon">${item.icon}</span><span style="flex:1"><strong>${item.title}</strong><small>${item.desc}</small></span><span>${unlocked ? '✓' : '🔒'}</span></div>`;
    }).join('');
    openModal('SUAS CONQUISTAS', `${html}<p class="small-note">${saveData.achievements.length} de ${ACHIEVEMENTS.length} conquistas desbloqueadas.</p>`);
  }

  function showSettings() {
    openModal('AJUSTES', `
      <label class="setting-row"><span><strong>EFEITOS SONOROS</strong><small style="display:block;color:#8ba393">Sons de pulo, moeda e conquista</small></span><input id="soundSetting" type="checkbox" ${saveData.settings.sound ? 'checked' : ''}></label>
      <label class="setting-row"><span><strong>ANIMAÇÕES REDUZIDAS</strong><small style="display:block;color:#8ba393">Movimentos mais rápidos e discretos</small></span><input id="motionSetting" type="checkbox" ${saveData.settings.reducedMotion ? 'checked' : ''}></label>
      <p class="small-note">As configurações são salvas automaticamente neste navegador.</p>
    `);
    $('soundSetting').addEventListener('change', (event) => {
      saveData.settings.sound = event.target.checked;
      persist();
      if (event.target.checked) beep(600, 0.08, 'triangle');
    });
    $('motionSetting').addEventListener('change', (event) => {
      saveData.settings.reducedMotion = event.target.checked;
      persist();
    });
  }

  function updateMenuRecordPreview() {
    // O menu principal não precisa de ranking em tempo real; esta função mantém o estado salvo.
    $('modeSelect').value = lastScoreMode;
  }

  function frame(timestamp) {
    if (!lastFrame) lastFrame = timestamp;
    const dt = Math.min(0.05, Math.max(0, (timestamp - lastFrame) / 1000));
    lastFrame = timestamp;
    update(dt);
    if (screen === 'game') draw();
    requestAnimationFrame(frame);
  }

  function bindEvents() {
    $('playBtn').addEventListener('click', () => startGame($('modeSelect').value));
    $('helpBtn').addEventListener('click', showHelp);
    $('recordsBtn').addEventListener('click', showRecords);
    $('achievementsBtn').addEventListener('click', showAchievements);
    $('settingsBtn').addEventListener('click', showSettings);
    $('pauseBtn').addEventListener('click', () => togglePause());
    $('resumeBtn').addEventListener('click', () => togglePause(false));
    $('pauseRestartBtn').addEventListener('click', () => startGame(mode));
    $('pauseMenuBtn').addEventListener('click', goToMenu);
    $('backToMenuBtn').addEventListener('click', () => {
      if (gameOver || window.confirm('Voltar ao menu? O progresso desta partida não será salvo como recorde até o fim do jogo.')) goToMenu();
    });
    $('againBtn').addEventListener('click', () => startGame(mode));
    $('endMenuBtn').addEventListener('click', goToMenu);
    $('modalClose').addEventListener('click', closeModal);
    $('modalBackdrop').addEventListener('click', (event) => { if (event.target === $('modalBackdrop')) closeModal(); });

    const keyDirections = {
      ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
      ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right'
    };
    window.addEventListener('keydown', (event) => {
      if (event.code === 'Escape' || event.code === 'KeyP') {
        if (!$('modalBackdrop').classList.contains('hidden')) closeModal();
        else togglePause();
        event.preventDefault();
        return;
      }
      const direction = keyDirections[event.code];
      if (direction && screen === 'game') {
        if (!event.repeat) queueDirection(direction);
        event.preventDefault();
      }
      if (event.code === 'Enter' && screen === 'menu') startGame($('modeSelect').value);
    });
    window.addEventListener('keyup', (event) => {
      const direction = keyDirections[event.code];
      if (direction) releaseDirection(direction);
    });
    window.addEventListener('blur', () => {
      heldDirections = [];
      pendingDirection = null;
      if (screen === 'game' && !gameOver) togglePause(true);
    });

    document.querySelectorAll('.mobile-controls button').forEach((button) => {
      const direction = button.dataset.dir;
      const press = (event) => {
        event.preventDefault();
        queueDirection(direction);
        button.setPointerCapture?.(event.pointerId);
      };
      const release = (event) => {
        event.preventDefault();
        releaseDirection(direction);
      };
      button.addEventListener('pointerdown', press);
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
    });

    $('modeSelect').addEventListener('change', () => { lastScoreMode = $('modeSelect').value; });
  }

  bindEvents();
  updateMenuRecordPreview();
  requestAnimationFrame(frame);
})();
