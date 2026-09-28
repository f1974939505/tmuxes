<div align="center">

# 🖥️ tmuxes

**简体中文** ｜ [English](./README.en.md)

### 一个浏览器标签页，掌控一整群 CLI coding agent。

**Claude Code · Codex · OpenCode · Hermes** —— 每个 agent 独占一个 tmux 会话，
横跨 **本地 · SSH · WSL**，还自带每个 agent 工作目录的文件浏览器和 Git 面板。

🔔 **Agent 结束、报错停止或需要人工决策时，浏览器会提醒你** —— 支持 Claude Code、Codex、OpenCode、Hermes 的结构化事件；后台任务、子 agent、monitor 和等待唤醒不会直接当作结束。状态证据不足时显示「未知」。

<p>
<a href="https://www.npmjs.com/package/tmuxes"><img alt="npm version" src="https://img.shields.io/npm/v/tmuxes?style=flat-square&logo=npm&color=CB3837"></a>
<img alt="platform" src="https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows%2011-2b2b2b?style=flat-square">
<img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black">
<img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white">
<img alt="Node.js" src="https://img.shields.io/badge/Node.js-22%20%7C%2024-339933?style=flat-square&logo=nodedotjs&logoColor=white">
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
| 🔔 **结束 / 错误 / 决策提醒** | 新建会话时填写 agent 命令，或在空闲终端右上角启动四种 agent。按结构化事件区分运行、后台工作、人工决策、完成、失败和未知；已展开目标每 5 秒同步 tmux 状态，不再扫描终端文字猜测错误。 |
| 🌐 **本地 · SSH · WSL · 原生 Windows** | 一个侧边栏同时列出你的本机、`~/.ssh/config` 里的主机、（Windows 上）你的 WSL 发行版，以及（Windows）原生 PowerShell / cmd 会话 —— 全部并排排开。 |
| 🗂️ **文件夹树** | 像资源管理器一样，把会话拖进**可拖拽的文件夹**里整理。按目标分别持久化到本地。 |
| 📂 **实时文件浏览 + 编辑** | 侧边栏底部跟随每个会话的**工作目录** —— 点一个代码文件就能把终端一分为二，在下面**直接读和改**（可保存、撤销/重做）。 |
| 🔀 **Git 面板** | 侧边栏底部可切到 Git 视图，基于当前会话工作目录查看仓库状态、未提交更改、提交历史和远端未合入提交；点击待提交文件会在右侧大区域底部打开类似 VS Code 的左右红绿 diff，点击 commit 会在同一区域显示完整 patch；支持切换分支、fetch、pull、push、sync 和一键提交全部工作区更改。Git 认证沿用目标机器已有配置，tmuxes 不保存凭据。 |
| 🔁 **真·多端同步** | 基于原生 `tmux attach`：同一个会话开两个标签页，逐键同步、互为镜像。 |
| ⚙️ **可调** | 侧边栏、终端、文件查看器的字号都能调，**实时生效**、刷新后仍保留。 |
| 📋 **轻松复制** | 点「选择文本」即可无 Shift 拖选输出快照；支持复制按钮、`Ctrl+C` / `Ctrl+Shift+C`，以及可选的鼠标选中自动复制。 |
| 🚀 **一键启动** | 双击 `start.cmd` / `start.command` / `start.sh` → 自动构建、启动、打开浏览器。 |

## 🖼️ 长这样

<div align="center">
<img src="https://raw.githubusercontent.com/f1974939505/tmuxes/main/fig/fig1.png" alt="tmuxes 截图 —— 一个标签页掌控一群 CLI agent" width="900">
</div>

## 🏗️ 架构

```text
                          REST  (create · list · rename · kill · cwd · files · git)
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

建议直接用 `@latest`，这样能拿到最新的修复包。`tmuxes` 是单用户本机工具，启动后只监听 `127.0.0.1`。

```bash
# 先验证 npm 包入口:
npx --yes tmuxes@latest --help

