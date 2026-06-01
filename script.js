// ===== 授業中に調整しやすい主要設定 =====
const TRAIL_INTERVAL_MS = 180;
const GAZE_POLL_INTERVAL_MS = 120;
const WEBGAZER_PREVIEW_WIDTH = 320;
const WEBGAZER_PREVIEW_HEIGHT = 240;
const MAX_TRAIL_POINTS = 300;
const CALIBRATION_CLICKS_PER_POINT = 3;
const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const ACCEPTED_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif"];
const CALIBRATION_POSITIONS = [
  { x: 10, y: 10, label: "左上" },
  { x: 50, y: 10, label: "上中央" },
  { x: 90, y: 10, label: "右上" },
  { x: 10, y: 50, label: "左中央" },
  { x: 50, y: 50, label: "中央" },
  { x: 90, y: 50, label: "右中央" },
  { x: 10, y: 90, label: "左下" },
  { x: 50, y: 90, label: "下中央" },
  { x: 90, y: 90, label: "右下" },
];

// WebGazer の永続保存を無効化します（index.html 側でもローカル版読み込み前に指定しています）。
window.saveDataAcrossSessions = false;

const toolbar = document.getElementById("toolbar");
const urlInput = document.getElementById("urlInput");
const openPageButton = document.getElementById("openPageButton");
const startGazeButton = document.getElementById("startGazeButton");
const calibrationButton = document.getElementById("calibrationButton");
const clearTrailButton = document.getElementById("clearTrailButton");
const clearBackgroundButton = document.getElementById("clearBackgroundButton");
const screenshotSelect = document.getElementById("screenshotSelect");
const openScreenshotButton = document.getElementById("openScreenshotButton");
const statusText = document.getElementById("statusText");
const displayArea = document.getElementById("displayArea");
const pageFrame = document.getElementById("pageFrame");
const droppedImage = document.getElementById("droppedImage");
const introPanel = document.getElementById("introPanel");
const embedNotice = document.getElementById("embedNotice");
const gazeCursor = document.getElementById("gazeCursor");
const trailLayer = document.getElementById("trailLayer");
const calibrationLayer = document.getElementById("calibrationLayer");
const calibrationPoint = document.getElementById("calibrationPoint");
const calibrationProgress = document.getElementById("calibrationProgress");
const sampleButtons = document.querySelectorAll(".sample-button");

let isGazeStarted = false;
let isGazeStarting = false;
let latestGaze = null;
let lastTrailTime = 0;
let trailDots = [];
let calibrationIndex = 0;
let calibrationClickCount = 0;
let droppedImageUrl = null;
let webgazerPreviewPositionTimer = null;
let gazePredictionPollTimer = null;

