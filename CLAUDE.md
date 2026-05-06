# Sanpo - 歩いて世界一周アプリ

## 🔄 ユーザーが「再開」と言った時、Claude が即実行する手順

**ユーザーは setup を覚えていない**。「再開」「resume」「続き」等のキーワードで以下を順に実行:

1. `git pull --ff-only` (worktree 内で)
2. `.env.local` が存在しなければ作成: `VITE_GOOGLE_MAPS_API_KEY=AIzaSyAl8HkXqKTy1_PDDU7-XX4cLQNYfXwrwl8` を書く
3. `node_modules` が無ければ `npm install`
4. 下の引継ぎサマリの最新セッションを 30 秒で要約 (要点 + 直近の commit + 残タスク) してユーザーに渡す
5. 「次やるならどれ?」と聞く (引継ぎサマリの「次やる作業」候補から)

完全クローンの場合 (リポジトリすら無い):
- `git clone https://github.com/kentaro-source/sanpo.git C:\dev\sanpo`
- 上記 2-5 を実行

APK ビルドが必要な場合 (ユーザーが APK 更新依頼):
- JDK 21 (Android Studio JBR `/c/Program Files/Android/Android Studio/jbr`)、ANDROID_HOME `$LOCALAPPDATA/Android/Sdk` を環境変数で渡して `cd android && ./gradlew.bat assembleDebug`
- adb は `$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe`

## 🚀 引継ぎサマリ (2026-05-06 第7セッション末 — JST自動リセット + dailyHistory撤去 + reverse geocoded share + 国境ロール MVP)

別PCで再開する Claude / 数ヶ月後の自分が**最初に読むべき要点**:

1. **5/7 (明日) X アカウント正式スタート確定** — ハンドル = `@sekai_sanpo_` (末尾アンダースコア)。`ShareToX` の hashtag 行に `@sekai_sanpo_` mention 同梱済
2. **5/7 0時(JST)に game state 自動リセット 実装完了**:
   - 定数 `LAUNCH_RESET_AT_MS = Date.UTC(2026, 4, 6, 15, 0, 0)` (5/6 15:00 UTC = 5/7 00:00 JST)
   - action `CHECK_SCHEDULED_RESET` を `GameProvider` mount + 60秒 interval で dispatch
   - `PlayerState.scheduledResetAt`: `undefined` → 初回 load で `LAUNCH_RESET_AT_MS` 設定 (or 既に過去なら `0` で skip)、`>0` で発火待ち、`0` で発火済み sentinel (再発火しない)
   - 発火: `clearGameState()` + `createInitialState()` + `scheduledResetAt: 0` + `startDate: now` で Day 1 再スタート
3. **dailyHistory 機能 撤去**:
   - `PlayerState` から `dailyHistory[]` / `todayKm` / `todaySicBoWins` / `todaySicBoLosses` / `todayNewCapitals` / `todayNewCities` 削除
   - `DailyRecord` 型削除、reducer 内 `closeOutDayIfNeeded` / `backfillMay2` / `MAX_DAILY_HISTORY` 削除
   - `HamburgerMenu` の「📊 日別記録」エントリ + history view 撤去 (今は 𝕏 投稿 / ⟳ 強制更新 のみ)
   - storage version 据え置き (旧 save の余分フィールドは害なく無視される)
4. **ShareToX の X 投稿が世界一周ブロガー風に進化**:
   - フォーマット (例):
     ```
     📅 Day 5
     🇯🇵 世田谷区深沢 → 磐田市向笠新屋
     👣 8,423歩
     🏃 最高 24 km/h
     🐢 最低 2.0 km/h
     🏛 → 🇰🇷 ソウル (2/193)

     #せかいさんぽ @sekai_sanpo_
     ```
   - 出発地→到着地は **Google Maps Geocoder で reverse geocode**。`src/services/geocode.ts` がラッパー (in-memory + localStorage `sanpo-geocode-cache-v1` キャッシュ、3桁丸めで~110m精度)
   - JP は `locality + sublocality_level_1` を long_name で結合 (世田谷区深沢)。`sublocality_level_3` (`X丁目`)・`level_4` (banchi) は除外。バグ注意: 単に `getLong('sublocality')` だと配列順の最初 = level_4 の banchi 数字を拾う
   - 海外は locality 単独 → admin_area_level_2 → sublocality_level_1 → admin_area_level_1 → formatted_address[0]
   - todayStartKm を `PlayerState` に追加。`ADD_STEPS` / `SYNC_FROM_GOOGLE_FIT` の day-rollover 時に `state.player.distanceKm` を snapshot (sameDay なら既存維持)
   - `positionAtKm(routeData, km)` で km → lat/lng、Geocoder へ渡す
   - 速度行 (🏃/🐢) は `todayMaxMultiplier` / `todayMinMultiplier` を ROLL_SICBO で post-roll の effective multiplier から更新。`todayMultiplierDayStart` で当日判定。Base = 4 km/h。今日ロール経験ありのときのみ表示
   - 国旗 emoji = ISO alpha-2 → Unicode regional indicator (Windows では `JP`/`KR` 風にフォールバックするが Twemoji on X では本物の旗)
   - **「プライバシー懸念」は誤判断**だった: アプリは仮想ルート上の座標で、ユーザーの実 GPS とは無関係。詳細地名 OK
5. **balance** — `stepsPerDie 500` (commit 972a541)、daily login bonus +5 chips (`CLAIM_LOGIN_BONUS` を GameProvider mount で auto-dispatch、idempotent)
5. **アプリ名は「せかいさんぽ」のまま維持** — ユーザーと合意。改名コストの方が大きい
6. **総距離 = 346,655 km**(waypoint + road factor 込み)。107km/日ペースだと約9年で1周、現実的に Sic Bo ブースト前提で1〜2年計画
7. **「通過」と「立寄」の使い分け**: 首都=「通過 (+5)」、都市=「立寄 (+3)」、思い出ボーナスは別途上乗せ
8. **都市座標ポリシー = 「市役所基準」** — 横浜が市役所のままで他の都市も同じ基準。改名/移動は迷ったら市役所
9. **X アカウント素材** は `public/x-promo/` に commit 済 (00c1d1d):
   - `profile-400.png` / `profile-800.png`: 人型 walker silhouette + 球体グリッド背景
   - `header-banner.png`: 1500x500 で designed banner (banner-design.svg からレンダ)
   - `post-map.png` / `post-map-cropped.png`: 縦長 phone-shape の Day1 マップ
   - `post-casino.png` / `post-casino-cropped.png`: Sic Bo dialog
   - 本番 URL: https://kentaro-source.github.io/sanpo/x-promo/{ファイル名}.png
10. **bio + 固定ポスト 確定文面** (下記参照) — ユーザーが X で投稿する時は固定文面を使用

### Bio (158/160 weighted chars)

> 歩いた歩数だけ地図上を進むバーチャル世界一周アプリ『せかいさんぽ』を自分で作ってプレイ中🚶 東京駅から193首都・34万km。Sic Boで爆速or足止め。2026/5/7スタート🌏

### 固定ポスト (3本スレッド、X字数制限内に収め済)

