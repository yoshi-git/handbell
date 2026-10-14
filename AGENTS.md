# Repository Guidelines

## プロジェクト構成とモジュール配置
`bell_score` はハンドベルの譜面を作成・試奏・共有する静的 SPA です（Vite + React + TypeScript、サーバ不要）。エントリーポイントは `src/main.tsx`、ハッシュルーティングは `src/App.tsx` にあります（`#/` 一覧、`#/edit/<id>` マイ曲、`#/sample/<id>` サンプル曲、`#/song?d=<圧縮データ>` 共有URL）。

- `src/model/`: データモデルと純粋関数。`types.ts`（`Song` 型）、`pitch.ts`（音名⇔MIDI変換）、`song.ts`（音符の追加・削除・長さ変更など）、`serialize.ts`（JSON・共有URLの変換と入力検証）
- `src/audio/`: Web Audio。`bell.ts` はベル音の合成、`scheduler.ts` は先読み方式の再生スケジューラ（`Player`）
- `src/components/`: `ScoreGrid.tsx`（音名グリッド。編集時のポインタ操作もここ）、`PlayerPanel.tsx`（担当者一覧とミュート/ソロ）
- `src/pages/`: `SongList.tsx`（一覧）、`Editor.tsx`（編集・試奏・共有・印刷、Undo 履歴）
- `src/storage/localSongs.ts`: localStorage 保存（キー `bellscore.songs`）
- `src/samples/`: `*.bellscore.json` を置くと `import.meta.glob` で自動的にサンプル曲として同梱されます
- `tests/`: Vitest の単体テスト

## ドメインの約束事
- 音名は「オクターブ番号＋音名」で、保存形式は常に♯表記（例: `3A`、`4C#`）。`4A` = 440Hz = MIDI 69。♭表記は表示時のみ（`displayName`）
- 既定の音域は **3A〜5E**（半音を含む20本）。`DEFAULT_RANGE` を変える場合はユーザーに確認すること
- 譜面は縦が音名（高音が上）、横が拍。担当者名は各音名の左に表示し、`Song.assignments`（音名→担当者名）で保持
- 時間の単位は step（1拍 = `subdivisions` step）。音符は `{ pitch, step, length }` で、`length` はベルを響かせる長さ
- 外部から読み込むデータ（JSON・共有URL）は必ず `parseSong` で検証してから使う
- データ形式を変えるときは `Song.version` を上げ、既存の JSON・共有URL・サンプル曲が読めるよう移行処理を入れること
- 曲を公開するギャラリー機能は現時点では対象外です

## ビルド・テスト・開発コマンド
```bash
npm install
npm run dev         # 開発サーバ (http://localhost:5173/)
npm run test        # Vitest
npm run build       # 型チェック + dist/ へビルド（相対パス）
npm run build:site  # 本番サイト用ビルド（base=/handbell/）
```
提出前に `npm run test` と `npm run build` を実行してください。UI に関わる変更は、ブラウザで実際に操作して確認します（配置・長さ変更・削除・試奏・JSON入出力・共有URL）。

## デプロイ
本番は https://www.learnwasei.com/handbell/ です（Azure Static Web Apps）。ソースは別リポジトリ `yoshi-git/static_web`（ローカルは `~/static_web`）で、`site/` 以下がそのまま公開されます。

1. このリポジトリで `npm run build:site` を実行します（`npm run build` は使わない。相対パスだと `/handbell` のようにスラッシュなしのURLで画面が真っ白になる）
2. `dist/` の中身で `~/static_web/site/handbell/` を置き換えます
3. `~/static_web` で `npm test` を実行します
4. commit して `main` に push すると、GitHub Actions で約1分半後に反映されます

push は本番サイトへの公開になるため、ユーザーの了承を得てから行ってください。デプロイ後は本番URLをブラウザで開いて確認します。

## コーディングスタイルと命名規則
TypeScript strict、インデントは 2 スペース、シングルクォート。コンポーネントは `PascalCase.tsx`、それ以外は `camelCase.ts`。ロジックは `src/model/` の純粋関数に置き、コンポーネントからはそれを呼び出します。`Song` はイミュータブルに扱い、変更時は新しいオブジェクトを返します。UI 文言は日本語です。スタイルは `src/styles.css` に集約し、色は `:root` の CSS 変数を使います（ダークモードと印刷用の上書きもここにあります）。依存パッケージの追加・更新は事前承認が必要です。

## テスト方針
`src/model/` を変えたら `tests/` に Vitest のテストを追加・更新します。特に、音名変換、JSON・共有URLの往復、不正データの拒否、同梱サンプル曲が読み込めることは維持してください。

## コミットと Pull Request
コミットメッセージは `Add loop playback` や `Fix note length clamping` のように、命令形で具体的に書きます。リモートは https://github.com/yoshi-git/handbell （`main` ブランチ）です。

## エージェント向け注意事項
無関係なローカル変更は巻き戻さないでください。挙動を変更する場合は、原因、対応策、期待結果を説明してください。ユーザーが作った曲をサンプル曲として同梱する際は、ユーザーから受け取った JSON をそのまま `src/samples/` に置きます。同梱の `twinkle.bellscore.json` は動作確認用の仮のサンプルです。
