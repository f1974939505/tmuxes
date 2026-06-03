<div align="center">

# 🖥️ tmuxes

**简体中文** ｜ [English](./README.en.md)

### 一个浏览器标签页，掌控一整群 CLI coding agent。

**Claude Code · Codex · OpenCode · Hermes** —— 每个 agent 独占一个 tmux 会话，
横跨 **本地 · SSH · WSL**，还自带每个 agent 工作目录的文件浏览器。

<p>
<a href="https://www.npmjs.com/package/tmuxes"><img alt="npm version" src="https://img.shields.io/npm/v/tmuxes?style=flat-square&logo=npm&color=CB3837"></a>
<img alt="platform" src="https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows%2011-2b2b2b?style=flat-square">
<img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black">
<img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white">
<img alt="Node.js" src="https://img.shields.io/badge/Node.js-22-339933?style=flat-square&logo=nodedotjs&logoColor=white">
<img alt="Vite" src="https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white">
<img alt="tmux" src="https://img.shields.io/badge/tmux-3.x-1BB91F?style=flat-square&logo=tmux&logoColor=white">
<img alt="xterm.js" src="https://img.shields.io/badge/xterm.js-6-1f6feb?style=flat-square">
</p>

<sub>🔒 仅本机 · ⚡ 一键启动 · 🪟 Windows 上直通 WSL · 🧩 零配置</sub>

</div>

---

> **为什么做这个？** 现代编码 agent 都是常驻的终端进程。同时跑好几个，你就开始在一堆窗格、SSH 窗口之间手忙脚乱：
> 「等等，刚那个是在哪台机器上来着？」**tmuxes** 把它们全塞进一个清爽的网页 UI：
> 开一个会话、丢进文件夹、看它干活、顺手瞄一眼它正在改的文件 —— 本地还是远程，都是同一个视图。

## ✨ 特性亮点

| | |
|---|---|
| 🧠 **为 agent 而生** | 每个 agent 独占一个 tmux 会话。新建时可带初始命令（比如 `claude` 或 `codex`），选中后右侧就是一个**完全可交互的实时终端**。 |
| 🌐 **本地 · SSH · WSL · 原生 Windows** | 一个侧边栏同时列出你的本机、`~/.ssh/config` 里的主机、（Windows 上）你的 WSL 发行版，以及（Windows）原生 PowerShell / cmd 会话 —— 全部并排排开。 |
| 🗂️ **文件夹树** | 像资源管理器一样，把会话拖进**可拖拽的文件夹**里整理。按目标分别持久化到本地。 |
| 📂 **实时文件浏览 + 编辑** | 侧边栏底部跟随每个会话的**工作目录** —— 点一个代码文件就能把终端一分为二，在下面**直接读和改**（可保存、撤销/重做）。 |
| 🔁 **真·多端同步** | 基于原生 `tmux attach`：同一个会话开两个标签页，逐键同步、互为镜像。 |
| ⚙️ **可调** | 侧边栏、终端、文件查看器的字号都能调，**实时生效**、刷新后仍保留。 |
| 🚀 **一键启动** | 双击 `start.cmd` / `start.command` / `start.sh` → 自动构建、启动、打开浏览器。 |

## 🖼️ 长这样

```text
┌───────────────────────────┬──────────────────────────────────────────────┐
│ tmuxes                  ⟳ │  ● claude-code — agent1                        │
│                           │                                                │
│ ▾ Local            local  │   $ claude "refactor the auth module"          │
│   📂 frontend             │   ⠿ thinking…                                  │
│     ● agent1   2 win · 3m │   ▸ Editing src/auth/session.ts                │
│     ○ agent2   1 win      │   ▸ Running tests…                             │
│   📁 backend              │                                                │
│   ○ scratch    1 win      │                                                │
│ ▾ devbox             ssh  ├───────────────── src/auth/session.ts ─────────┤
│   ○ build      1 win      │  1  export function createSession(user) {      │
│ ─────────── drag ──────── │  2    const token = sign(user, KEY)            │
│ WORKING DIRECTORY     ↑ ⌂ │  3    return { token, exp: Date.now() + TTL }  │
│   📁 src                  │  4  }                                          │
│   📄 session.ts           │                                                │
│   📄 README.md            │                                                │
│ ⚙ Settings                │                                                │
└───────────────────────────┴──────────────────────────────────────────────┘
   侧边栏：tmux 树 + 当前目录文件浏览器          终端  ╱  打开的文件
```

## 🏗️ 架构

```text
                          REST  (create · list · rename · kill · cwd · files)
  ┌────────────┐   ┌──────────────────────┐        ┌──────────────────────────────────┐
  │  Browser   │──▶│  Node · Express · ws │──pty──▶│ tmux                  (Linux/macOS)│
  │  xterm.js  │◀──│        node-pty      │──pty──▶│ ssh -tt user@host → tmux   (remote)│
  └────────────┘   └──────────────────────┘──pty──▶│ wsl.exe -d <distro> → tmux (Windows)│
        ▲   binary bytes ⇄ WebSocket ⇄ JSON control └──────────────────────────────────┘
```