**T1 (概要、280/280)**:
> 自分の歩数で東京駅から世界一周するアプリ『せかいさんぽ』を作って遊んでます。
>
> 飛行機もパスポートもなしに、歩いた分だけ地図上を進むバーチャル世界一周。1歩=1m、ソウル・サマルカンド・ローマ・リオ…193首都・449都市・34万km、トゥバル経由で東京帰還。
>
> 2026/5/7 スタート🌏
>
> #せかいさんぽ

**T2 (経緯+ルート、240/280)**:
> 「歩いた歩数で世界一周できないかな」と前から思ってたのを、Claude Code で形にしました。
>
> 193首都だけじゃなく、シルクロードのサマルカンド、東南アジアのバガン、南米のマチュピチュ、東アフリカのザンジバル…経由地を449個配置。通るたびにボーナス。

**T3 (Sic Bo+締め)**:
> 普通に歩くだけだと完走に何十年。Sic Bo を入れたのは、移動速度を上げるためと、カジノが単純に好きだから。
>
> 当たれば30分間 ×3〜×180倍速、外せば ×0.5、重なれば ×0.25 まで減速。
>
> 何年で世界一周できるか、ここでゆるく実況していきます🚶
>
> #せかいさんぽ

### 国境ロール (BorderModal) — このセッションで実装した MVP

仕組み:
- `PlayerState.pendingBorder = { kind: 'city'|'capital'; id; atKm; country }`
- ADD_STEPS / SYNC_FROM_GOOGLE_FIT で `findNextBorder(oldKm, fullNewKm, visitedCountries)` を実行
  - 未訪問国の最初の stop (city or capital) を見つけて pendingBorder にセット、distanceKm をその km で cap
  - `visitedCountrySet(visitedCapitals, visitedCities)` で「訪問済み国」を導出 (capital ID = country code、city.countryId 経由)
- 国境がセットされている間は walking 進行不可 (chip 蓄積は継続)
- `BorderModal` (`src/components/layout/BorderModal.tsx`):
  - 2枚のカードを face-down で表示、ユーザーがどちらか tap
  - クライアント側で2枚のランダムカード引いて、tap した側 = あなた、もう片方 = 審査官
  - 数字大きい方が勝ち (A=14)、引き分け = 負け
  - **flip 演出 = 審査官が先に めくれる (0–600ms)、その後プレイヤー (600–1200ms)** — 国境揶揄の演出
  - カード裏は CSS のみ (赤/burgundy 斜線 + 中央◆メダリオン)、絵札 emoji なし
  - 結果は 🎉 / 🤝 / 💸 のみ (説明文最小)
  - チップアイコンは header と同じ `chip-icon` を流用
  - `border-banner` (オレンジ pulse) で modal 閉じても国境ステート可視化
- `ROLL_BORDER` action: `{ choice: 'red'|'black'; outcome: 'win'|'lose'; cardLabel: string }` (choice slot は legacy unused)
  - 勝ち: pendingBorder クリア、city なら +3 (+IRL +3)、capital なら +5 (+IRL +5)、visitedCities/Capitals 追加
  - 負け: チップ -1 のみ、pendingBorder 残留 → 再挑戦できる

**設計意図 (重要)**: ハズレ時のチップ消費は **「国境は金とられがち」の揶揄** (ユーザー明言)。「ハズレは無料リトライ」みたいな"親切設計"に書き換えないこと。memory `project_border_satire.md` 参照

### 既知の制限と次の改善 (ユーザー確定スペック)

**発火位置の最終スペック**:
- **海路 (sea)**: 目的地側への上陸時 = first foreign stop。例 JP→KR は釜山。`findNextBorder` の現挙動で正しい
- **陸路 (land)**: 理想は文字通りの国境ライン。実装には route data に explicit 国境点を都市と同列の destination として追加する必要 (~192 点)。**code 側 heuristic では完全な正解は出ない** (midpoint は陸地で数百km ズレる、first-foreign-stop は既に他国内)
- **陸路の妥協策 (今これでいく)**: code は first-foreign-stop のまま。route data 側で **国境直後の都市 (到着される側、できるだけ国境に近い)** を waypoint に追加する。例: KP→CN なら 丹東 (鴨緑江沿い)、RU→FI なら Vyborg、CN→KZ なら Khorgos など
- 一度試した midpoint 案 (lastDomestic と firstForeign の中点) はユーザー却下: 陸路でズレすぎる。コミット `7f1bd4f` を `950823d` で revert 済み

### 残タスク (次セッション以降、優先順)

1. **陸路の国境隣接都市を `cities.ts` + `segmentMeta.ts` に追加** — 上記スペック通り、各 land 国境の到着側に国境隣接都市を waypoint で追加。これで code 変更なく first-foreign-stop が正確になる。優先順: 実プレイで早く到達する順 (KP→CN: 丹東、CN→MN: エレンホト or ザミンウード、CN→KZ: ホルゴス、KZ→RU: 各種、RU→FI: ヴィボルグ、…)。完璧を目指さず順次拡充
2. **(オプション) border-as-destination 完全版** — 1 が手間な場合、`Border` 型を新規導入 + `borderDistances` を route data に追加 + `findNextBorder` を「borders > cities/capitals 優先」に切替。理想だが大きな構造変更
2. **画像のクオリティ調整** ← banner (1500×500 横長で難しいとユーザー認める) / casino / map crop が「ひどすぎ」評価。再デザイン or Canva 等の外部ツール推奨。`public/x-promo/banner-design.svg` の手書きSVG では限界
3. **横浜以外の都市座標ポリシー記録** ← 市役所基準で統一決定済 (意思決定はあるが実 sweep はしてない)
4. **アカウント取得確認**: `@sekai_sanpo_` (末尾アンダースコア) で取得予定。取得後は ShareToX の mention が機能するか実投稿で確認

### コミット履歴 (このセッション、main → HEAD)
- 第7セッション分は別途このコミットに含む (multi-feat:JST reset + dailyHistory drop + reverse geocoded share)
- 00c1d1d chore(x-promo): X アカウント開設用画像一式
- 68e60d9 feat(icon): 人型 walker icon (破線→球体グリッドに修正済)
- b16ca6b feat: X 投稿機能（コメント+カジノ勝敗+Day N + 出発地→目的地）
- 972a541 feat: 500歩=1チップ、daily login bonus +5

---

## 🗂 旧引継ぎサマリ (2026-05-06 第5セッション末 — 全 192 セグメント + Sic Bo v7.1)

別PCで再開する Claude / 数ヶ月後の自分が**最初に読むべき要点**:

1. **本番デプロイは 2 系統** (前セッションから据置):
   - PWA: https://kentaro-source.github.io/sanpo/ (push で自動デプロイ)
   - **Android APK**: ローカルビルド → 端末に sideload (Play Store 公開はしない、自分用)
