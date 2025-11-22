// Поле: 10 колонок, 12 рядов.
// 0-й ряд: Северный полюс (белая полоса)
// 11-й ряд: Континент (зелёная полоса)
// Корабль ходит только по воде: ряды 1–10.
// Движение: не чаще одного шага каждые MOVE_DELAY мс (200 мс).

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

  // ----- ПАРАМЕТРЫ ДВИЖЕНИЯ -----
  const MOVE_DELAY = 200; // мс между шагами (<= 5 шагов в секунду)
  let lastMoveTime = 0;
  let desiredDx = 0; // -1, 0, 1
  let desiredDy = 0; // -1, 0, 1

  // ----- СОСТОЯНИЕ ИГРОКА -----
  const player = {
    col: Math.floor(GRID_COLS / 2),
    row: GRID_ROWS - 2, // 10-я строка (0..11), над континентом
  };

  // ----- ОСНОВНОЙ ЦИКЛ ОТРИСОВКИ -----
  function draw() {
    const now = Date.now();

    // Сначала обрабатываем движение с ограничением по времени
    handleMovement(now);

    // Потом рисуем всё
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Океан
    ctx.fillStyle = "#003366";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Северный полюс (верхняя полоса, ряд 0)
    ctx.fillStyle = "#e0f7ff";
    ctx.fillRect(
      0,
      0,
      canvas.width,
      northPoleRows * cellHeight
    );
    ctx.fillStyle = "#003366";
    ctx.font = "16px Segoe UI";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      "Северный полюс — белые медведи",
      canvas.width / 2,
      (northPoleRows * cellHeight) / 2
    );

    // Континент (нижняя полоса, ряд 11)
    ctx.fillStyle = "#145a32";
    ctx.fillRect(
      0,
      canvas.height - continentRows * cellHeight,
      canvas.width,
      continentRows * cellHeight
    );
    ctx.fillStyle = "#ffffff";
    ctx.font = "16px Segoe UI";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      "Континент: Аляска — Канада",
      canvas.width / 2,
      canvas.height - (continentRows * cellHeight) / 2
    );

    // Сетка
    drawGrid();

    // Кораблик
    drawPlayer();

    requestAnimationFrame(draw);
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

  function drawPlayer() {
    const xCenter = player.col * cellWidth + cellWidth / 2;
    const yCenter = player.row * cellHeight + cellHeight / 2;

    const shipWidth = cellWidth * 0.6;
    const shipHeight = cellHeight * 0.6;

    ctx.fillStyle = "#ffcc00";
    ctx.beginPath();
    // Нос вверх
    ctx.moveTo(xCenter, yCenter - shipHeight / 2);
    // Левый низ
    ctx.lineTo(xCenter - shipWidth / 2, yCenter + shipHeight / 2);
    // Правый низ
    ctx.lineTo(xCenter + shipWidth / 2, yCenter + shipHeight / 2);
    ctx.closePath();
    ctx.fill();

    // Подпись
    ctx.fillStyle = "#ffffff";
    ctx.font = "12px Segoe UI";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("Player", xCenter, yCenter - shipHeight / 2 - 2);
  }

  // ----- ЛОГИКА "ДОШЁЛ ДО ПОЛЮСА/КОНТИНЕНТА" -----
  function handleReachNorthPole() {
    // Здесь потом будет логика "забрать медведя"
    console.log("Корабль достиг Северного полюса");
  }

  function handleReachContinent() {
    // Здесь потом будет логика "высадить медведя"
    console.log("Корабль достиг континента");
  }

  // ----- ДВИЖЕНИЕ КОРАБЛЯ ПО КЛЕТКАМ (БЕЗ ТАЙМЕРА) -----
  function movePlayer(dx, dy) {
    // Горизонталь — обычное ограничение 0..GRID_COLS-1
    const newCol = player.col + dx;
    if (newCol >= 0 && newCol < GRID_COLS) {
      player.col = newCol;
    }

    // Вертикаль — только по воде (ряды 1..GRID_ROWS-2)
    if (dy < 0) {
      // Вверх
      if (player.row > 1) {
        player.row -= 1;
      } else if (player.row === 1) {
        // Стоим у полюса и пытаемся пойти ещё выше
        handleReachNorthPole();
      }
    } else if (dy > 0) {
      // Вниз
      if (player.row < GRID_ROWS - 2) {
        player.row += 1;
      } else if (player.row === GRID_ROWS - 2) {
        // Стоим у континента и пытаемся пойти ещё ниже
        handleReachContinent();
      }
    }
  }

  // ----- ОГРАНИЧЕНИЕ ПО ВРЕМЕНИ МЕЖДУ ШАГАМИ -----
  function handleMovement(now) {
    // Если никуда не хотим двигаться — выходим
    if (desiredDx === 0 && desiredDy === 0) return;

    // Если ещё не прошло MOVE_DELAY мс — выходим
    if (now - lastMoveTime < MOVE_DELAY) return;

    // Делаем шаг
    movePlayer(desiredDx, desiredDy);
    lastMoveTime = now;
  }

  // ----- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ УПРАВЛЕНИЯ -----
  function setDirection(dx, dy) {
    desiredDx = dx;
    desiredDy = dy;
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
        // Не управляющая клавиша — игнорируем
        break;
    }
  }

  function isMovementKey(key) {
    return [
      "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
      "w", "W", "a", "A", "s", "S", "d", "D"
    ].includes(key);
  }

  // ----- КЛАВИАТУРА (ПК) -----
  window.addEventListener("keydown", (e) => {
    setDirectionFromKey(e.key);
  });

  window.addEventListener("keyup", (e) => {
    if (isMovementKey(e.key)) {
      // Отпустили любую "ходовую" клавишу — останавливаемся
      clearDirection();
    }
  });

  // ----- КНОПКИ НА ЭКРАНЕ (ТЕЛЕФОН / ПК) -----
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

    // pointerup / pointerleave / pointercancel — чтобы при уходе пальца/мыши останавливались
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

  // Старт анимации
  draw();
});
