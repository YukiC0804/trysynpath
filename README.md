# Try Synpath — Operations Demo

Standalone interactive product demo for Synpath's AI Operations Command Centre.

## 本地运行

```bash
git clone https://github.com/YukiC0804/trysynpath.git
cd trysynpath
npm install
npm run dev
```

打开 http://localhost:3001

---

## 首次发布到 GitHub（`YukiC0804/trysynpath`）

代码目前在 [Demo 仓库的 `trysynpath/` 目录](https://github.com/YukiC0804/Demo/tree/cursor/manufacturing-ops-demo-314a/trysynpath)。`trysynpath` 独立仓库需要**你本机 push 一次**（Cursor bot 没有该仓库写权限）。

### 方法 A：本机一键推送（推荐）

```bash
git clone https://github.com/YukiC0804/Demo.git
cd Demo
git checkout cursor/manufacturing-ops-demo-314a
cd trysynpath
bash scripts/publish-to-github.sh
```

完成后即可：

```bash
git clone https://github.com/YukiC0804/trysynpath.git
cd trysynpath
npm install
npm run dev
```

### 方法 B：GitHub Actions 自动同步

1. 创建 [Fine-grained PAT](https://github.com/settings/tokens?type=beta)，对 `YukiC0804/trysynpath` 勾选 **Contents: Read and write**
2. 在 [Demo 仓库 Settings → Secrets → Actions](https://github.com/YukiC0804/Demo/settings/secrets/actions) 添加 `TRYSYNPATH_PUSH_TOKEN`
3. 打开 [Actions → Publish trysynpath](https://github.com/YukiC0804/Demo/actions/workflows/publish-trysynpath.yml) → **Run workflow**

### 方法 C：授权 Cursor GitHub App

1. 打开 https://github.com/settings/installations
2. 找到 **Cursor** → Configure
3. Repository access 添加 **trysynpath**
4. 保存后让 Cursor agent 重新 push

---

## Build

```bash
npm run build
npm run preview
```

## Document → Sage workflow

Architecture, Gmail OAuth setup, fixtures, safe modes and the manual live test
checklist are documented in
[`docs/SAGE_DOCUMENT_WORKFLOW.md`](docs/SAGE_DOCUMENT_WORKFLOW.md).

The production Gmail callback URI is:

```text
https://www.getsynpath-ai.com/api/gmail/oauth/callback
```

Never commit the Google OAuth client-secret JSON.

## Demo assets

将图纸/spec 图片放入 `download/` 后运行：

```bash
bash scripts/copy-demo-assets.sh
```