2. **全 192 セグメント実装済**: 世界一周ルート完成。192/192 で Tokyo → 6 大陸 → Tuvalu まで。
   - Asia + ME + Caucasus + AZ→EG/ST→RU anchor (50): 既存
   - Batch 4-5 (RU→DE, 22): 東欧/南欧/バルカン/中欧
   - Batch 6-8 (DE→MT, 20): 北欧/西欧/地中海
   - Batch 9-13 (MT→TV, 49): 大西洋越え/米州/カリブ/南米/オセアニア
   - Batch 14 (Africa内部, 53): EG→ST 全アフリカ
   - Batch 15 (グローバル小都市), 16 (Google弱国補強), 17 (残り gap)
   - 計 449 都市定義、347 が waypoint 参照、102 は不参照だが **route 200km 圏内自動 project** で全 449 都市が立ち寄り bonus 対象
3. **Sic Bo ルール v7.1** (`utils/sicbo.ts`):
   - **大/小/単/双 payout ×3** (real Sic Bo の ×2 から bump、headline +EV ベットに)
   - per-bet lose multiplier:
     - 大/小/単/双: ×0.5 (drama)
     - triple系 (any-triple, triple-1〜6): ×0.85 固定 (lottery、−EV)
     - 合計 N: ×(1 − win_prob) 自動式 (~+1〜12% EV)
   - effectiveMultiplier に **floor 0.25 (1km/h 🐢)、cap 30 (120km/h 🚗)**
   - 各 bet → 1 boost が独立 30分 timer で乗算スタック
   - 大+単 両外しで 1 ロール → ×0.25 = 1km/h floor 到達可
   - チップ N 個: 勝 = ×(payout × N) 線形、外 = ×lose_mult (N 無関係)
   - 全外れ ×0.5 廃止 (per-bet 方式で吸収)
4. **Sic Bo dice mp3** (`public/sounds/dice-roll.mp3`): freesound 出典の本物 Sic Bo シャッフル音
   - 1.0s〜3.4s の有意区間だけ再生、shake (1.0-2.6s) → 静止 → thud (3.0-3.4s)
   - rolling 演出 2.0s で結果遷移、thud が dice reveal に同期
   - 当たり/ハズレ chime 廃止 (sound.ts に残置だが呼ばれない)
5. **チップ生成**: `stepsPerDie = 777` (1000→777、ラッキー7、`storage.ts` の migration で stale 値も自動で 777 に)
6. **首都/都市ボーナス値 (大幅 bump)**:
   - 首都通過: +5 (was +2)
   - 首都 IRL 思い出: +5 追加 → 計 +10
   - 都市立寄: +3 (was +1)
   - 都市 IRL 思い出: +3 追加 → 計 +6
7. **UI 改修サマリ**:
   - ヘッダー左に **☰ ハンバーガーメニュー** (📊 日別記録 + ⟳ 強制更新)
   - ヘッダーから build tag 削除 (タイトル title= に hover で表示)
   - **マカオ風カジノチップ icon** (黄色外輪 + 緑内側 + 黄色★) を CSS で実装、ヘッダ&カジノボタン
   - **国旗 emoji** (🇯🇵 等、Unicode regional indicator) ProgressInfo capital/city 行に
   - ProgressInfo: 「向かう街」「次の停車地」廃止、4 stops + 最後は次首都固定、tap で description 展開
   - **速度バナー**: ベース 4km/h × 倍率、emoji が km/h で動く (👶<3, 🚶<6, 🏃<12, 🚴<25, 🛵<60, 🚗<120, 🚄<250, ✈️<700, 🚀≥700)
   - 加速時オレンジ→赤グラデ、減速 ×0.5+ は青系 + 👶 baby emoji
   - **カジノモーダル下部に LAST 5** Sic Bo 履歴 (3 ダイス pip 描画 + 合計 + ×倍率/MISS)
   - **マーカークリックで InfoWindow** (description / IRL star)
8. **日別記録 (dailyHistory)**:
   - PlayerState に `dailyHistory?: DailyRecord[]` (60 日上限)
   - 日跨ぎで `closeOutDayIfNeeded` が前日分を push、accumulator (`todayKm`/`todaySicBoWins`/`todaySicBoLosses`/`todayNewCapitals`/`todayNewCities`) を 0 に
   - **5/2 のみ ハードコード backfill** (`backfillMay2`): sicBoHistory timestamp から 5/2 の W/L 抽出 + 歩数 3500 + 残 km 全部
   - ☰ → 📊 日別記録 で今日 (黄色 highlight) + 過去日のリスト表示
9. **Capacitor 化 (前セッション継続)**:
   - JDK 21 (Android Studio JBR 使用、`/c/Program Files/Android/Android Studio/jbr`)
   - APK ビルド: `cd android && ./gradlew.bat assembleDebug`
   - インストール: `adb install -r app/build/outputs/apk/debug/app-debug.apk`
   - Health Connect プラグイン `@capgo/capacitor-health@8.4` で background 歩数取得
   - Capacitor の WebView origin = `https://localhost`、API キー referrer に `https://localhost/*` + `http://localhost/*` 追加済
10. **マップ修正**:
    - 初期センタリングが great-circle で Roppongi 辺りにズレてた → polyline 描画完了時に snap 位置に panTo 修正済 (`initialCenterDoneRef` gate)
    - 📍 recenter ボタンは `position: fixed; bottom: 270px` で bottom-panel の上に浮かせ
    - JP→KR ルート: 北九州→**大分→宮崎→熊本**→長崎→福岡 (東九州道経由)、ジグザグ解消
    - 福岡→プサンの **博多港フェリー** (前セッションで Nagasaki→Busan を訂正済)

### 既知の制約・残タスク
- **Korea/北朝鮮内のルートは Google API で routing 拒否され直線**: 法規制 (韓国地図輸出禁止)、北朝鮮データ無し。回避策なし、都市マーカーで国土感を出すのみ。
- triple ベットは EV ×0.887 (−11%)、any-triple は ×0.951、ロマン枠で意図通り。
- iOS APK 未対応 (kentaro-source は Android のみ)。
- foreground notification (画面 OFF 時の歩数バー表示等) 未実装。
- precompute 距離スクリプトは API キー referrer 制限で実行不可、land/mixed セグメントは great-circle × 1.4 倍補正。

### コミット履歴 (このセッション、main → HEAD)
- 70816da fix(storage): stepsPerDie 1000→777 migrate
- f258dae feat: 777 steps/chip + 強化 bonus + all-city pass-by
- 663e161 feat(sicbo): v7.1 ルール
- f9f0081 feat: 5/2 dailyHistory hardcoded
- d24220f fix(map): polyline snap 初期 pan + recenter
- f68091e feat: speed display + dailyHistory + ハンバーガー + dice mp3 + IRL flag
- 0f04f0a feat(sicbo+ui): LAST 5 + flag emoji
- 2f7a4df feat(sicbo): カジノ内 LAST 5 履歴、前回マス 廃止
- e8cd4e2 feat: 首都/思い出 bonus stack
- 2007336 feat: 27 IRL都市フラグ + 向かう街 ラベル削除
- 8bccda9 fix(ui): 最後 stop は必ず首都
- 6e8af40 feat(ui): tap-expand stops、max 4
- 835fe82 feat: InfoWindow + batch 17 都市
- 2557ef9 feat(route): batch 16 Google弱国
- 0bd26a1 feat(route): batch 15 グローバル小都市
- 45bf949 feat(route): batch 14 Africa 53 セグメント (192/192完成)
- 55c705a feat(route): batch 9-13 米州/オセアニア
- 9773d21 feat(route): batch 6-8 欧州完結
- 1c0c9c6 feat(route): batch 4 refine + batch 5 バルカン
- 4e72d96 feat(route): batch 4 東欧/南欧
- 3a6d2c8 feat: Capacitor 8 + Health Connect