# 一键运行(无需克隆,默认自动开浏览器):
npx --yes tmuxes@latest

# 或全局安装后用 tmuxes 命令:
npm install -g tmuxes
tmuxes                       # → http://127.0.0.1:7420

# 常用参数:
tmuxes --port 8080 --no-open
```

如果 Windows 上 `npx` 失败，先确认：

- `node -v` 是 **22.x（22.12.0 起）或 24.x**，`npm -v` 是 **10+**。
- 使用的是官方 npm registry，且没有旧缓存污染；必要时先跑 `npm cache verify` 再重试。
- 你要连接的机器/主机上已经装好 **tmux**。Linux 上 `node-pty` 需要现场编译，先装 `build-essential` + `python3`；Windows / macOS 使用预编译二进制。

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

## 🔔 Agent 状态与提醒

在新建 session 的初始命令中填写 `claude`、`codex`、`opencode` 或 `hermes`；也可以先进入空 session，`cd /你的目标目录` 后点击右上角对应按钮。目标机器需要 **Python 3.9+（`python3`）** 和 tmux。首次启动会把仅依赖 Python 标准库的采集器部署到该目标的 `~/.cache/tmuxes/agents/<内容哈希>/`，后续复用相同文件。

- **运行 / 后台（红点）**：主 agent 工作，或仍有后台 shell、monitor、子 agent、goal、定时唤醒。子任务结束不等于主任务结束。
- **决策**：收到真正交给人工的审批或结构化提问。已解决请求会清除；同一请求持续到下一次界面同步才响铃，短暂自动处理不响铃。
- **结束**：主轮次正常结束，且已知的关联工作全部收尾，短暂确认期内没有新活动。不会仅凭静默、进程退出或一段最终回答判断完成。
- **错误**：主任务终止性失败；warning、自动重试和普通工具失败不会直接触发。
- **未知（灰点）**：未接入、监测断开、接口不支持或后台状态不完整。中断和关闭客户端不等于完成。

各工具的接入与兼容边界：

| Agent | 接入方式与说明 |
| --- | --- |
| Codex | 使用共享 app-server，经过私有 Unix socket 的 WebSocket 转发观察原 TUI 事件，并在结束事件后只读查询 goal、子线程、后台终端。验证基线为 CLI 0.158.0；不再注入 `-c hooks...`，不强制 embedded mode，不代答审批，不停止共享 daemon。旧版不支持接口时不会伪报完成。 |
| Claude Code | 通过本次启动的 `--settings` 追加 hooks，保留用户传入的 settings。读取 `Stop.background_tasks/session_crons`，并区分子 agent、提问、通知和 `StopFailure`。缺少后台字段或 `stop_hook_active=true` 时不宣称完成。其他 Stop hook 的首次继续决定不一定对观察 hook 可见，确认期只能缓解该竞态。 |
| OpenCode | 通过本次启动的 `OPENCODE_CONFIG_CONTENT` 追加本地插件，保留已有配置；读取会话、子会话、权限和提问事件。第三方工具脱离会话运行且没有可靠完成事件时，保守保持后台 / 未知。 |
| Hermes | 首次启动写入独立的 `tmuxes-observer-<哈希>` 本地插件，并调用 `hermes plugins enable`，由 Hermes 展示必要的启用交互；不添加依赖。插件仅对本次启动生效，读取生命周期、人工审批、子 agent 和本进程后台任务计数。内部任务计数接口不可用时不宣称完成。命名 profile 请先设置该 profile 的 `HERMES_HOME`，启动器不接受 `-p/--profile`。 |

Codex 的监测启动不接受 `-c/--config`、`--enable`、`--disable`、`--search`、`--no-daemon` 或自定义 `--remote`；请将配置放进 Codex 自己的配置文件，或在终端手动启动不带监测的命令。tmuxes 不修改 Codex 的持久配置、hook 信任或审批策略。协议是实验接口，升级后会优先降级为未知而非误报完成。

当前源码已修复 0.1.17 中 `/resume` 选择器无法建立第二条连接的问题，并隔离选择器退出与主会话状态。原生 hooks、`notify` 和终端通知的替代方案及能力边界见 [通知传输设计评估](https://github.com/f1974939505/tmuxes/blob/main/docs/agent-notification-design.md)（英文技术说明）；这些简化方案尚未替换现有桥接。

采集器只在目标机器本地处理事件，不保存提示词或工具输出，不新增 SSH 轮询、登录探测或重连循环。浏览器沿用既有管理连接读取 tmux 状态。设置服务端环境变量 `TMUXES_NO_AUTOHOOK=1` 可关闭初始命令的自动接入。Hermes 插件可通过 `hermes plugins disable <插件名>` 停用。

按钮会向当前 pane 输入启动命令，请仅在 shell 空闲时点击。裸 `cc` 仍按系统编译器处理。原生 Windows shell 没有 tmux，不支持这套监测；请使用 WSL 或 SSH 目标。

## 🔀 Git 面板

侧边栏底部可以从 `文件` 切到 `Git`。Git 面板绑定当前选中 tmux session 的工作目录，不做后台 Git 轮询；进入面板、切换会话、点击刷新或执行 Git 操作后才读取状态。

- **工作区更改**：单独列出未提交文件。点击待提交文件会在右侧大区域底部打开类似 VS Code 的左右红绿 diff；未跟踪文件也会按新增文件显示。
- **提交**：输入 commit message 后点 `Commit`，tmuxes 会执行 `git add -A` 再创建 commit；有冲突时不会提交。
- **提交历史 / 远端提交**：显示当前分支最近提交，以及 upstream 上尚未合入本地的远端提交。点击任一 commit 会在同一个底部查看区显示完整 patch。
- **同步操作**：支持 fetch、`pull --ff-only`、push、sync（`fetch --prune` → `pull --ff-only` → 必要时 push）和分支切换。不会执行 force push、reset、discard、clean 或删除分支。
- **凭据**：Git 认证沿用目标机器已有 Git / SSH 配置，tmuxes 不保存凭据。若目标环境配置了缺失的 `credential-manager` helper，fetch / pull / push 会临时禁用 credential helper 自动重试一次，避免 public / SSH 仓库被坏 helper 阻断。

## 🧩 目标（Targets）

- **本地** *(Linux/macOS)* —— 你机器上的 tmux。Windows 上不显示。
- **Windows 本机终端** *(Windows)* —— 服务端用 ConPTY 直接开 PowerShell / cmd 等本机 shell（自动探测 `pwsh` → `powershell` → `cmd` → Git Bash），新建时可在下拉里选 shell。会话随**服务端进程**存活（刷新 / 重连 / 多标签都不丢，重启服务端会丢）；这类会话没有 tmux 工作目录，故隐藏底部文件浏览器。
- **WSL 发行版** *(Windows)* —— 通过 `wsl.exe -l -q` 自动发现；每个发行版一个目标。发行版里必须装了 tmux。
- **SSH 主机** —— 从你的 `~/.ssh/config` 的 `Host` 条目里发现（跳过通配符）。也可显式添加：

  ```bash
  TMUXES_HOSTS="alice@web1,bob@db2:2222" npm run dev      # Linux / macOS
  set TMUXES_HOSTS=alice@web1,bob@db2:2222 && npm run dev # Windows cmd
  ```

  密钥 / agent 认证必须在普通 shell 里已经能用。全新主机请先在普通终端里接受一次它的 host key。为避免短命管理命令反复新建 SSH 连接，类 Unix 平台会通过 OpenSSH `ControlMaster` / `ControlPersist` 长期复用同一条 SSH 连接；原生 Windows 则由 tmuxes 维护一条应用层 SSH 管理长连接，不使用 Windows OpenSSH mux socket，避免 `getsockname failed: Not a socket`。tmuxes 不再强制设置 `ServerAliveInterval`，如需保活请按所在平台规则写进你自己的 `~/.ssh/config`。如果复用 / 管理连接中断，tmuxes 会自动重建并重试一次；仍失败时会在前端页面提示并暂停该 SSH 目标的自动轮询，点击 `Reconnect` 可手动再试一次。

## 💻 环境要求

所有平台都需要 **Node 22.x（22.12.0 起）或 24.x** 和 **npm 10+**。项目版本文件保留 22.22.2 作为默认开发版本，不限制使用 Node 24。Windows 发布验证覆盖 Node 22.22.2 和 24.16.0（含原生终端创建及输入输出）。其余：

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

**复制到系统剪贴板：** 点击终端上方的「选择文本」，直接拖选后点「复制」或按 `Ctrl+C` / `Ctrl+Shift+C`（macOS：`⌘C`），无需按住 Shift。该视图是打开时的当前终端缓冲快照，任务继续运行；点「返回交互」或按 `Esc` 返回实时终端，再次打开可获取新快照。它不是完整会话历史；全屏程序可能只有当前屏幕，尚未加载到浏览器的 tmux 历史不会包含在内。

交互模式中，有选区时 `Ctrl+C` 复制，无选区时仍中断程序；`Ctrl+Shift+C` 专用于复制。设置中可开启「鼠标选中后自动复制」（默认关闭）。复制失败会显示提示，可使用右键菜单。需要 tmux 内部滚动或复制时，继续使用下表：

| 操作 | 按键 |
|---|---|
| 进入复制 / 滚动模式 | `C-b` 然后 `[` |
| 在模式里上下翻 | `↑ ↓`、`PageUp` / `PageDown` |
| 开始选择 → 复制 | `Space` 定起点 → 移动光标选中 → `Enter` 复制 |
| 把复制的内容粘回来 | `C-b` 然后 `]` |
| 在模式里搜索 | `C-s` 向前 / `C-r` 向后（默认 emacs 风格） |
| 退出复制 / 滚动模式 | `q` |
| **开鼠标滚轮**（直接滚轮翻 + 鼠标选） | 执行 `tmux set -g mouse on`，或写进 `~/.tmux.conf` |
| **交互模式下临时选字**（绕过 tmux 鼠标模式） | 按住 `Shift` 拖选 → 点「复制」或按 `Ctrl+C`；也可用右键菜单 |

> 提示：开了 `mouse on` 后鼠标归 tmux 管;想用浏览器原生的**框选 + 右键复制粘贴**,**按住 `Shift`** 再拖动 / 右键即可。
>
> 提示：tmuxes 的「复制」写入当前设备的系统剪贴板；tmux 复制模式默认写入 tmux 自己的缓冲，两者不同。超出浏览器缓冲的历史及拆面板仍使用 tmux 操作。

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

### 0.1.17
- **Agent 提醒重做**：分别识别报错、等待用户决策和经确认的任务结束；后台任务、子 agent、monitor shell 及短暂停顿不作为整体结束，无法确认时显示未知状态。
- **Codex 共享后台服务**：改用本地协议桥接，不再自动注入 `-c` hooks，消除因此触发的 embedded-mode 警告；恢复实际用户决策提醒，并过滤短暂的自动审批状态。
- **四种 Agent 集成**：更新 Claude Code hooks，新增 OpenCode、Hermes 启动按钮与事件适配；自动集成要求 tmux 目标上的 Python 3.9+，兼容性限制及关闭方式见上文。

### 0.1.16
- **Node 24 支持**：修正 npm 包的 `engines.node` 声明为 `^22.12.0 || ^24.0.0`，消除 Node 24 上错误的 `EBADENGINE` 警告；同步所有 workspace、锁文件、安装说明及启动脚本提示。

### 0.1.15
- **终端复制**：新增复制按钮、选区复制快捷键、无需 Shift 的文本快照选择模式，以及可选的鼠标选中自动复制；无选区时保留交互终端的 `Ctrl+C` 中断行为。

### 0.1.14
- **恢复 Claude Code 决策提醒**：0.1.13 误把 Claude Code 的审批、权限确认和用户决策请求一起移除。本版只针对 Codex 移除决策提醒，Claude Code 的 `PermissionRequest`、`permission_prompt`、`elicitation_dialog` 重新触发「决策」badge、提示音和后台标签页闪烁。
- **Codex 决策提醒保持移除**：Codex 的审批 / 决策请求仍不触发浏览器提醒，避免 `approvals_reviewer = "auto_review"` / Approve for me 自动审批流程误报。

### 0.1.13
- **移除决策提醒**：Codex 的审批、权限确认和用户决策请求不再触发浏览器提醒；tmuxes 只提醒 agent 结束和异常停止，避免 Codex 自动审批流程误报。（注：0.1.13 同时误移除了 Claude Code 的决策提醒，已在 0.1.14 恢复。）
- **Git 面板**：侧边栏底部新增 Git 视图，支持当前会话工作目录的状态查看、未提交更改列表、文件 diff、分支切换、fetch、pull、push、sync，以及 stage 全部更改后创建 commit。
- **提交历史 / 远端提交**：Git 面板会显示当前分支最近提交和 upstream 上尚未合入的远端提交，点击提交会在右侧大区域底部打开完整 patch；点击待提交文件会打开左右红绿 diff。
- **credential-manager fallback**：fetch / pull / push 遇到目标环境配置了缺失的 `credential-manager` helper 时，会自动用临时禁用 credential helper 的方式重试一次，避免 public/SSH 仓库被错误 helper 阻断。

### 0.1.12
- **Codex auto-review 提醒修复**：Codex 开启 `approvals_reviewer = "auto_review"` / Approve for me 时，审批请求会保持 running 状态，不再误触发 `决策` badge、提示音或后台标签页闪烁；人工审批配置仍会正常提醒。

### 0.1.11
- **文档 / 发布规范**：补齐 npm 发布检查流程，明确只发布 `server` workspace，发布前后都要验证 `npx` / `npm exec` 入口和本机启动 smoke test。
- **安全约束**：发布流程不得提交或粘贴 `.npmrc` token、`NPM_TOKEN`、SSH 私钥、一次性验证码或任何个人凭据。
- **README 重整**：安装说明加入 `npx --help` 验证、Windows 排错提示，并压缩早期版本更新。

### 0.1.10
- **发布修正**：重新发布 npm `latest` 包，确认线上 `tmuxes` bin、前端 `public` 资源和 `npx tmuxes@latest` 入口可用。

### 0.1.9
- **修复: Windows SSH 原生管理命令改用应用层长连接**。避免 Windows OpenSSH `ControlMaster` mux socket 的 `getsockname failed: Not a socket`，同时避免短命管理命令反复新建 SSH 连接。
- **改进: 文件浏览器合并远端目录刷新**。一次远端调用同时读取 pane 工作目录、校验路径并列目录，减少 SSH 管理流量。

### 0.1.0 - 0.1.8
- **早期功能成型**：完成本地 / SSH / WSL / Windows shell 目标、tmux attach 多端同步、拖拽文件夹树、工作目录文件浏览与编辑。
- **agent 提醒演进**：从活动转静止提醒升级到 Claude Code / Codex 官方 lifecycle hooks，支持结束和异常停止状态。
- **Windows / SSH 稳定性**：修复 ConPTY 下 `Ctrl+C` 退出、恢复浏览器原生右键，并将 SSH 管理命令改为长期复用连接且中断后只自动重试一次。

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
