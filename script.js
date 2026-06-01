// ===== 授業中に調整しやすい主要設定 =====
const TRAIL_INTERVAL_MS = 180;
const MAX_TRAIL_POINTS = 300;
const CALIBRATION_CLICKS_PER_POINT = 1;
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

// WebGazer の永続保存を無効化します（index.html 側でも CDN 読み込み前に指定しています）。
window.saveDataAcrossSessions = false;

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
const gazeCursor = document.getElementById("gazeCursor");
const trailLayer = document.getElementById("trailLayer");
const calibrationLayer = document.getElementById("calibrationLayer");
const calibrationPoint = document.getElementById("calibrationPoint");
const calibrationProgress = document.getElementById("calibrationProgress");
const sampleButtons = document.querySelectorAll(".sample-button");

let isGazeStarted = false;
let latestGaze = null;
let lastTrailTime = 0;
let trailDots = [];
let calibrationIndex = 0;
let calibrationClickCount = 0;
let droppedImageUrl = null;

function setStatus(message) {
  statusText.textContent = message;
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

  if (droppedImageUrl) {
    URL.revokeObjectURL(droppedImageUrl);
    droppedImageUrl = null;
  }
}

function showIframe(url) {
  introPanel.hidden = true;
  droppedImage.hidden = true;
  pageFrame.hidden = false;
  embedNotice.hidden = false;
  pageFrame.src = url;

  if (droppedImageUrl) {
    URL.revokeObjectURL(droppedImageUrl);
    droppedImageUrl = null;
  }
}

function showImage(file) {
  if (droppedImageUrl) {
    URL.revokeObjectURL(droppedImageUrl);
  }

  droppedImageUrl = URL.createObjectURL(file);
  droppedImage.src = droppedImageUrl;
  droppedImage.hidden = false;
  pageFrame.hidden = true;
  introPanel.hidden = true;
  embedNotice.hidden = true;
  pageFrame.removeAttribute("src");
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
    return;
  }

  if (!window.webgazer) {
    setStatus("WebGazer.jsを読み込めませんでした。index.html と同じフォルダに webgazer.js があるか確認してください。");
    return;
  }

  try {
    setStatus("WebGazerを起動中です。ブラウザからカメラ許可を求められたら許可してください。");

    window.webgazer
      .setRegression("ridge")
      .setTracker("TFFacemesh")
      .setGazeListener((data) => {
        if (!data) return;
        updateGaze(data.x, data.y);
      });

    await window.webgazer.begin();
    window.webgazer.showVideoPreview(true);
    window.webgazer.showPredictionPoints(false);
    window.saveDataAcrossSessions = false;

    isGazeStarted = true;
    setStatus("視線追跡を開始しました。次に「9点キャリブレーション」を押すと精度を調整できます。");
  } catch (error) {
    console.error(error);
    setStatus("視線追跡を開始できませんでした。カメラ許可、HTTPS、ブラウザ設定を確認してください。");
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

function startCalibration() {
  if (!isGazeStarted) {
    setStatus("先に「視線追跡開始」を押して、カメラを許可してください。");
    return;
  }

  calibrationIndex = 0;
  calibrationClickCount = 0;
  calibrationLayer.hidden = false;
  moveCalibrationPoint();
  setStatus("9点キャリブレーション中です。青い点を見ながらクリックしてください。");
}

function moveCalibrationPoint() {
  const point = CALIBRATION_POSITIONS[calibrationIndex];
  calibrationPoint.style.left = `${point.x}%`;
  calibrationPoint.style.top = `${point.y}%`;
  calibrationPoint.style.transform = "translate(-50%, -50%)";
  calibrationProgress.textContent = `${calibrationIndex + 1} / ${CALIBRATION_POSITIONS.length}（${point.label}）`;
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
    calibrationProgress.textContent = `${calibrationIndex + 1} / ${CALIBRATION_POSITIONS.length}（あと ${CALIBRATION_CLICKS_PER_POINT - calibrationClickCount} 回クリック）`;
    return;
  }

  calibrationIndex += 1;
  calibrationClickCount = 0;

  if (calibrationIndex >= CALIBRATION_POSITIONS.length) {
    calibrationLayer.hidden = true;
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
showIntro();
