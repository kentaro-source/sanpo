# Sanpo - 歩いて世界一周アプリ

## 🚀 引継ぎサマリ (2026-04-30)

別PCで再開する Claude / 数ヶ月後の自分が**最初に読むべき要点**:

1. **このリポジトリ**: https://github.com/kentaro-source/sanpo (public)
2. **本番URL**: https://kentaro-source.github.io/sanpo/ (push で自動デプロイ、約45秒)
3. **ローカル**: `git clone https://github.com/kentaro-source/sanpo.git C:\dev\sanpo` → `npm install` → `npm run dev`
4. **API キー**: `.env.local` に `VITE_GOOGLE_MAPS_API_KEY=AIzaSyAl8HkXqKTy1_PDDU7-XX4cLQNYfXwrwl8` 必要(localhost:5173 のみ動作)
5. **最新の動作確認**: Android Chrome PWA で動作中、Google Fit 同期成功(13歩実機テスト済み)
6. **次やる作業の最優先**: 実道路距離プリコンピュートスクリプト(下記「次のフェーズ実装」項目1)

git の identity は `kentaro-source` / `kentaro-source@users.noreply.github.com` をローカルセット推奨。

PWAの強制更新は**ヘッダー右の `⟳` ボタン**(SW unregister + cache全削除 + cache-busted reload)。これがあれば push 後の反映で困らない。

## プロジェクト概要
スマホの歩数計と連動して、歩くだけで世界193カ国の首都を一筆書きで巡るシミュレーション。
**Sic Bo（大小）スタイルのベット&ダイス**でマスを進む。**自分用、個人プロジェクト**。

仕様の詳細は `歩いて世界一周アプリ_プロジェクト仕様書.md` を参照。

## 経緯と現在の状態

### 経緯
- 2026-04-16: Phase 1 MVP実装、GitHub Pagesデプロイ、PWA化
- 2026-04-17頃: カザフスタン旅行（手動歩数入力で運用開始）
- 2026-04-29 (前半): Google Fit連携 (OAuth + 自動同期) 実装完了
- 2026-04-29 (午後): Sic Boベット制（カジノ風）に変更、UI伝統マカオ風
- 2026-04-29 (夕方): 都市データ追加（164都市）+ Google Maps切替完了
- 2026-04-29 (夜): 実在ルート化開始 - capitals.ts再構成 (v3) + セグメント分類 (バッチ1-3, 46/193) + Directions API実装
- 2026-04-30: 別PC再開セッション。本番反映周りを大幅整備:
  - PWA自動更新（SWビルドID注入 + controllerchange自動リロード）+ ヘッダーに `⟳` 強制更新ボタン
  - GitHub Actions Secret `VITE_GOOGLE_MAPS_API_KEY` 設定済み（→ 地図がProdで描画されるようになった）
  - `loading=async` を Maps URL から削除（`google.maps.Map` constructor復活、白画面修正）
  - **mixed セグメントを区間ペア毎に Directions API**で描画 → 海を直進せず、陸は道路追従
  - Polyline `geodesic: true` → 海/ファンタジー区間も大圏弧に
  - `seaSegments` 任意フィールドを `SegmentClassification` に追加（明示的に直線にしたい区間用）
  - **マス数を waypoint-aware に**（Tokyo→Seoul 8→11マス、storage version 3→4）
  - 各マスを地図上に小さい点で可視化（通過済み=緑大、未通過=灰小）。perf考慮で**1/3サンプル**+zoom<4で非表示
  - レイアウト変更: `position: fixed; bottom: 0` でパネル下端固定、Diceボタン必ず可視
  - ヘッダー右に `⟳` ボタン: SW unregister + cache全消去 + cache-busted reload
  - アプリ名「**せかいさんぽ**」(index.html, manifest, Header)
  - Google Fit: `sanpo-google-fit-ever-consented` フラグ導入。トークン期限切れでも一度連携した端末は大ボタン非表示。token保存履歴があれば自動でフラグONバックフィル
  - 同期失敗時のみ小さい「再連携が必要です [再連携]」表示
  - Fit query から `dataSourceId` 削除 → 全ソース集計（Health Connect 経由でも歩数取得できるように）
  - 細かい修正: 距離プリコンピュート用 `tsx` 導入（まだ未使用）、各種CSS調整

