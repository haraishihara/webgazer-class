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

## 起動

GitHub Pagesに公開するか、ローカル確認の場合は以下のような静的サーバーで開いてください。

```bash
python3 -m http.server 8000
```

その後、ブラウザで `http://localhost:8000/` を開きます。カメラ利用のため、公開時はHTTPS上で使うことを推奨します。

## プライバシー

この授業用ページでは、視線データやカメラ映像をサーバーに送信・保存しません。