function setStatus(message) {
  statusText.textContent = message;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function syncToolbarHeight() {
  // ツールバーは画面幅によって折り返すため、実際の高さをCSS変数へ反映します。
  const toolbarHeight = Math.ceil(toolbar.getBoundingClientRect().height);
  document.documentElement.style.setProperty("--toolbar-height", `${toolbarHeight}px`);
  positionWebGazerPreview();
}

function positionWebGazerPreview() {
  // WebGazerのDOM構造では、映像・顔ランドマーク・顔位置判定枠は
  // webgazerVideoContainer の内側で絶対配置されます。子要素をfixedにすると、
  // 顔位置判定枠の計算が壊れて緑色にならないため、移動するのは親コンテナだけにします。
  const top = `${Math.ceil(toolbar.getBoundingClientRect().height) + 16}px`;
  const container = document.getElementById("webgazerVideoContainer");
  if (!container) return;

  container.style.position = "fixed";
  container.style.top = top;
  container.style.left = "16px";
  container.style.width = `${WEBGAZER_PREVIEW_WIDTH}px`;
  container.style.height = `${WEBGAZER_PREVIEW_HEIGHT}px`;
  container.style.zIndex = "1500";

  ["webgazerVideoFeed", "webgazerFaceOverlay"].forEach((id) => {
    const element = document.getElementById(id);
    if (!element) return;
    element.style.position = "absolute";
    element.style.top = "0";
    element.style.left = "0";
  });

  const feedbackBox = document.getElementById("webgazerFaceFeedbackBox");
  if (feedbackBox) {
    feedbackBox.style.position = "absolute";
  }

  if (window.webgazer?.setVideoViewerSize && document.getElementById("webgazerVideoFeed")) {
    try {
      window.webgazer.setVideoViewerSize(WEBGAZER_PREVIEW_WIDTH, WEBGAZER_PREVIEW_HEIGHT);
    } catch (error) {
      // WebGazerの初期化前は内部video要素が未作成のため失敗することがあります。
    }
  }
}

function watchWebGazerPreviewPosition() {
  if (webgazerPreviewPositionTimer) {
    clearInterval(webgazerPreviewPositionTimer);
  }

  positionWebGazerPreview();
  webgazerPreviewPositionTimer = setInterval(positionWebGazerPreview, 500);
}

function startGazePredictionPolling() {
  if (gazePredictionPollTimer) {
    clearInterval(gazePredictionPollTimer);
  }

  gazePredictionPollTimer = setInterval(async () => {
    if (!window.webgazer?.getCurrentPrediction) return;

    try {
      const prediction = await window.webgazer.getCurrentPrediction();
      if (prediction) {
        updateGaze(prediction.x, prediction.y);
      }
    } catch (error) {
      // 初期化直後や顔が検出されない瞬間は予測が失敗することがあるため、次回に再試行します。
    }
  }, GAZE_POLL_INTERVAL_MS);
}

function isAcceptedScreenshotPath(src) {
  const lowerSrc = src.toLowerCase().split(/[?#]/)[0];
  return ACCEPTED_IMAGE_EXTENSIONS.some((extension) => lowerSrc.endsWith(extension));
}

function getScreenshotEntries() {
  if (!Array.isArray(window.SCREENSHOT_IMAGES)) return [];

  return window.SCREENSHOT_IMAGES
    .map((entry) => {
      if (typeof entry === "string") {
        return { label: entry.replace(/^screenshots\//, ""), src: entry };
      }
      return entry;
    })
    .filter((entry) => entry?.src && isAcceptedScreenshotPath(entry.src));
}

function populateScreenshotOptions() {
  const screenshotEntries = getScreenshotEntries();
  screenshotSelect.innerHTML = "";

  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.textContent = screenshotEntries.length
    ? "画像を選択してください"
    : "screenshots/manifest.js に画像を登録";
  screenshotSelect.appendChild(placeholderOption);

  screenshotEntries.forEach((entry) => {
    const option = document.createElement("option");
    option.value = entry.src;
    option.textContent = entry.label || entry.src.replace(/^screenshots\//, "");
    screenshotSelect.appendChild(option);
  });

  const isEmpty = screenshotEntries.length === 0;
  screenshotSelect.disabled = isEmpty;
  openScreenshotButton.disabled = isEmpty;
}

function openSelectedScreenshot() {
  const selectedOption = screenshotSelect.selectedOptions[0];
  const src = selectedOption?.value;
  if (!src) {
    setStatus("screenshots フォルダの画像を使うには、screenshots/manifest.js に画像を登録してください。");
    return;
  }

  showScreenshotImage(src, selectedOption.textContent);
  setStatus("登録済み画像を表示しました。視線カーソルと軌跡を重ねて観察できます。");
}

function normalizeUrl(rawUrl) {
  const trimmedUrl = rawUrl.trim();
  if (!trimmedUrl) return "";
  if (/^https?:\/\//i.test(trimmedUrl)) return trimmedUrl;
  return `https://${trimmedUrl}`;
}

function showIntro() {
  introPanel.hidden = false;
  pageFrame.hidden = true;
  droppedImage.hidden = true;
  embedNotice.hidden = true;
  pageFrame.removeAttribute("src");
  droppedImage.removeAttribute("src");

  clearDroppedImageObjectUrl();
}

function showIframe(url) {
  introPanel.hidden = true;
  droppedImage.hidden = true;
  pageFrame.hidden = false;
  embedNotice.hidden = false;
  pageFrame.src = url;

  clearDroppedImageObjectUrl();
}

function clearDroppedImageObjectUrl() {
  if (droppedImageUrl) {
    URL.revokeObjectURL(droppedImageUrl);
    droppedImageUrl = null;
  }
}

function showImageSource(src, altText) {
  droppedImage.src = src;
  droppedImage.alt = altText;
  droppedImage.hidden = false;
  pageFrame.hidden = true;
  introPanel.hidden = true;
  embedNotice.hidden = true;
  pageFrame.removeAttribute("src");
}

function showImage(file) {
  clearDroppedImageObjectUrl();
  droppedImageUrl = URL.createObjectURL(file);
  showImageSource(droppedImageUrl, file.name || "ドラッグ＆ドロップされた画像");
}

function showScreenshotImage(src, label) {
  clearDroppedImageObjectUrl();
  showImageSource(src, label || "登録済みスクリーンショット画像");
}

function openPageFromInput() {
  const normalizedUrl = normalizeUrl(urlInput.value);
  if (!normalizedUrl) {
    setStatus("URLを入力してください。画像を使う場合は表示領域にドラッグ＆ドロップしてください。");
    return;
  }

  urlInput.value = normalizedUrl;
  showIframe(normalizedUrl);
  setStatus("ページをiframeで開きました。表示されない場合は、スクリーンショット画像をドラッグ＆ドロップしてください。");
}

async function startGazeTracking() {
  if (isGazeStarted) {
    setStatus("視線追跡はすでに開始しています。必要に応じて9点キャリブレーションを行ってください。");
    return true;
  }

  if (isGazeStarting) {
    setStatus("WebGazerを起動中です。カメラ許可が出ている場合は許可してください。");
    return true;
  }

  if (!window.webgazer) {
    setStatus("WebGazer.jsを読み込めませんでした。index.html と同じフォルダに webgazer.js があるか確認してください。");
    return false;
  }

  try {
    isGazeStarting = true;
    setStatus("WebGazerを起動中です。ブラウザからカメラ許可を求められたら許可してください。");

    window.webgazer
      .saveDataAcrossSessions(false)
      .setRegression("ridge")
      .setTracker("TFFacemesh")
      .setGazeListener((data) => {
        if (!data) return;
        updateGaze(data.x, data.y);
      });

    const beginResult = window.webgazer.begin(() => {
      isGazeStarted = false;
      isGazeStarting = false;
      setStatus("カメラを開始できませんでした。ブラウザのカメラ許可とHTTPS設定を確認してください。");
    });
    window.webgazer.showVideoPreview(true);
    window.webgazer.showFaceOverlay(true);
    window.webgazer.showFaceFeedbackBox(true);
    window.webgazer.showPredictionPoints(false);
    window.saveDataAcrossSessions = false;

    // 一部のWebGazer.jsでは begin() のPromise解決が遅い/返らない場合があります。
    // カメラが起動しているのにキャリブレーションが押せない状態を避けるため、
    // begin() 呼び出し直後に開始済みとして扱います。
    isGazeStarted = true;
    isGazeStarting = false;
    watchWebGazerPreviewPosition();
    startGazePredictionPolling();
    setStatus("視線追跡を開始しました。次に「9点キャリブレーション」を押すと精度を調整できます。");

    Promise.resolve(beginResult).then(() => {
      positionWebGazerPreview();
    }).catch((error) => {
      console.error(error);
      isGazeStarted = false;
      isGazeStarting = false;
      setStatus("視線追跡を開始できませんでした。カメラ許可、HTTPS、ブラウザ設定を確認してください。");
    });

    return true;
  } catch (error) {
    console.error(error);
    isGazeStarted = false;
    isGazeStarting = false;
    setStatus("視線追跡を開始できませんでした。カメラ許可、HTTPS、ブラウザ設定を確認してください。");
    return false;
  }
}

function updateGaze(x, y) {
  latestGaze = { x, y };
  gazeCursor.style.transform = `translate(${x}px, ${y}px)`;
  gazeCursor.classList.add("visible");

  const now = Date.now();
  if (now - lastTrailTime >= TRAIL_INTERVAL_MS) {
    addTrailDot(x, y);
    lastTrailTime = now;
  }
}

function addTrailDot(x, y) {
  const dot = document.createElement("div");
  dot.className = "trail-dot";
  dot.style.transform = `translate(${x}px, ${y}px)`;
  trailLayer.appendChild(dot);
  trailDots.push(dot);

  while (trailDots.length > MAX_TRAIL_POINTS) {
    const oldestDot = trailDots.shift();
    oldestDot?.remove();
  }
}

function clearTrail() {
  trailDots.forEach((dot) => dot.remove());
  trailDots = [];
  setStatus("視線軌跡を消しました。");
}

function hasWebGazerCameraPreview() {
  const video = document.getElementById("webgazerVideoFeed");
  return Boolean(video?.srcObject || video?.readyState > 0);
}

async function ensureGazeTrackingForCalibration() {
  if (isGazeStarted || isGazeStarting || hasWebGazerCameraPreview()) {
    return true;
  }

  setStatus("キャリブレーションの前にWebGazerを起動します。カメラ許可が出たら許可してください。");
  const started = await startGazeTracking();
  if (!started) return false;

  // WebGazerのクリック学習は現在フレームの目特徴量を使うため、起動直後に少し待ちます。
  await sleep(300);
  return true;
}

async function startCalibration() {
  const canCalibrate = await ensureGazeTrackingForCalibration();
  if (!canCalibrate) return;

  calibrationIndex = 0;
  calibrationClickCount = 0;
  calibrationLayer.hidden = false;
  calibrationLayer.removeAttribute("hidden");
  calibrationLayer.style.display = "block";
  moveCalibrationPoint();
  setStatus(`9点キャリブレーション中です。青い点を見ながら、各点を${CALIBRATION_CLICKS_PER_POINT}回クリックしてください。`);
}

function moveCalibrationPoint() {
  const point = CALIBRATION_POSITIONS[calibrationIndex];
  const toolbarHeight = Math.ceil(toolbar.getBoundingClientRect().height);
  const footerHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--footer-height"), 10) || 0;
  const usableHeight = Math.max(window.innerHeight - toolbarHeight - footerHeight, 120);
  const x = window.innerWidth * (point.x / 100);
  const y = toolbarHeight + usableHeight * (point.y / 100);

  calibrationPoint.style.left = `${x}px`;
  calibrationPoint.style.top = `${y}px`;
  calibrationPoint.style.transform = "translate(-50%, -50%)";
  calibrationProgress.textContent = `${calibrationIndex + 1} / ${CALIBRATION_POSITIONS.length}（${point.label}・${calibrationClickCount + 1}/${CALIBRATION_CLICKS_PER_POINT}回目）`;
}

function handleCalibrationClick(event) {
  event.preventDefault();
  const rect = calibrationPoint.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;

  // WebGazer に「この画面座標を見てクリックした」という学習サンプルを追加します。
  if (window.webgazer?.recordScreenPosition) {
    window.webgazer.recordScreenPosition(x, y, "click");
  }

  calibrationClickCount += 1;
  if (calibrationClickCount < CALIBRATION_CLICKS_PER_POINT) {
    moveCalibrationPoint();
    return;
  }

  calibrationIndex += 1;
  calibrationClickCount = 0;

  if (calibrationIndex >= CALIBRATION_POSITIONS.length) {
    calibrationLayer.hidden = true;
    calibrationLayer.style.display = "none";
    setStatus("キャリブレーション完了です。視線カーソルの動きを確認してください。");
    return;
  }

  moveCalibrationPoint();
}

function handleDragEnter(event) {
  event.preventDefault();
  displayArea.classList.add("drag-over");
}

function handleDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
  displayArea.classList.add("drag-over");
}

function handleDragLeave(event) {
  if (!displayArea.contains(event.relatedTarget)) {
    displayArea.classList.remove("drag-over");
  }
}

function handleDrop(event) {
  event.preventDefault();
  displayArea.classList.remove("drag-over");

  const file = event.dataTransfer.files?.[0];
  if (!file || !ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    setStatus("画像ファイルをドロップしてください。PNG / JPG / JPEG / WebP / GIF に対応しています。");
    return;
  }

  showImage(file);
  setStatus("画像を表示しました。画像の上に視線カーソルと軌跡が重なって表示されます。");
}

droppedImage.addEventListener("error", () => {
  setStatus("画像を読み込めませんでした。screenshots/manifest.js のパス、またはドロップした画像ファイルを確認してください。");
});

openPageButton.addEventListener("click", openPageFromInput);
urlInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") openPageFromInput();
});
startGazeButton.addEventListener("click", startGazeTracking);
calibrationButton.addEventListener("click", startCalibration);
clearTrailButton.addEventListener("click", clearTrail);
openScreenshotButton.addEventListener("click", openSelectedScreenshot);
screenshotSelect.addEventListener("change", () => {
  if (screenshotSelect.value) openSelectedScreenshot();
});
clearBackgroundButton.addEventListener("click", () => {
  showIntro();
  setStatus("背景をクリアしました。URLを開くか、画像をドラッグ＆ドロップしてください。");
});
calibrationPoint.addEventListener("click", handleCalibrationClick);

displayArea.addEventListener("dragenter", handleDragEnter);
displayArea.addEventListener("dragover", handleDragOver);
displayArea.addEventListener("dragleave", handleDragLeave);
displayArea.addEventListener("drop", handleDrop);

sampleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    urlInput.value = button.dataset.url;
    openPageFromInput();
  });
});

// 初期状態を明示します。
syncToolbarHeight();
populateScreenshotOptions();
showIntro();
window.addEventListener("resize", syncToolbarHeight);
