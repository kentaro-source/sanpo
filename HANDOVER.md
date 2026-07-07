# HANDOVER.md — せかいさんぽ 開発引継ぎ

最終更新: 2026-07-07（第14セッション中に作成。記載の数値・挙動はすべてコード読解または実機/devでの実測で確認済み。推測は「疑い」と明記）

---

## 1. プロジェクトの目的

**「せかいさんぽ」** — スマホの歩数計と連動し、実際に歩いた歩数で地図上を進んで東京駅から世界一周するシミュレーションゲーム。**個人プロジェクト（作者自身専用、Play Store 非公開）**。

- 1歩 = 1m。193 の UN 加盟国首都 + 香港/マカオ/台湾（独立国扱い）= **196カ国** を一筆書きで巡り、東京へ帰還する
- 素の歩行では数十年かかるため、歩数で貯めた「チップ」を **Sic Bo（大小、カジノの3ダイス賭け）** に賭け、勝てば ×3〜×180 の速度倍率（30分）、負ければ減速（大/小等は ×0.5）
- 国ごとに首都到達で「入国審査」（カード引きゲーム）が発生
- 進捗は X（@sekai_sanpo_）で実況（2026-05-07 Day 1 開始）
- 本番: PWA https://kentaro-source.github.io/sanpo/ ＋ Android APK（sideload）。リポジトリ: https://github.com/kentaro-source/sanpo (public)

---

## 2. 技術構成

### 言語・フレームワーク
| 項目 | 内容 |
|---|---|
| フロントエンド | React 19 + TypeScript ~6.0 + Vite 8（`package.json` で確認） |
| 状態管理 | React Context + useReducer（`src/contexts/GameContext.tsx`）。**DB なし、永続化は localStorage のみ** |
| 地図 | **Google Maps JavaScript API を直接使用**（`MapView.tsx` が script タグを動的ロード）。`package.json` にある leaflet / react-leaflet / @react-google-maps/api は **どこからも import されていない残骸**（grep で確認） |
| モバイル | Capacitor 8（Android のみ）。プラグイン: `@capacitor/app`・`browser`・`local-notifications`・`preferences`・`@capgo/capacitor-health` |
| PWA | `public/sw.js`（ビルド時に `__BUILD_ID__` 注入 → controllerchange で自動リロード）＋ `manifest.json` |
| 音 | Web Audio API 合成音 + mp3 サンプル（`public/sounds/`） |

### ビルド・デプロイ
- `npm run dev` — dev サーバ（`.claude/launch.json` の "dev" = port **5174**、URL は `http://localhost:5174/sanpo/`）
- `npx tsc -b --noEmit` — 型チェック
- `npm run build` — PWA ビルド（base=`/sanpo/`）。**main へ push すると GitHub Actions（`.github/workflows/deploy.yml`）が GitHub Pages へ自動デプロイ**
- `npm run cap:sync` — APK 用 web ビルド（`CAP=1` で base=`./`）+ `cap sync android`
- APK: `JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"`（**JDK 21 必須**）、`ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk` を通して `android\gradlew.bat assembleDebug` → `adb install -r android\app\build\outputs\apk\debug\app-debug.apk` → **`am force-stop` → 再起動**（SW キャッシュ stale 対策。それでも古ければアプリ内 ⟳）
- Android 設定: appId `com.kentarosource.sanpo`、X OAuth 用 deep link `com.kentarosource.sanpo://oauth-callback`（AndroidManifest の intent-filter）、権限は INTERNET + POST_NOTIFICATIONS

### 外部サービスと API キー
| サービス | 用途 | 設定場所 |
|---|---|---|
| Google Maps JS API（Map/DirectionsService/Geocoder） | 地図描画・実道路ポリライン・逆ジオコーディング | `.env.local` の `VITE_GOOGLE_MAPS_API_KEY`（gitignored。キー値自体は CLAUDE.md に記載あり、referrer 制限付き）。本番は GitHub Actions Secret 同名 |
| Health Connect（`@capgo/capacitor-health`） | **歩数の主ソース（Android 実機）**。前景 4s / 背景 30s ポーリング + 起動burst 2/5/10/20s（`useHealthConnect.ts`） | 追加設定不要（端末の Health Connect 権限） |
| DeviceMotion ペドメーター | 前景の歩数ソース（PWA 含む）。閾値 13 m/s²・cooldown 380ms（`pedometer.ts`） | なし |
| Google Fit REST + GIS OAuth | **UI 非表示の残存コード**（`App.tsx` のコメントで意図的に無効化と明記）。Cloudflare Worker (`/exchange`,`/refresh`) 経由トークン | `VITE_FIT_WORKER_URL`（Actions Secret） |
| X API v2（OAuth2 PKCE + POST /2/tweets） | 進捗投稿。**Free tier は 402 で直接投稿不可** → intent URL（`𝕏 画面で開く`）で運用 | `VITE_X_CLIENT_ID`（未設定なら OAuth UI 非表示） |

