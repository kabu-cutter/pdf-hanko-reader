# PDFハンコリーダー v0.2.5 表示エンジン改善案

作成日: 2026-05-18

## 目的

A4縦以外のPDFでも、端が切れたり横位置スライダーが効かなかったりしないように、PDF表示部分の設計を見直す。

現在の問題は、横位置スライダー単体の不具合というより、PDF表示領域がA4縦前提に近い構造になっていて、横長PDF・大きいPDF・スキャン画像PDFなどで崩れている可能性が高い。

---

## 現在の主な不具合

### 1. 横位置スライダーが動かない

症状:

- スライダーを動かしてもPDF表示位置が変わらない
- 拡大時に左右へ移動できない
- 横スクロールバーが出ない、または使えない

想定原因:

- `scrollLeft` を変更している対象要素が違う
- 実際に横スクロールしている要素が別にある
- `scrollWidth - clientWidth` が 0 になっている
- 中央寄せや固定幅指定により、ブラウザ上は「横にはみ出していない」と判定されている

---

### 2. 拡大時にページ端が切れる

症状:

- ズームするとPDFの端が見えなくなる
- 横長PDFで左端または右端が扱いにくい
- スタンプを押す位置の確認がしづらい

想定原因:

- PDF表示領域が中央寄せ前提になっている
- スクロール担当の要素が明確に分かれていない
- canvasとstampLayerのサイズが完全に同期していない可能性がある

---

## 解決方針

PDFごとにサイズを決め打ちせず、PDF.jsから取得できる本来のページサイズを基準にする。

```js
const viewport = page.getViewport({ scale });
```

この `viewport.width` と `viewport.height` をPDFページの実サイズとして扱う。

つまり、

```text
A4縦だからこの幅
```

ではなく、

```text
PDF.jsが返したページ幅・高さをそのまま使う
```

という方針にする。

---

## 新しい表示構造案

スクロール担当を1つに絞る。

```text
viewerScroller  ← overflow: auto; ここだけがスクロール担当
└─ pageArea
   └─ pageWrap  ← PDF.jsのviewportサイズに合わせる
      ├─ canvas
      └─ stampLayer
```

### 重要ポイント

- `viewerScroller` だけをスクロール対象にする
- `pageWrap` の幅と高さをPDF.jsのviewportに合わせる
- canvasとstampLayerを完全に同じサイズにする
- 無理な中央寄せをやめる
- 基本は左上基準で表示する
- 必要に応じて「ページが表示枠より小さい場合だけ中央寄せ」する

---

## 表示モード案

ズームを単純な倍率操作だけにせず、3つの表示モードを用意する。

### 1. ページ幅に合わせる

横幅が画面に収まる倍率を自動計算する。

```js
scale = viewerWidth / pageWidth;
```

用途:

- 普段読むときの標準表示
- 横長PDFでもまず全体の横幅を収めたいとき

---

### 2. ページ全体を表示

縦横どちらも画面内に収まる倍率を自動計算する。

```js
scale = Math.min(viewerWidth / pageWidth, viewerHeight / pageHeight);
```

用途:

- まずページ全体を確認したいとき
- ゴミカレンダーのような1ページ全体を俯瞰したいPDF

---

### 3. 手動ズーム

ユーザーが倍率を自由に変更する。

用途:

- 細かい文字を読む
- スタンプ位置を細かく確認する
- 必要に応じて拡大して読む

---

## 横位置スライダーの修正方針

横位置スライダーは、必ず `viewerScroller.scrollLeft` と同期する。

```js
viewerScroller.scrollLeft = Number(horizontalSlider.value);
```

スライダー範囲は以下で決める。

```js
maxScrollLeft = viewerScroller.scrollWidth - viewerScroller.clientWidth;
horizontalSlider.max = maxScrollLeft;
```

### 条件

- `maxScrollLeft > 0` のときだけ横位置スライダーを有効化する
- `maxScrollLeft === 0` のときは無効化する
- PDF表示直後、ズーム変更後、ウィンドウサイズ変更後にスライダー範囲を再計算する
- ネイティブ横スクロールバーとスライダーを相互同期する

---

## スタンプレイヤーの修正方針

スタンプ位置はページ内の比率で保存する。

```text
xRatio = clickX / pageWidth
yRatio = clickY / pageHeight
```

再表示時は現在のページサイズに合わせて復元する。

```text
x = xRatio * currentPageWidth
y = yRatio * currentPageHeight
```

これにより、ズーム変更後も位置がずれにくくなる。

---

## デバッグ表示案

修正中は、画面上に以下を表示できるようにする。

```text
scrollWidth
clientWidth
scrollLeft
pageWidth
pageHeight
scale
mode
```

目的:

- 横スクロール可能な幅が本当に発生しているか確認する
- スライダーが正しい対象を動かしているか確認する
- A4縦以外のPDFでもpageWidth/pageHeightが正しく取れているか確認する

正式版では非表示、または「デバッグ表示」チェックボックスで切り替える。

---

## v0.2.5で今回入れるもの

### 最優先

- PDF.jsのviewportサイズを基準に表示する
- A4縦前提の固定幅・固定高さをやめる
- `viewerScroller` を唯一のスクロール対象にする
- canvasとstampLayerのサイズを完全一致させる
- 横位置スライダーを `viewerScroller.scrollLeft` と同期する
- 横スクロールバーを確実に出す

### できれば入れる

- 表示モード追加
  - ページ幅に合わせる
  - ページ全体を表示
  - 手動ズーム
- デバッグ表示
  - scrollWidth
  - clientWidth
  - scrollLeft
  - pageWidth
  - pageHeight
  - scale

---

## 今回は見送るもの

- Chrome拡張化
- カーソル付近のスタンププレビュー
- 高度な文字サイズ自動判定
- スタンプ管理画面
- PDFへの直接書き込み
- 複数ページ同時表示

---

## 履歴機能の方針

### URL PDF

- 履歴からワンクリックで開けるようにする

### ローカルPDF

ブラウザ制限があるため、完全なワンクリック再オープンは難しい場合がある。

方針:

- 可能なら File System Access API で再オープン
- 対応していない環境では、同じPDFを選び直す
- 同じPDFを選び直せば、ファイル名に紐づいたハンコ配置を復元する

---

## 今後の作業フロー

ZIPをいきなり生成せず、今後はこの順番で進める。

```text
1. 改善点・不具合をリストアップ
2. 今回入れるもの / 次回以降に回すものに分類
3. 実装方針を整理
4. ユーザー確認
5. OKが出てからZIP生成
```

---

## 次のバージョン候補

### v0.2.5

目的:

A4縦以外のPDFでも崩れない表示エンジンにする。

中心課題:

- 横位置スライダーが動かない問題の根本修正
- 拡大時に端が切れる問題の根本修正
- PDF.jsのviewport基準への移行

---

## メモ

今回の問題は、個別のスライダー処理だけで直すより、PDF表示の土台を作り直すほうが安全。

特に以下を守る。

- PDFページのサイズはPDF.jsのviewportから取得する
- スクロール担当は1つだけにする
- canvasとstampLayerは同じ親要素内に置く
- canvasとstampLayerのサイズは常に一致させる
- スタンプ位置はピクセル固定ではなく比率で保存する