### Sic Bo EV 表 (1 chip、参照用)

| ベット | payout | win_prob | lose | 期待乗数 |
|---|---|---|---|---|
| 大/小/単/双 | ×3 | 0.486 | ×0.5 | **×1.213** |
| 合計 9/12 | ×7 | 0.116 | ×0.884 | ×1.124 |
| 合計 8/13 | ×8 | 0.097 | ×0.903 | ×1.116 |
| 合計 10/11 | ×6 | 0.125 | ×0.875 | ×1.113 |
| 合計 7/14 | ×12 | 0.069 | ×0.931 | ×1.111 |
| 合計 6/15 | ×17 | 0.046 | ×0.954 | ×1.089 |
| 合計 5/16 | ×30 | 0.028 | ×0.972 | ×1.069 |
| 合計 4/17 | ×60 | 0.014 | ×0.986 | ×1.044 |
| any-triple | ×30 | 0.0278 | ×0.85 | ×0.951 |
| triple-1〜6 | ×180 | 0.00463 | ×0.85 | ×0.887 |

---

## 🗂 旧引継ぎサマリ (2026-05-02 第4セッション末 — Capacitor 化完了)

別PCで再開する Claude / 数ヶ月後の自分が**最初に読むべき要点**:

1. **本番デプロイは 2 系統**:
   - PWA: https://kentaro-source.github.io/sanpo/ (push で自動デプロイ)
   - **Android APK**: ローカルビルド → 端末に sideload (Play Store 公開はしない、自分用)
2. **APK ビルドの toolchain** (一度入れれば不要):
   - JDK は **Android Studio 同梱の JBR (OpenJDK 21)** を使う (`/c/Program Files/Android/Android Studio/jbr`)。Capacitor 8 が JDK 21 を要求するので、別途入れた Temurin 17 では失敗する
   - Android SDK: `$LOCALAPPDATA/Android/Sdk` (Android Studio Standard install で自動)
   - `android/local.properties` に `sdk.dir` を書いておく必要あり (このリポジトリには既に commit 済)
3. **APK ビルド + 端末インストールのフルコマンド**:
   ```bash
   cd android
   JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" \
     ANDROID_HOME="$LOCALAPPDATA/Android/Sdk" \
     PATH="$JAVA_HOME/bin:$PATH" \
     ./gradlew.bat assembleDebug
   "$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe" install -r \
     app/build/outputs/apk/debug/app-debug.apk
   ```
   - 直前に `npm run cap:sync` で web build → android/app/src/main/assets/public へコピー必須
   - 端末側: USB デバッグ ON + USB ケーブル接続
4. **Health Connect 連携**:
   - プラグイン: `@capgo/capacitor-health@8.4` (Capacitor 8 対応で唯一活発にメンテされてる)
   - アダプタ: [src/services/healthConnect.ts](src/services/healthConnect.ts) + [src/hooks/useHealthConnect.ts](src/hooks/useHealthConnect.ts)
   - 30秒間隔で `queryAggregated({ dataType: 'steps', bucket: 'day', aggregation: 'sum' })` を叩いて当日累計を取得
   - 取得値を **既存の `SYNC_FROM_GOOGLE_FIT` action にそのまま流す** (action 名は legacy だが内部の `attributedTodaySteps` 二重計上防止ロジックが Fit/HC 両方に効く)
   - native 判定は `Capacitor.isNativePlatform()` ([src/services/platform.ts](src/services/platform.ts))。PWA では useHealthConnect は no-op
   - foreground は引き続き DeviceMotion ペドメーター + HC 両方走る (二重計上は attributedTodaySteps で吸収)
   - **背景時の歩数取得が解禁** — 画面 OFF・アプリ閉じてても HC が記録 → 起動時に追いつく
5. **APK 固有の落とし穴と対策**:
   - **WebView の textZoom が端末アクセシビリティの font-size 設定を継承して全 px が拡大される** → [MainActivity.java](android/app/src/main/java/com/kentarosource/sanpo/MainActivity.java) で `setTextZoom(100)` 固定
   - **Header がステータスバーと重なる** (PWA はブラウザが守ってくれるが APK は WebView がフルスクリーン) → `.header` の padding-top を `max(8px, env(safe-area-inset-top))` に
   - **Google Maps が APK origin を許可してない** → Cloud Console の API キー referrer に `https://localhost/*` と `http://localhost/*` を追加 (済)
   - **`.env.local` が worktree には無い** → APK ビルド時は worktree に手動コピーする (`cp ../../../../.env.local .env.local`)
   - **PWA と APK は別 origin (`https://kentaro-source.github.io` vs `https://localhost`) で localStorage 共有なし** → 移行はゲーム再開と同じ。必要なら手動エクスポート/インポート
6. **package.json scripts**:
   - `npm run dev` / `npm run build`: 従来通り PWA 用
   - `npm run cap:build`: `CAP=1` で `vite build` → `dist/` の `base` が `./` になる (APK の WebView 用)
   - `npm run cap:sync`: `cap:build` + `cap sync android` (Capacitor で android/ にコピー)
   - `npm run cap:open`: Android Studio で android/ を開く
7. **vite.config.ts**: `process.env.CAP === '1'` で base を `./` に切り替え。これしないと APK の WebView で asset 読めない (`loading=async` 削除と同レベルの致命傷)
8. **android/ ディレクトリは git commit する**: Capacitor が generate するが、MainActivity の修正やマニフェスト微調整があるので一緒にバージョン管理

### 既知の制約 (Capacitor 後も残るもの)
- iOS APK は未対応 (Capacitor は対応してるが、kentaro-source は Android 端末のみ)
- Health Connect プラグインは API 26+ なので variables.gradle の minSdkVersion を 24→26 にバンプ済
- Foreground notification 周りは未実装 (ロック画面に「歩いた数」表示等は別途 Capacitor プラグイン要)

---

## 🗂 旧引継ぎサマリ (2026-05-02 第3セッション末)

別PCで再開する Claude / 数ヶ月後の自分が**最初に読むべき要点**:

1. **このリポジトリ**: https://github.com/kentaro-source/sanpo (public)
2. **本番URL**: https://kentaro-source.github.io/sanpo/ (push で自動デプロイ、約30秒)
3. **ローカル**: `git clone https://github.com/kentaro-source/sanpo.git C:\dev\sanpo` → `npm install` → `npm run dev`
4. **API キー**: `.env.local` に `VITE_GOOGLE_MAPS_API_KEY=AIzaSyAl8HkXqKTy1_PDDU7-XX4cLQNYfXwrwl8` のみ。Fit/Worker は UI 非表示化したので不要
5. **storage v9 (capitals.ts v4)**: Caucasus(GE/AM/AZ) を ME 直後 (positions 44-46) に移動。AZ→EG / ST→RU を mixed + waypoint anchor にして大陸ジャンプを最低限に