### localStorage / Preferences キー（全て grep で確認）
- `sanpo-game-state`（GameState 全体、**version 9** = `storage.ts` の `CURRENT_VERSION`）
- `sanpo-progress-watchdog`（version 非依存の進行バックアップ。schema bump で state が drop されても distanceKm/visited/チップ等を復旧。**新フィールド追加時はここにも入れること**）
- `sanpo-directions-cache-v2`（Directions 結果 30日 / 失敗 7日の負キャッシュ）
- `sanpo-geocode-cache-v2`、`sanpo-sound-muted`、`sanpo-pedometer-enabled`、`sanpo-notif-permission-requested`、`sanpo-google-fit-token`・`sanpo-google-fit-ever-consented`・`sanpo-fit-user-key`
- 一回限りマイグレーションフラグ: `sanpo-yuncheng-warp-undo-v1`（コード中に現存）。実機にはさらに過去の `sanpo-state-cleanup-v3..v7`・`sanpo-distance-restore-v1` 等が残存（コードからは削除済みの旧 cleanup の痕跡。**再利用禁止**）
- Capacitor Preferences: `sanpo-x-token-v1`、`sanpo-x-pkce-v1`

### ルートデータ（2026-07-07 に `scripts/_routestats.mts` で実測）
| 項目 | 値 |
|---|---|
| 首都（capitals.ts、ルート順） | **193** |
| 都市（cities.ts） | **1,012**（うち 947 が route 上に km 解決。200km 圏外の 65 は立寄ボーナス対象外） |
| セグメント | 193（segmentMeta.ts で分類済み **192** + 最終首都→東京の wrap） |
| 総距離 | **369,083 km**（great-circle×1.4 の raw スケール。ルート変更のたび変動） |
| squares | 18,457（~20km 間隔。`positionAtKm` の補間精度を決める） |

主要データファイル（すべて `src/data/`）:
- `segmentMeta.ts` — 各セグメントの routeType（land/sea/mixed/fantasy）・waypointCityIds・**seaSegments（直線で描く leg の [i,i+1] ペア）**
- `generateRoute.ts` — routeData 生成（km は **raw = great-circle×1.4**）、`positionAtKm`
- `manualLegPaths.ts` — **Google が経路を返さない香港/マカオ越境の手描きポリライン**（深圳湾大橋・港珠澳大橋・拱北口岸。実機 DirectionsService で ZERO_RESULTS を確認済み）。`MapView` の sea-leg 分岐が参照
- `realLifeVisited.ts` — 作者が実生活で訪問済みの都市/首都（思い出ボーナス倍加対象）
- `segmentDistances.ts` — **空**（precompute スクリプト未実行。road factor 1.4 で代用中）

---

## 3. 実装済み機能の一覧

