# Sanpo - 歩いて世界一周アプリ

歩数計と連動して、世界193カ国の首都を Sic Bo（大小）ベットで巡るゲーム。

🌐 **本番URL**: https://kentaro-source.github.io/sanpo/

---

## 🤖 Claude Code 用：再開コマンド

ユーザーが以下のフレーズを言ったら、このプロジェクトの作業再開を意図しています。

**トリガーフレーズ**:
- 「sanpo」「sanpo再開」
- 「歩いて世界一周」
- 「世界一周アプリ」
- 「再開」（文脈で sanpo と判断できる場合）

**Claude が行うべきこと**:

1. 現在のディレクトリが `sanpo` プロジェクトでない場合:
   - `C:\dev\sanpo` が存在すればそこに `cd`
   - 存在しなければ `git clone https://github.com/kentaro-source/sanpo.git C:\dev\sanpo` を実行
2. `git pull` で最新化
3. プロジェクトの `CLAUDE.md` を読み込んで状況把握
4. ユーザーに「最新を取得しました。前回の続きから始めますか？」と確認
5. 続きから作業

ユーザーはコマンドラインを覚えていないので、Claude側から先に行動・実行する。

---

## プロジェクト概要

- **目的**: 歩数を世界一周ゲームに変換するスマホPWA
- **技術**: React 19 + TypeScript + Vite 8 + Leaflet + GitHub Pages
- **進捗**: 詳細は `CLAUDE.md` 参照

## 開発コマンド

```bash
npm run dev       # 開発サーバー
npm run build     # ビルド
git push          # GitHub Actions で自動デプロイ
```

## ライセンス

個人プロジェクト（自分用）
