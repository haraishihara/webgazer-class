// ===== 授業中に調整しやすい主要設定 =====
const TRAIL_INTERVAL_MS = 180;
const GAZE_POLL_INTERVAL_MS = 120;
const WEBGAZER_PREVIEW_WIDTH = 320;
const WEBGAZER_PREVIEW_HEIGHT = 240;
// WebGazer v3 の TFFaceMesh は MediaPipe の追加ファイルを必要とします。
// バイナリファイルをPRに含めないため、既定ではCDNから読み込みます。
//const MEDIAPIPE_FACE_MESH_SOLUTION_PATH = "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619";

function getMediaPipeFaceMeshSolutionPath() {
  // 末尾スラッシュ付きの絶対URLにし、Worker 内の locateFile 結合を安定させます。
  return new URL("./mediapipe/face_mesh/", window.location.href).toString();
}

const MEDIAPIPE_FACE_MESH_SOLUTION_PATH = getMediaPipeFaceMeshSolutionPath();
const MAX_TRAIL_POINTS = 300;
const CALIBRATION_CLICKS_PER_POINT = 3;
const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
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
const statusText = document.getElementById("statusText");
const displayArea = document.getElementById("displayArea");
const pageFrame = document.getElementById("pageFrame");
const droppedImage = document.getElementById("droppedImage");
const introPanel = document.getElementById("introPanel");
const embedNotice = document.getElementById("embedNotice");
const closeEmbedNoticeButton = document.getElementById("closeEmbedNoticeButton");
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
let isEmbedNoticeDismissed = sessionStorage.getItem("embedNoticeDismissed") === "1";

function setStatus(message) {
  statusText.textContent = message;
}

function updateStartGazeButtonState() {
  if (!startGazeButton) return;
  startGazeButton.disabled = isGazeStarting;
  startGazeButton.textContent = isGazeStarting ? "起動中..." : "視線追跡開始";
}