### コアループ
- **歩数→距離**: 1歩 = `KM_PER_STEP` 0.001km × 有効倍率。二重計上は `attributedTodaySteps`/`attributedDayStart` で防止（全ソース合算管理）
- **チップ生成**: `stepsPerDie` **500歩=1チップ**、`maxDice` **100**（ボーナス超過は ×1.5 = 150 まで）。ログインボーナス **+5/日**。マイルストーン 1万/10万/100万/1000万/1億歩 → +1/+2/+3/+5/+5
- **Sic Bo**（`utils/sicbo.ts`・`SicBoModal.tsx`）: 大/小/単/双 ×3、合計4〜17 ×60〜×6、any-triple ×30、triple-N ×180 の24ベット。勝ち = payout×チップ数の倍率ブースト（**30分固定・乗算スタック**）。負け = **ベット種別ごとの負け倍率ブースト30分・負けベット1件につき1つ**（`loseMultiplierFor`: 大/小/単/双 ×0.5、triple系 ×0.85、合計N ×(1−勝率)。チップ数は負け倍率に影響しない）。有効倍率 floor **0.25** / cap **1000**。ゾロ目時は大小単双・合計N すべて負け（**第13で `!triple` 修正済み・決定的テスト済み**）。LAST 5 履歴、mp3 ダイス音、結果からの X 共有
- **首都/都市ボーナス**: 通過 +5 / 立寄 +3。実生活訪問なら 思い出ボーナス +5/+3 を追加（計 +10/+6）
- **国境 = per-capital 入国審査**（`BorderModal.tsx`）: 各国首都到達で1回、審査官とのカード勝負（バカラ絞り: drag squeeze 演出、標準トランプ PNG 52枚 `public/img/cards/`）。審査料ランダム 1〜5チップ。負けても再挑戦可（チップ消費は「国境は金とられがち」の意図的な揶揄 — 無料化しないこと）。**香港/マカオ/台北は border-city 方式で「国」扱い**（`BORDER_CITY_COUNTRIES`）→ 国数 **196** = `capitals.length + 3`
- **歩行停止は国境 pending 中のみ**（clamp）。後方回収は「現在いる国の首都1つだけ・mission-only（歩行は止めない）」

### 地図（`MapView.tsx`）
- 近傍9セグメント（後3/前5）だけを1本のパスに構築。Directions は **≤25 stops のチャンク**呼び、失敗時は **1 leg ずつ再試行**（1つの不通 leg が batch 全体を直線化しないため）
- seaSegments の leg は直線。ただし `manualLegPaths.ts` に手動ポリラインがあればそれを描画（HK/マカオ実装済み）
- RDP 簡略化 10m 許容。歩行済み=緑/未来=青（白 halo 付き）
- **プレイヤーマーカー = `markerOnBuiltPath`**: 全ストップ（首都+waypoint都市）を raw km でアンカーし、実道路パスに弧長マッピング。フォールバックは `projectOntoPath`（連続エッジ投影）。小移動 350ms glide、ブースト大ジャンプは snap
- 都市/首都マーカーは zoom 連動表示、クリックで InfoWindow（説明+IRL★）

### 位置系統（重要設計）
- **判定 km は raw 完全統一**（`playerPath.ts` の `getCapitalKm`/`getCityKm` は常に routeData の raw km を返す。MapView が push する snap override は書かれるが**読まれない** — 再有効化禁止）
- `snappedPositionAtKm`（ShareToX 等の共有位置）は **`markerPositionAtKm`（マーカーと同一の全ストップ弧長方式）を最優先**に第14で修正 → セグメントキャッシュ → 旧 windowPath の順

### 歩数ソース
- `PedometerStatus`（不可視コンポーネント）が DeviceMotion ペドメーター + Health Connect ポーリングを駆動。Google Fit ボタンは**意図的に非レンダリング**（`App.tsx` コメント）

### X 投稿（`ShareToX.tsx`）
- daily / sicbo の2モード。全文編集可能な textarea、X weighted 280字カウント（CJK=2）
- 現在地/出発地は `snappedPositionAtKm` → 逆ジオコーディング（キャッシュ付き）。🏛 行は「次の街 + 次の国」（border-city 対応済み）
- `DAY_OFFSET = 1`（作者がハワイで日付変更線を東向きに越えたための恒久 +1 補正）
- 冒頭に `🎮 アプリで仮想世界一周中`（X の偽装ラベル対策）

### 通知（`useCrossingNotifications.ts`）
- `source: 'walk'` の通過/思い出ボーナスと国境到達のみ OS 通知（Sic Bo・入国審査・ログインボーナス由来は出さない）。Android 13+ の POST_NOTIFICATIONS を初回要求

### UI その他
- Header（カ国数・チップ）、HamburgerMenu（𝕏投稿 / 📊日別記録60日 / 🔧現在地を補正(±100/10/1km) / ⟳強制更新=SW+Cache削除のみ）、ProgressInfo（速度 emoji・ブーストスタック・停車地4件 tap 展開）、BonusToast（sicbo/border source は skip）
- 日別記録は `dailyHistory`（60日上限、日跨ぎ rollup）

