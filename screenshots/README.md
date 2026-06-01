# screenshots

授業で使うWebページのスクリーンショット画像をこのフォルダに置きます。

対応形式は PNG / JPG / JPEG / WebP / GIF です。

画像を追加したら、同じフォルダの `manifest.js` に以下のように登録してください。

```js
window.SCREENSHOT_IMAGES = [
  { label: "ニュースサイト例", src: "screenshots/news-example.png" },
  { label: "ECサイト例", src: "screenshots/shop-example.jpg" },
];
```

GitHub Pages などの静的サイトでは、ブラウザからフォルダ内の画像一覧を自動取得できないため、`manifest.js` への登録が必要です。