### デプロイ
- **本番URL**: https://kentaro-source.github.io/sanpo/
- **リポジトリ**: https://github.com/kentaro-source/sanpo
- **デプロイ**: pushすると GitHub Actions で自動デプロイ（`.github/workflows/deploy.yml`）

### 現在の状態 (2026-04-30 引継ぎ)

**動作状況**: 本番URLで完全動作。Android Chrome PWA で動作確認済み。歩数同期も成功(13歩カウントを実機で確認)。

**主要実装ファイル**:
- レイアウト: `src/App.css` — `.app-layout` flex column / map `flex:1` / `.bottom-panel` `position:fixed; bottom:0`
- ヘッダー: `src/components/layout/Header.tsx` — `せかいさんぽ` + visited count + dice token + `⟳` (`hardReload()`)
- マップ: `src/components/map/MapView.tsx` — `loading=async` 無し、Polyline `geodesic:true`、square dots は1/3サンプル+zoom<4で非表示
- ルート描画: mixed セグメントは隣接ペアごとに Directions API、海越え(`seaSegments`明示 or API失敗)は直線
- マス生成: `src/data/generateRoute.ts` — waypoint-aware 距離計算、waypoint パス沿い補間
- Google Fit: `sanpo-google-fit-ever-consented` フラグで二度とボタン非表示、`dataSourceId` 削除で全ソース集計
- PWA更新: `public/sw.js` の `__BUILD_ID__` をビルド時に注入(`vite.config.ts` writeBundle hook)、`controllerchange` で自動リロード

**localStorage キー一覧**:
- `sanpo-game-state` (version 4)
- `sanpo-google-fit-token` (1時間期限)
- `sanpo-google-fit-ever-consented` ("1"なら永続「連携済み」扱い、トークン履歴があればbackfill)
- `sanpo-directions-cache-v1` (Directions API 結果キャッシュ、TTL 30日)

**実装済み (2026-04-29時点)**

#### コアゲーム
- 193カ国首都ルート（東京スタート、合計1,692マス、約230,000km）
- 歩数 → 🎲トークン獲得（7,000歩=1個、上限5個）
- **Sic Bo（大小）ベット制**: 24種のベット、ベット数は可変、複数同時ベット可
- 振るとお椀（シェイカー）が振られて、結果はテーブルに3つのダイス
- 当選: ベット数 × 倍率分マス進行 / 外れ: 0マス
- 首都ボーナス: 新規通過+1🎲、新規ジャスト到着+2🎲（既訪問は0）
- localStorageでセーブ（`sanpo-game-state`、version 1）
- PWA対応（PNGアイコン、Service Worker、manifest.json）

#### Google Fit 連携
- Client ID: `329322197077-ba96t4apoji356kphtccruujp7p3oth3.apps.googleusercontent.com`
- OAuth2 フロー: Google Identity Services トークン方式
- 連携後は **自動同期**（アプリ起動時 + フォーカス復帰時）
- 連携前は大きな「Google Fit と連携」ボタン、連携後は最小ステータス表示

#### サウンド
- Web Audio APIで合成音（アセット不要）
- ダイスのコロコロ音、勝ち/ハズレ/ジャックポット/トークン獲得音

### マス・ゲームバランス
- 全体 1,692マス（150km=1マス、最小5、最大40）
- 最長区間: 40マス（キト→キャンベラ 13,708km）
- 大小×6倍率（EV ≒ 3マス/トークン）→ 1日1万歩で約1年で1周想定

## 技術スタック
- React 19 + TypeScript + Vite 8
- Leaflet + react-leaflet（地図）
- localStorage
- Google Fit REST API + Google Identity Services
- Web Audio API（サウンド合成）
- GitHub Pages（ホスティング）