### Reducer アクション（GameContext、12種すべて確認）
`ADD_STEPS` / `SYNC_FROM_GOOGLE_FIT`（HC からもこれ経由） / `ROLL_SICBO` / `UPDATE_CONFIG` / `CLAIM_LOGIN_BONUS` / `ROLL_BORDER` / `RECHECK_CROSSINGS` / `RETRY_LAST_MISSED_BORDER`（**handler 残置・未使用、復活させない**） / `CHECK_SCHEDULED_RESET`（2026-05-07 リセット、発火済み） / `FORCE_LAUNCH_RESET` / `SET_DISTANCE_KM`（fill+trim の手動補正） / `RESET_GAME`

---

## 4. 既知のバグ・未解決の問題

1. **X投稿の位置化け（マーカーは正しいのに share の現在地が別の国になる）— 修正コミット済み・実機の修正後確認は未実施**
   - 症状の確証: 2026-06-25 実機 CDP で share 文面が「🇵🇭 フィリピン Davao City」、マーカー/🏛行は中国広東で正しい（乖離を直接観測）
   - 原因（確定）: 実機の Directions キャッシュがほぼ空 → windowPath が直線退化 → 旧 `snapFromWindowPath` が「パスの弧長 cumKm」を km 軸に使うため位置が化ける。マーカーは stop 実座標アンカーなので無事
   - 修正: `markerPositionAtKm`（マーカーと同一の全ストップ弧長方式）を `snappedPositionAtKm` の最優先に — **コミット済み（`b7e7855`）・修正入り APK は 2026-06-25 に端末へインストール済み（install Success 確認済み）**
   - **未実施: 修正後の実機確認**（確認直前で中断）。2026-07-07 現在プレイヤーの実位置がフィリピンのため「PH と表示される」だけでは正誤判定できない — **地図マーカーの地点と share の現在地行が同一地点（同じ市/州）か**で確認すること
2. **陸路/海路の直線描画 — 区間ごとに状態が異なる**
   - ✅ **香港/マカオ越境（深圳→香港→マカオ→珠海）: 解決・実機確認済み**。Google は SAR 越境を全て ZERO_RESULTS（実機 DirectionsService で確認）→ 手動橋ポリライン（深圳湾大橋/港珠澳大橋/拱北）で実ルート描画（`581e3e3`+`b7e7855`）。2026-06-25 実機スクショで橋・道路を辿る描画を目視確認
   - 🟡 **高雄→マニラ→ボルネオ→ジャカルタの島伝い: コミット済み・実機未確認**。旧 890km 直線をバスコ/アパリ経由ルソン陸路に、PH→BN をサバ上陸（タワウ/コタキナバル）経由に、BN→ID をサラワク陸路に分割（`581e3e3`）。全陸路 leg が Google でルート可能なことは実機 DirectionsService で確認済み、stop 配線・道路追従は dev で確認済み。**ただしこの変更を含む APK は端末に未インストールの可能性が高い**（3回目ビルドは成功したが install の実行記録がセッションログに無い — 当時の「インストール完了」報告は誤りだった）。端末の PH 区間 stop リストにバスコ/アパリが出るかで新旧を判別できる
   - 🟡 **実機の Directions キャッシュがほぼ蓄積されない問題（一般陸路の直線化）: 根本原因特定・修正コミット済み（2026-07-07）・実機未確認**
     - 原因3つ（dev 実測で確証）: (1) WALKING 結果を**無簡略化**でキャッシュ — 東京発の1チャンクだけで **13.8万点/5.55M 字** = Android WebView の localStorage quota(~5MB) を単独で超過 (2) quota 超過時に `saveCache` の catch が**キャッシュ全削除** → 書込のたび全消しで「端末に1件だけ」の観測と完全一致（desktop Chrome は quota が大きく再現せず = dev/実機差の正体）(3) 一時的失敗（`OVER_QUERY_LIMIT` 等）も恒久失敗と同じく**7日負キャッシュ** → 起動時バーストで正常な陸路が1週間直線化
     - 修正（`src/services/directions.ts`）: 書込前に RDP 10m 簡略化 + 座標5桁丸め（同一チャンク 5.55M→**615k字 = 1/9**、東京窓全体 1.93M字）／quota 時は**最古エントリから退避して再試行**（全消し廃止）／負キャッシュは恒久失敗（ZERO_RESULTS 等）のみ、一時的失敗は次回再試行／旧ビルドの死キー `sanpo-snapped-path-v1`（端末で ~1.5M字、現行コード無参照）を初回ロードで削除
     - 検証済み: 簡略化・死キー削除・恒久負キャッシュ（韓国区間9件）は dev 実アプリで実測。退避ループは Node 同型テストで確認（最古のみ退避・全消しなし・quota 極小でも無限ループなし）
     - **未検証**: 実 quota での end-to-end 挙動（preview ブラウザが unlimited-storage のため再現不可・実機未接続）と `OVER_QUERY_LIMIT` の実発生時挙動（意図的に発生させる手段がない、コード読解レベル）→ **次回実機で、起動→歩行後に `sanpo-directions-cache-v2` のエントリ数が蓄積していくことを確認**。チャンク上限縮小案（~8 legs）はこの修正で不要になった見込みだが、実機観測後に判断
   - 🟡 **バリ→ディリ / ディリ→シンガポール: コミット済み（2026-07-07 `2a851f8`）・実機未確認**。ヌサトゥンガラ島伝い（マタラム〜アタンブア8都市、seaSegments 不要 — 島間フェリー・ID→TL 国境含め全 leg が Google でルート可能なことを dev DirectionsService で確認）+ ディリ→マカッサル→パレパレ→バタム→SG（海3区間は実航路の直線）。stop 配線は dev で確認済み。次回 APK に含めて実機確認
