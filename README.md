# webgazer-class

WebGazer.jsを使った授業用の簡易視線追跡Webアプリです。

## 使い方

このリポジトリは、GitHub Pagesなどの静的ホスティングにそのまま置いて使う構成です。npm、ビルド、外部サーバーは不要です。

### 必要なファイル

以下のファイルを同じフォルダに置いてください。

- `index.html`
- `style.css`
- `script.js`
- `webgazer.js`（別途用意したWebGazer.js本体）
- `screenshots/manifest.js`（登録済み画像の一覧）
- `screenshots/` 内のPNG / JPG / JPEG / WebP / GIF画像（任意）

> 注意: `webgazer.js` はCDNから読み込まず、`index.html` と同じフォルダに置いたローカルファイルを読み込みます。
> WebGazer v3 の TFFaceMesh は `face_mesh.binarypb` や WASM などのMediaPipe追加ファイルも必要です。このアプリではバイナリをPRに含めないため、既定では `script.js` の `MEDIAPIPE_FACE_MESH_SOLUTION_PATH` で指定したCDNから追加ファイルを読み込みます。

### GitHub Pagesで必要なWebGazer / MediaPipeファイル

通常は、以下の配置で動きます。

```text
index.html
style.css
script.js
webgazer.js
screenshots/manifest.js
screenshots/README.md
mediapipe/face_mesh/README.md
```

`face_mesh.binarypb` などの404が出る場合は、WebGazer本体ではなく MediaPipe FaceMesh の追加ファイルが見つかっていません。`https://github.com/tensorflow/tfjs-models/tree/master/facemesh` は現在の取得先ではありません。

既定では `script.js` の `MEDIAPIPE_FACE_MESH_SOLUTION_PATH` が次のCDNを指しています。

```js
const MEDIAPIPE_FACE_MESH_SOLUTION_PATH = "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619";
```

このCDNが学校やブラウザ環境で使える場合、追加ファイルの手動配置は不要です。CDNが使えない場合は、`mediapipe/face_mesh/README.md` に書かれたファイルを `https://unpkg.com/@mediapipe/face_mesh@0.4.1633559619/<ファイル名>` からダウンロードし、`mediapipe/face_mesh/` に配置してから、`script.js` の定数を次のように変更してください。

> 注意: `https://app.unpkg.com/...` のページを保存すると、JavaScriptではなくHTMLが保存されます。必ず `https://unpkg.com/...` の生ファイルURL（Raw）を使ってください。

```js
const MEDIAPIPE_FACE_MESH_SOLUTION_PATH = "./mediapipe/face_mesh";
```

### screenshotsフォルダの画像を使う

iframeで埋め込めないWebページを教材にしたい場合は、あらかじめスクリーンショット画像を `screenshots/` フォルダに置いて、`screenshots/manifest.js` に登録します。

```js
window.SCREENSHOT_IMAGES = [
  { label: "ニュースサイト例", src: "screenshots/news-example.png" },
  { label: "ECサイト例", src: "screenshots/shop-example.jpg" },
];
```

登録した画像は、アプリ上部の「画像」メニューから選択して表示できます。GitHub Pagesなどの静的サイトではフォルダ内の画像一覧をブラウザから自動取得できないため、画像を追加したら `manifest.js` も更新してください。

## 起動

GitHub Pagesに公開するか、ローカル確認の場合は以下のような静的サーバーで開いてください。

```bash
python3 -m http.server 8000
```

その後、ブラウザで `http://localhost:8000/` を開きます。カメラ利用のため、公開時はHTTPS上で使うことを推奨します。

## プライバシー

この授業用ページでは、視線データやカメラ映像をサーバーに送信・保存しません。