## ディレクトリ構造
```
src/
├── components/
│   ├── dice/        # DiceButton（プレイ起動）, GoogleFitButton, StepInput, DiceResult
│   ├── sicbo/       # SicBoModal, Die（pip付きサイコロ）
│   ├── layout/      # AppLayout, Header
│   ├── map/         # MapView, RoutePolyline, SquareDots, CapitalMarkers, CurrentPositionMarker
│   └── stats/       # ProgressInfo
├── contexts/        # GameContext (useReducer + localStorage persist)
├── data/
│   ├── capitals.ts  # 193カ国首都データ（ルート順）
│   ├── generateRoute.ts  # マス生成ロジック
│   └── index.ts     # routeData singleton
├── hooks/           # useGame
├── services/        # googleFit.ts (OAuth + Fitness API), sound.ts
├── types/           # 型定義（Capital, Square, GameState, BetSlot, SicBoRoll等）
└── utils/           # geo (Haversine, interpolate), storage, sicbo (払戻計算)
```

## Sic Bo 仕様

### ベット種類（計24種）
| ベット | 確率 | 倍率（マス進行） | 期待値 |
|---|---|---|---|
| 大/小 | 48.6% | ×6 | 2.92 |
| 単(奇)/双(偶) | 50% | ×6 | 3.0 |
| 合計4,17 | 1.4% | ×216 | 3.0 |
| 合計5,16 | 2.8% | ×108 | 3.0 |
| 合計6,15 | 4.6% | ×64 | 3.0 |
| 合計7,14 | 6.9% | ×44 | 3.0 |
| 合計8,13 | 9.7% | ×30 | 2.9 |
| 合計9,12 | 11.6% | ×26 | 3.0 |
| 合計10,11 | 12.5% | ×24 | 3.0 |
| 任意ゾロ目 | 2.78% | ×108 | 3.0 |
| 特定ゾロ目 | 0.46% | ×648 | 3.0 |

### 勝ち/負け
- 当選: ベット数 × 倍率 マス進行
- 外れ: 0マス、ベット数のトークンは消費
- 大/小/単/双: ゾロ目の場合は必ず外れ（実カジノ風）

## ユーザーの訪問・宿泊情報（都市データ整備時に参照）

### 訪問国・回数
- 香港 ×3 / 韓国 ×3 / 中国 ×2 / ベトナム ×2
- インドネシア / ロシア / アメリカ / アイスランド / フィンランド / インド / イタリア
- カザフスタン / オーストラリア / タイ / ミャンマー / ラオス / マレーシア
- フィリピン / マカオ / ブルネイ / カンボジア / 台湾 / 日本 / バチカン市国 / シンガポール

### 訪問国メモ
- 香港・マカオ・台湾・バチカン: UN非加盟のため現在のルート（193首都）に含まれていない。都市追加時に検討。
- **首都未訪問の国** (国は訪問したが首都には行っていない):
  ロシア・アメリカ・中国・インド・オーストラリア・ミャンマー・カンボジア
  → 都市追加時、これらの「実際に訪問した都市」を優先的に拾う必要あり

### 国内詳細
- 日本: 全47都道府県の県庁所在地を訪問済み

### 訪問済みの主要都市（首都以外、宿泊または通過）
- **ロシア**: ウラジオストク、ハバロフスク
- **アメリカ**: ラスベガス
- **アイスランド**: アークレイリ
- **中国**: 大連、上海、珠海
- **インド**: コルカタ
- **イタリア**: ミラノ、ベネチア、フィレンツェ
- **カザフスタン**: アルマトイ（※首都未訪問、ここのみ）
- **韓国**: プサン、清州（チョンジュ）
- **オーストラリア**: パース、メルボルン、シドニー、ゴールドコースト
- **ミャンマー**: ヤンゴン
- **マレーシア**: マラッカ
- **フィリピン**: セブ
- **ベトナム**: ホイアン
- **カンボジア**: シェムリアップ
- **台湾**: 台北、台南、台中、高雄

## よくあるコマンド

```bash
# 開発サーバー
npm run dev

# 型チェック
npx tsc -b --noEmit

# ビルド
npm run build

# プッシュ（自動デプロイ）
git push
```

## 進行中タスク（次回再開時すぐ着手）

### 実在ルート化 - セグメント分類 (進行中: 46/193 完了)