### 主要な変更(このセッション末時点で本番反映済)

**ゲームバランス**:
- `KM_PER_STEP = 0.001` (1m/歩。「1歩は1歩」)
- `stepsPerDie = 1000` (1000歩=1チップ)
- `maxDice = 100` (チップ上限、海越え用に多めに貯められる)
- `BOOST_WINDOW_MS = 30 * 60 * 1000` (Sic Bo 勝ち/負け 全て 30分固定。倍率による窓長変動なし)
- 倍率は `boosts: Boost[]` として multiplicative にスタック(連勝で ×2×6 = ×12 等)
- 首都/都市ボーナス: 「通過/到着」区別撤廃 → 一律。実生活訪問なら 首都 +5 / 都市 +3、未訪問は +2 / +1。`combineDice()` で cap × 1.5 まで bonus 枠 over-cap 許容

**歩数源**:
- DeviceMotion ベースのペドメーター(`src/services/pedometer.ts`、`src/hooks/usePedometer.ts`)が foreground の唯一の歩数源
- Fit UI は完全非表示。`useGoogleFitConnection` フックは残置(将来の Capacitor 移行用)
- ピーク検出閾値 13 m/s²、cooldown 380ms(150歩/分上限)
- `attributedTodaySteps` で全ソース合算管理、二重計上防止

**ルート/地図**:
- waypoint city ペアを ~200km 以下にして Walking モード Directions API を成立させる方針
- 整備済セグメント: Asia (JP→...→TM)、ME(IR→...→CY、ざっくり)、Caucasus、AZ→EG/ST→RU の最小アンカー
- まだ細かく整備されてない: Russia/Europe、Africa(EG→ST 内部)、Americas、Oceania
- Directions API は WALKING → 失敗時 DRIVING fallback、両方失敗で straight line(`seaSegments` 明示)
- Polyline は walked(緑+白halo) / future(青+白halo) で setPath 更新、フリッカー無し
- RDP eps 0.0001°(~10m) で道路精度
- マーカーは可視 9 セグメント周辺の都市のみ生成(perf)
- 📍 ボタン(地図右下) で現在地センタリング。auto-pan は撤廃済

**localStorage キー**:
- `sanpo-game-state` (version 9)
- `sanpo-progress-watchdog` (version-independent backup、distanceKm/totalSteps/visitedCapitals/visitedCities/claimedMilestones/completedLaps/stepsTowardNextDie/availableDice/attributedTodaySteps/attributedDayStart 保持)
- `sanpo-google-fit-token` / `sanpo-google-fit-ever-consented` / `sanpo-fit-user-key` (Fit関連、無効化中)
- `sanpo-pedometer-enabled` (ペドメーター ON/OFF、デフォルト ON)
- `sanpo-directions-cache-v1` (Directions API 30日キャッシュ、⟳ で消さない設計に変更)

### ⟳ ボタンが触るもの
- SW unregister
- Cache Storage 全削除
- localStorage は触らない(game-state, watchdog, Fit token, directions cache 全部保持)

### 次やる作業の優先順位

1. **大陸内ルートの細分化(残約170セグメント)**:
   - Russia/Europe(RU→FI→...→MT)
   - Africa 内部(EG→LY→...→ST)
   - Americas(MT→CA→...→EC、特にカリブ諸島)
   - Oceania(AU→NZ→...→TV)
   - 各セグメントで waypoint city ペアを ~200km 以下にして Walking 成立を狙う
2. **MA-ES(ジブラルタル海峡)接続**: 議論済だが大幅な capitals.ts 再構成が必要なため保留中
3. **Capacitor 化**(B案、未着手): foreground 用途は pedometer で対応済だが、background 同期(画面OFFで歩いた時)は引続き未対応。Health Connect 直叩きで根本解決可

### Watchdog の役割重要性
storage version をバンプすると古い save が version mismatch で drop されるが、watchdog がコア progress (distanceKm + step counts + visited lists + tokens) を独立保存するので、ユーザー進行は失われない。新フィールド追加時は watchdog にも入れること(直近で `stepsTowardNextDie` 等を取り逃して 300歩リセット事故が発生した)。

### 未対応既知バグ/制約
- Player marker は polyline 投影で道路上に snap するが、polyline がまだ非同期ロード中の最初の数秒は great-circle 補間 → ロード後にカクッと位置補正される
- AM↔AZ など国境閉鎖区間は Directions が失敗 → 直線 fallback
- ジオメトリ rebuild は segment 越えのみだが、capitals.ts を変更すると全 segment 再構築でキャッシュ無いと数十秒
- Pedometer は foreground のみ。Android で画面OFF時は歩数が貯まらない。Fit Cloud → Health Connect の遅延問題は依然未解消(Capacitor 化で根本対応予定)

git の identity は `kentaro-source` / `kentaro-source@users.noreply.github.com` を**ローカルのみ**に set 推奨(global は触らない)。

---

## 🗂 旧引継ぎサマリ (2026-05-02 後半セッション、参考)

別PCで再開する Claude / 数ヶ月後の自分が**最初に読むべき要点**:

1. **このリポジトリ**: https://github.com/kentaro-source/sanpo (public)
2. **本番URL**: https://kentaro-source.github.io/sanpo/ (push で自動デプロイ、約45秒)
3. **ローカル**: `git clone https://github.com/kentaro-source/sanpo.git C:\dev\sanpo` → `npm install` → `npm run dev`
4. **API キー**: `.env.local` に `VITE_GOOGLE_MAPS_API_KEY=...` だけで OK(Fit は v8 後半で UI 非表示化したので worker URL 不要)
5. **storage v8 + ペドメーター移行(2026-05-02 後半)**: `attributedTodaySteps` フィールド導入で歩数源跨ぎの二重計上を防御。Google Fit UI を完全非表示にし、in-browser DeviceMotion ペドメーターに一本化。Fit/Worker コードは将来 Capacitor 移行用に残置するが foreground 経由は不要。
6. **Sic Bo 仕様調整(2026-05-02 後半)**: ブースト窓を全勝ち固定 30分(`BOOST_WINDOW_MS = 30 * 60 * 1000`、`utils/sicbo.ts`)、倍率は `boosts: Boost[]` で multiplicative にスタック、`maxDice: 100`、`stepsPerDie: 1000`、`KM_PER_STEP: 0.001`(1m/歩)、首都/都市ボーナスは「通過/到着」区別撤廃で実生活訪問なら +5/+3、未訪問なら +2/+1(cap × 1.5 までボーナス枠 over-cap 許容)。
7. **次やる作業: 経由都市の追加で歩行可能ルート整備(全193セグメント)**:
   - JP→KR でテンプレ確立済み(2026-05-02)。waypoint city ペアを **<200km 間隔**(Walking モード上限 ~300km の安全圏)で繋ぐ。Walking 失敗時は Driving、両方失敗(海越え/国境)時は `seaSegments` 明示で直線フォールバック。
   - JP→KR 例: 東京→横浜→浜松→名古屋→京都→大阪→神戸→広島→北九州→福岡→熊本→宮崎→長崎→[フェリー]→プサン→清州→ソウル(14都市経由、各ペア ≤270km、海越えは Nagasaki↔Busan のみ)
   - 残り192セグメント分、地域順に同じ要領で waypoint city 設計 + cities.ts に必要なら都市追加 + segmentMeta.ts の waypointCityIds 更新