3. **韓国・北朝鮮内は Google が routing 拒否**（韓国の地図輸出規制・北朝鮮データ無し）→ 恒久的に直線。回避不能（既知の制約）
4. **X 直接投稿は 402**（Free tier が POST /2/tweets を課金必須化）。OAuth/token 部分は動作。intent URL 運用が現状の正
5. **アプリを task から swipe away すると歩数取得も通知も停止**（WebView 死亡）。WorkManager での常駐 polling は未実装（大改修）
6. **未使用コード/依存**: `GoogleFitButton.tsx`（意図的非表示）、`DiceResult.tsx`（import ゼロの死コード）、`RETRY_LAST_MISSED_BORDER`（未呼出）、package.json の leaflet / react-leaflet / @react-google-maps/api / @types/leaflet（import ゼロ）
7. **`segmentDistances.ts` が空**: 実道路距離 precompute は API キーの referrer 制限で実行不可のまま（サーバ用キーが必要）。全 land/mixed は great-circle×1.4 の概算
8. **第10〜14セッションの変更は 2026-07-07 に7コミットへ整理して main にコミット・push 済み**（sicbo / route / map / state / ui / steps / scripts。GitHub Pages デプロイ success）。**リポジトリ直下の `救護室*.pdf` ×2・`c418d23f-*.jpg`・`_devshot.png` は作者の個人ファイル/スクショでプロジェクト無関係 — 意図的に未コミットで残置。今後もコミットに含めないこと**

### 実機のゲーム状態
- **2026-06-25 実測（CDP）**: `distanceKm` ≈ 18,800（広東省・深圳過ぎ、香港手前）。Day 48 表示。`visitedCapitals` = JP/KR/KP/CN/MN（**5/196**）、`crossedBorders` 8件、`borderRollsWon` = KR/KP/RU/CN/MN。watchdog と一致・dailyHistory 50日分整合（距離ワープなし）
- **2026-07-07 ユーザー申告**: 現在地は**フィリピン**（ルソン島伝い区間）→ 香港/マカオ/台湾は通過済みのはず。ただし入国審査の発火・国数（8/196 になっている想定）・端末の APK 版は**実機未確認**（同日 adb 未接続で CDP 実測不可）

---

## 5. 残タスクと次に着手すべきこと（優先順）