**完了済み:**
- ✅ Google Maps切替 (動作確認済み、APIキー保護済み)
- ✅ capitals.ts v3 再構成: 香港→台湾→フィリピンの自然な太平洋島嶼ルート
  - 新Asia順: JP→KR→KP→CN→MN→**PH**→BN→ID→TL→SG→MY→TH→KH→VN→LA→MM→BD→...
  - 海洋SE Asia (PH/BN/ID/TL/SG/MY) を 大陸SE Asia (TH/KH/VN/LA/MM) より先に
  - インド洋諸島 (MU/SC) を MG (Madagascar) の隣に
  - storage version → 3 (古いセーブ自動リセット)
- ✅ `src/data/segmentMeta.ts`: 46/193 セグメント分類済み
  - バッチ1+2 (1-31): アジア+中東前半 完了
  - バッチ3 (32-46): 中東後半 完了
- ✅ MapView.tsx で段階的に色分けポリライン表示
  - red=land / blue=sea / purple=mixed / orange=fantasy
- ✅ **Directions API実装** (`src/services/directions.ts`)
  - landセグメントはGoogle Directions APIで実道路に沿った polyline
  - localStorage キャッシュ (TTL 30日)
  - 動作確認: 30セグメント分のキャッシュ生成済み
  - sea/mixed/fantasy は引き続き直線
- ✅ Sic Bo盤UX改善
  - 各セルに「+N」（潜在進行マス）動的表示、チップ数で更新
  - ベット盤から日本語完全排除（×N → +N）
  - status barも 🎲/BET アイコン化
- ✅ Google Fit UI整理
  - 連携後は完全非表示（自動同期がbackground実行）
  - 同期成功時のみ短いトースト
- ✅ 実生活訪問データ整備（`src/data/realLifeVisited.ts`）
  - 訪問都市・首都の Set 公開
  - 思い出ボーナス（+2🎲）の判定基盤完成
  - **gameplay logic未実装**（Reducer連携が次回タスク）

**次回再開: 残作業**
1. **マイルストーン・都市訪問ボーナス実装**
   - PlayerState 拡張: `visitedCities`, `claimedMilestones`
   - Reducer: ROLL_SICBO 時に着地マス周辺の都市検出（200km以内）→ +1🎲 (or +2🎲 思い出)
   - Reducer: ADD_STEPS/SYNC_FROM_GOOGLE_FIT 時にマイルストーン判定
   - UI通知: ポップアップ・トースト
2. **セグメント分類バッチ4-11** (ロシア・欧州・アフリカ・米州・オセアニア)
3. **実道路距離プリコンピュート** (option A): `tsx` 導入済み。`scripts/precompute-distances.ts` を書いて Directions API HTTP endpoint で各セグメント実距離を取得 → `src/data/segmentDistances.ts` に保存 → `generateRoute.ts` で利用 → 現状 great-circle 1.5倍ほど短い距離計算が解消(Tokyo→Seoul 11→17マス想定)。referrer ヘッダ `https://kentaro-source.github.io/` 付きで HTTP fetch すれば既存 API キーで通る
4. その他: ログインボーナスは**不要**で確定（純粋に歩数連動）

### 確定したルール設計
- **Sic Bo返金**: 案3（返金なし、現状）
- **トークン上限**: 5維持、ボーナス上限超えは没収を許容
- **マイルストーン**: 1万=+1, 10万=+2, 100万=+3, 1000万=+5, 1億=+5+特別演出
- **都市訪問ボーナス**: 「停止時のみ」（半径200km以内）、未訪問+1, 実生活訪問+2
- **ログインボーナス**: 不要

## 設計思想・UI/UXルール

### Sic Boベット盤
- **日本語ラベル禁止**（中途半端と感じる）
- 大/小/単/双/囲 はOK（伝統的な漢字シンボル）
- セルラベルは「+N」形式（Nはチップ数×倍率の動的計算）
- ボタン: RESET / ROLL / CLOSE / AGAIN（英語）
- ステータスバー: 🎲N/M / BET N（アイコン化）
- 倍率は固定では表示せず、現在の進行マス数を直感的に
- 大/小は HUGE で（マカオ風、64px赤色）