8. **既知の根本問題(継続)**: モダン Android は歩数を Health Connect に書き、Fit クラウドへのミラー遅延あり。Capacitor + Health Connect プラグイン未着手だが、ペドメーター一本化で foreground 体験は実用域。background は別途要対応。
9. **その他重要な fix 履歴(セッション末尾)**:
   - createInitialState の `version: 7` リテラル(CURRENT_VERSION=8 と不一致 → 毎 reload で reset)を 8 に修正
   - RDP 再帰がスタック overflow → 反復実装に変更(`MapView.tsx`)
   - `built.push(...pathSeg)` で V8 引数数上限(~65k)突破の RangeError → ループ push に変更
   - RDP 簡略化 eps を 0.02°(~2km)→ 0.001°(~100m)に絞り、zoom16 で道路カーブが残るように
   - 地図右下に 📍 現在地ボタン追加(`map-recenter` クラス)
   - ルート線を「青+白アンダーグロー」で密集タイル上でも視認可能に

git の identity は `kentaro-source` / `kentaro-source@users.noreply.github.com` をローカルセット推奨。

**⟳ ボタン挙動の変遷**: 一時期 Fit 認証状態もクリア → ユーザー再連携事故 → 7888d73 で Fit clear 撤去。`CLEAN_SLATE_KEY` ワンショット強制リセット機構を入れたが意図せず再発動して進行リセットの原因になり撤去(セッション末尾)。今は SW unregister + Cache Storage 削除 + `sanpo-directions-cache-v1`/`v2` 削除のみ。`sanpo-game-state` / `sanpo-progress-watchdog` は触らない。

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
- 2026-05-02: **距離ベース大型リファクタ + Worker 認証 + Fit クラウド遅延の限界露呈**。重要な転換点:
  - **マス概念廃止 → 距離ベース**(player.distanceKm continuous km along route)
    - 歩数 → km 直接変換 (1歩 = 100m, KM_PER_STEP=0.1)
    - 1日約 1,000km 進行(10,000歩×100m)、約230日で1周
    - storage version 5→6
  - **Sic Bo 仕様変更**: マス進行ではなく**速度倍率ウィンドウ**を設定する勝負に
    - 標準 Sic Bo 配当(大/小=×2 等、`SICBO_PAYOUTS`)
    - Boost budget = 倍率 × 時間 = 48 一定: ×2 → 24h、×12 → 4h、×180 → 16分
    - 勝ち: 倍率ウィンドウ起動。負け: ×0.5 同時間ペナルティ
    - 倍率有効中の再ロールは**上書き**
    - `evaluateBetWindow`, `windowMsForMultiplier`, `LOSS_MULTIPLIER` (utils/sicbo.ts)
  - **進行UI再設計**: マス → km 表示
    - ProgressInfo: 「📍 宮崎 868km / 計868」(実距離、square 量子化なし)
    - waypoint 都市は path-fractional km で正確に配置(7e9e26a)
    - 「⚡ ×2 加速中（残り 23h45m）」バナー
    - 距離フォーマット: 100km以上はカンマ区切り("1,234km"、"千km"廃止)
  - **地図表示**:
    - プレイヤーマーカーは `positionAtKm()` で polyline 上に補間 → 歩くと滑らかに動く
    - **歩いた所(緑太線) / これから(グレー細線)** の2色描画(7e9e26a)
    - デフォルト zoom 14(100m=10px、街レベル)、AUTO-PAN は marker が viewport 内側75%から外れた時のみ
    - 東京座標を**東京駅(35.6812, 139.7671)**に変更(以前は Suginami 和泉でしょぼかった)
  - **Cloudflare Worker 認証(`worker/`)**: 1時間 token 期限切れの再連携要求を廃止
    - 構成: PWA で `initCodeClient` ポップアップ → auth code を Worker `/exchange` へ POST → Worker が client_secret で交換し refresh_token を KV に保存 → 以降は `/refresh` で永続トークン取得
    - 新規 OAuth クライアント `283060166957-n7v8roliir9nbhiueiolbgimdftjfd1d.apps.googleusercontent.com` (My First Project 配下、テストモード)
    - **必須**: redirect URI に `postmessage` を追加(GIS popup フロー仕様)
    - GitHub Actions Secret: `VITE_FIT_WORKER_URL=https://sanpo-fit.kk891751.workers.dev`
    - KV namespace ID: `62334a5f2e064b3b84e441795c734b8b`
    - `getAccessToken(false)` は worker mode で `workerRefresh()` を呼び silent token 更新
  - **Fit データ遅延の構造的問題が露呈**:
    - 端末 → Health Connect → Fit Cloud のパイプラインで Fit Cloud への到達が極端に遅い／無い
    - 多ソース max + 生 dataset endpoint も併用したが効果限定的
    - **Fit アプリは HC を直接読むので増えるが、我々の REST API は Fit Cloud しか見えない**
    - 解決には Capacitor + Health Connect プラグイン化が必要(未着手)
  - **NaN-safe 防御**: stepsToKm の multiplier/multiplierUntil が undefined だと NaN→localStorage に null として保存→無限ループでロックする可能性あり。`Number.isFinite()` チェックと `loadGameState` のサニタイザで自動修復(579ce87)
  - **その他**:
    - 歩数取得は徒歩優先、長距離は車優先のフォールバック(`directions.ts`)
    - `⟳` ボタンが Fit 状態を clear する仕様を撤回(596a5d9 → 7888d73 でリバート)
    - 手動歩数入力を Fit 連携中も常時表示する案を**ユーザー却下**(撤回)
    - Fit 同期は診断行タップで手動同期可能(`sanpo-force-sync` カスタムイベント)
