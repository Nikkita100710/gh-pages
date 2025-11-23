// Arctic Rescue — одиночный прототип с "тетрис-пультом" и окнами About / Instruction.

window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  if (!canvas || !ctx) {
    console.error("Не найден canvas с id='gameCanvas' или контекст рисования.");
    return;
  }

  // ---- ЗАГРУЗКА КАРТИНКИ КОРАБЛЯ ----
  const boatImage = new Image();
  let boatImageLoaded = false;
  boatImage.src = "boat.png"; // PNG лодки рядом с arctic.html
  boatImage.onload = () => {
    boatImageLoaded = true;
  };

  // ----- ПАРАМЕТРЫ СЕТКИ -----
  const GRID_COLS = 10;
  const GRID_ROWS = 12;

  const cellWidth = canvas.width / GRID_COLS;
  const cellHeight = canvas.height / GRID_ROWS;

  const northPoleRows = 1;
  const continentRows = 1;

  // ----- СОСТОЯНИЕ ИГРЫ -----
  const ROUND_DURATION_MS = 60_000; // 1 минута
  let roundStartTime = 0;
  let gameOver = false;
  let gameStarted = false; // игра хотя бы раз была запущена
  let paused = false;
  let pauseAccumulated = 0; // суммарное "замороженное" время
  let pauseStartedAt = null; // когда нажали PAUSE

  // ----- ДВИЖЕНИЕ КОРАБЛЯ -----
  const MOVE_DELAY = 200; // шаг не чаще, чем раз в 200 мс
  let lastMoveTime = 0;
  let desiredDx = 0;
  let desiredDy = 0;
  let facingDx = 0;
  let facingDy = -1;

  let lastStepDx = 0;
  let lastStepDy = 0;

  const player = {
    col: Math.floor(GRID_COLS / 2),
    row: GRID_ROWS - 2, // над континентом (10)
  };

  // ----- АЙСБЕРГИ -----
  const ICEBERG_MOVE_DELAY = 500;
  const ICEBERG_SPAWN_DELAY = 1200;
  const ICEBERG_MAX_COUNT = 10;

  const ICEBERG_MIN_ROW = 2;
  const ICEBERG_MAX_ROW = GRID_ROWS - 3; // 9

  let icebergs = [];
  let lastIcebergMoveTime = 0;
  let lastIcebergSpawnTime = 0;

  // ----- МЕДВЕДИ -----
  let carryingBear = false;
  let savedBears = 0;

  // ----- ВСПОМОГАТЕЛЬНОЕ -----
  function resetPlayerPosition() {
    player.col = Math.floor(GRID_COLS / 2);
    player.row = GRID_ROWS - 2;
    facingDx = 0;
    facingDy = -1;
  }

  function resetGameState() {
    savedBears = 0;
    carryingBear = false;
    icebergs = [];
    resetPlayerPosition();
    clearDirection();
    gameOver = false;
    paused = false;

    pauseAccumulated = 0;
    pauseStartedAt = null;

    lastStepDx = 0;
    lastStepDy = 0;
    lastMoveTime = 0;
  }

  function startGame() {
    resetGameState();
    gameStarted = true;
    roundStartTime = Date.now();
  }

  // ----- РИСОВКА ГОЛОВЫ МЕДВЕДЯ -----
  function drawBearHead(x, y, bodyRadius) {
    const earRadius = bodyRadius * 0.4;

    ctx.save();

    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "rgba(0, 0, 60, 0.8)";
    ctx.lineWidth = 2;

    // Тело
    ctx.beginPath();
    ctx.arc(x, y, bodyRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Ушки
    ctx.beginPath();
    ctx.arc(x - bodyRadius * 0.6, y - bodyRadius * 0.6, earRadius, 0, Math.PI * 2);
    ctx.arc(x + bodyRadius * 0.6, y - bodyRadius * 0.6, earRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Нос
    ctx.fillStyle = "#333333";
    ctx.beginPath();
    ctx.arc(x, y + bodyRadius * 0.15, bodyRadius * 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Глазки
    ctx.beginPath();
    const eyeOffsetX = bodyRadius * 0.35;
    const eyeOffsetY = bodyRadius * 0.15;
    ctx.arc(x - eyeOffsetX, y - eyeOffsetY, bodyRadius * 0.08, 0, Math.PI * 2);
    ctx.arc(x + eyeOffsetX, y - eyeOffsetY, bodyRadius * 0.08, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ----- ОСНОВНОЙ ЦИКЛ ОТРИСОВКИ -----
  function draw() {
    const now = Date.now();

    if (gameStarted && !gameOver && !paused) {
      updateTimer(now);
      handleMovement(now);
      handleIcebergs(now);
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Океан
    const oceanGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    oceanGradient.addColorStop(0, "#002b55");
    oceanGradient.addColorStop(1, "#005080");
    ctx.fillStyle = oceanGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Полюс
    ctx.fillStyle = "#e0f7ff";
    ctx.fillRect(0, 0, canvas.width, northPoleRows * cellHeight);

    // Континент
    ctx.fillStyle = "#145a32";
    ctx.fillRect(
      0,
      canvas.height - continentRows * cellHeight,
      canvas.width,
      continentRows * cellHeight
    );

    drawPoleLabels();
    drawPolarBears();
    drawGrid();
    drawIcebergs();
    drawPlayer();
    drawScore();
    drawTimer(now);

    if (gameOver) {
      drawGameOverOverlay();
    }

    requestAnimationFrame(draw);
  }

  function drawPoleLabels() {
    const northHeight = northPoleRows * cellHeight;
    const textY = northHeight * 0.35;

    ctx.textBaseline = "middle";

    // Название игры — слева
    ctx.fillStyle = "#cc7a00";
    ctx.font = "bold 20px Segoe UI";
    ctx.textAlign = "left";
    ctx.fillText("Arctic Rescue", 12, textY);

    // Подпись про Северный полюс — центр
    ctx.fillStyle = "#003366";
    ctx.font = "16px Segoe UI";
    ctx.textAlign = "center";
    ctx.fillText("Северный полюс — белые медведи", canvas.width / 2, textY);

    // Континент
    const bandTop = canvas.height - continentRows * cellHeight;
    const bandHeight = continentRows * cellHeight;
    const continentTextY = bandTop + bandHeight * 0.3;

    ctx.fillStyle = "#ffffff";
    ctx.font = "16px Segoe UI";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Континент", canvas.width / 2, continentTextY);
  }

  function drawGrid() {
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1;

    for (let c = 0; c <= GRID_COLS; c++) {
      const x = c * cellWidth;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    for (let r = 0; r <= GRID_ROWS; r++) {
      const y = r * cellHeight;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
  }

  function drawPolarBears() {
    const bearsToDraw = 5;
    const northHeight = northPoleRows * cellHeight;
    const y = northHeight * 0.7;
    const bodyRadius = cellHeight * 0.18;

    for (let i = 0; i < bearsToDraw; i++) {
      const x = ((i + 1) * canvas.width) / (bearsToDraw + 1);
      drawBearHead(x, y, bodyRadius);
    }
  }

  function drawPlayer() {
    const xCenter = player.col * cellWidth + cellWidth / 2;
    const yCenter = player.row * cellHeight + cellHeight / 2;
    const hullHeight = cellHeight * 0.5;

    let angle = 0;
    if (facingDx === 1 && facingDy === 0) angle = Math.PI / 2;
    else if (facingDx === 0 && facingDy === 1) angle = Math.PI;
    else if (facingDx === -1 && facingDy === 0) angle = -Math.PI / 2;

    ctx.save();
    ctx.translate(xCenter, yCenter);
    ctx.rotate(angle);

    if (boatImageLoaded) {
      const maxBoatWidth = cellWidth * 0.9;
      const maxBoatHeight = cellHeight * 0.9;

      const imgW = boatImage.width;
      const imgH = boatImage.height;
      const imgAspect = imgW / imgH;

      let drawW = maxBoatWidth;
      let drawH = drawW / imgAspect;

      if (drawH > maxBoatHeight) {
        drawH = maxBoatHeight;
        drawW = drawH * imgAspect;
      }

      ctx.drawImage(boatImage, -drawW / 2, -drawH / 2, drawW, drawH);

      if (carryingBear) {
        const bearRadius = Math.min(cellWidth, cellHeight) * 0.16;
        const bearX = 0;
        const bearY = -drawH / 2 + drawH * 0.25;
        drawBearHead(bearX, bearY, bearRadius);
      }
    } else {
      const hullWidth = cellWidth * 0.7;
      const simpleHullHeight = cellHeight * 0.5;
      const bottomY = simpleHullHeight / 2;
      const topY = -simpleHullHeight / 2;
      const leftX = -hullWidth / 2;
      const rightX = hullWidth / 2;

      ctx.fillStyle = "#ffd447";
      ctx.strokeStyle = "#b8860b";
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.moveTo(0, topY - simpleHullHeight * 0.35);
      ctx.lineTo(leftX + hullWidth * 0.2, topY);
      ctx.lineTo(leftX, bottomY);
      ctx.lineTo(rightX, bottomY);
      ctx.lineTo(rightX - hullWidth * 0.2, topY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      if (carryingBear) {
        const bearRadius = Math.min(cellWidth, cellHeight) * 0.16;
        const bearX = 0;
        const bearY = topY - simpleHullHeight * 0.05;
        drawBearHead(bearX, bearY, bearRadius);
      }
    }

    ctx.restore();

    ctx.fillStyle = "#ffffff";
    ctx.font = "12px Segoe UI";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("Player", xCenter, yCenter + hullHeight / 2 + 14);
  }

  function drawIcebergs() {
    for (const iceberg of icebergs) {
      const x = iceberg.col * cellWidth;
      const y = iceberg.row * cellHeight;

      const padding = 6;
      const left = x + padding;
      const right = x + cellWidth - padding;
      const top = y + padding;
      const bottom = y + cellHeight - padding;
      const midX = (left + right) / 2;

      ctx.fillStyle = "#e0f7ff";
      ctx.beginPath();

      switch (iceberg.variant) {
        case 0:
          ctx.moveTo(left, bottom);
          ctx.lineTo(left, top + (bottom - top) * 0.5);
          ctx.lineTo(midX, top);
          ctx.lineTo(right, top + (bottom - top) * 0.5);
          ctx.lineTo(right, bottom);
          ctx.closePath();
          break;
        case 1:
          ctx.moveTo(left, bottom);
          ctx.lineTo(left, top + (bottom - top) * 0.6);
          ctx.lineTo(left + (right - left) * 0.25, top + (bottom - top) * 0.25);
          ctx.lineTo(midX, top + (bottom - top) * 0.45);
          ctx.lineTo(right - (right - left) * 0.25, top + (bottom - top) * 0.2);
          ctx.lineTo(right, top + (bottom - top) * 0.6);
          ctx.lineTo(right, bottom);
          ctx.closePath();
          break;
        case 2:
        default:
          ctx.moveTo(left, bottom);
          ctx.lineTo(left, top + (bottom - top) * 0.65);
          ctx.lineTo(left + (right - left) * 0.2, top + (bottom - top) * 0.35);
          ctx.lineTo(midX, top + (bottom - top) * 0.15);
          ctx.lineTo(right - (right - left) * 0.2, top + (bottom - top) * 0.32);
          ctx.lineTo(right, top + (bottom - top) * 0.65);
          ctx.lineTo(right, bottom);
          ctx.closePath();
          break;
      }

      ctx.fill();

      ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
      ctx.beginPath();
      ctx.ellipse(
        (left + right) / 2,
        bottom + 3,
        (right - left) / 2.5,
        4,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }

  function drawScore() {
    const bandTop = canvas.height - continentRows * cellHeight;
    const bandHeight = continentRows * cellHeight;
    const y = bandTop + bandHeight * 0.7;

    ctx.fillStyle = "#ffffff";
    ctx.font = "16px Segoe UI";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`Спасено: ${savedBears} белых медведей`, 10, y);
  }

  // ----- ТАЙМЕР -----
  function updateTimer(now) {
    // Если мы в режиме паузы, считаем, что время "застряло" на момент pauseStartedAt
    let effectiveNow = now;
    if (pauseStartedAt !== null) {
      effectiveNow = pauseStartedAt;
    }

    const elapsed = effectiveNow - roundStartTime - pauseAccumulated;
    const remaining = ROUND_DURATION_MS - elapsed;

    if (remaining <= 0) {
      gameOver = true;
      clearDirection();
    }
  }


  function formatTime(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const mm = String(minutes).padStart(1, "0");
    const ss = String(seconds).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  function drawTimer(now) {
    let remaining;

    if (!gameStarted) {
      remaining = ROUND_DURATION_MS;
    } else {
      let effectiveNow = now;
      if (pauseStartedAt !== null) {
        effectiveNow = pauseStartedAt;
      }

      const elapsed = effectiveNow - roundStartTime - pauseAccumulated;
      remaining = Math.max(0, ROUND_DURATION_MS - elapsed);
    }

    const text = `Время: ${formatTime(remaining)}`;

    ctx.fillStyle = "#ffffff";
    ctx.font = "16px Segoe UI";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    const x = canvas.width - 10;
    const y = northPoleRows * cellHeight + 10;
    ctx.fillText(text, x, y);
  }

  function drawGameOverOverlay() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#ffffff";
    ctx.font = "28px Segoe UI";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Время вышло!", canvas.width / 2, canvas.height / 2 - 10);

    ctx.font = "18px Segoe UI";
    ctx.fillText(
      `Спасено: ${savedBears} белых медведей`,
      canvas.width / 2,
      canvas.height / 2 + 20
    );
  }

  // ----- ПОЛЮС / КОНТИНЕНТ -----
  function handleReachNorthPole() {
    if (!carryingBear) {
      carryingBear = true;
    }
  }

  function handleReachContinent() {
    if (carryingBear) {
      carryingBear = false;
      savedBears += 1;
    }
  }

  // ----- ДВИЖЕНИЕ КОРАБЛЯ -----
  function movePlayer(dx, dy) {
    const newCol = player.col + dx;
    if (newCol >= 0 && newCol < GRID_COLS) {
      player.col = newCol;
    }

    if (dy < 0) {
      if (player.row > 1) {
        player.row -= 1;
      } else if (player.row === 1) {
        handleReachNorthPole();
      }
    } else if (dy > 0) {
      if (player.row < GRID_ROWS - 2) {
        player.row += 1;
      } else if (player.row === GRID_ROWS - 2) {
        handleReachContinent();
      }
    }
  }

  function handleMovement(now) {
    if (desiredDx === 0 && desiredDy === 0) return;

    if (desiredDx !== lastStepDx || desiredDy !== lastStepDy) {
      lastStepDx = desiredDx;
      lastStepDy = desiredDy;
      lastMoveTime = now;
      return;
    }

    if (now - lastMoveTime < MOVE_DELAY) return;

    movePlayer(desiredDx, desiredDy);
    lastMoveTime = now;
  }

  // ----- АЙСБЕРГИ -----
  function handleIcebergs(now) {
    if (now - lastIcebergMoveTime >= ICEBERG_MOVE_DELAY) {
      moveIcebergs();
      lastIcebergMoveTime = now;
    }

    if (
      now - lastIcebergSpawnTime >= ICEBERG_SPAWN_DELAY &&
      icebergs.length < ICEBERG_MAX_COUNT
    ) {
      spawnIceberg();
      lastIcebergSpawnTime = now;
    }

    checkCollisionsWithIcebergs();
  }

  function moveIcebergs() {
    for (const iceberg of icebergs) {
      iceberg.col += 1;
    }
    icebergs = icebergs.filter((iceberg) => iceberg.col < GRID_COLS);
  }

  function spawnIceberg() {
    const row =
      Math.floor(Math.random() * (ICEBERG_MAX_ROW - ICEBERG_MIN_ROW + 1)) +
      ICEBERG_MIN_ROW;

    const variant = Math.floor(Math.random() * 3);

    icebergs.push({ row, col: 0, variant });
  }

  function checkCollisionsWithIcebergs() {
    for (const iceberg of icebergs) {
      if (iceberg.row === player.row && iceberg.col === player.col) {
        handleIcebergCollision();
        break;
      }
    }
  }

  function handleIcebergCollision() {
    if (carryingBear) carryingBear = false;
    resetPlayerPosition();
    clearDirection();
  }

  // ----- УПРАВЛЕНИЕ -----
  function setDirection(dx, dy) {
    desiredDx = dx;
    desiredDy = dy;

    if (dx !== 0 || dy !== 0) {
      facingDx = dx;
      facingDy = dy;
    }
  }

  function clearDirection() {
    desiredDx = 0;
    desiredDy = 0;
  }

  function setDirectionFromKey(key) {
    switch (key) {
      case "ArrowUp":
      case "w":
      case "W":
        setDirection(0, -1);
        break;
      case "ArrowDown":
      case "s":
      case "S":
        setDirection(0, 1);
        break;
      case "ArrowLeft":
      case "a":
      case "A":
        setDirection(-1, 0);
        break;
      case "ArrowRight":
      case "d":
      case "D":
        setDirection(1, 0);
        break;
    }
  }

  function isMovementKey(key) {
    return [
      "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
      "w", "W", "a", "A", "s", "S", "d", "D"
    ].includes(key);
  }

  window.addEventListener("keydown", (e) => {
    setDirectionFromKey(e.key);
  });

  window.addEventListener("keyup", (e) => {
    if (isMovementKey(e.key)) clearDirection();
  });

  // Кнопки джойстика
  const btnUp = document.getElementById("btn-up");
  const btnDown = document.getElementById("btn-down");
  const btnLeft = document.getElementById("btn-left");
  const btnRight = document.getElementById("btn-right");

  function attachButtonControls(btn, dx, dy) {
    if (!btn) return;

    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      setDirection(dx, dy);
    });

    const stop = (e) => {
      e.preventDefault();
      clearDirection();
    };

    btn.addEventListener("pointerup", stop);
    btn.addEventListener("pointerleave", stop);
    btn.addEventListener("pointercancel", stop);
  }

  attachButtonControls(btnUp, 0, -1);
  attachButtonControls(btnDown, 0, 1);
  attachButtonControls(btnLeft, -1, 0);
  attachButtonControls(btnRight, 1, 0);

  // ----- СИСТЕМНЫЕ КНОПКИ: RESET / SOUND / PAUSE / OPTIONS -----
  const btnReset = document.getElementById("btn-reset");
  const btnSound = document.getElementById("btn-sound");
  const btnPause = document.getElementById("btn-pause");
  const btnOptions = document.getElementById("btn-options");

  if (btnReset) {
    btnReset.addEventListener("click", () => {
      const intro = document.getElementById("intro");
      const aboutOverlay = document.getElementById("aboutOverlay");
      if (intro) intro.style.display = "none";
      if (aboutOverlay) aboutOverlay.style.display = "none";
      startGame();
    });
  }

  if (btnSound) {
    btnSound.addEventListener("click", () => {
      // Заглушка: просто визуально включаем/выключаем
      btnSound.classList.toggle("sys-btn-off");
    });
  }

  if (btnPause) {
    btnPause.addEventListener("click", () => {
      if (!gameStarted || gameOver) return;

      if (!paused) {
        // Входим в паузу
        paused = true;
        pauseStartedAt = Date.now();
        btnPause.textContent = "START";
      } else {
        // Выходим из паузы
        paused = false;
        if (pauseStartedAt !== null) {
          pauseAccumulated += Date.now() - pauseStartedAt;
          pauseStartedAt = null;
        }
        btnPause.textContent = "PAUSE";
      }
    });
  }


  if (btnOptions) {
    btnOptions.addEventListener("click", () => {
      const aboutOverlay = document.getElementById("aboutOverlay");
      if (aboutOverlay) aboutOverlay.style.display = "flex";
      // игру не останавливаем, Никита решит, ставить ли PAUSE
    });
  }

  // ----- ОКНА INTRO и ABOUT -----
  const intro = document.getElementById("intro");
  const startButton = document.getElementById("startButton");

  if (startButton && intro) {
    startButton.addEventListener("click", () => {
      intro.style.display = "none";
    });
  }

  const aboutOverlay = document.getElementById("aboutOverlay");
  const aboutOkBtn = document.getElementById("aboutOkBtn");
  const aboutMoreBtn = document.getElementById("aboutMoreBtn");

  if (aboutOkBtn && aboutOverlay) {
    aboutOkBtn.addEventListener("click", () => {
      aboutOverlay.style.display = "none";
    });
  }

  if (aboutMoreBtn && aboutOverlay && intro) {
    aboutMoreBtn.addEventListener("click", () => {
      aboutOverlay.style.display = "none";
      intro.style.display = "flex";
    });
  }

  // ----- ЗАПУСК -----
  resetPlayerPosition();
  startGame();      // сразу запускаем раунд
  draw();
});