function ensureHttpServing() {
  if (window.location.protocol !== "file:") {
    return true;
  }
  setStatus("file:// では動作しません。プロジェクトフォルダで python3 -m http.server 8000 を実行し、http://localhost:8000/ を開いてください。");
  return false;
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

function configureWebGazerMediaPipeAssets() {
  if (!window.webgazer?.params) return;

  // WebGazer v3 の params.faceMeshSolutionPath 既定値は ./mediapipe/face_mesh です。
  // GitHubのPRでは face_mesh.binarypb / wasm などのバイナリを同梱しないため、
  // MediaPipe公式npm配布物をCDNから読むように上書きします。
  window.webgazer.params.faceMeshSolutionPath = MEDIAPIPE_FACE_MESH_SOLUTION_PATH;
  window.webgazer.params.showVideoPreview = true;
  window.webgazer.params.showFaceOverlay = true;
  window.webgazer.params.showFaceFeedbackBox = true;
  window.webgazer.params.videoViewerWidth = WEBGAZER_PREVIEW_WIDTH;
  window.webgazer.params.videoViewerHeight = WEBGAZER_PREVIEW_HEIGHT;
}

async function checkMediaPipeAssetsReachable() {
  try {
    const response = await fetch(`${MEDIAPIPE_FACE_MESH_SOLUTION_PATH}face_mesh.binarypb`, { method: "HEAD" });
    return response.ok;
  } catch (error) {
    return false;
  }
}

function hideEmbedNotice() {
  if (!embedNotice) return;
  embedNotice.hidden = true;
}

function dismissEmbedNotice() {
  isEmbedNoticeDismissed = true;
  sessionStorage.setItem("embedNoticeDismissed", "1");
  hideEmbedNotice();
}

function showEmbedNoticeIfAllowed() {
  if (!embedNotice || isEmbedNoticeDismissed) return;
  embedNotice.hidden = false;
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
  hideEmbedNotice();
  pageFrame.removeAttribute("src");
  droppedImage.removeAttribute("src");

  clearDroppedImageObjectUrl();
}

function showIframe(url) {
  introPanel.hidden = true;
  droppedImage.hidden = true;
  pageFrame.hidden = false;
  pageFrame.src = url;
  showEmbedNoticeIfAllowed();

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
  hideEmbedNotice();
  pageFrame.removeAttribute("src");
}

function showImage(file) {
  clearDroppedImageObjectUrl();
  droppedImageUrl = URL.createObjectURL(file);
  showImageSource(droppedImageUrl, file.name || "ドラッグ＆ドロップされた画像");
}

function openPageFromInput() {
  const normalizedUrl = normalizeUrl(urlInput.value);
  if (!normalizedUrl) {
    setStatus("URLを入力してください。画像を使う場合は表示領域にドラッグ＆ドロップしてください。");
    return;
  }

  urlInput.value = normalizedUrl;
  showIframe(normalizedUrl);
  setStatus("ページをiframeで開きました。表示されない場合は、画像をドラッグ＆ドロップしてください。");
}

async function startGazeTracking() {
  if (isGazeStarted) {
    setStatus("視線追跡はすでに開始しています。必要に応じて9点キャリブレーションを行ってください。");
    return true;
  }

  if (isGazeStarting) {
    setStatus("WebGazerを起動中です。カメラ許可が出ている場合は許可してください。");
    return false;
  }

  if (!window.webgazer) {
    setStatus("WebGazer.jsを読み込めませんでした。index.html と同じフォルダに webgazer.js があるか確認してください。");
    return false;
  }

  if (!ensureHttpServing()) {
    return false;
  }

  isGazeStarting = true;
  updateStartGazeButtonState();

  try {
    configureWebGazerMediaPipeAssets();
    setStatus("WebGazerを起動中です。ブラウザからカメラ許可を求められたら許可してください。");

    const isReachable = await checkMediaPipeAssetsReachable();
    if (!isReachable) {
      setStatus("MediaPipe FaceMeshの追加ファイルを読み込めません。mediapipe/face_mesh フォルダの配置を確認してください。");
      return false;
    }

    // 公式デモ（https://webgazer.cs.brown.edu/）と同様に begin() の完了を待ちます。
    // setTracker() は呼ばない（既定の TFFacemesh を使い、二重初期化を避ける）。
    await window.webgazer
      .saveDataAcrossSessions(false)
      .setRegression("ridge")
      .setGazeListener((data) => {
        if (!data) return;
        updateGaze(data.x, data.y);
      })
      .showVideoPreview(true)
      .showFaceOverlay(true)
      .showFaceFeedbackBox(true)
      .showPredictionPoints(false)
      .begin();

    window.saveDataAcrossSessions = false;
    isGazeStarted = true;
    watchWebGazerPreviewPosition();
    startGazePredictionPolling();
    positionWebGazerPreview();
    setStatus("視線追跡を開始しました。次に「9点キャリブレーション」を押すと精度を調整できます。");
    return true;
  } catch (error) {
    console.error(error);
    isGazeStarted = false;
    setStatus("視線追跡を開始できませんでした。カメラ許可、HTTPS、ブラウザ設定を確認してください。");
    return false;
  } finally {
    isGazeStarting = false;
    updateStartGazeButtonState();
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
  setStatus("画像を読み込めませんでした。ドロップした画像ファイルを確認してください。");
});

closeEmbedNoticeButton?.addEventListener("click", dismissEmbedNotice);

openPageButton.addEventListener("click", openPageFromInput);
urlInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") openPageFromInput();
});
startGazeButton.addEventListener("click", startGazeTracking);
calibrationButton.addEventListener("click", startCalibration);
clearTrailButton.addEventListener("click", clearTrail);
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
if (window.webgazer?.params) {
  configureWebGazerMediaPipeAssets();
}
syncToolbarHeight();
showIntro();
updateStartGazeButtonState();
window.addEventListener("resize", syncToolbarHeight);
window.addEventListener("beforeunload", () => {
  if (window.webgazer?.end) {
    window.webgazer.end();
  }
});
