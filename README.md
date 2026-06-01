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

> 注意: `webgazer.js` はCDNから読み込まず、`index.html` と同じフォルダに置いたローカルファイルを読み込みます。
> WebGazer v3 の TFFaceMesh は `mediapipe/face_mesh/` 内の `face_mesh.binarypb` や WASM なども必要です（リポジトリに同梱済み）。

### GitHub Pagesで必要なWebGazer / MediaPipeファイル

通常は、以下の配置で動きます。

```text
index.html
style.css
script.js
webgazer.js
mediapipe/face_mesh/（FaceMesh 用バイナリ一式）
```

`face_mesh.binarypb` などが 404 の場合は、MediaPipe ファイルが見つかっていません。`mediapipe/face_mesh/README.md` を参照してください。

ローカル確認では **必ず HTTP サーバー** を使ってください（`index.html` をダブルクリックして `file://` で開くと CORS エラーになります）。

## 起動

GitHub Pagesに公開するか、ローカル確認の場合は以下のような静的サーバーで開いてください。

```bash
python3 -m http.server 8000
```

その後、ブラウザで `http://localhost:8000/` を開きます。カメラ利用のため、公開時はHTTPS上で使うことを推奨します。

視線追跡の起動は [WebGazer.js 公式](https://webgazer.cs.brown.edu/) と同様に `webgazer.begin()` の完了を待ってから行います。

## プライバシー

この授業用ページでは、視線データやカメラ映像をサーバーに送信・保存しません。
