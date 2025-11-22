// Простейший прототип игрового поля и движения кораблика по сетке 10x10

window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  // Размер сетки
  const GRID_COLS = 10;
  const GRID_ROWS = 10;

  // Размер одной клетки
  const cellWidth = canvas.width / GRID_COLS;
  const cellHeight = canvas.height / GRID_ROWS;

  // Игрок / кораблик
  const player = {
    col: Math.floor(GRID_COLS / 2), // колонка (по X)
    row: GRID_ROWS - 1,             // строка (по Y), нижняя строка
  };

  // Фоновые зоны: северный полюс (верхняя полоса) и континент (нижняя полоса)
  const northPoleRows = 1; // 1 строка сверху
  const continentRows = 1; // 1 строка снизу

  // Основной цикл отрисовки
  function draw() {
    // Очистка
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Рисуем фон океана
    ctx.fillStyle = "#003366";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Северный полюс (белая полоса сверху)
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

    // Континент (полоса снизу)
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

    // Рисуем сетку
    drawGrid();

    // Рисуем кораблик
    drawPlayer();

    // В дальнейшем тут будет отрисовка айсбергов, других игроков, таймера и т.д.
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

    // Рисуем кораблик как маленький треугольник-нос вверх
    const shipWidth = cellWidth * 0.6;
    const shipHeight = cellHeight * 0.6;

    ctx.fillStyle = "#ffcc00";
    ctx.beginPath();
    // Нос корабля (вверх)
    ctx.moveTo(xCenter, yCenter - shipHeight / 2);
    // Левый нижний угол
    ctx.lineTo(xCenter - shipWidth / 2, yCenter + shipHeight / 2);
    // Правый нижний угол
    ctx.lineTo(xCenter + shipWidth / 2, yCenter + shipHeight / 2);
    ctx.closePath();
    ctx.fill();

    // Подпись кораблика (пока фиксированная)
    ctx.fillStyle = "#ffffff";
    ctx.font = "12px Segoe UI";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("Player", xCenter, yCenter - shipHeight / 2 - 2);
  }

  // Движение корабля с ограничением по границам поля
  function movePlayer(dx, dy) {
    const newCol = player.col + dx;
    const newRow = player.row + dy;

    if (newCol >= 0 && newCol < GRID_COLS) {
      player.col = newCol;
    }
    if (newRow >= 0 && newRow < GRID_ROWS) {
      player.row = newRow;
    }
  }

  // Управление с клавиатуры (ПК)
  window.addEventListener("keydown", (e) => {
    switch (e.key) {
      case "ArrowUp":
        movePlayer(0, -1);
        break;
      case "ArrowDown":
        movePlayer(0, 1);
        break;
      case "ArrowLeft":
        movePlayer(-1, 0);
        break;
      case "ArrowRight":
        movePlayer(1, 0);
        break;
    }
  });

  // Управление с кнопок (телефон / мышь)
  document.getElementById("btn-up").addEventListener("click", () => {
    movePlayer(0, -1);
  });
  document.getElementById("btn-down").addEventListener("click", () => {
    movePlayer(0, 1);
  });
  document.getElementById("btn-left").addEventListener("click", () => {
    movePlayer(-1, 0);
  });
  document.getElementById("btn-right").addEventListener("click", () => {
    movePlayer(1, 0);
  });

  // Запуск отрисовки
  draw();
});
