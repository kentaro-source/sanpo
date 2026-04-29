# Sanpo - 歩いて世界一周アプリ

## プロジェクト概要
スマホの歩数計と連動して、歩くだけで世界193カ国の首都を一筆書きで巡るシミュレーション。
桃鉄スタイルのサイコロでマスを進む。**自分用、個人プロジェクト**。

仕様の詳細は `歩いて世界一周アプリ_プロジェクト仕様書.md` を参照。

## 経緯と現在の状態

### 経緯
- 2026-04-16: Phase 1 MVP実装、GitHub Pagesデプロイ、PWA化
- 2026-04-17頃: カザフスタン旅行（手動歩数入力で運用開始）
- 2026-04-29: Google Fit連携作業を開始（OAuth設定途中）

### 現在 (2026-04-29時点)

### デプロイ
- **本番URL**: https://kentaro-source.github.io/sanpo/
- **リポジトリ**: https://github.com/kentaro-source/sanpo
- **デプロイ**: pushすると GitHub Actions で自動デプロイ（`.github/workflows/deploy.yml`）

### 実装済み (Phase 1 MVP完了)
- 193カ国首都ルート（東京スタート、桃鉄式マス進行）
- 手動歩数入力 → 5,000歩で🎲1個（上限5個）
- サイコロ振って1〜6マス進む
- 首都ぴったり到着でボーナス🎲+1
- すごろく風マスドット表示（Leaflet SVG）
- 通過済み/未通過の色分け
- localStorageでセーブ（`sanpo-game-state`）
- PWA対応（PNGアイコン、Service Worker、manifest.json）
- モバイルファーストUI

### マス数バランス
- 全体 約3,000マス（150km=1マス、最小5、最大40）
- 最長区間: 40マス
- サイコロ上限5個 × 6 = 最大30マス進行（最長区間を一発で越えられない）

## 技術スタック
- React 19 + TypeScript + Vite 8
- Leaflet + react-leaflet（地図）
- localStorage
- GitHub Pages（ホスティング）

## ディレクトリ構造
```
src/
├── components/
│   ├── dice/        # DiceButton, DiceResult, StepInput
│   ├── layout/      # AppLayout, Header
│   ├── map/         # MapView, RoutePolyline, SquareDots, CapitalMarkers, CurrentPositionMarker
│   └── stats/       # ProgressInfo
├── contexts/        # GameContext (useReducer + localStorage persist)
├── data/
│   ├── capitals.ts  # 193カ国首都データ（ルート順）
│   ├── generateRoute.ts  # マス生成ロジック
│   └── index.ts     # routeData singleton
├── hooks/           # useGame
├── types/           # 型定義（Capital, Square, GameState等）
└── utils/           # geo (Haversine, interpolate), storage
```

## 進行中: Google Fit連携

### 状況
2026-04-29から作業開始。OAuth設定の途中で中断。次回続き。

### Google Cloud Console 設定状況
- プロジェクト: `sampo` 作成済み
- Fitness API: 有効化済み
- OAuth同意画面: 作成済み（公開ステータス: テスト）
- スコープ追加: ✅ 完了 (`fitness.activity.read`)
- **テストユーザー追加: 未完了**（自分のGmail追加が必要）
- **OAuth Client ID作成: 未完了**

### 残りの設定手順
1. Google Cloud Console → 「対象」 → テストユーザーに自分のGmail追加
2. 「クライアント」 → 「OAuth クライアントを作成」
   - アプリケーションの種類: ウェブ アプリケーション
   - 名前: `Sanpo Web`
   - 承認済みのJavaScript生成元:
     - `https://kentaro-source.github.io`
     - `http://localhost:5173`
   - 作成 → **クライアントID取得**

### 実装するもの (クライアントID取得後)
- Google Identity Services での OAuth フロー
- Fitness API REST 呼び出しで今日の歩数取得
- 「Google Fitと連携」ボタン
- 連携後は自動で歩数を取得して `addSteps` を呼ぶ

### 注意事項
- Google Fit REST API は **2026年に廃止予定**。当面動くが将来は Health Connect への移行検討。
- クライアントIDは公開しても問題ない（シークレットではない）が、JavaScript生成元の制限で守る。

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

## 今後やりたいこと（メモ）
- 主要都市追加（首都以外。大阪、上海、ドバイ、NYC等）
- マスイベント（エリア別ランダム表示）
- 首都到着時の国情報表示（RestCountries API）
- Travel Tracker連携（訪問済み国は思い出表示）
- ストリートビュー連携
- 統計ダッシュボード