1. **最新 APK（島伝い + Directions キャッシュ修正入り）のインストール確認と実施（最優先）**: 端末には 2026-06-25 の2回目ビルド（位置化け修正+HK/マカオ橋）までしか入っていない可能性が高い（3回目=島伝い入りは**ビルド成功のみ確認、install の実行記録なし**）。判別: PH 区間の stop リストにバスコ/アパリが出るか、または `dumpsys package com.kentarosource.sanpo` の lastUpdateTime。古ければコミット済みソースから `npm run cap:sync` → gradle → `adb install -r` → `am force-stop` → 起動。なお現在地より手前の新経由地（バスコ等の通過済み分）は前進時のみ検知のため遡及加点されない（仕様通り、補正不要）
2. **ShareToX 位置化け修正の実機確認**: 現在地が実際にフィリピンのため国名では判定不可。**地図マーカーの地点と share の現在地行が同一地点（同じ市/州）か**で確認（CDP で ☰→𝕏投稿→4.5s 待って textarea 読取り）。不一致なら `markerPositionAtKm(distanceKm)` の戻り値を CDP で直接ログして追う
3. **香港/マカオ/台湾の入国審査が発火したかの確認**（第12から繰越）: ユーザー申告で通過済みのはず → `borderRollsWon` に HK/MO/TW が入り国数 **8/196** になっているか CDP で確認。抜けがあれば原因調査（勝手に補填しない — 鉄則参照）
4. ~~バリ→ディリ / ディリ→シンガポールの島伝い化~~ — **済（2026-07-07 `2a851f8` コミット・push 済み）**。実機反映は task 1 の APK インストールに含まれる。これで**プレイヤー前方の未整備直線はゼロ**（残る直線は実航路の海と恒久制約のみ）
5. ~~未コミット変更の整理 commit~~ — **済（2026-07-07、7コミット + push 済み、GitHub Pages デプロイ success）**
6. **WorkManager で完全 kill 時の background polling**（大改修・継続）
7. **X 偽装ラベル状況の追跡**（継続観察）
8. （任意）Directions チャンク縮小 / leaflet 系未使用依存の削除 / `DiceResult.tsx` 削除

### 絶対に破ってはいけない設計ルール（過去の重大事故から確定）
- **distanceKm を起動時に自動で動かすロジックを書かない**（forward/backward とも。過去 cleanup v1〜v7 が全て事故化）
- **km 判定は raw 統一**。snap override（`setStopKm` の値）を読む実装に戻さない
- **通過済みルート・通過済み目的地に手を出さない**（再クレジット/再審査は「恥ずかしい」事案）
- **信頼源は `dailyHistory[].km` + `todayKm` のみ**（visitedCapitals/borderRollsWon から距離を逆算しない）
- **実機バグは必ず実機（CDP）で確認してから結論**（dev で再現しないバグが多発。dev だけ見て「直った/問題ない」と言った回は全て誤診だった）
- 国境ハズレ時のチップ消費は仕様（揶揄）。親切設計に書き換えない
- ユーザーへは常に丁寧語、かつ端的に。既に伝えられたことを聞き直さない

### 実機検証（CDP over adb）チートシート
```powershell
$adb = "$env:LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe"
& $adb shell monkey -p com.kentarosource.sanpo -c android.intent.category.LAUNCHER 1   # 起動
$pid_ = "$(& $adb shell pidof com.kentarosource.sanpo)".Trim()
& $adb forward tcp:9333 localabstract:webview_devtools_remote_$pid_
Invoke-RestMethod http://localhost:9333/json/list   # title「せかいさんぽ」の type=page の webSocketDebuggerUrl を取得
node scripts/_cdp.mjs "<wsUrl>" scripts/_cdpexpr.js  # _cdpexpr.js に評価したい式を書く（awaitPromise/returnByValue 対応）
```
- share 文面の読み方: `_cdpexpr.js` で `button.header-menu` click → 「𝕏 投稿」ボタン click → 4.5s 待って `textarea` の value を返す（第13/14 で使用済みのコードが git 履歴/このファイル群にある）
- **localStorage を書き換えたら sleep ~3s → `am force-stop` → 再起動**（reload だと旧 React state が再保存して上書きする）
- 端末はすぐロック/ドーズする: `svc power stayon true` + `input keyevent KEYCODE_WAKEUP`。secure lock はユーザーに解除依頼。screencap はロック中 0 byte
- ポート 9222 はローカル Edge が占有しがち → 9333 等を使う
- 補助スクリプト（`scripts/`、コミット済み）: `_cdp.mjs`（CDP eval）、`_cdpexpr.js`（使い捨て式置き場）、`_cdppinch.mjs`（ピンチズーム注入）、`_recenter.js`（📍ボタン click）、`_genmanual.mjs`+`_polys.json`（manualLegPaths.ts の生成元）、`_routestats.mts`（ルート実数値の実測）

### dev での位置シミュレーション
dev（port 5174）の localStorage `sanpo-game-state` の `player.distanceKm` を書き換えて reload すると任意地点の描画・停車地リストを確認できる（第14で 21,000km=ルソン、23,500km=ボルネオを検証済み）。**ただし dev は Directions キャッシュが効くため実機の直線化バグは再現しない** — 実機確認の代わりにはならない。
