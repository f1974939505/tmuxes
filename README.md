<div align="center">

# 🖥️ tmuxes

**简体中文** ｜ [English](./README.en.md)

### 一个浏览器标签页，掌控一整群 CLI coding agent。

**Claude Code · Codex · OpenCode · Hermes** —— 每个 agent 独占一个 tmux 会话，
横跨 **本地 · SSH · WSL**，还自带每个 agent 工作目录的文件浏览器。

🔔 **Claude Code / Codex 结束运行、异常停止或需要决策时,浏览器会自动提醒你** —— 侧边栏红/绿状态点 +「结束 / 决策 / 错误」提示 + 提示音 + 后台标签页标题闪烁。再也不用挨个窗格去盯「它还在跑吗」。

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

<sub>🔒 仅本机 · ⚡ 一键启动 · 🔔 agent hook 提醒 · 🪟 Windows 上直通 WSL · 🧩 零配置</sub>

</div>

---

> **为什么做这个？** 现代编码 agent 都是常驻的终端进程。同时跑好几个，你就开始在一堆窗格、SSH 窗口之间手忙脚乱：
> 「等等，刚那个是在哪台机器上来着？」**tmuxes** 把它们全塞进一个清爽的网页 UI：
> 开一个会话、丢进文件夹、看它干活、顺手瞄一眼它正在改的文件 —— 本地还是远程，都是同一个视图。

## ✨ 特性亮点

| | |
|---|---|
| 🧠 **为 agent 而生** | 每个 agent 独占一个 tmux 会话。新建时可带初始命令（比如 `claude` 或 `codex`），选中后右侧就是一个**完全可交互的实时终端**。 |
| 🔔 **结束 / 决策 / 错误提醒** | 新建会话时初始命令是 `claude` 或 `codex` 会自动接入官方 lifecycle hooks。也可以先进入空 session `cd` 到目标目录,再点终端右上角的 `claude` / `codex` 按钮启动带 hook 的 agent。已展开目标每 5 秒同步一次:红点表示 agent 正在运行,绿点表示已结束、异常停止或正在等你决策;结束运行、需要决策和异常停止会显示不同提示。 |
| 🌐 **本地 · SSH · WSL · 原生 Windows** | 一个侧边栏同时列出你的本机、`~/.ssh/config` 里的主机、（Windows 上）你的 WSL 发行版，以及（Windows）原生 PowerShell / cmd 会话 —— 全部并排排开。 |
| 🗂️ **文件夹树** | 像资源管理器一样，把会话拖进**可拖拽的文件夹**里整理。按目标分别持久化到本地。 |
| 📂 **实时文件浏览 + 编辑** | 侧边栏底部跟随每个会话的**工作目录** —— 点一个代码文件就能把终端一分为二，在下面**直接读和改**（可保存、撤销/重做）。 |
| 🔁 **真·多端同步** | 基于原生 `tmux attach`：同一个会话开两个标签页，逐键同步、互为镜像。 |
| ⚙️ **可调** | 侧边栏、终端、文件查看器的字号都能调，**实时生效**、刷新后仍保留。 |
| 🚀 **一键启动** | 双击 `start.cmd` / `start.command` / `start.sh` → 自动构建、启动、打开浏览器。 |

## 🖼️ 长这样

<div align="center">
<img src="https://raw.githubusercontent.com/f1974939505/tmuxes/main/fig/fig1.png" alt="tmuxes 截图 —— 一个标签页掌控一群 CLI agent" width="900">
</div>

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

刚刚开用的小家伙还在快速长身体,可能偶尔有 bug,修复更新也会比较快;建议用 `@latest` 总是拿到最新版本。

