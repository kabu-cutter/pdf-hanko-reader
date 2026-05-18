# PDFハンコリーダー 起動用ファイル

このZIPには、PDFハンコリーダーをローカルWebサーバーで起動するための補助ファイルが入っています。

## 使い方

PDFハンコリーダー本体の `index.html`、`app.js`、`styles.css` が入っているフォルダへ、以下のファイルをコピーしてください。

- Windows: `start-windows.bat`
- Mac: `start-mac.command`

## Windows

`start-windows.bat` をダブルクリックしてください。

表示されたら、ブラウザで以下を開きます。

```text
http://localhost:8000
```

## Mac

ターミナルで実行権限を付けてください。

```bash
chmod +x start-mac.command
```

その後、`start-mac.command` を実行します。

表示されたら、ブラウザで以下を開きます。

```text
http://localhost:8000
```

## 注意

- Python が必要です。
- すでに8000番ポートを使っている場合は、古いサーバーを止めてから起動してください。
- これはv0.2.5本体の修正版ではなく、起動を楽にする補助ファイルです。
