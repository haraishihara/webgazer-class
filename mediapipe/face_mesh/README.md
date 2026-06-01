# mediapipe/face_mesh

WebGazer v3 の `TFFacemesh` トラッカーを完全ローカルで動かす場合は、MediaPipe FaceMesh の追加ファイルをこのフォルダに置きます。

このリポジトリのPRではバイナリファイルを扱えないため、初期状態では実ファイルを同梱していません。既定の `script.js` は CDN を参照しますが、学校のネットワークなどでCDNが使えない場合は、このフォルダに以下のファイルをダウンロードしてください。

ダウンロード元の例:

`https://unpkg.com/@mediapipe/face_mesh@0.4.1633559619/<ファイル名>`

必要な主なファイル:

- `face_mesh.binarypb`
- `face_mesh_solution_packed_assets.data`
- `face_mesh_solution_packed_assets_loader.js`
- `face_mesh_solution_simd_wasm_bin.data`
- `face_mesh_solution_simd_wasm_bin.js`
- `face_mesh_solution_simd_wasm_bin.wasm`
- `face_mesh_solution_wasm_bin.js`
- `face_mesh_solution_wasm_bin.wasm`

配置後、`script.js` の `MEDIAPIPE_FACE_MESH_SOLUTION_PATH` を次のように変更します。

```js
const MEDIAPIPE_FACE_MESH_SOLUTION_PATH = "./mediapipe/face_mesh";
```

`face_mesh.js` は WebGazer の TFFacemesh 経由では通常不要ですが、MediaPipe FaceMesh を単体で使う教材を追加する場合には同じ配布元から取得できます。