- 2026-05-01: 大型セッション。**地図パフォーマンス + Google Fit 同期 + 進行 UX + ボーナス系**を一気に整備:
  - **地図パフォーマンス**:
    - 全193セグメントの個別 Polyline → **「現在地周辺の9セグメントだけ」を1本の Polyline に統合**(SEGMENTS_BEHIND=3, SEGMENTS_AHEAD=5)
    - クリッピング(modulo wrap しない)。wrap させると未分類セグメントが古い分類域を巻き込んで「東京→中東 ghost line」が出る
    - Polyline 簡略化を Douglas-Peucker(RDP, 0.02deg≈2km)に変更。固定数サンプリングだと曲線が直線化してしまうため
    - 首都マーカーを「現在地から3つ後・5つ前」のみに削減。zoom>=7 でのみ表示
    - マスドット zoom>=8 + 1/5 サンプル
    - デフォルト zoom 4→11(街レベル)。`fitBounds` ではなくプレイヤー中心の `setCenter`+`setZoom`
    - **ヘッダーにビルドタグ表示**(`vite.config.ts` で `__BUILD_TAG__` define、MMDD-HHMM形式)。「変わってない」を可視化
  - **Google Fit「歩数増えない」問題の決着**:
    - 旧: incremental fetch `[lastSync, now]` → Fit サーバ書き込み遅延でウィンドウ通過したデータが永久に取りこぼし
    - 新: **絶対値ベース** — 毎回 `[startOfToday, now]` で当日累計を取得し、reducer 側で前回累計 baseline との delta を加算。idempotent + 遅延データ自動回収。日跨ぎで baseline reset。アップグレード初回は二重カウント防止で baseline 採用のみ
    - PlayerState 拡張: `todayStepsBaseline`, `todayBaselineDayStart`
    - 自動ポーリング: 60s/60s → **30s/25s** に短縮(間隔と min interval 同値だと半分の tick が no-op になっていた)
    - **Service Worker が外部 API リクエストに干渉する可能性**を完全排除。`url.origin !== self.location.origin` で SW スルー
    - Fit fetch に `cache: 'no-store'`(belt-and-suspenders)
    - **多ソース最大値採用**: モダン Android Fit アカウントは複数の歩数ストリーム(estimated_steps / merged / Health Connect mirror / OEM)が共存し、**1ストリームだけ更新が止まる現象がある**(これが3,647歩固定の真因)。`dataSources?dataTypeName=...` で全列挙→各 ID で aggregate→max を採用
    - 診断UI: ProgressInfo に「Fit: N歩 / HH:MM:SS 同期」を表示。同期が動いてるか・何を返してるかを画面で切り分け可能に
    - **致命的修正**: `silent re-auth` の入れすぎでポップアップブロッカ起動 → 結局 catch して null 返すラッパーで囲ったので一応OK。`getAccessToken(interactive=false)` で外向きには interactive を要求しない設計
  - **ルート精度 + 進行 UX**:
    - **waypoint 都市をマスに紐付け**(`Square.cityId`)。`generateRoute` で各 waypoint の path 上 fractional 位置から最寄マス決定、衝突時は前進
    - **停車地チェーン表示**(ProgressInfo): 次の首都に着くまでの city stops を 6個まで列挙、`📍 宮崎 / 📍 長崎 / 📍 福岡 / 🏛 ソウル` の縦リスト
    - 距離は **「前の停車地からの距離」** を主表示、計N(現在地から)を muted で副表示。絶対距離だけだと "宮崎 8 / 長崎 10 / 福岡 11" が一様に見えて宮崎→長崎の近さが伝わらない
    - 実生活訪問都市は ★ プレフィックス
    - **land/mixed セグメントは great-circle × 1.4倍** で道路距離を概算(precompute されるまでの暫定)。Tokyo→Seoul 11→16マス
    - precompute スクリプト `scripts/precompute-distances.ts` 完成済(が API キー問題で実行不可)
    - 空の `src/data/segmentDistances.ts` 用意 → precompute 実行されたら自動で `generateRoute` が優先採用
    - storage version 4→5(マス数シフトのため)
  - **マイルストーン + 都市訪問ボーナス + トースト**:
    - マイルストーン: `MILESTONES` 定数(10k=+1🎲, 100k=+2, 1M=+3, 10M=+5, 100M=+5+特別ラベル)。`ADD_STEPS` / `SYNC_FROM_GOOGLE_FIT` でトリガ
    - 都市訪問ボーナス: `ROLL_SICBO` で `totalAdvance>0` 時、着地マスから半径200km以内の未訪問都市を検出 → +1🎲 (`visitedInRealLife=true` なら +2🎲 思い出ボーナス)
    - 首都通過/到着もトースト化
    - PlayerState 拡張: `claimedMilestones`, `visitedCities`, `recentBonuses`(直近8件 ring buffer)
    - `BonusToast` コンポーネント: 地図右上に floating、5秒で自動消滅。kind 別色(milestone=琥珀, city-irl=ピンク, capital-landing=緑)
  - **CLAUDE.md 自体のアップデート**: 今あなたが読んでいるこの長大な追記がそれ

### デプロイ
- **本番URL**: https://kentaro-source.github.io/sanpo/
- **リポジトリ**: https://github.com/kentaro-source/sanpo
- **デプロイ**: pushすると GitHub Actions で自動デプロイ（`.github/workflows/deploy.yml`）

### 現在の状態 (2026-05-01 引継ぎ)

**動作状況**: 本番URLで完全動作。Android Chrome PWA で動作確認済み。Google Fit 多ソース同期で歩数増加確認済み。

**主要実装ファイル**:
- レイアウト: `src/App.css` — `.app-layout` flex column / map `flex:1` / `.bottom-panel` `position:fixed; bottom:0`
- ヘッダー: `src/components/layout/Header.tsx` — `せかいさんぽ` + visited count + dice token + ビルドタグ + `⟳` (`hardReload()`)
- マップ: `src/components/map/MapView.tsx` — Polyline は近傍9セグメント結合 + RDP簡略化、首都マーカーは近傍9個のみ、デフォルト zoom 11
- ルート描画: mixed セグメントは隣接ペアごとに Directions API、海越え(`seaSegments`明示 or API失敗)は直線
- マス生成: `src/data/generateRoute.ts` — waypoint-aware 距離計算 + 1.4倍 road factor(land/mixed)、waypoint 都市をマスに紐付け
- 進行UI: `src/hooks/useGame.ts` の `upcomingStops` derive、`src/components/stats/ProgressInfo.tsx` で停車地チェーン表示
- ボーナス: `src/contexts/GameContext.tsx` の `MILESTONES` 配列 + ROLL_SICBO 内の都市検出ロジック + `BonusToast.tsx`
- Google Fit: `src/services/googleFit.ts` — 多ソース max 採用、`cache: 'no-store'`、SW バイパス
- 診断UI: `src/components/dice/StepInput.tsx` — `Fit: N歩 / HH:MM:SS 同期` 行
- PWA更新: `public/sw.js` の `__BUILD_ID__` をビルド時に注入、`controllerchange` で自動リロード、外部 origin はバイパス

**localStorage キー一覧**:
- `sanpo-game-state` (**version 5**, マス数 1.4倍 road factor 反映)
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
1. ✅ **マイルストーン・都市訪問ボーナス実装** (2026-05-01 完了)
   - `MILESTONES` 定数 + `checkMilestones()` ヘルパー
   - ROLL_SICBO 内で半径200km検出 + 思い出+2🎲
   - `BonusToast` で5秒 floating 表示
2. **セグメント分類バッチ4-11** (ロシア・欧州・アフリカ・米州・オセアニア) — まだ未着手、147/193 残
3. **実道路距離プリコンピュート** — スクリプト `scripts/precompute-distances.ts` 完成済み。**しかし API キーの referrer 制限で REQUEST_DENIED**(旧 CLAUDE.md の記載は誤り)。要対応:
   - Google Cloud で **referrer 制限なし**(または IP制限のみ)のサーバー用 API キーを新規作成
   - `.env.local` に追加するか、スクリプト内で別 env から読む
   - `npx tsx scripts/precompute-distances.ts` で `src/data/segmentDistances.ts` 自動生成
   - 完了後は `generateRoute` が `precomputed ?? heuristic*1.4` で自動採用