### 地図
- Google Maps（OpenStreetMapから移行済み）
- `loading=async` を URL から外している(新API仕様で `google.maps.Map` constructor を直接使うため)
- 経由都市マーカー: タイプ別色
- ルート色分け: red=land / blue=sea / purple=mixed / orange=fantasy
- 通過済み: 緑実線 / 未通過: グレー破線
- 訪問済み首都: 大きい緑丸 / 未訪問: 小さいグレー丸
- landセグメントは Directions API で実道路追従
- mixedセグメントは隣接ペア毎に Directions API 試行、海越えは直線(geodesic curve)
- すべての Polyline に `geodesic: true` → 直線でなく大圏弧
- マスドット: 1/3サンプル(perf)、zoom<4で非表示、通過済み4px緑/未通過2px灰

### Google Fit
- 連携後はUI完全非表示（自動同期がbackground）
- 同期成功時のみ短いトースト
- アプリ起動時とフォーカス復帰時に自動同期
- 連携前のみ大きな「連携」ボタン
- **`ever-consented` フラグで永続「連携済み」扱い** — トークン期限切れ後もボタン再表示しない
- 旧トークン保存履歴があれば自動でフラグONバックフィル(過去ユーザーも対応)
- silent re-auth (prompt:'none') は使わない — popup blocker でエラー大量発生したため
- Fit API リクエストから `dataSourceId` 削除済み — Health Connect 経由でも歩数取得可能

### 出発地について
- ゲーム内のスタート: **東京（JP capital）** = square 0
- ユーザーの故郷: **宮崎**（segment #1の最初の経由都市）
- segment #1 経路: 東京 → 宮崎 → 長崎 → 福岡 → ferry → プサン → 清州 → ソウル
- 関東関西は経由都市マーカー無し（Directions APIが道路として通すのみ）

### ルート設計の哲学（ユーザー要望）
- 陸セグメント: 大きい道や鉄道を通る（実在ルート）
- 海セグメント: 実在の航路（神戸→上海フェリー、関釜フェリー、渤海フェリー等）
- ルート無い区間（太平洋横断等）: ファンタジー扱い
- 訪問都市は経由地として組み込む（思い出を辿る世界一周）
- ルート順は地理的に自然になるよう capitals.ts を再構成（v3）

## 重要な設計判断の経緯（消えやすい暗黙知）

### なぜ ×6 → ×4 に倍率下げた
- 大に2トークンで12マス進むと「ウランバートル手前まで一気」感がして進みすぎ
- ×4 に下げて 2トークン勝ち=8マス、5トークン=20マスに抑制
- EV ≈ 1.94 × 1.4トークン/日 = 約1.5万歩/日で1年クリア

### なぜ stepsPerDie 7000 → 5000 に戻した
- 上記倍率下げで進行ペースが落ちたため、トークン生成を上げて補償
- 1日1万歩で2🎲生成、1年で約240日プレイ想定

### なぜ capitals.ts を v3 まで再構成
- v1（初期）: 各種ルート問題（TM→SG, TL→IR の不自然なジャンプ）
- v2: 海洋SE Asia (MY/SG/ID/TL/PH/BN) を MM の後ろに、インド洋諸島 (MU/SC) を MG の隣に
- v3（現在）: ユーザー指摘「香港→台湾→フィリピンの太平洋島嶼ルートが自然」
  - PH を MN の直後に挿入、海洋SE Asia の前に配置
  - 大陸SE Asia (TH/KH/VN/LA/MM) は海洋SE Asia の後ろに
  - 結果: MN→PH 経由で台湾を訪問するドラマチックな東シナ海ルートに

### なぜトークン上限5維持
- Sic Bo の最大ベットを抑え、最長セグメント（40マス）を一発で越えさせない
- 5トークン × 6マス（×6時代）= 30マス < 40
- ×4に下げて余裕がさらに増えたが、上限変更はせず保留

### 実生活訪問都市の扱い
- 「思い出ボーナス」として +2🎲（未訪問は +1🎲）
- ゲーム的にはほぼ同じだが、ポップアップで「★懐かしの〇〇を再訪！」演出
- データは `src/data/realLifeVisited.ts` の Set で管理
- 容易に追加削除可能

