# mediapipe/face_mesh

WebGazer v3 の `TFFacemesh` トラッカー用の MediaPipe FaceMesh ファイルです。

[WebGazer.js 公式](https://webgazer.cs.brown.edu/) のビルドと同じ構成を `brownhci/WebGazer` の `src/mediapipe/face_mesh` から配置しています。

## 含まれる主なファイル

- `face_mesh.binarypb`
- `face_mesh_solution_packed_assets.data`
- `face_mesh_solution_packed_assets_loader.js`
- `face_mesh_solution_simd_wasm_bin.js`
- `face_mesh_solution_simd_wasm_bin.wasm`
- `face_mesh_solution_wasm_bin.js`
- `face_mesh_solution_wasm_bin.wasm`

## 注意

- ブラウザで `index.html` を直接開く（`file://`）と CORS で失敗します。必ず HTTP サーバー経由で開いてください。
- `https://app.unpkg.com/...` の HTML ページを保存すると動きません。生ファイル URL（`https://unpkg.com/...`）か、このリポジトリ同梱ファイルを使ってください。