4. その他: ログインボーナスは**不要**で確定（純粋に歩数連動）

**今後検討する UX**
- 自動ストップ機能(首都/都市で必ず止まる、超過分消失、ボーナス統一)
- Sic Bo ダイス履歴(過去10回)
- 首都到着時に国情報 popup(RestCountries API)
- 地図がまだ重ければ追加対応(マーカー全廃モード or Leaflet 戻し)

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
- 経由都市マーカー: タイプ別色、**zoom>=7 でのみ表示**
- ルート: ユーザー指摘により**色分けは廃止**。単一の青(#2563eb)Polyline
- 通過済み: 緑実線 / 未通過: グレー破線
- 訪問済み首都: 大きい緑丸 / 未訪問: 小さいグレー丸、**現在地から3つ後・5つ前のみ表示**
- landセグメントは Directions API で実道路追従
- mixedセグメントは隣接ペア毎に Directions API 試行、海越えは直線(geodesic curve)
- すべての Polyline に `geodesic: true` → 直線でなく大圏弧
- マスドット: 1/5サンプル + **zoom>=8 でのみ表示**、通過済み4px緑/未通過2px灰
- **デフォルト zoom 11**(街レベル)、プレイヤー中心 `setCenter`+`setZoom`(`fitBounds`は使わない)
- **Polyline は近傍9セグメント結合 + RDP簡略化**(2km tolerance)。世界一周分1500点を毎回描くのは重すぎたため
- ヘッダー右に**ビルドタグ表示**(MMDD-HHMM)で「最新版か」を即座に確認できる

### Google Fit
- 連携後はUI完全非表示（自動同期がbackground）
- 同期成功時のみ短いトースト
- アプリ起動時とフォーカス復帰時に自動同期 + **30秒ごとポーリング**(min 25s dedup)
- 連携前のみ大きな「連携」ボタン
- **`ever-consented` フラグで永続「連携済み」扱い** — トークン期限切れ後もボタン再表示しない
- 旧トークン保存履歴があれば自動でフラグONバックフィル(過去ユーザーも対応)
- silent re-auth は controlled に試行(`getAccessToken(interactive=false)` 内で `silentSignIn()` をサイレントに、失敗時は throw して呼び出し側でハンドリング)
- **多ソース max 採用** — `dataSources?dataTypeName=com.google.step_count.delta` で全ストリームを列挙し、各 ID に対して個別 aggregate を投げて**最大値**を返す。モダン Android で複数ストリームのうち1つだけ更新が止まる現象に対処
- **絶対値ベース同期** — 毎回 `[startOfToday, now]` で当日累計を取得し、reducer で前回 baseline との delta を加算。Fit サーバ書き込み遅延でデータが遅れて到着しても次回ポーリングで自動回収。アップグレード初回だけ二重カウント防止で baseline 採用のみ
- `cache: 'no-store'` + Service Worker 外部 origin バイパスで stale データを完全排除
- 診断UI: 進捗バー下に `Fit: N歩 / HH:MM:SS 同期` を表示。「歩数増えない」を切り分け可能

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

### なぜ road factor を 1.4倍にした(precompute 完了までの暫定)
- great-circle で waypoint を辿った長さは実道路距離より明らかに短い(関東→九州横断で 1100km vs 道路 1500km 弱)
- precompute 入るまで land/mixed セグメントは `× 1.4` でかさ上げ
- Tokyo→Seoul: 11マス → 16マス(2026-05-01時点)
- precompute 結果が `segmentDistances.ts` に入ったら自動で優先採用、1.4倍は使われなくなる
- 1.4 という数字は「Asia 区間で実距離 / great-circle が概ねこの比」の経験則。地域差は precompute で吸収

### なぜ停車地表示は「前の停車地からの距離」を主にした
- 当初は「現在地から N マス先」で表示していたが、Tokyo→宮崎 8マス・宮崎→長崎 10マス・福岡 11マス と並ぶと「どれも 10マス前後」に見えてしまい近さの差が伝わらない
- 主表示を「前の stop からの距離」(2/1/2/2/1)に変更、計N(現在地から)を muted で副表示
- 地理的な「次の一歩の重さ」が直感的に伝わるようになった

### マイルストーン+都市訪問ボーナスの実装ポイント
- `MILESTONES` は ascending、`oldTotal < threshold <= newTotal` を1つの sync で複数跨いだ場合は全部 fire
- `claimedMilestones` でべき等性を担保(同じ閾値で2度報酬は出ない)
- 都市検出は `ROLL_SICBO` の advance>0 時のみ、停止地点(toSquare)から半径 200km haversine で
- `recentBonuses` は ring buffer (max 8)、新しいものが先頭、`BonusToast` が timestamp で expire
- 思い出ボーナスは `city.visitedInRealLife === true` で判定、`★懐かしの〇〇を再訪` ラベル
- 首都到着もトースト化(以前は silent だった)

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
- Mapに表示済み（type別色分け、zoom>=7）
- ✅ **近接検出と都市訪問ボーナス実装済み** (2026-05-01: ROLL_SICBO 時に半径200km、未訪問+1🎲、思い出+2🎲)

### 次のフェーズ実装 (まだ未着手)
1. **実道路距離プリコンピュート**: スクリプト `scripts/precompute-distances.ts` 完成済み。**API キー問題で実行ブロック**(下記参照)。出力 → `src/data/segmentDistances.ts` → `generateRoute.ts` が自動採用
2. **海ルート手動キュレーション**: 重要な海峡・フェリー waypoint(どの mixed セグメントで `seaSegments` を明示するか)
3. **セグメント分類バッチ4-11** (ロシア・欧州・アフリカ・米州・オセアニア) — 147/193 残
4. **自動ストップ機能**: 新規首都・都市で必ず止まる
5. **Sic Bo ダイス履歴** (過去10回)
6. **首都到着時の国情報** (RestCountries API)

### precompute スクリプト実行のための API キー問題
- 現行 `VITE_GOOGLE_MAPS_API_KEY` は HTTP referrer 制限 (`https://kentaro-source.github.io/*` + `http://localhost:5173/*`)
- Maps JS API はブラウザの Referer 検証で動くが、**Directions HTTP API は Referer 検証しない** → REQUEST_DENIED が返る
- 旧 CLAUDE.md の「referrer ヘッダ付きで HTTP fetch すれば通る」は**実機検証で誤りと判明**(2026-05-01)
- 解決策: Google Cloud Console で
  1. 新しい API キーを作成
  2. **アプリケーション制限なし** または IP 制限のみ(自宅IP等)
  3. **API 制限**: Directions API のみ許可
  4. `.env.local` に別変数として追加 or スクリプト内ハードコードして実行
  5. 実行後はキーを削除/制限変更で安全に
- 実行手順: `API_KEY=xxx npx tsx scripts/precompute-distances.ts`(スクリプトは現状 `.env.local` から読むので別 env サポート要追加)

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