```bash
# 一键运行(无需克隆,自动开浏览器):
npx tmuxes@latest

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

## 🔔 启动带 hook 的 Claude Code / Codex

tmuxes 目前会给 **Claude Code (`claude`)** 和 **Codex (`codex`)** 自动接入官方 lifecycle hooks，用来判断 agent 是正在运行、已经结束、异常停止，还是正在等你做决策。

两种用法：

1. 新建 session 时，在初始命令里直接填 `claude` 或 `codex`。
2. 先新建空 session，进入后在终端里 `cd /你的目标目录`，再点终端右上角的 `claude` / `codex` 按钮。

状态含义：

- 红点：agent 正在运行。
- 绿点：agent 已结束、异常停止、正在等你决策，或这个 session 没接入 agent hook。
- `结束` badge：本轮运行结束。
- `决策` badge：agent 正在等待权限确认或用户输入。
- `错误` badge：agent 异常停止，例如 Codex 断流但没有触发 stop hook。tmuxes 会在已展开目标的 5 秒同步里扫描 running agent 的 pane 尾部并把这类错误纠正为提醒状态。

注意：右上角按钮本质上是向当前 tmux pane 发送一条带 hook 的 `claude` / `codex` 命令。不要在当前 pane 里已有程序正在接收输入时点击它。裸 `cc` 常常是系统 C 编译器，tmuxes 不会默认把它当作 Claude Code。原生 Windows shell 没有 tmux session option，因此不支持这套 hook 状态。

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

所有平台都需要 **Node 22.12+**（项目版本文件固定为 22.22.2）和 **npm 10+**。其余：

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
| **按住 Shift 用鼠标**（绕过 tmux 鼠标模式） | 按住 `Shift` 拖动选中文字 → 浏览器右键「复制」；右键「粘贴」 |

> 提示：开了 `mouse on` 后鼠标归 tmux 管;想用浏览器原生的**框选 + 右键复制粘贴**,**按住 `Shift`** 再拖动 / 右键即可。
>
> 提示：在 tmuxes 里**新建 / 选择 / 重命名 / 杀会话**直接点 UI 就行，不用记命令；但**往上滚看历史、复制文字、拆面板**这些是 tmux 自己的功能，得用上面的快捷键。

## ❓ 常见问题

<details>
<summary><b>某个集群里 tmux 的中文(或其它非 ASCII 字符)全变成了下划线 <code>_</code>?</b></summary>

那台机器的登录 locale 不是 UTF-8(HPC 登录节点很常见,`LANG=C` / `POSIX`),于是 tmux 进入**非 UTF-8 模式**,把每个多字节字符用 `_` 占位。**在那台机器上**修:

1. 设一个 UTF-8 locale —— 先看哪些可用,再写进 `~/.bashrc` / `~/.zshrc`:
   ```bash
   locale -a | grep -i utf          # 看有哪些(C.UTF-8 / en_US.UTF-8 / zh_CN.UTF-8 …)
   echo 'export LANG=C.UTF-8' >> ~/.bashrc   # 换成上面真实存在的那个
   ```
2. 重启该机器上的 tmux 服务,让会话以 UTF-8 重新创建:
   ```bash
   tmux kill-server
   ```
3. 回到 tmuxes 重新连接 / 新建会话即可。

> ⚠️ pane 的 UTF-8 模式在**创建时**就定死了 —— 只改 locale **不重启 server** 的话,已经变成下划线的旧会话不会自动恢复,必须重建。

</details>

## 📋 更新日志

### 0.1.6
- **修复:Codex 断流后红灯不恢复**。当 Codex 输出 `stream disconnected before completion` 但没有触发 stop hook 时,已展开目标的 5 秒同步会扫描 running agent 的 pane 尾部,写回 `错误` 提醒并把红点恢复为绿点。
- **改进:Claude Code `StopFailure` 归类为异常停止**。正常 `Stop` / `SessionEnd` 仍显示 `结束`,失败停止显示 `错误`。

### 0.1.5
- **修复:Claude Code 启动改用 `claude` 命令**。裸 `cc` 在很多 Linux/SSH 环境里是系统 C 编译器,不再默认识别为 Claude Code,右上角按钮也改为 `claude` / `codex`。
- **变更:项目 Node 版本统一到 22**。新增 `.nvmrc` / `.node-version`,并将 package engines 统一为 Node `>=22.12.0 <23`。

### 0.1.4
- **改进:提醒改为 Claude Code / Codex 官方 lifecycle hooks**。新建会话时初始命令是 `claude` 或 `codex` 会自动注入 hooks;也可以先进入空 session `cd` 到目标目录,再点右上角 `claude` / `codex` 按钮启动带 hook 的 agent。tmuxes 每 5 秒读取 tmux session option 同步状态。红点表示正在运行,绿点表示已结束或需要决策,并分别显示「结束 / 决策」提示。

### 0.1.3
- **修复 (Windows)**:`Ctrl+C` 现在真的能停掉服务了。之前的修复有 bug(readline 没进入终端模式,信号桥接形同虚设),而且 node-pty 的 ConPTY 会破坏宿主进程的 `CTRL_C_EVENT → SIGINT` 通路。改为**直接从控制台读取 `Ctrl+C` 原始字节(0x03)**,绕开被破坏的信号机制。`Ctrl+Break` 同样可用。
- **变更:恢复浏览器原生右键**。终端区域不再拦截右键菜单。想用浏览器原生**框选 + 右键复制粘贴**,**按住 `Shift`** 拖动 / 右键即可(绕过 tmux 鼠标模式)。

### 0.1.2
- **新增:活动转静止提醒**。零配置监测每个会话——session 终端画面从持续变化转为静止后,通过**侧边栏状态点 + 提示音 + 后台标签页标题闪烁**提醒你。设置面板可开关提醒与提示音。

### 0.1.1
- **修复 (Windows)**：`Ctrl+C` 现在可以正常终止服务端进程。node-pty 的 ConPTY 子进程会拦截 `CTRL_C_EVENT` 导致 SIGINT 无法到达宿主 node；通过 `readline` 从控制台输入层直接桥接 SIGINT 修复此问题。
- **修复 (终端)**：鼠标右键现在可以在 tmux 鼠标模式里正常使用。浏览器原生右键菜单在终端区域被禁用，右键事件直接传入 xterm → tmux。需要在 tmux 里开启 `set -g mouse on`。

### 0.1.0
- 初次发布。

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
