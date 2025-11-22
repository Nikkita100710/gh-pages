// Arctic Rescue — одиночный прототип.
// Поле: 10 колонок, 12 рядов.
// 0-й ряд: Северный полюс (белая полоса)
// 11-й ряд: Континент (зелёная полоса)
// Корабль ходит только по воде: ряды 1–10.
//
// Движение корабля: не чаще одного шага каждые MOVE_DELAY мс (200 мс).
// Айсберги 1x1 (строго внутри своей клетки): ряды 2..9, слева направо.
// Белые медведи: бесконечный запас на полюсе, счётчик спасённых на континенте.
// Раунд: 1 минута, по окончании — игра останавливается.

window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  if (!canvas || !ctx) {
    console.error("Не найден canvas с id='gameCanvas' или контекст рисования.");
    return;
  }

  // ----- ПАРАМЕТРЫ СЕТКИ -----
  const GRID_COLS = 10;
  const GRID_ROWS = 12; // 1 ряд полюс, 10 воды, 1 континент

  const cellWidth = canvas.width / GRID_COLS;   // 600 / 10 = 60
  const cellHeight = canvas.height / GRID_ROWS; // 720 / 12 = 60

  const northPoleRows = 1; // ряд 0
  const continentRows = 1; // ряд 11

  // ----- ПАРАМЕТРЫ ДВИЖЕНИЯ КОРАБЛЯ -----
  const MOVE_DELAY = 200; // мс между шагами корабля (<= 5 шагов в секунду)
  let lastMoveTime = 0;
  let desiredDx = 0; // -1, 0, 1
  let desiredDy = 0; // -1, 0, 1

  // Направление, в которое "смотрит" корабль (по умолчанию вверх)
  let facingDx = 0;
  let facingDy = -1;

  // ----- АЙСБЕРГИ -----
  const ICEBERG_MOVE_DELAY = 500;   // мс между шагами айсбергов
  const ICEBERG_SPAWN_DELAY = 1200; // мс между попытками спавна нового айсберга
  const ICEBERG_MAX_COUNT = 10;     // максимум айсбергов одновременно

  // айсберги будут только в рядах 2..9 (вода между парковочными рядами 1 и 10)
  const ICEBERG_MIN_ROW = 2;
  const ICEBERG_MAX_ROW = GRID_ROWS - 3; // 12 - 3 = 9

  let icebergs = [];
  let lastIcebergMoveTime = 0;
  let lastIcebergSpawnTime = 0;

  // ----- СОСТОЯНИЕ ИГРОКА И МЕДВЕДЕЙ -----
  const player = {
    col: Math.floor(GRID_COLS / 2),
    row: GRID_ROWS - 2, // 10-я строка (0..11), над континентом
  };

  let carryingBear = false; // везём медведя или нет
  let savedBears = 0;       // сколько спасли

  // ----- ТАЙМЕР РАУНДА -----
  const ROUND_DURATION_MS = 60_000; // 1 минута
  let roundStartTime = Date.now();
  let gameOver = false;

  function resetPlayerPosition() {
    player.col = Math.floor(GRID_COLS / 2);
    player.row = GRID_ROWS - 2;
    facingDx = 0;
    facingDy = -1; // по умолчанию смотрим вверх
  }

  // ----- УНИВЕРСАЛЬНЫЙ РИСОВАЛЬЩИК ГОЛОВЫ МЕДВЕДЯ -----
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

    // Обновляем таймер и, при необходимости, останавливаем игру
    updateTimer(now);

    // Обновляем движение, если игра ещё идёт
    if (!gameOver) {
      handleMovement(now);
      handleIcebergs(now);
    }

    // Очищаем кадр
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Океан с лёгким градиентом
    const oceanGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    oceanGradient.addColorStop(0, "#002b55");
    oceanGradient.addColorStop(1, "#005080");
    ctx.fillStyle = oceanGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Северный полюс (верхняя полоса)
    ctx.fillStyle = "#e0f7ff";
    ctx.fillRect(
      0,
      0,
      canvas.width,
      northPoleRows * cellHeight
    );

    // Континент (нижняя полоса)
    ctx.fillStyle = "#145a32";
    ctx.fillRect(
      0,
      canvas.height - continentRows * cellHeight,
      canvas.width,
      continentRows * cellHeight
    );

    // Надписи "Северный полюс" и "Континент"
    drawPoleLabels();

    // Белые медведи на полюсе
    drawPolarBears();

    // Сетка
    drawGrid();

    // Айсберги
    drawIcebergs();

    // Корабль
    drawPlayer();

    // Счётчик спасённых
    drawScore();

    // Таймер
    drawTimer(now);

    // Оверлей "Время вышло!"
    if (gameOver) {
      drawGameOverOverlay();
    }

    requestAnimationFrame(draw);
  }

  function drawPoleLabels() {
    const northHeight = northPoleRows * cellHeight;
    const northTextY = northHeight * 0.3;

    // Северный полюс
    ctx.fillStyle = "#003366";
    ctx.font = "16px Segoe UI";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      "Северный полюс — белые медведи",
      canvas.width / 2,
      northTextY
    );

    // Континент
    const bandTop = canvas.height - continentRows * cellHeight;
    const bandHeight = continentRows * cellHeight;
    const continentTextY = bandTop + bandHeight * 0.3;

    ctx.fillStyle = "#ffffff";
    ctx.font = "16px Segoe UI";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      "Континент",
      canvas.width / 2,
      continentTextY
    );
  }

  function drawGrid() {
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1;

    // Вертикальные линии
    for (let c = 0; c <= GRID_COLS; c++) {
      const x = c * cellWidth;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    // Горизонтальные линии
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

    const hullWidth = cellWidth * 0.7;
    const hullHeight = cellHeight * 0.5;

    // Определяем угол поворота по направлению
    let angle = 0; // нос вверх
    if (facingDx === 1 && facingDy === 0) {
      angle = Math.PI / 2;         // вправо
    } else if (facingDx === 0 && facingDy === 1) {
      angle = Math.PI;             // вниз
    } else if (facingDx === -1 && facingDy === 0) {
      angle = -Math.PI / 2;        // влево
    }

    ctx.save();

    // Переносим систему координат в центр корабля и поворачиваем
    ctx.translate(xCenter, yCenter);
    ctx.rotate(angle);

    const bottomY = hullHeight / 2;
    const topY = -hullHeight / 2;
    const leftX = -hullWidth / 2;
    const rightX = hullWidth / 2;

    // Корпус (ледокол)
    ctx.fillStyle = "#ffd447";
    ctx.strokeStyle = "#b8860b";
    ctx.lineWidth = 2;

    ctx.beginPath();
    // Нос вверх (центр)
    ctx.moveTo(0, topY - hullHeight * 0.35);
    // Левый верх борта
    ctx.lineTo(leftX + hullWidth * 0.2, topY);
    // Левый низ
    ctx.lineTo(leftX, bottomY);
    // Правый низ
    ctx.lineTo(rightX, bottomY);
    // Правый верх борта
    ctx.lineTo(rightX - hullWidth * 0.2, topY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Рубка
    const cabinWidth = hullWidth * 0.35;
    const cabinHeight = hullHeight * 0.4;
    const cabinX = -cabinWidth / 2;
    const cabinY = topY + hullHeight * 0.1;

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(cabinX, cabinY, cabinWidth, cabinHeight, 4);
    } else {
      ctx.rect(cabinX, cabinY, cabinWidth, cabinHeight);
    }
    ctx.fill();
    ctx.stroke();

    // Окна рубки
    ctx.fillStyle = "#2b5c99";
    const windowRadius = cabinWidth * 0.08;
    const winY = cabinY + cabinHeight * 0.4;
    ctx.beginPath();
    ctx.arc(cabinX + cabinWidth * 0.25, winY, windowRadius, 0, Math.PI * 2);
    ctx.arc(cabinX + cabinWidth * 0.5,  winY, windowRadius, 0, Math.PI * 2);
    ctx.arc(cabinX + cabinWidth * 0.75, winY, windowRadius, 0, Math.PI * 2);
    ctx.fill();

    // Медведь на палубе (если везём)
    if (carryingBear) {
      const bearRadius = Math.min(cellWidth, cellHeight) * 0.16;
      const bearX = 0;
      const bearY = topY - hullHeight * 0.05;
      drawBearHead(bearX, bearY, bearRadius);
    }

    ctx.restore();

    // Подпись "Player" (не вращаем)
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
      const left   = x + padding;
      const right  = x + cellWidth - padding;
      const top    = y + padding;
      const bottom = y + cellHeight - padding;
      const midX   = (left + right) / 2;

      ctx.fillStyle = "#e0f7ff";
      ctx.beginPath();

      switch (iceberg.variant) {
        case 0:
          // Классический треугольный айсберг
          ctx.moveTo(left,  bottom);
          ctx.lineTo(left,  top + (bottom - top) * 0.5);
          ctx.lineTo(midX,  top);
          ctx.lineTo(right, top + (bottom - top) * 0.5);
          ctx.lineTo(right, bottom);
          ctx.closePath();
          break;

        case 1:
          // Широкий низкий айсберг с двумя вершинами
          ctx.moveTo(left,  bottom);
          ctx.lineTo(left,  top + (bottom - top) * 0.6);
          ctx.lineTo(left + (right - left) * 0.25, top + (bottom - top) * 0.25);
          ctx.lineTo(midX,  top + (bottom - top) * 0.45);
          ctx.lineTo(right - (right - left) * 0.25, top + (bottom - top) * 0.2);
          ctx.lineTo(right, top + (bottom - top) * 0.6);
          ctx.lineTo(right, bottom);
          ctx.closePath();
          break;

        case 2:
        default:
          // "Рваный" айсберг с несколькими пиками
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

      // Тень под айсбергом
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
    const scoreText = `Спасено: ${savedBears} белых медведей`;
    ctx.fillText(scoreText, 10, y);
  }

  // ----- ТАЙМЕР И ОКОНЧАНИЕ РАУНДА -----
  function updateTimer(now) {
    if (gameOver) return;

    const elapsed = now - roundStartTime;
    const remaining = ROUND_DURATION_MS - elapsed;

    if (remaining <= 0) {
      gameOver = true;
      clearDirection();
      console.log("Время вышло! Раунд завершён.");
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
    const elapsed = now - roundStartTime;
    const remaining = Math.max(0, ROUND_DURATION_MS - elapsed);
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
    // Перезапуск пока через F5
  }

  // ----- ЛОГИКА ПОЛЮС / КОНТИНЕНТ -----
  function handleReachNorthPole() {
    if (!carryingBear) {
      carryingBear = true;
      console.log("Медведь взят на борт на Северном полюсе");
    }
  }

  function handleReachContinent() {
    if (carryingBear) {
      carryingBear = false;
      savedBears += 1;
      console.log("Медведь доставлен на континент. Всего спасено:", savedBears);
    }
  }

  // ----- ДВИЖЕНИЕ КОРАБЛЯ ПО КЛЕТКАМ -----
  function movePlayer(dx, dy) {
    // Горизонталь
    const newCol = player.col + dx;
    if (newCol >= 0 && newCol < GRID_COLS) {
      player.col = newCol;
    }

    // Вертикаль
    if (dy < 0) {
      // вверх
      if (player.row > 1) {
        player.row -= 1;
      } else if (player.row === 1) {
        handleReachNorthPole();
      }
    } else if (dy > 0) {
      // вниз
      if (player.row < GRID_ROWS - 2) {
        player.row += 1;
      } else if (player.row === GRID_ROWS - 2) {
        handleReachContinent();
      }
    }
  }

  function handleMovement(now) {
    if (desiredDx === 0 && desiredDy === 0) return;
    if (now - lastMoveTime < MOVE_DELAY) return;

    movePlayer(desiredDx, desiredDy);
    lastMoveTime = now;
  }

  // ----- АЙСБЕРГИ: ДВИЖЕНИЕ, СПАВН, СТОЛКНОВЕНИЯ -----
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

    const variant = Math.floor(Math.random() * 3); // 0,1,2

    icebergs.push({
      row,
      col: 0,
      variant,
    });
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
    console.log("Столкновение с айсбергом! Корабль возвращён на старт.");
    if (carryingBear) {
      carryingBear = false;
    }
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
      default:
        break;
    }
  }

  function isMovementKey(key) {
    return [
      "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
      "w", "W", "a", "A", "s", "S", "d", "D"
    ].includes(key);
  }

  // Клавиатура (ПК)
  window.addEventListener("keydown", (e) => {
    setDirectionFromKey(e.key);
  });

  window.addEventListener("keyup", (e) => {
    if (isMovementKey(e.key)) {
      clearDirection();
    }
  });

  // Кнопки на экране (телефон/ПК)
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

  attachButtonControls(btnUp,    0, -1);
  attachButtonControls(btnDown,  0,  1);
  attachButtonControls(btnLeft, -1,  0);
  attachButtonControls(btnRight, 1,  0);

  // Старт
  resetPlayerPosition();
  draw();
});
