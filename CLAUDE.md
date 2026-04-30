# Sanpo - 歩いて世界一周アプリ

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

### デプロイ
- **本番URL**: https://kentaro-source.github.io/sanpo/
- **リポジトリ**: https://github.com/kentaro-source/sanpo
- **デプロイ**: pushすると GitHub Actions で自動デプロイ（`.github/workflows/deploy.yml`）

### 実装済み (2026-04-29時点)

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
3. その他: ログインボーナスは**不要**で確定（純粋に歩数連動）

### 確定したルール設計
- **Sic Bo返金**: 案3（返金なし、現状）
- **トークン上限**: 5維持、ボーナス上限超えは没収を許容
- **マイルストーン**: 1万=+1, 10万=+2, 100万=+3, 1000万=+5, 1億=+5+特別演出
- **都市訪問ボーナス**: 「停止時のみ」（半径200km以内）、未訪問+1, 実生活訪問+2
- **ログインボーナス**: 不要

### Google Maps APIキー
- `AIzaSyAl8HkXqKTy1_PDDU7-XX4cLQNYfXwrwl8`
- 「My First Project」配下（Fitness APIは「sampo」配下、別プロジェクト）
- HTTP リファラ制限: `https://kentaro-source.github.io/*` + `http://localhost:5173/*`
- `.env.local` 設定済み (gitignored)
- GitHub Actions Secret `VITE_GOOGLE_MAPS_API_KEY` 要確認

### 都市データ (164都市)
- `src/data/cities.ts`: 164都市（追加: TW-TAIPEI, MO-MACAU, JP-MIYAZAKI, JP-NAGASAKI）
- 全ユーザー訪問都市カバー済み
- Mapに表示済み（type別色分け）
- ❌ 近接検出と初訪+1🎲ボーナスは未実装

### 次のフェーズ実装 (まだ未着手)
1. **Directions API ラッパー**: 陸セグメントの polyline をビルド時取得・キャッシュ
2. **海ルート手動キュレーション**: 重要な海峡・フェリー waypoint
3. **ルート再生成**: polyline 沿いに Square 再分配
4. **自動ストップ機能**: 新規首都・都市で必ず止まる
5. **都市マーカー近接検出**: 半径200km以内で訪問判定→トークンボーナス

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
