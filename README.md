# grill-me — Claude Code Skill メモ

Matt Pocock 氏（元 Vercel）が公開している Claude Code 用スキル `grill-me` のメモ。
このリポジトリは、このスキルを実際に使って試すためのデモ環境（Next.js プロジェクト）です。

- 本家: <https://github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md>
- 解説記事: <https://www.aihero.dev/use-the-grill-me-skill-k029d>

---

## これは何か

**Claude にコードを書かせる前に、設計や計画を質問攻めにしてもらう**ためのスキル。

Claude / Codex などのコーディングエージェントが「ユーザの意図を十分に理解しないまま実装に走ってしまう」失敗パターンへの対策として作られた。`/grill-me` をトリガすると、Claude は次のように振る舞う:

- 計画の各論点を**決定木（decision tree）として扱う**
- 上流の分岐から順に、**1 度に 1 問ずつ**質問してくる
- 各質問に **推奨される回答候補を添えて**提示する
- 必要に応じて、ユーザの説明だけに頼らず**コードベース自体を調べに行く**
- 全分岐が解決するまで「容赦なく」インタビューを続ける

つまり、ユーザが「曖昧なまま実装に進む」のを物理的に防ぐためのガードレール。

## 本家 SKILL.md の全文

スキル本体はわずか数行。中身は以下のとおり（YAML フロントマター + 短い指示）:

```yaml
---
name: grill-me
description: Interview the user relentlessly about a plan or design until reaching shared understanding, resolving each branch of the decision tree. Use when user wants to stress-test a plan, get grilled on their design, or mentions "grill me".
---
```

**Key Instructions**

- "Interview the user relentlessly about every aspect of this plan until we reach a shared understanding"
- Walk through the complete decision tree, addressing dependencies sequentially
- Present one question at a time
- Offer recommended answers alongside each query
- When applicable, investigate the codebase rather than relying solely on user explanations

ポイントは **"walk down each branch of the design tree"** という言い回し。これによって Claude は「1 個のプロンプト」ではなく「複数の決定の連なり」として要件を扱うようになる。

## どんな時に使うか

- 新機能の設計を着手前にストレステストしたい
- 自分の頭の中の仕様を**言語化させて穴を見つけたい**
- アーキテクチャ選択の前に、未決の論点を洗い出したい
- Claude に「先走って実装するな」と毎回言うのが面倒な時

## インストール

Claude Code は `~/.claude/skills/<name>/SKILL.md` を自動で読み込むので、配置するだけで有効化される:

```bash
mkdir -p ~/.claude/skills/grill-me
curl -o ~/.claude/skills/grill-me/SKILL.md \
  https://raw.githubusercontent.com/mattpocock/skills/main/skills/productivity/grill-me/SKILL.md
```

## 使い方

会話中に以下のいずれかで発火する:

- 「`/grill-me`」と明示的に呼ぶ
- 「grill me on this plan」など自然文でトリガフレーズを含める
- 「この設計を詰めたい / ストレステストしたい」といった文脈

発火後は Claude が 1 問ずつ質問してくるので、淡々と答えていく。全分岐が解決すると、合意済みの内容のサマリを出してくれる。

## 派生: `grill-with-docs`

同じく Matt Pocock 氏が公開している進化版。**質問攻めに加えて、決定内容を `CONTEXT.md` や ADR（Architecture Decision Records）にインラインで書き出す**ところまでやる。

- 既存のドメインモデルと用語の整合を取る
- 「なぜその選択をしたか」を未来の開発者に残せる
- アーキテクチャレベルの大きな意思決定に向く

`/grill-me` で感触を掴んだら、こちらに進むのが想定された流れ。

## 参考リンク

- 本家リポジトリ: <https://github.com/mattpocock/skills>
- "My 'Grill Me' Skill Went Viral": <https://www.aihero.dev/my-grill-me-skill-has-gone-viral>
- "5 Agent Skills I Use Every Day": <https://www.aihero.dev/5-agent-skills-i-use-every-day>
- ClaudSkills カタログ: <https://claudskills.com/skills/grill-me/>
