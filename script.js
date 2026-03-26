/**
 * 滑块拼图 — 主脚本
 *
 * 代码按功能分组：
 *   1. 可选图片配置
 *   2. DOM 元素引用
 *   3. 游戏状态
 *   4. 工具函数
 *   5. 最佳成绩记录（localStorage）
 *   6. 图片处理（加载、切片、生成主题图、转 DataURL）
 *   7. 洗牌与可解性判定
 *   8. 计时器
 *   9. 面板渲染
 *  10. 核心游戏逻辑（点击移动、胜利检测）
 *  11. 五彩纸屑动画
 *  12. Google 激励广告 (Ad Placement API)
 *  13. 页面切换
 *  14. 图片选择器
 *  15. 游戏初始化
 *  16. 事件绑定（开始页 / 游戏页 / 弹窗）
 */
(() => {
  "use strict";

  /* ================================================================
     1. 可选图片配置
     ================================================================
     当前使用 Canvas 生成的渐变占位图。

     【如何替换为本地图片】
     将 colors 属性改为 src 属性即可，例如：
       { id: "cat", name: "可爱猫咪", src: "images/cat.jpg" }
     代码会优先使用 src 加载真实图片，无 src 时才用 colors 生成渐变图。
     图片建议为正方形或接近正方形，最小 480×480。
     ================================================================ */

  const PUZZLE_IMAGES = [
    { id: "cat",    name: "可爱猫咪", src: "images/cat.jpg" },
    { id: "dog",    name: "忠诚狗狗", src: "images/dog.jpg" },
    { id: "rabbit", name: "萌萌兔兔", src: "images/rabbit.jpg" },
  ];

  /* ================================================================
     1b. 游戏次数配置
     ================================================================ */

  const MAX_PLAYS = 5;
  // 恢复间隔：10 秒（测试用），生产环境改为 2 * 60 * 1000（2 分钟）
  const RECOVERY_INTERVAL_MS = 10 * 1000;
  const PLAY_STORAGE_KEY = "puzzle_play_data";

  // 分享冷却：10 秒（测试用），生产环境改为 30 * 60 * 1000（30 分钟）
  const SHARE_COOLDOWN_MS = 10 * 1000;
  const SHARE_STORAGE_KEY = "puzzle_share_timestamp";

  /* ================================================================
     2. DOM 元素引用
     ================================================================ */

  const startScreenEl = document.getElementById("start-screen");
  const gameScreenEl  = document.getElementById("game-screen");

  const difficultyBadgeEl = document.getElementById("difficulty-badge");

  const timerEl     = document.getElementById("timer");
  const moveCountEl = document.getElementById("move-count");

  const boardEl = document.getElementById("board");

  const btnBack    = document.getElementById("btn-back");
  const btnRestart = document.getElementById("btn-restart");
  const btnPreview = document.getElementById("btn-preview");

  const victoryOverlayEl = document.getElementById("victory-overlay");
  const confettiCanvasEl = document.getElementById("confetti-canvas");
  const victoryTimeEl    = document.getElementById("victory-time");
  const victoryMovesEl   = document.getElementById("victory-moves");
  const victoryDiffEl    = document.getElementById("victory-diff");
  const btnAgain         = document.getElementById("btn-again");
  const btnHome          = document.getElementById("btn-home");

  const previewModalEl  = document.getElementById("preview-modal");
  const previewFullEl   = document.getElementById("preview-full");
  const btnClosePreview = document.getElementById("btn-close-preview");

  const bestRecordEl    = document.getElementById("best-record");
  const bestDisplayEl   = document.getElementById("best-display");
  const victoryRecordEl = document.getElementById("victory-record");

  // 广告提示 Toast
  const adToastEl = document.getElementById("ad-toast");

  // 游戏次数相关 DOM
  const playCounterEl          = document.getElementById("play-counter");
  const playRemainingEl        = document.getElementById("play-remaining");
  const playRecoveryInfoEl     = document.getElementById("play-recovery-info");
  const gamePlayCounterEl      = document.getElementById("game-play-counter");
  const gamePlayRemainingEl    = document.getElementById("game-play-remaining");
  const gamePlayRecoveryInfoEl = document.getElementById("game-play-recovery-info");
  const playToastEl            = document.getElementById("play-toast");

  // 分享功能相关 DOM
  const btnShareStart        = document.getElementById("btn-share-start");
  const btnShareGame         = document.getElementById("btn-share-game");
  const shareCooldownStartEl = document.getElementById("share-cooldown-start");
  const shareCooldownGameEl  = document.getElementById("share-cooldown-game");
  const shareOverlayEl       = document.getElementById("share-overlay");
  const btnShareConfirm      = document.getElementById("btn-share-confirm");
  const btnShareCancel       = document.getElementById("btn-share-cancel");

  const btnStart            = document.getElementById("btn-start");
  const fileInputEl         = document.getElementById("file-input");
  const uploadPlaceholderEl = document.getElementById("upload-placeholder");
  const previewImgEl        = document.getElementById("preview-img");
  const difficultyBtnEls    = document.querySelectorAll(".diff-btn");
  const imagePickerEl       = document.getElementById("image-picker");

  /* ================================================================
     3. 游戏状态
     ================================================================ */

  let gridSize   = 3;
  let totalTiles = gridSize * gridSize;

  let board          = [];
  let puzzleImageSrc = null;  // 当前拼图使用的完整图片 URL（用于 CSS 背景定位渲染）
  let blankPosition  = 0;
  let moveCount      = 0;
  let elapsedSeconds = 0;
  let timerInterval  = null;
  let isTimerRunning = false;
  let puzzleSolved   = false;

  let imageSrc     = null;
  let imageDataURL = null;

  let selectedImageId = PUZZLE_IMAGES[0].id;
  let useCustomImage  = false;

  let adToastTimeout = null;    // 广告 toast 自动隐藏 timeout

  // 游戏次数状态
  let remainingPlays   = MAX_PLAYS;
  let lastConsumedAt   = 0;        // 上次消耗时间戳（用于恢复计算）
  let recoveryTimerId  = null;     // 恢复检测 interval
  let playToastTimeout = null;     // 次数 toast 自动隐藏 timeout

  // 分享冷却状态
  let shareCooldownTimerId = null; // 冷却倒计时 interval

  /* ================================================================
     4. 工具函数
     ================================================================ */

  function formatTime(totalSeconds) {
    const min = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const sec = String(totalSeconds % 60).padStart(2, "0");
    return `${min}:${sec}`;
  }

  function difficultyLabel() {
    return `${gridSize}×${gridSize}`;
  }

  /* ================================================================
     5. 最佳成绩记录（localStorage）
     ================================================================ */

  const STORAGE_KEY = "puzzle_best_scores";

  function loadBestScores() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveBestScores(scores) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
  }

  function getBestForGrid(size) {
    const scores = loadBestScores();
    return scores[size] || null;
  }

  function updateBestScore(size, moves, seconds) {
    const scores = loadBestScores();
    const prev = scores[size];
    let isNewRecord = false;

    if (!prev) {
      scores[size] = { bestMoves: moves, bestTime: seconds };
      isNewRecord = true;
    } else {
      if (moves < prev.bestMoves) {
        prev.bestMoves = moves;
        isNewRecord = true;
      }
      if (seconds < prev.bestTime) {
        prev.bestTime = seconds;
        isNewRecord = true;
      }
    }

    saveBestScores(scores);
    return isNewRecord;
  }

  function displayBestScore() {
    const best = getBestForGrid(gridSize);
    if (!best) {
      bestRecordEl.hidden = true;
      return;
    }
    bestDisplayEl.textContent = `${best.bestMoves} 步 · ${formatTime(best.bestTime)}`;
    bestRecordEl.hidden = false;
  }

  /* ================================================================
     6. 图片处理（加载、切片、生成主题图、转 DataURL）
     ================================================================ */

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      if (src.startsWith("http://") || src.startsWith("https://")) {
        img.crossOrigin = "anonymous";
      }
      img.onload  = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function sliceImage(img) {
    const squareSize = Math.min(img.naturalWidth, img.naturalHeight);
    const offsetX    = (img.naturalWidth  - squareSize) / 2;
    const offsetY    = (img.naturalHeight - squareSize) / 2;
    const srcTile    = squareSize / gridSize;
    const outTile    = Math.min(320, Math.round(960 / gridSize));

    const urls = [];
    for (let i = 0; i < totalTiles; i++) {
      const row = Math.floor(i / gridSize);
      const col = i % gridSize;
      const canvas = document.createElement("canvas");
      canvas.width = outTile;
      canvas.height = outTile;
      canvas.getContext("2d").drawImage(
        img,
        offsetX + col * srcTile, offsetY + row * srcTile, srcTile, srcTile,
        0, 0, outTile, outTile
      );
      urls.push(canvas.toDataURL("image/jpeg", 0.9));
    }
    return urls;
  }

  /**
   * 用 Canvas 生成一张主题渐变图（正方形）。
   * @param {string[]} colors - 3 个渐变色值
   * @param {number} [size=960] - 画布边长
   */
  function generateThemedImage(colors, size) {
    const S = size || 960;
    const canvas = document.createElement("canvas");
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext("2d");

    const grad = ctx.createLinearGradient(0, 0, S, S);
    grad.addColorStop(0, colors[0]);
    grad.addColorStop(0.5, colors[1]);
    grad.addColorStop(1, colors[2]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, S, S);

    ctx.fillStyle = "rgba(255,255,255,0.10)";
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.arc(
        S * 0.08 + i * S * 0.115,
        S / 2 + Math.sin(i * 0.9) * S * 0.26,
        S * 0.05 + i * S * 0.013,
        0, Math.PI * 2
      );
      ctx.fill();
    }

    ctx.fillStyle = "rgba(255,255,255,0.06)";
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(
        S * 0.2 + i * S * 0.18,
        S * 0.25 + Math.cos(i * 1.2) * S * 0.15,
        S * 0.08 + i * S * 0.015,
        0, Math.PI * 2
      );
      ctx.fill();
    }

    return canvas.toDataURL("image/jpeg", 0.9);
  }

  /** 当所有图片加载失败时的最终回退：带编号的渐变图 */
  function generateFallbackImage() {
    const S = 960;
    const canvas = document.createElement("canvas");
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext("2d");

    const grad = ctx.createLinearGradient(0, 0, S, S);
    grad.addColorStop(0, "#667eea");
    grad.addColorStop(0.5, "#764ba2");
    grad.addColorStop(1, "#f7797d");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, S, S);

    ctx.fillStyle = "rgba(255,255,255,0.1)";
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.arc(80 + i * 110, S / 2 + Math.sin(i * 0.9) * 250, 50 + i * 12, 0, Math.PI * 2);
      ctx.fill();
    }

    const tileW = S / gridSize;
    const fontSize = Math.round(260 / gridSize);
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        const num = r * gridSize + c + 1;
        if (num < totalTiles) {
          ctx.fillText(String(num), c * tileW + tileW / 2, r * tileW + tileW / 2);
        }
      }
    }

    return canvas.toDataURL("image/jpeg", 0.9);
  }

  function imageToDataURL(img) {
    const canvas = document.createElement("canvas");
    canvas.width  = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d").drawImage(img, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.9);
  }

  /**
   * 根据当前选择（内置图 or 自定义上传）返回图片 src。
   * 自定义上传优先；否则从 PUZZLE_IMAGES 查找。
   */
  function resolveImageSrc() {
    if (useCustomImage && imageSrc) {
      return imageSrc;
    }
    const entry = PUZZLE_IMAGES.find(p => p.id === selectedImageId);
    if (entry && entry.src) return entry.src;
    if (entry && entry.colors) return generateThemedImage(entry.colors);
    return null;
  }

  /* ================================================================
     7. 洗牌与可解性判定
     ================================================================ */

  function countInversions(arr) {
    const withoutBlank = arr.filter(v => v !== totalTiles - 1);
    let inversions = 0;
    for (let i = 0; i < withoutBlank.length; i++) {
      for (let j = i + 1; j < withoutBlank.length; j++) {
        if (withoutBlank[i] > withoutBlank[j]) inversions++;
      }
    }
    return inversions;
  }

  function isSolvable(arr) {
    const inversions = countInversions(arr);
    if (gridSize % 2 === 1) {
      return inversions % 2 === 0;
    }
    const blankRow = Math.floor(arr.indexOf(totalTiles - 1) / gridSize);
    const blankRowFromBottom = gridSize - blankRow;
    return (inversions + blankRowFromBottom) % 2 === 0;
  }

  function isBoardSolved(arr) {
    return arr.every((value, index) => value === index);
  }

  function createShuffledBoard() {
    const arr = Array.from({ length: totalTiles }, (_, i) => i);
    do {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
    } while (!isSolvable(arr) || isBoardSolved(arr));
    return arr;
  }

  /* ================================================================
     8. 计时器
     ================================================================ */

  function startTimer() {
    if (timerInterval) return;
    timerInterval = setInterval(() => {
      elapsedSeconds++;
      timerEl.textContent = formatTime(elapsedSeconds);
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  function resetTimer() {
    stopTimer();
    elapsedSeconds = 0;
    timerEl.textContent = "00:00";
  }

  /* ================================================================
     9. 面板渲染
     ================================================================ */

  function renderBoard() {
    boardEl.innerHTML = "";
    boardEl.style.setProperty("--grid", gridSize);

    board.forEach((tileIndex, position) => {
      const div = document.createElement("div");
      div.className = "tile";

      if (tileIndex === totalTiles - 1) {
        div.classList.add("blank");
      } else {
        // 使用 CSS 背景定位显示完整图片的对应区域，避免 canvas tainted 问题
        const row = Math.floor(tileIndex / gridSize);
        const col = tileIndex % gridSize;
        div.style.backgroundImage = `url(${puzzleImageSrc})`;
        div.style.backgroundSize = `${gridSize * 100}% ${gridSize * 100}%`;
        const posX = gridSize > 1 ? (col / (gridSize - 1)) * 100 : 0;
        const posY = gridSize > 1 ? (row / (gridSize - 1)) * 100 : 0;
        div.style.backgroundPosition = `${posX}% ${posY}%`;
        div.addEventListener("click", () => handleTileClick(position));
      }

      boardEl.appendChild(div);
    });
  }

  /* ================================================================
     10. 核心游戏逻辑
     ================================================================ */

  function isAdjacent(posA, posB) {
    const rowA = Math.floor(posA / gridSize), colA = posA % gridSize;
    const rowB = Math.floor(posB / gridSize), colB = posB % gridSize;
    return Math.abs(rowA - rowB) + Math.abs(colA - colB) === 1;
  }

  function handleTileClick(position) {
    if (puzzleSolved) return;
    if (!isAdjacent(position, blankPosition)) return;

    if (!isTimerRunning) {
      isTimerRunning = true;
      startTimer();
    }

    [board[position], board[blankPosition]] = [board[blankPosition], board[position]];
    blankPosition = position;

    moveCount++;
    moveCountEl.textContent = moveCount;

    renderBoard();
    checkVictory();
  }

  function checkVictory() {
    if (!isBoardSolved(board)) return;

    puzzleSolved = true;
    stopTimer();

    const isNewRecord = updateBestScore(gridSize, moveCount, elapsedSeconds);
    displayBestScore();

    const tileEls = boardEl.querySelectorAll(".tile:not(.blank)");
    tileEls.forEach((el, i) => {
      setTimeout(() => el.classList.add("tile-win"), i * 60);
    });

    const delay = tileEls.length * 60 + 500;
    setTimeout(() => {
      victoryTimeEl.textContent  = formatTime(elapsedSeconds);
      victoryMovesEl.textContent = moveCount;
      victoryDiffEl.textContent  = difficultyLabel();
      victoryRecordEl.hidden = !isNewRecord;
      victoryOverlayEl.hidden = false;
      launchConfetti();
    }, delay);
  }

  /* ================================================================
     11. 五彩纸屑动画
     ================================================================ */

  function launchConfetti() {
    const ctx = confettiCanvasEl.getContext("2d");
    const W = confettiCanvasEl.width  = window.innerWidth;
    const H = confettiCanvasEl.height = window.innerHeight;

    const PALETTE = [
      "#4f6ef7", "#f7797d", "#764ba2", "#ffd166",
      "#06d6a0", "#118ab2", "#ef476f", "#ffc43d",
    ];

    const PIECE_COUNT = 120;
    const MAX_FRAMES  = 180;
    const FADE_START  = MAX_FRAMES - 40;

    const pieces = Array.from({ length: PIECE_COUNT }, () => ({
      x: Math.random() * W,
      y: Math.random() * H - H,
      w: 6 + Math.random() * 8,
      h: 4 + Math.random() * 6,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.15,
      vy: 1.5 + Math.random() * 3,
      vx: (Math.random() - 0.5) * 2,
      color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
    }));

    let frame = 0;

    function draw() {
      ctx.clearRect(0, 0, W, H);
      frame++;

      const opacity = frame > FADE_START
        ? 1 - (frame - FADE_START) / (MAX_FRAMES - FADE_START)
        : 1;

      for (const p of pieces) {
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;
        p.vy += 0.04;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = Math.max(0, opacity);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }

      if (frame < MAX_FRAMES) {
        requestAnimationFrame(draw);
      } else {
        ctx.clearRect(0, 0, W, H);
      }
    }

    requestAnimationFrame(draw);
  }

  /* ================================================================
     12. Google 激励广告 (Ad Placement API)
     ================================================================
     接入 Google H5 Games Ads（Ad Placement API）激励广告。
     用户点击"预览原图"→ 播放激励广告 → 看完后展示原图。
     SDK 不可用时给出降级提示，不影响游戏主体功能。
     ================================================================ */

  let googleAdsReady = false;

  function showAdToast(msg) {
    if (adToastTimeout) clearTimeout(adToastTimeout);
    adToastEl.textContent = msg;
    adToastEl.hidden = false;
    adToastTimeout = setTimeout(() => {
      adToastEl.hidden = true;
      adToastTimeout = null;
    }, 3000);
  }

  /**
   * 初始化 Google Ad Placement API。
   * 通过轮询检测 adBreak / adConfig 全局函数是否可用。
   */
  function initGoogleAds() {
    function onReady() {
      if (googleAdsReady) return;
      googleAdsReady = true;
      console.log("[GoogleAds] Ad Placement API 就绪");
      try {
        window.adConfig({ preloadAdBreaks: "on", sound: "on" });
      } catch (e) {
        console.warn("[GoogleAds] adConfig 调用失败:", e);
      }
    }

    if (typeof window.adBreak === "function" && typeof window.adConfig === "function") {
      onReady();
      return;
    }

    let attempts = 0;
    const pollId = setInterval(function () {
      attempts++;
      if (typeof window.adBreak === "function" && typeof window.adConfig === "function") {
        clearInterval(pollId);
        onReady();
      } else if (attempts >= 10) {
        clearInterval(pollId);
        console.warn("[GoogleAds] SDK 初始化超时，广告功能不可用");
      }
    }, 1000);
  }

  /**
   * 用户点击"预览原图"时调用。
   * 优先使用 Google Ad Placement API 激励广告；SDK 不可用时降级为模拟广告倒计时。
   */
  function showRewardAd() {
    if (!imageDataURL) return;

    if (googleAdsReady && typeof window.adBreak === "function") {
      console.log("[GoogleAds] 开始请求激励广告");
      showAdToast("正在加载广告…");
      let rewarded = false;
      window.adBreak({
        type: "reward",
        name: "preview-original",
        beforeReward: function (showAdFn) {
          console.log("[GoogleAds] beforeReward 回调触发");
          showAdFn();
        },
        beforeAd: function () {
          console.log("[GoogleAds] beforeAd 回调触发 - 广告即将播放");
          adToastEl.hidden = true;
        },
        afterAd: function () {
          console.log("[GoogleAds] afterAd 回调触发 - 广告播放结束");
        },
        adViewed: function () {
          console.log("[GoogleAds] adViewed 回调触发 - 用户看完广告");
          rewarded = true;
          previewFullEl.src = imageDataURL;
          previewModalEl.hidden = false;
        },
        adDismissed: function () {
          console.log("[GoogleAds] adDismissed 回调触发 - 广告被关闭");
          showAdToast("需要看完广告才能查看原图");
        },
        adBreakDone: function (placementInfo) {
          console.log("[GoogleAds] adBreakDone 回调触发", placementInfo);
          if (!placementInfo) {
            console.warn("[GoogleAds] placementInfo 为空");
            return;
          }
          console.log("[GoogleAds] breakStatus:", placementInfo.breakStatus);
          console.log("[GoogleAds] rewarded:", rewarded);
          
          if (placementInfo.breakStatus === "notReady") {
            console.warn("[GoogleAds] 广告状态为 notReady，降级到模拟广告");
            showSimulatedAd();
          } else if (!rewarded && placementInfo.breakStatus === "viewed") {
            console.log("[GoogleAds] 广告已观看但 adViewed 未触发，手动显示预览");
            previewFullEl.src = imageDataURL;
            previewModalEl.hidden = false;
          }
        },
      });
      return;
    }

    console.warn("[GoogleAds] SDK 不可用，使用模拟广告");
    showSimulatedAd();
  }

  /* ---------- 模拟广告降级（Google Ads 不可用时） ---------- */

  const SIM_AD_DURATION = 5;
  let simAdTimerId = null;

  function showSimulatedAd() {
    let remaining = SIM_AD_DURATION;
    showAdToast("广告播放中… " + remaining + "秒");

    simAdTimerId = setInterval(function () {
      remaining--;
      if (remaining > 0) {
        showAdToast("广告播放中… " + remaining + "秒");
      } else {
        clearInterval(simAdTimerId);
        simAdTimerId = null;
        adToastEl.hidden = true;
        previewFullEl.src = imageDataURL;
        previewModalEl.hidden = false;
      }
    }, 1000);
  }

  /* ================================================================
     12b. 游戏次数管理系统
     ================================================================ */

  function loadPlayData() {
    try {
      const raw = localStorage.getItem(PLAY_STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      remainingPlays = typeof data.remainingPlays === "number"
        ? Math.max(0, Math.min(MAX_PLAYS, data.remainingPlays))
        : MAX_PLAYS;
      lastConsumedAt = data.lastConsumedAt || 0;

      // 计算离线期间应恢复的次数
      if (remainingPlays < MAX_PLAYS && lastConsumedAt > 0) {
        const elapsed = Date.now() - lastConsumedAt;
        const recoverable = Math.floor(elapsed / RECOVERY_INTERVAL_MS);
        if (recoverable > 0) {
          remainingPlays = Math.min(MAX_PLAYS, remainingPlays + recoverable);
          // 如果已满则清除时间戳；否则更新为最后一次恢复的时刻
          if (remainingPlays >= MAX_PLAYS) {
            lastConsumedAt = 0;
          } else {
            lastConsumedAt = lastConsumedAt + recoverable * RECOVERY_INTERVAL_MS;
          }
          savePlayData();
        }
      }
    } catch {
      remainingPlays = MAX_PLAYS;
      lastConsumedAt = 0;
    }
  }

  function savePlayData() {
    localStorage.setItem(PLAY_STORAGE_KEY, JSON.stringify({
      remainingPlays,
      lastConsumedAt,
    }));
  }

  function updatePlayDisplay() {
    // 同步两处次数显示
    playRemainingEl.textContent     = remainingPlays;
    gamePlayRemainingEl.textContent = remainingPlays;

    const empty = remainingPlays <= 0;

    // 次数为 0 时高亮容器
    playCounterEl.classList.toggle("play-counter--empty", empty);
    gamePlayCounterEl.classList.toggle("play-counter--empty", empty);

    // 更新按钮状态
    updateButtonStates();

    // 恢复倒计时信息
    updateRecoveryCountdown();

    // 同步分享按钮状态（次数变化可能影响分享可用性）
    updateShareButtonState();
  }

  function updateRecoveryCountdown() {
    if (remainingPlays >= MAX_PLAYS || lastConsumedAt <= 0) {
      playRecoveryInfoEl.hidden     = true;
      gamePlayRecoveryInfoEl.hidden = true;
      return;
    }

    const elapsed   = Date.now() - lastConsumedAt;
    const recovered = Math.floor(elapsed / RECOVERY_INTERVAL_MS);
    const nextAt    = (recovered + 1) * RECOVERY_INTERVAL_MS;
    const msLeft    = Math.max(0, nextAt - elapsed);
    const secLeft   = Math.ceil(msLeft / 1000);

    let text;
    if (secLeft >= 60) {
      const m = Math.floor(secLeft / 60);
      const s = secLeft % 60;
      text = `${m}分${s.toString().padStart(2, "0")}秒后恢复 +1`;
    } else {
      text = `${secLeft}秒后恢复 +1`;
    }

    playRecoveryInfoEl.textContent     = text;
    gamePlayRecoveryInfoEl.textContent = text;
    playRecoveryInfoEl.hidden          = false;
    gamePlayRecoveryInfoEl.hidden      = false;
  }

  function updateButtonStates() {
    const disabled = remainingPlays <= 0;
    btnStart.classList.toggle("btn-play-disabled", disabled);
    btnRestart.classList.toggle("btn-play-disabled", disabled);
    btnAgain.classList.toggle("btn-play-disabled", disabled);
  }

  /**
   * 尝试消耗一次游戏机会。
   * @returns {boolean} 成功消耗返回 true；次数不足返回 false
   */
  function consumePlay() {
    if (remainingPlays <= 0) {
      showPlayToast("今日游戏次数已用完，请等待恢复");
      return false;
    }
    remainingPlays--;
    // 首次从满次数消耗时，记录恢复起点；后续消耗保留已有时间戳
    if (lastConsumedAt <= 0) lastConsumedAt = Date.now();
    savePlayData();
    updatePlayDisplay();
    ensureRecoveryTimer();
    return true;
  }

  function ensureRecoveryTimer() {
    if (recoveryTimerId) return;
    if (remainingPlays >= MAX_PLAYS) return;
    recoveryTimerId = setInterval(recoveryTick, 1000);
  }

  function stopRecoveryTimer() {
    if (recoveryTimerId) {
      clearInterval(recoveryTimerId);
      recoveryTimerId = null;
    }
  }

  function recoveryTick() {
    if (remainingPlays >= MAX_PLAYS) {
      stopRecoveryTimer();
      updatePlayDisplay();
      return;
    }
    if (lastConsumedAt <= 0) {
      stopRecoveryTimer();
      return;
    }

    const elapsed     = Date.now() - lastConsumedAt;
    const recoverable = Math.floor(elapsed / RECOVERY_INTERVAL_MS);

    if (recoverable > 0) {
      const before = remainingPlays;
      remainingPlays = Math.min(MAX_PLAYS, remainingPlays + recoverable);
      const actualRecovered = remainingPlays - before;

      if (remainingPlays >= MAX_PLAYS) {
        lastConsumedAt = 0;
        stopRecoveryTimer();
      } else {
        lastConsumedAt = lastConsumedAt + recoverable * RECOVERY_INTERVAL_MS;
      }
      savePlayData();
      updatePlayDisplay();

      if (actualRecovered > 0) {
        showPlayToast(`剩余次数已恢复 +${actualRecovered}`);
      }
    } else {
      updateRecoveryCountdown();
    }
  }

  function showPlayToast(msg) {
    if (playToastTimeout) clearTimeout(playToastTimeout);
    playToastEl.textContent = msg;
    playToastEl.hidden = false;
    playToastTimeout = setTimeout(() => {
      playToastEl.hidden = true;
      playToastTimeout = null;
    }, 2500);
  }

  /* ================================================================
     12c. 分享功能（模拟微信分享 + 冷却机制）
     ================================================================ */

  function loadShareTimestamp() {
    try {
      const ts = parseInt(localStorage.getItem(SHARE_STORAGE_KEY), 10);
      return Number.isFinite(ts) ? ts : 0;
    } catch {
      return 0;
    }
  }

  function saveShareTimestamp(ts) {
    localStorage.setItem(SHARE_STORAGE_KEY, String(ts));
  }

  /** 返回剩余冷却毫秒数，0 表示冷却已结束 */
  function getShareCooldownRemaining() {
    const lastShare = loadShareTimestamp();
    if (lastShare <= 0) return 0;
    const elapsed = Date.now() - lastShare;
    return Math.max(0, SHARE_COOLDOWN_MS - elapsed);
  }

  function formatCooldownText(ms) {
    const totalSec = Math.ceil(ms / 1000);
    if (totalSec >= 60) {
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      return `还剩${m}分${s.toString().padStart(2, "0")}秒可再次分享`;
    }
    return `还剩${totalSec}秒可再次分享`;
  }

  function updateShareButtonState() {
    const cooldownMs = getShareCooldownRemaining();
    const inCooldown = cooldownMs > 0;

    btnShareStart.classList.toggle("btn-share--cooldown", inCooldown);
    btnShareGame.classList.toggle("btn-share--cooldown", inCooldown);

    if (inCooldown) {
      btnShareStart.textContent = "⏳ 冷却中";
      btnShareGame.textContent  = "⏳ 冷却中";
      const text = formatCooldownText(cooldownMs);
      shareCooldownStartEl.textContent = text;
      shareCooldownGameEl.textContent  = text;
      shareCooldownStartEl.hidden = false;
      shareCooldownGameEl.hidden  = false;
    } else {
      btnShareStart.textContent = "📤 分享得次数";
      btnShareGame.textContent  = "📤 分享得次数";
      shareCooldownStartEl.hidden = true;
      shareCooldownGameEl.hidden  = true;
    }
  }

  function startShareCooldownTimer() {
    if (shareCooldownTimerId) return;
    shareCooldownTimerId = setInterval(() => {
      const remaining = getShareCooldownRemaining();
      updateShareButtonState();
      if (remaining <= 0) {
        stopShareCooldownTimer();
      }
    }, 1000);
  }

  function stopShareCooldownTimer() {
    if (shareCooldownTimerId) {
      clearInterval(shareCooldownTimerId);
      shareCooldownTimerId = null;
    }
  }

  function handleShareClick() {
    // 1) 检查冷却期
    const cooldownMs = getShareCooldownRemaining();
    if (cooldownMs > 0) {
      showPlayToast("每30分钟只能分享得1次机会，请稍后再试");
      return;
    }

    // 2) 检查次数上限
    if (remainingPlays >= MAX_PLAYS) {
      showPlayToast("次数已满，无法增加");
      return;
    }

    // 3) 弹出模拟分享弹窗
    shareOverlayEl.hidden = false;
  }

  function confirmShare() {
    shareOverlayEl.hidden = true;

    // 增加次数（不超上限）
    remainingPlays = Math.min(MAX_PLAYS, remainingPlays + 1);
    savePlayData();
    updatePlayDisplay();

    // 记录分享时间戳并启动冷却倒计时
    saveShareTimestamp(Date.now());
    updateShareButtonState();
    startShareCooldownTimer();

    showPlayToast("分享成功！获得1次游戏机会");
  }

  function cancelShare() {
    shareOverlayEl.hidden = true;
  }

  /* ================================================================
     13. 页面切换
     ================================================================ */

  function showScreen(screenEl) {
    startScreenEl.hidden = true;
    gameScreenEl.hidden  = true;
    screenEl.hidden = false;

    screenEl.style.animation = "none";
    screenEl.offsetHeight;
    screenEl.style.animation = "";
  }

  /* ================================================================
     14. 图片选择器
     ================================================================ */

  function renderImagePicker() {
    imagePickerEl.innerHTML = "";

    PUZZLE_IMAGES.forEach(entry => {
      const card = document.createElement("div");
      card.className = "image-option" +
        (entry.id === selectedImageId && !useCustomImage ? " selected" : "");
      card.dataset.id = entry.id;

      const thumb = document.createElement("div");
      thumb.className = "image-option-thumb";
      if (entry.src) {
        thumb.style.backgroundImage = `url(${entry.src})`;
      } else if (entry.colors) {
        thumb.style.backgroundImage = `url(${generateThemedImage(entry.colors, 200)})`;
      }

      const label = document.createElement("span");
      label.className = "image-option-label";
      label.textContent = entry.name;

      card.appendChild(thumb);
      card.appendChild(label);

      card.addEventListener("click", () => {
        selectedImageId = entry.id;
        useCustomImage = false;
        imageSrc = null;
        fileInputEl.value = "";
        previewImgEl.hidden = true;
        uploadPlaceholderEl.hidden = false;
        renderImagePicker();
      });

      imagePickerEl.appendChild(card);
    });
  }

  /* ================================================================
     15. 游戏初始化
     ================================================================ */

  async function initGame() {
    resetTimer();
    moveCount      = 0;
    moveCountEl.textContent = "0";
    isTimerRunning = false;
    puzzleSolved   = false;
    victoryOverlayEl.hidden = true;

    totalTiles = gridSize * gridSize;
    difficultyBadgeEl.textContent = difficultyLabel();

    const src = resolveImageSrc();

    try {
      await loadImage(src);
      puzzleImageSrc = src;
      // 预览原图：canvas 转换可能因 file:// 协议 tainted 而失败，回退使用原始 src
      if (src.startsWith("data:")) {
        imageDataURL = src;
      } else {
        try {
          const img = await loadImage(src);
          imageDataURL = imageToDataURL(img);
        } catch {
          imageDataURL = src;
        }
      }
    } catch {
      puzzleImageSrc = generateFallbackImage();
      imageDataURL = puzzleImageSrc;
    }

    board         = createShuffledBoard();
    blankPosition = board.indexOf(totalTiles - 1);

    renderBoard();
    displayBestScore();
    showScreen(gameScreenEl);
  }

  /* ================================================================
     16. 事件绑定
     ================================================================ */

  // --- 开始页 ---

  difficultyBtnEls.forEach(btn => {
    btn.addEventListener("click", () => {
      difficultyBtnEls.forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
    });
  });

  fileInputEl.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    previewImgEl.src = url;
    previewImgEl.hidden = false;
    uploadPlaceholderEl.hidden = true;
    imageSrc = url;
    useCustomImage = true;
    renderImagePicker();
  });

  btnStart.addEventListener("click", () => {
    if (!consumePlay()) return;
    const selected = document.querySelector(".diff-btn.selected");
    gridSize   = parseInt(selected.dataset.grid, 10);
    totalTiles = gridSize * gridSize;
    initGame();
  });

  // --- 游戏页 ---

  btnBack.addEventListener("click", () => {
    stopTimer();
    showScreen(startScreenEl);
  });

  btnRestart.addEventListener("click", () => {
    if (!consumePlay()) return;
    initGame();
  });

  btnPreview.addEventListener("click", () => {
    console.log("[Debug] 预览按钮被点击");
    console.log("[Debug] imageDataURL 存在:", !!imageDataURL);
    console.log("[Debug] googleAdsReady:", googleAdsReady);
    console.log("[Debug] adBreak 函数存在:", typeof window.adBreak === "function");
    showRewardAd();
  });

  btnClosePreview.addEventListener("click", () => {
    previewModalEl.hidden = true;
  });

  previewModalEl.addEventListener("click", (e) => {
    if (e.target === previewModalEl) previewModalEl.hidden = true;
  });

  // --- 分享功能 ---

  btnShareStart.addEventListener("click", handleShareClick);
  btnShareGame.addEventListener("click", handleShareClick);

  btnShareConfirm.addEventListener("click", confirmShare);
  btnShareCancel.addEventListener("click", cancelShare);

  shareOverlayEl.addEventListener("click", (e) => {
    if (e.target === shareOverlayEl) cancelShare();
  });

  // --- 胜利弹窗 ---

  btnAgain.addEventListener("click", () => {
    if (!consumePlay()) return;
    victoryOverlayEl.hidden = true;
    initGame();
  });

  btnHome.addEventListener("click", () => {
    victoryOverlayEl.hidden = true;
    showScreen(startScreenEl);
  });

  // --- 初始化图片选择器 ---
  renderImagePicker();

  // --- 初始化游戏次数系统 ---
  loadPlayData();
  updatePlayDisplay();
  ensureRecoveryTimer();

  // --- 初始化分享冷却状态 ---
  updateShareButtonState();
  if (getShareCooldownRemaining() > 0) {
    startShareCooldownTimer();
  }

  // --- 初始化 Google 广告 SDK ---
  initGoogleAds();

  // 页面关闭时清理定时器
  window.addEventListener("beforeunload", () => {
    stopRecoveryTimer();
    stopShareCooldownTimer();
  });
})();
