# CLAUDE.md

`bell_score` はハンドベルの譜面を作成・試奏・共有する静的 SPA です（Vite + React + TypeScript、サーバ不要）。本番は https://www.learnwasei.com/handbell/ 、リモートは https://github.com/yoshi-git/handbell （`main` ブランチ）です。

## 最重要ルール（必ず守る）
- **push は事前にユーザーの了承を得る**。特に `~/static_web` への push は本番公開になる
- **依存パッケージの追加・更新は事前承認が必要**。XML・ZIP の読み込みも依存なしで自前実装している（`xml.ts`、`zip.ts`）
- **`DEFAULT_RANGE`（3A〜5E）を変えるときはユーザーに確認する**
- **外部から読み込むデータ（JSON・共有URL・MusicXML）は必ず `parseSong` で検証してから使う**
- **データ形式を変えるときは `Song.version` を上げ、移行処理を入れる**。既存の JSON・共有URL・サンプル曲は引き続き読めること
- 無関係なローカル変更は巻き戻さない

## コマンド
```bash
npm install
npm run dev         # 開発サーバ (http://localhost:5173/)
npm run test        # Vitest
npm run build       # 型チェック + dist/ へビルド（相対パス）
npm run build:site  # 本番サイト用ビルド（base=/handbell/）
```
作業を終える前に `npm run test` と `npm run build` を実行する。UI に関わる変更はブラウザで実際に操作して確認する（配置・長さ変更・削除・試奏・JSON／MusicXML の入出力・共有URL）。

## 構成
エントリーポイントは `src/main.tsx`。ハッシュルーティングは `src/App.tsx` にある（`#/` 一覧、`#/edit/<id>` マイ曲、`#/sample/<id>` サンプル曲、`#/song?d=<圧縮データ>` 共有URL）。

- `src/model/`: データモデルと純粋関数
  - `types.ts`: `Song` 型（現在 `version: 2`）
  - `pitch.ts`: 音名⇔MIDI 変換、表示名（`displayName`）
  - `song.ts`: 音符の追加・削除・長さ変更、移調、小節の挿入・削除など
  - `serialize.ts`: JSON・共有URL（lz-string）の変換、入力検証（`parseSong`）、旧バージョンからの移行。範囲コピーをクリップボードに載せるテキスト形式（`clipToText`／`parseClip`）もここ
  - `musicxml.ts`: MusicXML の書き出し・読み込み。範囲と担当者は `<miscellaneous>` に入れて往復できるようにしている
  - `xml.ts`: MusicXML 用の小さな XML パーサ（Node には DOMParser がないため自前）
- `src/audio/`: Web Audio。`bell.ts` はベル音の合成、`scheduler.ts` は先読み方式の再生スケジューラ（`Player`）
- `src/components/ScoreGrid.tsx`: 音名グリッド。担当者名・音名・右端の出現回数の列と、編集時のポインタ操作もここにある
- `src/pages/`: `SongList.tsx`（一覧・ファイル読み込み）、`Editor.tsx`（編集・試奏・共有・印刷・書き出し、Undo 履歴）
- `src/storage/localSongs.ts`: localStorage への保存（キー `bellscore.songs`）
- `src/util/`: `file.ts`（ダウンロード・ファイル名）、`zip.ts`（`.mxl` 読み込み）、`colors.ts`（担当者ごとの色）
- `src/samples/`: `*.bellscore.json` を置くと `import.meta.glob` で自動的にサンプル曲として同梱される
- `tests/`: Vitest の単体テスト

## ドメインの約束事
- 音名は「オクターブ番号＋音名」。保存形式は常に♯表記（例: `3A`、`4C#`）。`4A` = 440Hz = MIDI 69
- ♯／♭のどちらで表示するかは曲ごとの設定（`Song.accidental`）。♭は表示と書き出しのときだけ使う
- 既定の音域は 3A〜5E（半音を含む20本）
- 譜面は縦が音名（高音が上）、横が拍。担当者名は各音名の左に表示し、`Song.assignments`（音名→担当者名）で持つ。値は「名前:メモ」とも書け、最初の `:`（全角 `：` も可）より左を担当者名として扱う（色分け・人数もこれで数える）。保存は入力どおり
- 再生の高さ（「音の高さ」で何オクターブ上で鳴らすか）は端末ごとの設定（localStorage、既定は2オクターブ上）で、`Song` には入れない。譜面・書き出しは常に記譜どおり
- 時間の単位は step（1拍 = `subdivisions` step）。音符は `{ pitch, step, length }` で、`length` はベルを響かせる長さ
- ユーザーが作った曲をサンプルとして同梱するときは、受け取った JSON を手を加えずに `src/samples/` に置く
- 曲を公開するギャラリー機能は現時点では対象外

## コーディング規約
- TypeScript strict、インデント 2 スペース、シングルクォート
- コンポーネントは `PascalCase.tsx`、それ以外は `camelCase.ts`
- ロジックは `src/model/` の純粋関数に置き、コンポーネントからはそれを呼ぶ。`Song` はイミュータブルに扱い、変更するときは新しいオブジェクトを返す
- UI の文言は日本語
- スタイルは `src/styles.css` にまとめ、色は `:root` の CSS 変数を使う（ダークモードと印刷用の上書きもここにある）

## テスト方針
`src/model/` を変えたら `tests/` の Vitest テストを追加・更新する。次の点はテストで守り続ける。
- 音名変換
- JSON・共有URL・MusicXML の往復
- 不正なデータを拒否すること
- 同梱のサンプル曲がすべて読み込めること

## コミット
コミットメッセージは英語の命令形で、具体的に書く（例: `Add loop playback`、`Fix note length clamping`）。挙動を変えたときは、原因・対応・期待される結果をユーザーに説明する。

## デプロイ
ホスティングは Azure Static Web Apps。ソースは別リポジトリ `yoshi-git/static_web`（ローカルは `~/static_web`）で、その `site/` 以下がそのまま公開される。

1. このリポジトリで `npm run build:site` を実行する（`npm run build` は使わない。相対パスでビルドすると、`/handbell` のように末尾スラッシュのない URL で画面が真っ白になる）
2. `~/static_web/site/handbell/` の中身を `dist/` の中身で置き換える
3. `~/static_web` で `npm test` を実行する
4. commit し、**ユーザーの了承を得てから** `main` に push する。GitHub Actions で約1分半後に反映される

push 後に反映を待ってポーリング（curl の繰り返しなど）はしない。push できたことを報告して終わり、本番での確認はユーザーに任せる。

## このファイルの更新（自律的に行う）
このファイルはエージェントが読む唯一のプロジェクト指示書なので、実態とずれたら自分で直す。
- **確認なしで更新してよいこと**: ファイルの追加・削除・改名による「構成」の更新、新しいコマンド、作業中にわかった落とし穴（例: 「○○すると画面が真っ白になる」）、記述と実装が食い違っていたときの修正
- **ユーザーの指示があったら反映すること**: ユーザーから「今後は○○して」「○○はしないで」とプロジェクト全体に関わる指示があったとき
- **ユーザーの確認が必要なこと**: 「最重要ルール」とデプロイ手順の変更・削除、承認が必要な操作の範囲を広げる変更
- 更新はできるだけ関連するコードの変更と同じコミットに含め、最後の報告で何を書き換えたかを一言伝える
- 簡潔に保つ。古くなった記述は追記せずに書き換えるか消す。コードや git 履歴を見ればわかる細部（関数の一覧、過去の修正内容）は書かない
- 特定の環境や個人に関わること（サンドボックスの事情、git の作者設定など）はここではなく、エージェントのメモリに書く
