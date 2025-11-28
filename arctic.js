
// Arctic Rescue — одиночний режим + локальний мультиплеєр на одному пристрої.
// УВАГА: увесь інтерфейс (текст на кнопках, підказки) — українською для дітей.
// Тут в коді коментарі рос/укр для зручності розробки.

window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  if (!canvas || !ctx) {
    console.error("Не знайдено canvas з id='gameCanvas' або контекст малювання.");
    return;
  }

  // ---- ЗАВАНТАЖЕННЯ ЗОБРАЖЕНЬ КОРАБЛІВ ----
  const boatImage1 = new Image(); // Гравець 1
  let boatImage1Loaded = false;
  boatImage1.src = "boat.png";
  boatImage1.onload = () => {
    boatImage1Loaded = true;
  };

  const boatImage2 = new Image(); // Гравець 2 (жовтий човен)
  let boatImage2Loaded = false;
  boatImage2.src = "boat-2.png"; // додайте boat-2.png поруч з arctic.html
  boatImage2.onload = () => {
    boatImage2Loaded = true;
  };

  // ----- ПАРАМЕТРИ СІТКИ -----
  const GRID_COLS = 10;
  const GRID_ROWS = 12;

  const cellWidth = canvas.width / GRID_COLS;
  const cellHeight = canvas.height / GRID_ROWS;

  const northPoleRows = 1;
  const continentRows = 1;

  // ----- СТАН ГРИ (СПІЛЬНИЙ) -----
  const ROUND_DURATION_MS = 60_000; // 1 хвилина

  // Єдиний об'єкт стану гри для флагів і таймера
  const gameState = {
    mode: "single",        // "single", "local2", потім додамо "online2"
    gameStarted: false,
    gameOver: false,
    paused: false,
    roundStartTime: 0,
    pauseAccumulated: 0,  // сумарний час у паузі
    pauseStartedAt: null,
  };
  // ----- ОНЛАЙН-РЕЖИМ (заготовка для Firebase) -----
  let onlineRoomId = null;
  let onlineIsHost = false;
  let guestPollIntervalId = null; // інтервал очікування гостя

  // Невеличкий інтервал синхронізації (приблизно 7 разів на секунду)
  const NET_SYNC_INTERVAL_MS = 80;
  let lastHostSyncTime = 0;
  let lastGuestSyncTime = 0;


  function getFirebaseHelpers() {
    // акуратно дістаємо те, що передали з arctic.html
    if (!window.arcticFirebase) return null;
    const { db, refFn, setFn, getFn } = window.arcticFirebase;
    if (!db || !refFn || !setFn || !getFn) return null;
    return { db, refFn, setFn, getFn };
  }
  // Відправка команд керування від гостя до Firebase
  function sendGuestInput(dx, dy) {
    // Працює тільки якщо ми в онлайн-режимі і є кімната
    if (!onlineRoomId || onlineIsHost === true) return;

    const helpers = getFirebaseHelpers();
    if (!helpers) return;

    const { db, refFn, setFn } = helpers;
    const inputRef = refFn(db, `rooms/${onlineRoomId}/inputs/guest`);

    const payload = {
      dx,
      dy,
      updatedAt: Date.now()
    };

    setFn(inputRef, payload).catch((err) => {
      console.error("Не вдалося відправити керування гостя:", err);
    });
  }



  function generateRoomId(length = 4) {
    // Тепер код складається тільки з цифр, наприклад: 0273, 9041 тощо
    const digits = "0123456789";
    let id = "";
    for (let i = 0; i < length; i++) {
      const index = Math.floor(Math.random() * digits.length);
      id += digits[index];
    }
    return id;
  }


  function startWaitingForGuest() {
    const helpers = getFirebaseHelpers();
    if (!helpers) return;
    const { db, refFn, getFn } = helpers;

    // якщо щось не так — не запускаємо інтервал
    if (!onlineRoomId || !onlineIsHost) return;

    // інтервал вже запущено
    if (guestPollIntervalId !== null) return;

    guestPollIntervalId = setInterval(() => {
      // якщо кімната/хост змінились або гість вже є — зупиняємо інтервал
      if (!onlineRoomId || !onlineIsHost || onlineGuestJoined) {
        clearInterval(guestPollIntervalId);
        guestPollIntervalId = null;
        return;
      }

      const guestRef = refFn(db, `rooms/${onlineRoomId}/guest`);
      getFn(guestRef)
        .then((snapshot) => {
          if (snapshot.exists()) {
            onlineGuestJoined = true;
            clearInterval(guestPollIntervalId);
            guestPollIntervalId = null;
            alert("Гість приєднався до кімнати! Можна починати гру.");
          }
        })
        .catch((err) => {
          console.error("Помилка перевірки підключення гостя:", err);
        });
    }, 500); // раз на півсекунди перевіряємо, чи гість уже є
  }

  function createOnlineRoomAsHost() {
    const helpers = getFirebaseHelpers();
    if (!helpers) {
      alert(
        'Онлайн-режим тимчасово недоступний (немає з\'єднання з Firebase).'
      );
      return;
    }


    const { db, refFn, setFn } = helpers;

    const roomId = generateRoomId(4);
    const roomPath = `rooms/${roomId}`;
    const roomRef = refFn(db, roomPath);

    const now = Date.now();

    const payload = {
      mode: "online2",
      createdAt: now,
      host: {
        name: "Гравець 1",
        joinedAt: now
      },
      state: null // сюди потім покладемо buildNetState()
    };

    setFn(roomRef, payload)
      .then(() => {
        onlineRoomId = roomId;
        onlineIsHost = true;
        onlineGuestJoined = false;

        // запускаємо очікування гостя ще до старту гри
        startWaitingForGuest();

        alert(
          `Створено онлайн-кімнату.\nКод: ${roomId}\n\nОчікуємо на приєднання гостя.`
        );
      })


      .catch((err) => {
        console.error("Помилка створення кімнати:", err);
        alert("Не вдалося створити кімнату. Спробуйте пізніше.");
      });
  }
  function joinOnlineRoomAsGuest(roomIdRaw) {
    const helpers = getFirebaseHelpers();
    if (!helpers) {
      alert(
        'Онлайн-режим тимчасово недоступний (немає з\'єднання з Firebase).'
      );
      return;
    }

    const { db, refFn, setFn, getFn } = helpers;

    const roomId = roomIdRaw.trim().toUpperCase();
    if (!roomId) {
      alert("Код кімнати порожній.");
      return;
    }

    const roomPath = `rooms/${roomId}`;
    const roomRef = refFn(db, roomPath);

    getFn(roomRef)
      .then((snapshot) => {
        if (!snapshot.exists()) {
          alert(`Кімнату з кодом "${roomId}" не знайдено.`);
          // кидаємо спец-помилку, щоб не виконувати наступний then
          throw new Error("room-not-found");
        }

        const data = snapshot.val() || {};
        const now = Date.now();

        const updated = {
          ...data,
          guest: {
            name: "Гравець 2",
            joinedAt: now
          }
        };

        return setFn(roomRef, updated);
      })
      .then(() => {
        // якщо сюди дійшли — кімната існує і запис гостя успішний
        onlineRoomId = roomId;
        onlineIsHost = false;

        alert(
          `Ви приєдналися до кімнати з кодом ${roomId}.\n\n` +
          "Онлайн-режим ще у розробці, але підключення до кімнати вже працює."
        );
      })
      .catch((err) => {
        if (err && err.message === "room-not-found") {
          // це «нормальна» ситуація, ми вже показали alert вище
          return;
        }
        console.error("Помилка приєднання до кімнати:", err);
        alert("Не вдалося приєднатися до кімнати. Спробуйте пізніше.");
      });
  }


  // ----- РЕЖИМ ГРИ -----
  // "single"  — один гравець
  // "local2"  — двоє гравців на одному пристрої
  // "online2" — поки що у розробці, поводиться як single
  let gameMode = gameState.mode;

  // ----- ОДИНОЧНИЙ РЕЖИМ: РУХ КОРАБЛЯ -----
  const MOVE_DELAY = 200; // крок не частіше, ніж раз на 200 мс

  let lastMoveTime = 0;
  let desiredDx = 0;
  let desiredDy = 0;
  let facingDx = 0;
  let facingDy = -1;
  let lastStepDx = 0;
  let lastStepDy = 0;

  const player = {
    col: Math.floor(GRID_COLS / 2),
    row: GRID_ROWS - 2, // ряд 10 — над континентом
  };

  let carryingBear = false;
  let savedBears = 0;

  // ----- ЛОКАЛЬНИЙ 2-ГРАВЦЕВИЙ РЕЖИМ -----
  // Стартові позиції у режимі двох гравців:
  // Гравець 1 — 3 колонка, Гравець 2 — 6 колонка (симетрично відносно центру).
  const player1 = {
    col: 3,
    row: GRID_ROWS - 2,
  };

  const player2 = {
    col: 6,
    row: GRID_ROWS - 2,
  };

  let facingDx1 = 0;
  let facingDy1 = -1;
  let facingDx2 = 0;
  let facingDy2 = -1;

  let desiredDx1 = 0;
  let desiredDy1 = 0;
  let desiredDx2 = 0;
  let desiredDy2 = 0;

  let lastMoveTime1 = 0;
  let lastMoveTime2 = 0;

  let lastStepDx1 = 0;
  let lastStepDy1 = 0;
  let lastStepDx2 = 0;
  let lastStepDy2 = 0;

  let carryingBear1 = false;
  let carryingBear2 = false;
  let savedBears1 = 0;
  let savedBears2 = 0;

  // ----- АЙСБЕРГИ -----
  const ICEBERG_MOVE_DELAY = 500;
  const ICEBERG_SPAWN_DELAY = 1200;
  const ICEBERG_MAX_COUNT = 10;

  const ICEBERG_MIN_ROW = 2;
  const ICEBERG_MAX_ROW = GRID_ROWS - 3; // 9

  let icebergs = [];
  let lastIcebergMoveTime = 0;
  let lastIcebergSpawnTime = 0;

  // ----- ДОПОМІЖНІ ФУНКЦІЇ СТАНУ -----
  function resetPlayerPositionSingle() {
    player.col = Math.floor(GRID_COLS / 2);
    player.row = GRID_ROWS - 2;
    facingDx = 0;
    facingDy = -1;
  }

  function resetLocalPlayerPosition(playerIndex) {
    const row = GRID_ROWS - 2;
    if (playerIndex === 1) {
      player1.col = 3;
      player1.row = row;
      facingDx1 = 0;
      facingDy1 = -1;
    } else {
      player2.col = 6;
      player2.row = row;
      facingDx2 = 0;
      facingDy2 = -1;
    }
  }

  function resetLocalPlayersPositions() {
    resetLocalPlayerPosition(1);
    resetLocalPlayerPosition(2);
  }

  function resetCommonState() {
    icebergs = [];
    gameState.gameOver = false;
    gameState.paused = false;
    gameState.pauseAccumulated = 0;
    gameState.pauseStartedAt = null;
    lastIcebergMoveTime = 0;
    lastIcebergSpawnTime = 0;
  }

  function resetSingleState() {
    savedBears = 0;
    carryingBear = false;
    resetPlayerPositionSingle();
    clearDirectionSingle();
    lastStepDx = 0;
    lastStepDy = 0;
    lastMoveTime = 0;
    facingDx = 0;
    facingDy = -1;
  }

  function resetLocal2State() {
    savedBears1 = 0;
    savedBears2 = 0;
    carryingBear1 = false;
    carryingBear2 = false;
    resetLocalPlayersPositions();
    clearDirectionForPlayer(1);
    clearDirectionForPlayer(2);
    lastStepDx1 = 0;
    lastStepDy1 = 0;
    lastStepDx2 = 0;
    lastStepDy2 = 0;
    lastMoveTime1 = 0;
    lastMoveTime2 = 0;
    facingDx1 = 0;
    facingDy1 = -1;
    facingDx2 = 0;
    facingDy2 = -1;
  }

  function startGame() {
    resetCommonState();

    if (gameMode === "local2" || (gameMode === "online2" && onlineIsHost)) {
      // два гравці: локальний мультиплеєр або хост в online2
      resetLocal2State();
    } else {
      // звичайний одиночний режим (включаючи гостя в online2)
      resetSingleState();
    }

    gameState.gameStarted = true;
    gameState.roundStartTime = Date.now();
  }


  // ----- МАЛЮВАННЯ ГОЛОВИ ВЕДМЕДЯ -----
  function drawBearHead(x, y, bodyRadius) {
    const earRadius = bodyRadius * 0.4;

    ctx.save();

    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "rgba(0, 0, 60, 0.8)";
    ctx.lineWidth = 2;

    // Тіло
    ctx.beginPath();
    ctx.arc(x, y, bodyRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Вушка
    ctx.beginPath();
    ctx.arc(x - bodyRadius * 0.6, y - bodyRadius * 0.6, earRadius, 0, Math.PI * 2);
    ctx.arc(x + bodyRadius * 0.6, y - bodyRadius * 0.6, earRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Ніс
    ctx.fillStyle = "#333333";
    ctx.beginPath();
    ctx.arc(x, y + bodyRadius * 0.15, bodyRadius * 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Очі
    ctx.beginPath();
    const eyeOffsetX = bodyRadius * 0.35;
    const eyeOffsetY = bodyRadius * 0.15;
    ctx.arc(x - eyeOffsetX, y - eyeOffsetY, bodyRadius * 0.08, 0, Math.PI * 2);
    ctx.arc(x + eyeOffsetX, y - eyeOffsetY, bodyRadius * 0.08, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ====== НОВЫЙ ЦИКЛ: updateGame / renderGame / loop ======

function updateGame(now) {
  // Если мы гость в онлайн-комнате – ничего локально не считаем,
  // просто ждём сетевой state от хоста
  if (onlineRoomId && !onlineIsHost) {
    return;
  }

  if (gameState.gameStarted && !gameState.gameOver && !gameState.paused) {
    updateTimer(now);

    if (gameMode === "local2" || (gameMode === "online2" && onlineIsHost)) {
      // два гравці: або локальний мультиплеєр, або хост в онлайн-режимі
      handleMovementLocal2(now);
    } else {
      // звичайний одиночний режим
      handleMovementSingle(now);
    }

    handleIcebergs(now);
  }
}


  function renderGame(now) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Океан
    const oceanGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    oceanGradient.addColorStop(0, "#002b55");
    oceanGradient.addColorStop(1, "#005080");
    ctx.fillStyle = oceanGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Північний полюс
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

    if (gameMode === "local2" || gameMode === "online2") {
      // два гравці: локальний мультиплеєр + онлайн-режим
      drawPlayersLocal2();
    } else {
      // звичайний одиночний режим
      drawSinglePlayer();
    }


    drawScore();
    drawTimer(now);

    if (gameState.gameOver) {
      drawGameOverOverlay();
    }
  }

  function loop() {
    const now = Date.now();
    updateGame(now);
    renderGame(now);
    // Онлайн-синхронізація (якщо є кімната)
    handleOnlineSync(now);
    requestAnimationFrame(loop);
  }


  // ===== СЕТЕВОЕ СОСТОЯНИЕ: buildNetState / applyNetState (поки не використовуються) =====

  function buildNetState() {
    // Збираємо мінімально необхідне для онлайн-синхронізації
    return {
      mode: gameState.mode,
      game: {
        gameStarted: gameState.gameStarted,
        gameOver: gameState.gameOver,
        paused: gameState.paused,
        roundStartTime: gameState.roundStartTime,
        pauseAccumulated: gameState.pauseAccumulated,
        pauseStartedAt: gameState.pauseStartedAt,
      },
      single: {
        player: { col: player.col, row: player.row },
        facingDx,
        facingDy,
        desiredDx,
        desiredDy,
        lastMoveTime,
        lastStepDx,
        lastStepDy,
        carryingBear,
        savedBears,
      },
      local2: {
        player1: {
          col: player1.col,
          row: player1.row,
          facingDx: facingDx1,
          facingDy: facingDy1,
          desiredDx: desiredDx1,
          desiredDy: desiredDy1,
          lastMoveTime: lastMoveTime1,
          lastStepDx: lastStepDx1,
          lastStepDy: lastStepDy1,
          carryingBear: carryingBear1,
          savedBears: savedBears1,
        },
        player2: {
          col: player2.col,
          row: player2.row,
          facingDx: facingDx2,
          facingDy: facingDy2,
          desiredDx: desiredDx2,
          desiredDy: desiredDy2,
          lastMoveTime: lastMoveTime2,
          lastStepDx: lastStepDx2,
          lastStepDy: lastStepDy2,
          carryingBear: carryingBear2,
          savedBears: savedBears2,
        },
      },
      icebergs: icebergs.map((ice) => ({
        row: ice.row,
        col: ice.col,
        variant: ice.variant,
      })),
      icebergTiming: {
        lastIcebergMoveTime,
        lastIcebergSpawnTime,
      },
    };
  }

  function applyNetState(state) {
    if (!state || typeof state !== "object") return;

    // Режим
    if (typeof state.mode === "string") {
      gameState.mode = state.mode;
      gameMode = state.mode;
    }

    // Глобальний стан гри
    if (state.game) {
      const g = state.game;
      if (typeof g.gameStarted === "boolean") gameState.gameStarted = g.gameStarted;
      if (typeof g.gameOver === "boolean") gameState.gameOver = g.gameOver;
      if (typeof g.paused === "boolean") gameState.paused = g.paused;
      if (typeof g.roundStartTime === "number") gameState.roundStartTime = g.roundStartTime;
      if (typeof g.pauseAccumulated === "number")
        gameState.pauseAccumulated = g.pauseAccumulated;
      if (g.pauseStartedAt === null || typeof g.pauseStartedAt === "number") {
        gameState.pauseStartedAt = g.pauseStartedAt;
      }
    }

    // Одиночний режим
    if (state.single) {
      const s = state.single;
      if (s.player) {
        if (typeof s.player.col === "number") player.col = s.player.col;
        if (typeof s.player.row === "number") player.row = s.player.row;
      }
      if (typeof s.facingDx === "number") facingDx = s.facingDx;
      if (typeof s.facingDy === "number") facingDy = s.facingDy;
      if (typeof s.desiredDx === "number") desiredDx = s.desiredDx;
      if (typeof s.desiredDy === "number") desiredDy = s.desiredDy;
      if (typeof s.lastMoveTime === "number") lastMoveTime = s.lastMoveTime;
      if (typeof s.lastStepDx === "number") lastStepDx = s.lastStepDx;
      if (typeof s.lastStepDy === "number") lastStepDy = s.lastStepDy;
      if (typeof s.carryingBear === "boolean") carryingBear = s.carryingBear;
      if (typeof s.savedBears === "number") savedBears = s.savedBears;
    }

    // Локальний мультиплеєр (двох гравців)
    if (state.local2) {
      const l = state.local2;
      if (l.player1) {
        const p1 = l.player1;
        if (typeof p1.col === "number") player1.col = p1.col;
        if (typeof p1.row === "number") player1.row = p1.row;
        if (typeof p1.facingDx === "number") facingDx1 = p1.facingDx;
        if (typeof p1.facingDy === "number") facingDy1 = p1.facingDy;
        if (typeof p1.desiredDx === "number") desiredDx1 = p1.desiredDx;
        if (typeof p1.desiredDy === "number") desiredDy1 = p1.desiredDy;
        if (typeof p1.lastMoveTime === "number") lastMoveTime1 = p1.lastMoveTime;
        if (typeof p1.lastStepDx === "number") lastStepDx1 = p1.lastStepDx;
        if (typeof p1.lastStepDy === "number") lastStepDy1 = p1.lastStepDy;
        if (typeof p1.carryingBear === "boolean") carryingBear1 = p1.carryingBear;
        if (typeof p1.savedBears === "number") savedBears1 = p1.savedBears;
      }
      if (l.player2) {
        const p2 = l.player2;
        if (typeof p2.col === "number") player2.col = p2.col;
        if (typeof p2.row === "number") player2.row = p2.row;
        if (typeof p2.facingDx === "number") facingDx2 = p2.facingDx;
        if (typeof p2.facingDy === "number") facingDy2 = p2.facingDy;
        if (typeof p2.desiredDx === "number") desiredDx2 = p2.desiredDx;
        if (typeof p2.desiredDy === "number") desiredDy2 = p2.desiredDy;
        if (typeof p2.lastMoveTime === "number") lastMoveTime2 = p2.lastMoveTime;
        if (typeof p2.lastStepDx === "number") lastStepDx2 = p2.lastStepDx;
        if (typeof p2.lastStepDy === "number") lastStepDy2 = p2.lastStepDy;
        if (typeof p2.carryingBear === "boolean") carryingBear2 = p2.carryingBear;
        if (typeof p2.savedBears === "number") savedBears2 = p2.savedBears;
      }
    }

    // Айсберги
    if (Array.isArray(state.icebergs)) {
      icebergs = state.icebergs
        .filter(
          (ice) =>
            ice &&
            typeof ice.row === "number" &&
            typeof ice.col === "number" &&
            typeof ice.variant === "number"
        )
        .map((ice) => ({
          row: ice.row,
          col: ice.col,
          variant: ice.variant,
        }));
    }

    // Таймінги айсбергів
    if (state.icebergTiming) {
      const t = state.icebergTiming;
      if (typeof t.lastIcebergMoveTime === "number")
        lastIcebergMoveTime = t.lastIcebergMoveTime;
      if (typeof t.lastIcebergSpawnTime === "number")
        lastIcebergSpawnTime = t.lastIcebergSpawnTime;
    }
  }
  function handleOnlineSync(now) {
    // Якщо немає активної онлайн-кімнати — нічого не робимо
    if (!onlineRoomId) return;

    const helpers = getFirebaseHelpers();
    if (!helpers) return;

    const { db, refFn, setFn, getFn } = helpers;
    const stateRef = refFn(db, `rooms/${onlineRoomId}/state`);

    if (onlineIsHost) {
      // МИ ХОСТ

      // Обмежуємо частоту синхронізації
      if (now - lastHostSyncTime < NET_SYNC_INTERVAL_MS) return;
      lastHostSyncTime = now;

      // Додатково: перевіряємо, чи вже є гість у кімнаті
      if (!onlineGuestJoined) {
        const guestRef = refFn(db, `rooms/${onlineRoomId}/guest`);
        getFn(guestRef)
          .then((snapshot) => {
            if (snapshot.exists()) {
              onlineGuestJoined = true;
              alert("Гість приєднався до кімнати! Можна починати гру.");
            }
          })
          .catch((err) => {
            console.error("Помилка перевірки підключення гостя:", err);
          });
      }

      // 1) ОКРЕМО читаємо останню команду гостя (якщо є)
      const inputRef = refFn(db, `rooms/${onlineRoomId}/inputs/guest`);

      getFn(inputRef)
        .then((snapshot) => {
          if (!snapshot.exists()) {
            // Немає вводу – зупиняємо другого гравця
            if (typeof clearDirectionForPlayer === "function") {
              clearDirectionForPlayer(2);
            }
            return;
          }

          const input = snapshot.val() || {};
          const dx = Number(input.dx) || 0;
          const dy = Number(input.dy) || 0;

          if (dx === 0 && dy === 0) {
            if (typeof clearDirectionForPlayer === "function") {
              clearDirectionForPlayer(2);
            }
          } else {
            if (typeof setDirectionForPlayer === "function") {
              setDirectionForPlayer(2, dx, dy);
            }
          }
        })
        .catch((err) => {
          console.error("Помилка читання вводу гостя:", err);
        });

      // 2) НЕЗАВИСИМО від get() завжди відправляємо стан гри
      const netState = buildNetState();
      setFn(stateRef, netState).catch((err) => {
        console.error("Помилка запису стану кімнати (хост):", err);
      });
    } else {

      // МИ ГОСТЬ — періодично читаємо стан і застосовуємо його
      if (now - lastGuestSyncTime < NET_SYNC_INTERVAL_MS) return;
      lastGuestSyncTime = now;

      getFn(stateRef)
        .then((snapshot) => {
          if (!snapshot.exists()) return;
          const netState = snapshot.val();
          if (netState) {
            applyNetState(netState);
          }
        })
        .catch((err) => {
          console.error("Помилка читання стану кімнати (гість):", err);
        });
    }
  }



  // ===== ДАЛЬШЕ — РИСОВАНИЕ И ЛОГИКА, КАК БЫЛО ======

  function drawPoleLabels() {
    const northHeight = northPoleRows * cellHeight;
    const textY = northHeight * 0.35;

    ctx.textBaseline = "middle";

    // Назва гри — зліва
    ctx.fillStyle = "#cc7a00";
    ctx.font = "bold 20px Segoe UI";
    ctx.textAlign = "left";
    ctx.fillText("Arctic Rescue", 12, textY);

    // Підпис про полюс — по центру
    ctx.fillStyle = "#003366";
    ctx.font = "16px Segoe UI";
    ctx.textAlign = "center";
    ctx.fillText("Північний полюс — білі ведмеді", canvas.width / 2, textY);

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

  // ----- МАЛЮВАННЯ КОРАБЛІВ -----
  function drawSinglePlayer() {
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

    if (boatImage1Loaded) {
      const maxBoatWidth = cellWidth * 0.9;
      const maxBoatHeight = cellHeight * 0.9;

      const imgW = boatImage1.width;
      const imgH = boatImage1.height;
      const imgAspect = imgW / imgH;

      let drawW = maxBoatWidth;
      let drawH = drawW / imgAspect;

      if (drawH > maxBoatHeight) {
        drawH = maxBoatHeight;
        drawW = drawH * imgAspect;
      }

      ctx.drawImage(boatImage1, -drawW / 2, -drawH / 2, drawW, drawH);

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
    ctx.fillText("Гравець", xCenter, yCenter + hullHeight / 2 + 14);
  }

  function drawPlayersLocal2() {
    // Гравець 1
    drawPlayerShip(
      player1,
      facingDx1,
      facingDy1,
      boatImage1,
      boatImage1Loaded,
      "#ffb347",
      "Гравець 1",
      carryingBear1
    );

    // Гравець 2
    drawPlayerShip(
      player2,
      facingDx2,
      facingDy2,
      boatImage2,
      boatImage2Loaded,
      "#ffe066",
      "Гравець 2",
      carryingBear2
    );
  }

  function drawPlayerShip(
    playerObj,
    facingDxLocal,
    facingDyLocal,
    boatImg,
    boatLoaded,
    fallbackColor,
    label,
    hasBearOnBoard
  ) {
    const xCenter = playerObj.col * cellWidth + cellWidth / 2;
    const yCenter = playerObj.row * cellHeight + cellHeight / 2;
    const hullHeight = cellHeight * 0.5;

    let angle = 0;
    if (facingDxLocal === 1 && facingDyLocal === 0) angle = Math.PI / 2;
    else if (facingDxLocal === 0 && facingDyLocal === 1) angle = Math.PI;
    else if (facingDxLocal === -1 && facingDyLocal === 0) angle = -Math.PI / 2;

    ctx.save();
    ctx.translate(xCenter, yCenter);
    ctx.rotate(angle);

    if (boatLoaded) {
      const maxBoatWidth = cellWidth * 0.9;
      const maxBoatHeight = cellHeight * 0.9;

      const imgW = boatImg.width;
      const imgH = boatImg.height;
      const imgAspect = imgW / imgH;

      let drawW = maxBoatWidth;
      let drawH = drawW / imgAspect;

      if (drawH > maxBoatHeight) {
        drawH = maxBoatHeight;
        drawW = drawH * imgAspect;
      }

      ctx.drawImage(boatImg, -drawW / 2, -drawH / 2, drawW, drawH);

      if (hasBearOnBoard) {
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

      ctx.fillStyle = fallbackColor;
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

      if (hasBearOnBoard) {
        const bearRadius = Math.min(cellWidth, cellHeight) * 0.16;
        const bearX = 0;
        const bearY = topY - simpleHullHeight * 0.05;
        drawBearHead(bearX, bearY, bearRadius);
      }
    }

    ctx.restore();

    // Підпис гравця під човном — білий, щоб не зливался з кольором човна
    ctx.fillStyle = "#ffffff";
    ctx.font = "12px Segoe UI";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(label, xCenter, yCenter + hullHeight / 2 + 14);
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

    ctx.font = "16px Segoe UI";
    ctx.textBaseline = "middle";

    if (gameMode === "local2" || gameMode === "online2") {
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "left";
      ctx.fillText(`Гравець 1: ${savedBears1} ведмедів`, 10, y);

      ctx.textAlign = "right";
      ctx.fillText(`Гравець 2: ${savedBears2} ведмедів`, canvas.width - 10, y);
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "left";
      ctx.fillText(`Врятовано: ${savedBears} білих ведмедів`, 10, y);
    }

  }

  // ----- ТАЙМЕР -----
  function updateTimer(now) {
    let effectiveNow = now;
    if (gameState.pauseStartedAt !== null) {
      effectiveNow = gameState.pauseStartedAt;
    }

    const elapsed = effectiveNow - gameState.roundStartTime - gameState.pauseAccumulated;
    const remaining = ROUND_DURATION_MS - elapsed;

    if (remaining <= 0) {
      gameState.gameOver = true;
      clearDirectionSingle();
      clearDirectionForPlayer(1);
      clearDirectionForPlayer(2);
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

    if (!gameState.gameStarted) {
      remaining = ROUND_DURATION_MS;
    } else {
      let effectiveNow = now;
      if (gameState.pauseStartedAt !== null) {
        effectiveNow = gameState.pauseStartedAt;
      }

      const elapsed = effectiveNow - gameState.roundStartTime - gameState.pauseAccumulated;
      remaining = Math.max(0, ROUND_DURATION_MS - elapsed);
    }

    const text = `Час: ${formatTime(remaining)}`;

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

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Заголовок
    ctx.fillStyle = "#ffffff";
    ctx.font = "28px Segoe UI";
    ctx.fillText("Час вийшов!", canvas.width / 2, canvas.height / 2 - 60);

    if (gameMode === "local2" || gameMode === "online2") {
      // Режим двох гравців: показуємо рахунок кожного і хто переміг
      const yBase = canvas.height / 2 - 10;

      ctx.font = "18px Segoe UI";

      // Гравець 1 — помаранчевий
      ctx.fillStyle = "#ffb347";
      ctx.fillText(
        `Гравець 1: ${savedBears1} ведмедів`,
        canvas.width / 2,
        yBase
      );

      // Гравець 2 — жовтий
      ctx.fillStyle = "#ffe066";
      ctx.fillText(
        `Гравець 2: ${savedBears2} ведмедів`,
        canvas.width / 2,
        yBase + 26
      );

      // Хто переміг / нічия
      ctx.fillStyle = "#ffffff";
      ctx.font = "20px Segoe UI";

      let winnerText;
      if (savedBears1 > savedBears2) {
        winnerText = "Переміг Гравець 1!";
      } else if (savedBears2 > savedBears1) {
        winnerText = "Переміг Гравець 2!";
      } else {
        winnerText = "Нічия — гарна команда!";
      }

      ctx.fillText(winnerText, canvas.width / 2, yBase + 56);
    } else {
      // Звичайний одиночний режим: як і було раніше
      ctx.font = "18px Segoe UI";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(
        `Врятовано: ${savedBears} білих ведмедів`,
        canvas.width / 2,
        canvas.height / 2
      );
    }
  }

  // ----- ПОЛЮС / КОНТИНЕНТ -----
  function handleReachNorthPoleSingle() {
    if (!carryingBear) {
      carryingBear = true;
    }
  }

  function handleReachContinentSingle() {
    if (carryingBear) {
      carryingBear = false;
      savedBears += 1;
    }
  }

  function handleReachNorthPoleFor(playerIndex) {
    if (playerIndex === 1) {
      if (!carryingBear1) carryingBear1 = true;
    } else {
      if (!carryingBear2) carryingBear2 = true;
    }
  }

  function handleReachContinentFor(playerIndex) {
    if (playerIndex === 1) {
      if (carryingBear1) {
        carryingBear1 = false;
        savedBears1 += 1;
      }
    } else {
      if (carryingBear2) {
        carryingBear2 = false;
        savedBears2 += 1;
      }
    }
  }

  // ----- РУХ КОРАБЛЯ (ОДИН ГРАВЕЦЬ) -----
  function movePlayer(dx, dy) {
    const newCol = player.col + dx;
    if (newCol >= 0 && newCol < GRID_COLS) {
      player.col = newCol;
    }

    if (dy < 0) {
      if (player.row > 1) {
        player.row -= 1;
      } else if (player.row === 1) {
        handleReachNorthPoleSingle();
      }
    } else if (dy > 0) {
      if (player.row < GRID_ROWS - 2) {
        player.row += 1;
      } else if (player.row === GRID_ROWS - 2) {
        handleReachContinentSingle();
      }
    }
  }

  function handleMovementSingle(now) {
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

  // ----- РУХ КОРАБЛІВ (ДВОЄ ГРАВЦІВ) -----
  function movePlayerFor(playerObj, dx, dy, playerIndex) {
    const newCol = playerObj.col + dx;
    if (newCol >= 0 && newCol < GRID_COLS) {
      playerObj.col = newCol;
    }

    if (dy < 0) {
      if (playerObj.row > 1) {
        playerObj.row -= 1;
      } else if (playerObj.row === 1) {
        handleReachNorthPoleFor(playerIndex);
      }
    } else if (dy > 0) {
      if (playerObj.row < GRID_ROWS - 2) {
        playerObj.row += 1;
      } else if (playerObj.row === GRID_ROWS - 2) {
        handleReachContinentFor(playerIndex);
      }
    }
  }

  function handleMovementForPlayer(index, now) {
    let dx, dy, lastDxRef, lastDyRef, lastMoveRef;

    if (index === 1) {
      dx = desiredDx1;
      dy = desiredDy1;
      lastDxRef = lastStepDx1;
      lastDyRef = lastStepDy1;
      lastMoveRef = lastMoveTime1;
    } else {
      dx = desiredDx2;
      dy = desiredDy2;
      lastDxRef = lastStepDx2;
      lastDyRef = lastStepDy2;
      lastMoveRef = lastMoveTime2;
    }

    if (dx === 0 && dy === 0) return;

    // якщо напрям змінився — невелика пауза перед першим кроком
    if (dx !== lastDxRef || dy !== lastDyRef) {
      if (index === 1) {
        lastStepDx1 = dx;
        lastStepDy1 = dy;
        lastMoveTime1 = now;
      } else {
        lastStepDx2 = dx;
        lastStepDy2 = dy;
        lastMoveTime2 = now;
      }
      return;
    }

    if (now - lastMoveRef < MOVE_DELAY) return;

    if (index === 1) {
      movePlayerFor(player1, dx, dy, 1);
      lastMoveTime1 = now;
    } else {
      movePlayerFor(player2, dx, dy, 2);
      lastMoveTime2 = now;
    }
  }

  function handleMovementLocal2(now) {
    handleMovementForPlayer(1, now);
    handleMovementForPlayer(2, now);
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
    if (gameMode === "local2" || (gameMode === "online2" && onlineIsHost)) {
      // два гравці: локальний мультиплеєр або хост в онлайн-режимі
      for (const iceberg of icebergs) {
        if (iceberg.row === player1.row && iceberg.col === player1.col) {
          handleIcebergCollisionFor(1);
        }
        if (iceberg.row === player2.row && iceberg.col === player2.col) {
          handleIcebergCollisionFor(2);
        }
      }
    } else {
      // одиночний режим (включаючи гостя в online2 — він не рахує фізику)
      for (const iceberg of icebergs) {
        if (iceberg.row === player.row && iceberg.col === player.col) {
          handleIcebergCollisionSingle();
          break;
        }
      }
    }
  }


  function handleIcebergCollisionSingle() {
    if (carryingBear) carryingBear = false;
    resetPlayerPositionSingle();
    clearDirectionSingle();
  }

  function handleIcebergCollisionFor(playerIndex) {
    if (playerIndex === 1) {
      if (carryingBear1) carryingBear1 = false;
      resetLocalPlayerPosition(1);
      clearDirectionForPlayer(1);
    } else {
      if (carryingBear2) carryingBear2 = false;
      resetLocalPlayerPosition(2);
      clearDirectionForPlayer(2);
    }
  }

  // ----- КЕРУВАННЯ НАПРЯМКОМ -----
  function setDirectionSingle(dx, dy) {
    desiredDx = dx;
    desiredDy = dy;
    if (dx !== 0 || dy !== 0) {
      facingDx = dx;
      facingDy = dy;
    }
  }

  function clearDirectionSingle() {
    desiredDx = 0;
    desiredDy = 0;
  }

  function setDirectionForPlayer(playerIndex, dx, dy) {
    if (playerIndex === 1) {
      desiredDx1 = dx;
      desiredDy1 = dy;
      if (dx !== 0 || dy !== 0) {
        facingDx1 = dx;
        facingDy1 = dy;
      }
    } else {
      desiredDx2 = dx;
      desiredDy2 = dy;
      if (dx !== 0 || dy !== 0) {
        facingDx2 = dx;
        facingDy2 = dy;
      }
    }
  }

  function clearDirectionForPlayer(playerIndex) {
    if (playerIndex === 1) {
      desiredDx1 = 0;
      desiredDy1 = 0;
    } else {
      desiredDx2 = 0;
      desiredDy2 = 0;
    }
  }

  // Обгортка для сенсорного джойстика (керує Гравцем 1 у будь-якому режимі)
  function setDirection(dx, dy) {
    if (gameMode === "local2" || (gameMode === "online2" && onlineIsHost)) {
      // сенсорний пульт керує Гравцем 1 у двогравцевих режимах
      setDirectionForPlayer(1, dx, dy);
    } else {
      setDirectionSingle(dx, dy);
    }
  }

  function clearDirection() {
    if (gameMode === "local2" || (gameMode === "online2" && onlineIsHost)) {
      clearDirectionForPlayer(1);
    } else {
      clearDirectionSingle();
    }
  }


  // ----- КЕРУВАННЯ З КЛАВІАТУРИ -----
  function setDirectionFromKeyboardEventSingle(e) {
    const key = e.key;
    const code = e.code;

    // Спочатку фізичні клавіші WASD
    switch (code) {
      case "KeyW":
        setDirectionSingle(0, -1);
        return;
      case "KeyS":
        setDirectionSingle(0, 1);
        return;
      case "KeyA":
        setDirectionSingle(-1, 0);
        return;
      case "KeyD":
        setDirectionSingle(1, 0);
        return;
    }

    // Потім стрілки
    switch (key) {
      case "ArrowUp":
        setDirectionSingle(0, -1);
        break;
      case "ArrowDown":
        setDirectionSingle(0, 1);
        break;
      case "ArrowLeft":
        setDirectionSingle(-1, 0);
        break;
      case "ArrowRight":
        setDirectionSingle(1, 0);
        break;
    }
  }

  function isMovementKeyboardEventSingle(e) {
    const key = e.key;
    const code = e.code;

    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key)) {
      return true;
    }
    if (["KeyW", "KeyA", "KeyS", "KeyD"].includes(code)) {
      return true;
    }
    return false;
  }

  function handleKeyDownLocal2(e) {
    const key = e.key;
    const code = e.code;

    // Гравець 1 — WASD (за code)
    switch (code) {
      case "KeyW":
        setDirectionForPlayer(1, 0, -1);
        return;
      case "KeyS":
        setDirectionForPlayer(1, 0, 1);
        return;
      case "KeyA":
        setDirectionForPlayer(1, -1, 0);
        return;
      case "KeyD":
        setDirectionForPlayer(1, 1, 0);
        return;
    }

    // Гравець 2 — стрілки (за key)
    switch (key) {
      case "ArrowUp":
        setDirectionForPlayer(2, 0, -1);
        break;
      case "ArrowDown":
        setDirectionForPlayer(2, 0, 1);
        break;
      case "ArrowLeft":
        setDirectionForPlayer(2, -1, 0);
        break;
      case "ArrowRight":
        setDirectionForPlayer(2, 1, 0);
        break;
    }
  }

  function handleKeyUpLocal2(e) {
    const key = e.key;
    const code = e.code;

    if (["KeyW", "KeyA", "KeyS", "KeyD"].includes(code)) {
      clearDirectionForPlayer(1);
    }
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key)) {
      clearDirectionForPlayer(2);
    }
  }

  function getDirectionFromArrowKey(e) {
    switch (e.code) {
      case "ArrowUp":
        return { dx: 0, dy: -1 };
      case "ArrowDown":
        return { dx: 0, dy: 1 };
      case "ArrowLeft":
        return { dx: -1, dy: 0 };
      case "ArrowRight":
        return { dx: 1, dy: 0 };
      default:
        return null;
    }
  }

  // НОВАЯ ФУНКЦИЯ: WASD + стрелки в одно направление
  function getDirectionFromAnyKey(e) {
    const code = e.code;
    const key = e.key;

    // Вверх
    if (code === "KeyW" || key === "ArrowUp") {
      return { dx: 0, dy: -1 };
    }

    // Вниз
    if (code === "KeyS" || key === "ArrowDown") {
      return { dx: 0, dy: 1 };
    }

    // Влево
    if (code === "KeyA" || key === "ArrowLeft") {
      return { dx: -1, dy: 0 };
    }

    // Вправо
    if (code === "KeyD" || key === "ArrowRight") {
      return { dx: 1, dy: 0 };
    }

    return null;
  }

  window.addEventListener("keydown", (e) => {
    // ----- ONLINE2: двоє гравців на різних пристроях -----
    if (gameMode === "online2") {
      const dir = getDirectionFromAnyKey(e);
      if (!dir) return;

      e.preventDefault(); // щоб не скролилася сторінка

      if (onlineIsHost) {
        // Хост: будь-які WASD/стрілки керують Гравцем 1
        setDirectionForPlayer(1, dir.dx, dir.dy);
      } else {
        // Гість: будь-які WASD/стрілки шле на сервер для Гравця 2
        sendGuestInput(dir.dx, dir.dy);
      }
      return;
    }

    // ----- LOCAL2: двоє на одному пристрої -----
    if (gameMode === "local2") {
      handleKeyDownLocal2(e);
      return;
    }

    // ----- SINGLE: звичайний одиночний режим -----
    setDirectionFromKeyboardEventSingle(e);
  });


  window.addEventListener("keyup", (e) => {
    // ----- ONLINE2 -----
    if (gameMode === "online2") {
      const dir = getDirectionFromAnyKey(e);
      if (!dir) return;

      e.preventDefault();

      if (onlineIsHost) {
        // Хост: відпустили будь-яку клавішу руху — зупиняємо корабель 1
        clearDirectionForPlayer(1);
      } else {
        // Гість: шлемо (0,0), щоб зупинити корабель 2 у хоста
        sendGuestInput(0, 0);
      }
      return;
    }

    // ----- LOCAL2 -----
    if (gameMode === "local2") {
      handleKeyUpLocal2(e);
      return;
    }

    // ----- SINGLE -----
    if (isMovementKeyboardEventSingle(e)) {
      clearDirectionSingle();
    }
  });




  // ----- ДЖОЙСТИК (сенсорні кнопки) -----
  const btnUp = document.getElementById("btn-up");
  const btnDown = document.getElementById("btn-down");
  const btnLeft = document.getElementById("btn-left");
  const btnRight = document.getElementById("btn-right");

  function attachButtonControls(btn, dx, dy) {
    if (!btn) return;

    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();

      if (gameMode === "online2" && !onlineIsHost) {
        // Гість: кнопки керують другим кораблем через мережу
        sendGuestInput(dx, dy);
      } else {
        // Одиночка, локальний мультиплеєр або хост online2
        // керують локальним Гравцем 1
        setDirection(dx, dy);
      }
    });

    const stop = (e) => {
      e.preventDefault();

      if (gameMode === "online2" && !onlineIsHost) {
        // Гість відпустив кнопку — стоп для корабля 2
        sendGuestInput(0, 0);
      } else {
        clearDirection();
      }
    };

    btn.addEventListener("pointerup", stop);
    btn.addEventListener("pointerleave", stop);
    btn.addEventListener("pointercancel", stop);
  }


  attachButtonControls(btnUp, 0, -1);
  attachButtonControls(btnDown, 0, 1);
  attachButtonControls(btnLeft, -1, 0);
  attachButtonControls(btnRight, 1, 0);

  // ----- СИСТЕМНІ КНОПКИ: СПОЧАТКУ / ЗВУК / СТАРТ-ПАУЗА / МЕНЮ -----
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
      if (btnPause) {
        btnPause.textContent = "ПАУЗА";
      }
    });
  }

  if (btnSound) {
    btnSound.addEventListener("click", () => {
      // Поки що заглушка: просто міняємо вигляд кнопки
      btnSound.classList.toggle("sys-btn-off");
    });
  }

  if (btnPause) {
    btnPause.addEventListener("click", () => {
      // 1) Якщо гру ще не запускали або раунд закінчився — це кнопка СТАРТ
      if (!gameState.gameStarted || gameState.gameOver) {
        // У онлайн-режимі хост НЕ може стартувати, поки гість не приєднався
        if (gameMode === "online2" && onlineIsHost && !onlineGuestJoined) {
          alert(
            "Гість ще не приєднався до кімнати.\n" +
              "Дочекайтеся гостя, а потім натисніть СТАРТ."
          );
          return;
        }

        const intro = document.getElementById("intro");
        const aboutOverlay = document.getElementById("aboutOverlay");
        if (intro) intro.style.display = "none";
        if (aboutOverlay) aboutOverlay.style.display = "none";

        startGame();
        btnPause.textContent = "ПАУЗА";
        return;
      }


      // 2) Інакше — звичайний режим ПАУЗА / СТАРТ
      if (!gameState.paused) {
        gameState.paused = true;
        gameState.pauseStartedAt = Date.now();
        btnPause.textContent = "СТАРТ";
      } else {
        gameState.paused = false;
        if (gameState.pauseStartedAt !== null) {
          gameState.pauseAccumulated += Date.now() - gameState.pauseStartedAt;
          gameState.pauseStartedAt = null;
        }
        btnPause.textContent = "ПАУЗА";
      }
    });
  }

  if (btnOptions) {
    btnOptions.addEventListener("click", () => {
      const aboutOverlay = document.getElementById("aboutOverlay");
      if (aboutOverlay) aboutOverlay.style.display = "flex";
      // Гру спеціально не зупиняємо — гравець сам вирішить, натискати ПАУЗУ чи ні
    });
  }

  // ----- ВІКНА ВИБОРУ РЕЖИМУ / INTRO / ABOUT -----
  const modeOverlay = document.getElementById("modeOverlay");
  const modeSingleBtn = document.getElementById("mode-single");
  const modeLocal2Btn = document.getElementById("mode-local2");
  const modeOnline2Btn = document.getElementById("mode-online2");
  const controlPad = document.getElementById("controlPad");

  // Визначаємо, чи схоже, що це телефон / планшет
  const isProbablyTouch =
    "ontouchstart" in window || (navigator.maxTouchPoints || 0) > 0;
  const isSmallScreen = window.innerWidth <= 800;
  const isMobile = isProbablyTouch && isSmallScreen;

  // Якщо це мобільний пристрій — робимо режим "Двоє гравців (один пристрій)" неактивним
  if (isMobile && modeLocal2Btn) {
    modeLocal2Btn.disabled = true;
    modeLocal2Btn.classList.add("mode-disabled");
  }

  // Показуємо вибір режиму одразу після завантаження сторінки
  if (modeOverlay) {
    modeOverlay.style.display = "flex";
  }
  if (controlPad) {
    controlPad.style.display = "flex"; // за замовчуванням видно (один гравець)
  }

  if (modeSingleBtn && modeOverlay) {
    modeSingleBtn.addEventListener("click", () => {
      gameMode = "single";
      gameState.mode = "single";
      modeOverlay.style.display = "none";
      if (controlPad) controlPad.style.display = "flex";
    });
  }

  if (modeLocal2Btn && modeOverlay) {
    modeLocal2Btn.addEventListener("click", () => {
      gameMode = "local2";
      gameState.mode = "local2";
      modeOverlay.style.display = "none";
      if (controlPad) controlPad.style.display = "none"; // ховаємо круг з сенсорними стрілками
    });
  }

  if (modeOnline2Btn && modeOverlay) {
    modeOnline2Btn.addEventListener("click", () => {
      const input = prompt(
        'Режим "Двоє гравців онлайн".\n\n' +
        "Щоб зіграти онлайн, введіть 4-значний код кімнати (якщо вам його сказав друг).\n" +
        "Або залиште поле порожнім, щоб створити нову кімнату як хост."
      );

      if (input === null) {
        // користувач натиснув Cancel
        return;
      }

      const code = input.trim();
      if (code === "") {
        // створюємо нову кімнату (хост)
        createOnlineRoomAsHost();
      } else {
        // намагаємося приєднатися як гість
        joinOnlineRoomAsGuest(code);
      }

      // Після успішного вибору онлайн-режиму:
      // 1) переключаємо режим гри на online2
      // 2) ховаємо вікно вибору режиму
      gameMode = "online2";
      gameState.mode = "online2"; // <- ДОДАТИ ЦЮ РЯДОК
      modeOverlay.style.display = "none";
    });
  }

  // Вікно INTRO (детальна інструкція)
  const intro = document.getElementById("intro");
  const startButton = document.getElementById("startButton");

  if (startButton && intro) {
    startButton.addEventListener("click", () => {
      intro.style.display = "none";
    });
  }

  // Вікно ABOUT
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
  resetPlayerPositionSingle();
  // Гру не запускаємо автоматично — чекаємо на натискання "СТАРТ" або "СПОЧАТКУ"
  loop();
});