### 自動ストップ機能（保留）
- 「都市・首都を飛ばさず必ず止まる」案
- 首都ボーナス +1/+2 の判定との齟齬で保留
- 都市追加（150+）でマス密度が上がれば、自動ストップ無しでも飛ばし問題は解消する見込み
- 実装するなら「新規首都・都市で必ず停止、超過分は消失、ボーナスは+2に統一」

### 振り中のサウンド演出（重要）
- ユーザー要望: コロコロ音必須
- Web Audio APIで合成音実装済み（src/services/sound.ts）
- ダイスシェイク: 60ms間隔のクラックノイズ + 着地時3つのclack
- 勝ち: ascending C-E-G-C
- ジャックポット: cascading sparkle
- ハズレ: 下降サウルース

## CLAUDE.md自体の保守ルール
**重要: 会話で重要な決定があったら必ずCLAUDE.mdに反映する**。
これがプロジェクトの記憶。git pull だけでは会話履歴は引き継がれない。
- 設計判断の理由
- ユーザーの好み・制約
- 試したけど捨てた案とその理由
- これらを文章化することで、別PCのClaude や 数ヶ月後の自分が文脈を取り戻せる

### Google Maps APIキー
- `AIzaSyAl8HkXqKTy1_PDDU7-XX4cLQNYfXwrwl8`
- 「My First Project」配下（Fitness APIは「sampo」配下、別プロジェクト)
- HTTP リファラ制限: `https://kentaro-source.github.io/*` + `http://localhost:5173/*`
- `.env.local` 設定済み (gitignored)
- ✅ **GitHub Actions Secret `VITE_GOOGLE_MAPS_API_KEY` 設定済み** (2026-04-30に追加、本番ビルドで自動注入)
- ⚠ **CLAUDE.md(public)にキー直書きは妥協** — referrer制限あるので実害なし、リスク許容

### 都市データ (164都市)
- `src/data/cities.ts`: 164都市（追加: TW-TAIPEI, MO-MACAU, JP-MIYAZAKI, JP-NAGASAKI）
- 全ユーザー訪問都市カバー済み
- Mapに表示済み（type別色分け）
- ❌ 近接検出と初訪+1🎲ボーナスは未実装

### 次のフェーズ実装 (まだ未着手)
1. **実道路距離プリコンピュート**: `npx tsx scripts/precompute-distances.ts` でビルド時取得 → `src/data/segmentDistances.ts` 出力 → `generateRoute.ts` で利用 (great-circle の1.5倍ほど短い問題解消)
2. **海ルート手動キュレーション**: 重要な海峡・フェリー waypoint(どの mixed セグメントで `seaSegments` を明示するか)
3. **マイルストーン+都市訪問ボーナス**: PlayerState 拡張 + Reducer 連携 + UI通知
4. **自動ストップ機能**: 新規首都・都市で必ず止まる
5. **都市マーカー近接検出**: 半径200km以内で訪問判定→トークンボーナス
6. **セグメント分類バッチ4-11** (ロシア・欧州・アフリカ・米州・オセアニア)

## 直近の改善メモ（次回検討）

### Sic Bo
- ✅ 大/小 巨大化、伝統マカオ風盤、ピップ視認性改善 (28%/48%, inset positioning)
- ✅ 大/小 倍率: ×6 → ×4、stepsPerDie: 7000 → 5000 (バランス調整)
- ❌ サイコロ履歴表示（過去10回）
- ❌ 振り中アニメ更なる磨き込み
- ❌ 外れベットの返金ルール

### ボーナス拡張
- ❌ ログインボーナス（毎日起動で+1🎲、連続日数ブースト）
- ❌ 歩数マイルストーンボーナス（10万歩、100万歩...）
- ❌ 都市初訪+1🎲

### その他将来
- マスイベント（エリア別ランダム表示）
- 首都到着時の国情報表示（RestCountries API）
- Travel Tracker連携（訪問済み国は思い出表示）
- Google Maps Street View 連携（API キー流用可能）
- 統計ダッシュボード