- **`client/`** —— React + Vite + TypeScript，终端基于 [`@xterm/xterm`](https://www.npmjs.com/package/@xterm/xterm)。
- **`server/`** —— Node + Express + `ws` + `node-pty`。一个小型 REST API 跑短命的 tmux *管理*命令；单个 WebSocket 端点负责交互式 *attach* 的流式传输。

> **Windows 上没有原生 tmux？** 没问题。服务端原生运行（node-pty 用 ConPTY），通过 `wsl.exe` 直通你 WSL 发行版里的 tmux。Linux/macOS 上则直接和本地 tmux 通信。远程主机用系统 `ssh` 二进制，复用你已有的 `~/.ssh` 密钥 / `ssh-agent` —— **绝不存储任何密码。**

## 📦 用 npm 安装

```bash
# 一键运行(无需克隆,自动开浏览器):
npx tmuxes

# 或全局安装后用 tmuxes 命令:
npm install -g tmuxes
tmuxes                       # → http://127.0.0.1:7420

# 常用参数:
tmuxes --port 8080 --no-open
```

> 前提:你要连的机器/主机上装了 **tmux**。**Linux** 上 `node-pty` 需现场编译(装 `build-essential` + `python3`);**Windows / macOS** 有预编译二进制,真·一键。详见下方「环境要求」。

## 🚀 从源码一键启动(开发用)

<table>
<tr><th>系统</th><th>怎么做</th></tr>
<tr><td><b>🪟 Windows 11</b></td><td>双击 <b><code>start.cmd</code></b>（或在 Windows Terminal 里运行）。自动装依赖、构建、启动服务，并打开 <code>http://127.0.0.1:7420</code>。你的 WSL 发行版会出现在侧边栏。</td></tr>
<tr><td><b>🍎 macOS</b></td><td>在访达里双击 <b><code>start.command</code></b> <sub>（首次：右键 → 打开，绕过 Gatekeeper）</sub>。</td></tr>
<tr><td><b>🐧 Linux</b></td><td>运行 <b><code>./start.sh</code></b>。</td></tr>
</table>

## 🔧 手动运行

```bash
npm install            # node-pty：Win/macOS 有预编译，Linux 从源码编译

# 开发 —— Vite 开发服务器 + API，带热更新：
npm run dev            # → http://localhost:5173

# 生产 —— 构建客户端，由单进程统一服务：
npm run build
npm start              # → http://localhost:7420   （设 TMUXES_OPEN=1 可自动打开浏览器）
```

## 🧩 目标（Targets）

- **本地** *(Linux/macOS)* —— 你机器上的 tmux。Windows 上不显示。
- **Windows 本机终端** *(Windows)* —— 服务端用 ConPTY 直接开 PowerShell / cmd 等本机 shell（自动探测 `pwsh` → `powershell` → `cmd` → Git Bash），新建时可在下拉里选 shell。会话随**服务端进程**存活（刷新 / 重连 / 多标签都不丢，重启服务端会丢）；这类会话没有 tmux 工作目录，故隐藏底部文件浏览器。
- **WSL 发行版** *(Windows)* —— 通过 `wsl.exe -l -q` 自动发现；每个发行版一个目标。发行版里必须装了 tmux。
- **SSH 主机** —— 从你的 `~/.ssh/config` 的 `Host` 条目里发现（跳过通配符）。也可显式添加：

  ```bash
  TMUXES_HOSTS="alice@web1,bob@db2:2222" npm run dev      # Linux / macOS
  set TMUXES_HOSTS=alice@web1,bob@db2:2222 && npm run dev # Windows cmd
  ```

  密钥 / agent 认证必须在普通 shell 里已经能用。全新主机请先在普通终端里接受一次它的 host key。

## 💻 环境要求

所有平台都需要 **Node 18+**（开发用的是 22）和 **npm**。其余：

<details>
<summary><b>🪟 Windows 11</b></summary>

- WSL2 且至少一个发行版，并在其中装好 **tmux**（`sudo apt install tmux`）。
- 内置的 OpenSSH 客户端覆盖 SSH 目标。
- node-pty 提供**预编译 Windows 二进制** —— 不需要编译器。

</details>

<details>
<summary><b>🍎 macOS</b></summary>

- `tmux` 在 `PATH` 上（`brew install tmux`）。
- node-pty 提供**预编译 darwin 二进制**。
- 从访达启动却找不到 tmux？确保 Homebrew 的 bin 目录在 GUI 的 `PATH` 里。

</details>

<details>
<summary><b>🐧 Linux</b></summary>

- `tmux`，外加给 node-pty 的 C/C++ 工具链 + Python 3（**没有 Linux 预编译 —— 安装时现场编译**）：
  ```bash
  sudo apt-get install -y build-essential python3 tmux
  ```
- WSL 小坑：`node-gyp` 会用 `PATH` 上的任意 `python3`。如果坏掉的 conda Python 把构建搞挂了：
  ```bash
  npm config set python /usr/bin/python3
  ```

</details>

<details>
<summary><b>（备选）把服务端跑在 WSL 内部</b></summary>

在 Windows 上，你也可以把整个服务端跑在 WSL **内部**（像 Linux 一样），然后在 Windows 上开浏览器 —— WSL2 会转发 `localhost`。一键启动脚本用的是「原生 Windows + `wsl.exe`」方案，这样能在一个地方同时覆盖 SSH 目标和多个发行版。

</details>

## 🔒 安全

> ⚠️ **tmuxes 会把完整的 shell 访问权交给任何能连上它的人。** 它是一个单用户、仅本机的开发工具。

设计上它：

- 只绑定 **`127.0.0.1`** —— 绑定地址在运行时不可配置，
- **没有任何认证**，
- **从不起 shell**（argv 数组 + `shell:false`），并对每个输入做白名单校验，
- 拒绝 `Origin` 非 localhost 的 WebSocket 升级（防 DNS-rebind），
- 把文件浏览器 / 编辑器限制在所选 tmux 会话的**当前工作目录**之内。

**请勿**对它做反向代理、隧道、端口转发，或暴露到 `0.0.0.0`。机器上任何本地用户都能用它。

## 🧪 测试

```bash
npm test   # vitest：输入校验、列表解析、ssh/tmux/wsl 的 argv 形状
```

## 🐧 tmux 速查表

> tmux 的「前缀键」默认是 **`Ctrl+b`**（下面记作 `C-b`）—— 先按它，松开，再按后面的键。
> 在网页终端里**最常用的是滚动 / 复制模式**（往上看历史输出、复制文字）。

### 滚动 & 复制（最常用）

| 操作 | 按键 |
|---|---|
| 进入复制 / 滚动模式 | `C-b` 然后 `[` |
| 在模式里上下翻 | `↑ ↓`、`PageUp` / `PageDown` |
| 开始选择 → 复制 | `Space` 定起点 → 移动光标选中 → `Enter` 复制 |
| 把复制的内容粘回来 | `C-b` 然后 `]` |
| 在模式里搜索 | `C-s` 向前 / `C-r` 向后（默认 emacs 风格） |
| 退出复制 / 滚动模式 | `q` |
| **开鼠标滚轮**（直接滚轮翻 + 鼠标选） | 执行 `tmux set -g mouse on`，或写进 `~/.tmux.conf` |

### 会话 Session

| 操作 | 命令 / 按键 |
|---|---|
| 列出会话 | `tmux ls` |
| 新建 / 接入会话 | `tmux new -s <名>` / `tmux attach -t <名>` |
| 脱离（后台继续跑） | `C-b` 然后 `d` |
| 重命名当前会话 | `C-b` 然后 `$` |
| 会话间切换 | `C-b` 然后 `s` |

### 窗口 Window

| 操作 | 按键 |
|---|---|
| 新建窗口 | `C-b` 然后 `c` |
| 重命名窗口 | `C-b` 然后 `,` |
| 上 / 下一个窗口 | `C-b` 然后 `p` / `n` |
| 跳到第 N 个窗口 | `C-b` 然后数字 |
| 窗口列表 | `C-b` 然后 `w` |

### 面板 Pane（分屏）

| 操作 | 按键 |
|---|---|
| 垂直 / 水平拆分 | `C-b` 然后 `%` / `"` |
| 在面板间移动 | `C-b` 然后 `↑ ↓ ← →` |
| 最大化 / 还原当前面板 | `C-b` 然后 `z` |
| 关闭面板 | `C-b` 然后 `x` |

### 其它

| 操作 | 按键 |
|---|---|
| 查看全部快捷键 | `C-b` 然后 `?` |
| 进入 tmux 命令行 | `C-b` 然后 `:`（例：输 `set -g mouse on`） |
| 杀掉会话 | `tmux kill-session -t <名>` |

> 提示：在 tmuxes 里**新建 / 选择 / 重命名 / 杀会话**直接点 UI 就行，不用记命令；但**往上滚看历史、复制文字、拆面板**这些是 tmux 自己的功能，得用上面的快捷键。

<div align="center">
<sub>用 React、TypeScript、node-pty &amp; xterm.js 打造 —— 外加大量 tmux。盯娃愉快。🤖</sub>
</div>

## 🧑‍🔬 关于作者

> 嗨，我是这个项目的作者 👋
>
> 中国科学技术大学（USTC）理论物理在读博士，白天的日常是和**多体场论可解释的费米超流理论**（这玩意是用来研究和解释高温超导的），还有一大坨**高性能数值计算**代码贴身肉搏 ⚛️。
>
> 这个小工具其实是被一堆 agent 终端搞到头大之后的「自救产物」—— 既然每天都要盯一群 CLI agent 干活，那干脆给它们造个顺手的指挥台 😎。
>
> 如果你也对这些感兴趣（物理也好、代码也好），或者想一起折腾这个开源项目，随时来找我玩 📮
>
> **📧 junruwu@mail.ustc.edu.cn**