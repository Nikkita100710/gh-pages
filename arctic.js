// Простейший прототип игрового поля и движения кораблика по сетке 10x10

window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  if (!canvas || !ctx) {
    console.error("Не найден canvas с id='gameCanvas' или контекст рисования.");
    return;
  }

  // Размер сетки
  const GRID_COLS = 10;
  const GRID_ROWS = 10;

  // Размер клетки
  const cellWidth = canvas.width / GRID_COLS;
  const cellHeight = canvas.height / GRID_ROWS;

  // Игрок / кораблик
  const player = {
    col: Math.floor(GRID_COLS / 2),
    row: GRID_ROWS - 1, // нижняя строка
  };

  // Зоны
  const northPoleRows = 1; // 1 строка сверху
  const continentRows = 1; // 1 строка снизу

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Океан
    ctx.fillStyle = "#003366";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Северный полюс
    ctx.fillStyle = "#e0f7ff";
    ctx.fillRect(0, 0, canvas.width, northPoleRows * cellHeight);
    ctx.fillStyle = "#003366";
    ctx.font = "16px Segoe UI";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      "Северный полюс — белые медведи",
      canvas.width / 2,
      (northPoleRows * cellHeight) / 2
    );

    // Континент
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

  function drawPlayer() {
    const xCenter = player.col * cellWidth + cellWidth / 2;
    const yCenter = player.row * cellHeight + cellHeight / 2;

    const shipWidth = cellWidth * 0.6;
    const shipHeight = cellHeight * 0.6;

    ctx.fillStyle = "#ffcc00";
    ctx.beginPath();
    ctx.moveTo(xCenter, yCenter - shipHeight / 2);                // нос
    ctx.lineTo(xCenter - shipWidth / 2, yCenter + shipHeight / 2); // левый низ
    ctx.lineTo(xCenter + shipWidth / 2, yCenter + shipHeight / 2); // правый низ
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = "12px Segoe UI";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("Player", xCenter, yCenter - shipHeight / 2 - 2);
  }

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

  // Клавиатура (стрелки + WASD)
  window.addEventListener("keydown", (e) => {
    const key = e.key;

    switch (key) {
      case "ArrowUp":
      case "w":
      case "W":
        movePlayer(0, -1);
        break;

      case "ArrowDown":
      case "s":
      case "S":
        movePlayer(0, 1);
        break;

      case "ArrowLeft":
      case "a":
      case "A":
        movePlayer(-1, 0);
        break;

      case "ArrowRight":
      case "d":
      case "D":
        movePlayer(1, 0);
        break;
    }
  });

  // Кнопки на экране
  const btnUp = document.getElementById("btn-up");
  const btnDown = document.getElementById("btn-down");
  const btnLeft = document.getElementById("btn-left");
  const btnRight = document.getElementById("btn-right");

  if (btnUp && btnDown && btnLeft && btnRight) {
    btnUp.addEventListener("click", () => movePlayer(0, -1));
    btnDown.addEventListener("click", () => movePlayer(0, 1));
    btnLeft.addE
