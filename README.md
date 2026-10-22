<div align="center">

# 🖥️ tmuxes

**简体中文** ｜ [English](./README.en.md)

### 一个浏览器标签页，掌控一整群 CLI coding agent。

**Claude Code · Codex · OpenCode · Hermes** —— 每个 agent 独占一个 tmux 会话，
横跨 **本地 · SSH · WSL**，提供文件 / Git 面板、图片与 PDF 预览，以及支持 Markdown 公式的 Agent 阅读视图。

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

<sub>🔒 仅本机 · ⚡ 一键启动 · 🔔 可选原生 hooks / 插件 · 📖 Markdown 与公式 · 🪟 Windows 上直通 WSL</sub>

</div>

---

> **为什么做这个？** 现代编码 agent 都是常驻的终端进程。同时跑好几个，你就开始在一堆窗格、SSH 窗口之间手忙脚乱：
> 「等等，刚那个是在哪台机器上来着？」**tmuxes** 把它们全塞进一个清爽的网页 UI：
> 开一个会话、丢进文件夹、看它干活、顺手瞄一眼它正在改的文件 —— 本地还是远程，都是同一个视图。

## ✨ 特性亮点

| | |
|---|---|
| 🧠 **为 agent 而生** | 在不同 tmux 会话中运行 Claude Code、Codex、OpenCode 和 Hermes，右侧保留完整终端交互。Codex 按钮直接执行 `codex --no-daemon`。 |
| 🔔 **结束 / 错误 / 决策提醒** | 依据原生结构化事件区分运行、后台工作、人工决策、完成、失败和未知。已展开目标每 5 秒同步状态；后台 shell、子 agent 和 monitor 不直接视为结束。 |
| 🌐 **本地 · SSH · WSL · 原生 Windows** | 一个侧栏管理本地 tmux、SSH、WSL 与 PowerShell / cmd 会话；SSH 管理请求仅复用手动建立的持久连接。 |
| 🗂️ **文件夹树与提醒定位** | 拖拽整理会话，按目标保存文件夹；视图外提醒显示上下箭头，折叠组汇总提醒。文件 / Git 区默认占左栏可用高度的一半。 |
| 📂 **文件预览、编辑与下载** | 浏览工作目录，预览 PNG / JPG / GIF / WebP 与 PDF，渲染 Markdown 公式；文本可编辑、保存、撤销 / 重做，所有文件均可下载原始内容。PDF 支持反色阅读。 |
| 📖 **Agent 阅读与路径链接** | 读取 Codex / Claude Code 的近期提问与完整回答，支持表格和公式；终端、阅读视图及渲染选区中的文件路径可点击打开。 |
| 🪟 **常驻文件标签** | 切换会话、窗口或目标后保留文件、编辑和文件阅读位置；预览区支持底部、右侧及最大化，最大化时终端保持挂载。 |
| 🔀 **Git 面板** | 查看仓库状态、未提交更改、提交历史和远端提交；在共享预览区显示左右 diff 或完整 patch，支持切换分支、fetch、pull、push、sync 和提交全部更改。认证沿用目标机器配置。 |
| 🔁 **多端同步** | 同一 tmux 会话可在多个浏览器标签中同时查看与输入，复用服务端保留的终端连接。 |
| ⚙️ **可调布局与字号** | 分别调整侧栏、终端和预览字号；保存预览位置与尺寸，拖动分隔条调整布局。 |
| 📋 **轻松复制** | 「选择文本」提供可直接拖选的输出快照；支持复制按钮、`Ctrl+C` / `Ctrl+Shift+C`，以及可选的选中自动复制。 |
| 🚀 **一键启动** | 双击 `start.cmd` / `start.command`，或执行 `start.sh`，自动构建、启动并打开浏览器。 |

## 🖼️ 长这样

<div align="center">
<img src="https://raw.githubusercontent.com/f1974939505/tmuxes/main/fig/fig1.png" alt="0.1.26 界面：多 Agent 会话、文件下载、常驻标签与 Markdown 公式预览" width="1000">
</div>

0.1.26 的真实界面，使用虚构目标、会话、路径和输出；不包含真实主机、账号或项目数据。

<details>
<summary>查看 Agent 阅读与 PDF 反色预览</summary>

<p>回答中的 PDF、图片和 Markdown 路径可直接点击打开。</p>
<img src="https://raw.githubusercontent.com/f1974939505/tmuxes/main/fig/agent-reading.png" alt="Agent 阅读视图：可点击文件路径、表格与公式" width="1000">
<p>PDF 支持连续翻页、缩放、文字选择和反色；切换会话后保留打开的文件。</p>
<img src="https://raw.githubusercontent.com/f1974939505/tmuxes/main/fig/pdf-preview.png" alt="PDF 反色预览与常驻文件标签" width="1000">

</details>

## 🏗️ 架构

```text
                          REST  (sessions · files / Range · messages · git)
  ┌────────────┐   ┌──────────────────────┐        ┌──────────────────────────────────┐
  │  Browser   │──▶│  Node · Express · ws │──pty──▶│ tmux                  (Linux/macOS)│
  │  xterm.js  │◀──│        node-pty      │──pty──▶│ ssh -tt user@host → tmux   (remote)│
  └────────────┘   └──────────────────────┘──pty──▶│ wsl.exe -d <distro> → tmux (Windows)│
        ▲   binary bytes ⇄ WebSocket ⇄ JSON control └──────────────────────────────────┘
```

- **`client/`** —— React + Vite + TypeScript，终端基于 [`@xterm/xterm`](https://www.npmjs.com/package/@xterm/xterm)。
- **`server/`** —— Node + Express + `ws` + `node-pty`。REST 提供会话管理、文件 / Range 传输、分页消息与 Git；WebSocket 负责交互式 *attach*，复用服务端保留的终端状态。SSH 管理请求仅使用手动建立的持久连接，断线后统一暂停，等待手动重连。

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

打开或刷新页面时，左侧所有目标栏默认收缩，包括 Windows Local、WSL Ubuntu、本地 tmux 和 SSH 目标；点击栏标题后展开。

左栏的会话区与下方「文件 / Git」区默认各占可用高度的一半，分隔条仍可拖动调整。视图外的未读结束、决策或错误提醒，会在会话区上下边缘显示小箭头与数量；点击箭头定位最近的提醒。折叠目标或文件夹会显示内部提醒汇总。提醒位置由浏览器计算，不增加远端读取或 SSH 请求。

在目标的「Agent 状态接入」面板选择 agent，点击「安装 / 更新」一次。目标需要 **Python 3.9+ (`python3`)**、tmux 和已安装的 agent。安装保留配置并备份被修改的 hooks 文件；按各 agent 要求信任 hooks、启用插件并重启后，可直接在 tmux pane 输入 `claude`、`codex --no-daemon`、`opencode` 或 `hermes`。按钮输入相同命令，不注入 `--remote`、`-c` 或启动包装器。

- **运行中 / 后台工作**：根任务仍执行，或关联的后台 shell、monitor、子 agent、goal、定时唤醒尚未结束。
- **决策**：结构化事件表明需要用户输入；短暂且已解决的请求不提醒。
- **结束**：当前根回合正常结束、已知关联工作收敛，并通过短暂确认期。静默、进程退出、最终文本均不足以证明结束。
- **错误**：根任务最终失败；普通工具错误、警告和自动重试不会直接提醒。
- **未知**：接口缺失、失联、窗口归属或后台工作证据不足；不会猜测完成。


安装时会读取目标交互 shell 的 PATH 和导出的配置目录，支持 shell 初始化的安装路径；不修改 PATH。若 shell 初始化阻塞，安装会超时并提示检查启动配置。

| Agent | 接入方式与边界 |
| --- | --- |
| Codex | 合并 `CODEX_HOME/hooks.json`（默认 `~/.codex/hooks.json`），在 `/hooks` 审查并信任。前台启动使用 `--no-daemon`，hooks 单向写入元数据，按启动身份关联 pane。通过受支持的 hooks 和结构化会话记录核验状态；缺少后台任务完成证据时显示未知，不响应审批。 |
| Claude Code | 合并 `CLAUDE_CONFIG_DIR/settings.json`（默认 `~/.claude/settings.json`）。读取生命周期、问题、失败和后台任务字段；缺少后台字段或 Stop hook 继续运行时不宣称完成。其他 Stop hook 的首次继续决定可能不可见，确认期只能缓解竞态。 |
| OpenCode | 安装全局 v1 插件，遵循 `XDG_CONFIG_HOME`。当前适配器仅支持 v1；v2 改变了插件 API，安装器会拒绝并保留原配置，尚不支持 v2 状态采集。 |
| Hermes | 在 `HERMES_HOME/plugins/tmuxes-native-observer`（默认 `~/.hermes`）安装插件；执行 `hermes plugins enable tmuxes-native-observer` 后重启。缺少生命周期字段或后台任务计数时降级未知。命名 profile 需在相应环境分别安装。 |

面板仅显示已关联当前 pane 的观测记录。未关联、已结束和被新会话替代的历史观测在读取时从 tmuxes 状态缓存清理，不删除 agent 自身会话历史，也不停止进程。每条记录显示最后事件和上报时间。非 Codex 记录按进程身份隔离；禁止按进程名手工猜测绑定。

右上角 Codex 按钮直接向当前 pane 输入 `codex --no-daemon`，由当前交互 shell 执行。启动无需 Python、接入安装或额外后端；tmux 保持界面常驻。左侧接入面板只管理可选的状态采集，不再提供启动入口。原有 daemon 不会被自动停止。

Codex 前台状态通过受支持的原生 hooks 确认当前进程和回合，再从本机会话记录增量核对命令、嵌套子 agent 和代码执行单元，并只读查询可用的 goal 状态。当前回合确实结束且没有未结束工作，经过两次刷新确认才亮绿灯；`Stop` 本身不会直接报完成。完整且受支持的结构化记录可恢复漏掉的启动、工具返回或 `Stop` 证据。新提问、用户中断、仍运行的 shell / monitor / 子 agent，以及活动或暂停的 goal 都不会被当作完成。

更新后在目标「Agent 状态接入」选择 Codex，点击「安装 / 更新」；首次安装仍需在 `/hooks` 信任。已信任的接入在会话记录受支持且完整时，可重建正在运行会话的状态，无需为了补齐启动事件重启 Codex；面板在首次分批核对期间显示提示。仅更新本机 tmuxes 不会更新目标采集器。不能用记录恢复的会话仍依赖受支持的 hooks，缺少完整生命周期时可能需要在任务结束后重启。

命令或图片读取失败时，可能缺少 `PostToolUse`；采集器通过受支持的实际执行记录核对，避免残留后台状态。严格可识别的单次只读 `write_stdin` 等待，在对应命令明确退出后可确认结束；带循环、后续操作或其他工具的代码执行单元仍需自己的结束证据。

每条观测的主会话与子 agent 共享约 8 MiB 的单次读取预算和时间上限，保存游标后只读取新增记录。大图片分段跳过正文，不保存对话或工具输出；状态缓存仅保留身份和执行状态元数据。后台目标同样只读核对，采集不连接 Codex daemon、不增加常驻轮询器；SSH 目标始终复用已有管理连接，不增加登录。无法验证归属、格式或完整性的记录保持未知。hook 输入上限为 8 MiB。

Codex 的 `waitingOnApproval` 无法区分人工与自动审批，因此当前显示未知、不触发人工决策提醒；结构化用户提问仍可提醒。可读取受支持的 goal 数据库时，会同时核对手动状态变化。兼容性取决于目标提供的 hooks 和会话记录结构，新的工作类型或无法读取的记录不会被猜测为结束。绿灯只证明已核验的 Codex 工作结束，不证明任意外部脱离管理的后台进程已经退出。

采集器只保存有限状态元数据，不保存提示词或工具输出；安装文件位于 `~/.local/share/tmuxes/observer/`，状态文件位于 `~/.cache/tmuxes/observations/`。读取合并进已有会话刷新，通过现有管理连接执行，不增加 SSH 登录探测或独立轮询。`TMUXES_NO_AUTOHOOK` 不会关闭已经安装的原生 hooks；停用时在 agent 配置中仅删除指向 tmuxes observer 的 hook，OpenCode 删除对应插件文件，Hermes 执行 `hermes plugins disable tmuxes-native-observer`。

也可以直接在目标 pane 输入 `codex --no-daemon`。可选的原生 hooks 状态采集仍依赖目标 Python 和 `/hooks` 信任；移除的是启动过程的 Python 依赖。Linux / WSL 上直接启动的 Codex 通过原生 hook 的真实进程祖先链、`--no-daemon` 参数、启动时间和前台进程组关联 pane，不需要启动器标识。需更新目标接入并信任 hooks；没有事件或无法核验归属时不猜测绑定。未关联记录不展示且会清理；已关联但证据不足时显示未知，不猜测完成。

Linux / WSL 的启动器即使移除 `TMUX` 或 `TMUX_PANE`，hook 仍可将真实进程祖先链与已有本地 tmux server 的 pane PID 精确匹配，证明归属；不扫描主机、不按 Agent 名称猜测。升级后，请在 WSL 目标的「Agent 状态接入」为相关 Agent 点击「安装 / 更新」，等待新 hook 事件。缺少信任、事件不支持、归属歧义或 daemon 仍不会猜测状态。

## 📖 文件预览与 Agent 阅读

Agent 输出中的 PDF、图片、Markdown 和其他可预览文件路径可直接点击，在已有文件标签中打开或复用预览。原始终端、Agent 阅读及「渲染选中文本」都支持绝对路径和相对路径；带空格的路径请用引号或反引号包裹。终端也支持 Agent 自带的 `file://` 超链接；悬停显示下划线，点击打开，Shift 保留文字选择。相对终端路径在点击时按原会话当前工作目录解析；Markdown 文件内的路径按文档目录解析。链接保留来源，切换会话不会把旧输出绑定到新会话。路径识别不探测文件、不发起网络请求；点击后的读取沿用已有连接和会话目录权限。

文件列表每个文件右侧、以及文件预览工具栏均提供「下载」，保存目标上的原始文件，支持图片、PDF、Markdown 和无法预览的其他格式；未保存的编辑需先保存才会包含在下载中。下载复用现有管理连接，按不超过 512 KiB 的块传输到浏览器，不受预览大小上限限制，不在服务端缓存整份文件，也不会发起新的 SSH 登录。

打开的文件保留在预览区的文件标签中，切换 tmux 会话、窗口、目标或打开另一个文件后仍保留 PDF 页码与缩放、图片缩放与位置、Markdown 预览、未保存编辑及撤销记录。点击标签返回，文件来源固定为打开时的目标、会话和路径，标题显示来源；关闭文件或刷新页面才释放，不把文件内容写入浏览器持久存储。PDF 工具栏的「反色」将白底黑字切换为黑底白字，并记住颜色偏好。

文件浏览器可打开 PNG、JPG/JPEG、GIF、WebP 和 PDF。图片支持适应面板、原始大小、缩放和拖动；PDF 支持连续翻页、页码跳转、缩放与文字选择。图片预览上限为 32 MiB，PDF 为 256 MiB；文件按块读取，预览关闭不会终止共享连接。PDF.js、字体与 worker 随软件打包，无需 CDN。

Markdown 文件默认打开渲染预览，点击「源码」可继续编辑、保存和撤销；切回「预览」显示当前编辑内容。支持表格、代码块、`$...$` / `$$...$$` 公式，以及代码之外的 `\(...\)` / `\[...\]`。错误公式保留源码并提示；原始 HTML 不执行，外部图片点击后才加载。相对图片、Markdown 与 PDF 链接仍限制在当前会话工作目录内。

Agent 常见的 `$$公式首行` / `公式末行$$` 写法会先整理为独立数学块，保留矩阵换行、列表和引用层级，避免吞掉后续正文；块公式支持 `\tag{…}` 编号，代码内容保持原样。

当前可见文件每约 3 秒自动检查变化；隐藏文件标签与后台页面暂停检查。未保存编辑保持原样，外部修改会提示冲突；重新加载需确认丢弃编辑，保存会核对已读取的版本。图片和 PDF 更新保留缩放、页码与反色。写入中或暂时不存在的文件会在下次检查时重试；连接与权限错误后暂停。所有远程读取复用已有管理连接，只有手动连接才会重新建立 SSH。窄窗口的右侧预览临时置于底部，扩大窗口后恢复。

终端上方点击「Agent 阅读」，查看当前活跃 pane 的近期用户提问和完整回答。从最新记录向前读取，工具日志尾段自动继续补查；可持续加载更早消息，不限制可到达的历史总条数，点击「回到最新」返回当前尾部。浏览器保留最多 500 条 / 约 8 MiB UTF-16 文本的可移动窗口，移出窗口的历史仍可通过分页到达。文件与阅读视图使用独立标签，面板可切换到底部或右侧、拖动尺寸及最大化；最大化保持终端挂载与尺寸，位置和尺寸在浏览器中保存。阅读自动跟随底部；轻微向上滚动即停止跟随并保留位置，向下滚到实际底部或点击「回到最新」后恢复。

自动阅读解析已验证的 **Codex / Claude Code JSONL 消息结构**，依赖目标的原生接入。升级 tmuxes 后，在目标的「Agent 状态接入」分别为 Codex / Claude Code 点击一次「安装 / 更新」，等待新 hook 事件记录 transcript 路径；原有信任和其他配置保留。没有可靠关联或遇到不支持的格式时明确提示，可用终端的「选择文本」选取输出后点击「渲染选中文本」。普通终端选区同样可渲染；快照可能包含折行或缺失内容。

读取模块与状态灯采集独立，过滤思考过程、系统指令和工具日志。只有打开且可见的阅读标签每 3 秒增量读取，页面隐藏或标签切换后暂停；失败后暂停，手动连接成功或点击阅读刷新后恢复。每次读取有字节与时间预算，巨大日志分段处理；初始最多 50 条消息。单条回答不再固定截断到 256 Ki 字符；超过 7 MiB 单记录安全预算时跳过并提示返回原终端查看。向上阅读时保留位置，同时继续核对归属；活跃 pane 或会话变化时清除旧内容。对话仅传到当前浏览器的有界内存，不写入 tmuxes 状态文件、日志或浏览器持久存储。远程文件和对话读取均复用已经建立的管理连接，不能建立 SSH、探测连接或自动重连。

## 🔀 Git 面板

侧边栏底部可以从 `文件` 切到 `Git`。Git 面板绑定当前选中 tmux session 的工作目录，不做后台 Git 轮询；进入面板、切换会话、点击刷新或执行 Git 操作后才读取状态。

- **工作区更改**：单独列出未提交文件。点击待提交文件会在右侧大区域底部打开类似 VS Code 的左右红绿 diff；未跟踪文件也会按新增文件显示。
- **提交**：输入 commit message 后点 `Commit`，tmuxes 会执行 `git add -A` 再创建 commit；有冲突时不会提交。
- **提交历史 / 远端提交**：显示当前分支最近提交，以及 upstream 上尚未合入本地的远端提交。点击任一 commit 会在同一个底部查看区显示完整 patch。
- **同步操作**：支持 fetch、`pull --ff-only`、push、sync（`fetch --prune` → `pull --ff-only` → 必要时 push）和分支切换。不会执行 force push、reset、discard、clean 或删除分支。
- **凭据**：Git 认证沿用目标机器已有 Git / SSH 配置，tmuxes 不保存凭据。若目标环境配置了缺失的 `credential-manager` helper，fetch / pull / push 会临时禁用 credential helper 自动重试一次，避免 public / SSH 仓库被坏 helper 阻断。

## 🧩 目标（Targets）

- **本地** *(Linux/macOS)* —— 你机器上的 tmux。Windows 上不显示。
- **Windows 本机终端** *(Windows)* —— 服务端用 ConPTY 直接开 PowerShell / cmd 等本机 shell（自动探测 `pwsh` → `powershell` → `cmd` → Git Bash），新建时可在下拉里选 shell。会话随**服务端进程**存活（刷新 / 重连 / 多标签都不丢，重启服务端会丢）；这类会话没有 tmux 工作目录，文件 / Git 功能不可用。文件预览、下载和路径链接沿用本地 tmux、WSL 和 SSH 范围。
- **WSL 发行版** *(Windows)* —— 通过 `wsl.exe -l -q` 自动发现；每个发行版一个目标。发行版里必须装了 tmux。
- **SSH 主机** —— 从你的 `~/.ssh/config` 的 `Host` 条目里发现（跳过通配符）。也可显式添加：

  ```bash
  TMUXES_HOSTS="alice@web1,bob@db2:2222" npm run dev      # Linux / macOS
  set TMUXES_HOSTS=alice@web1,bob@db2:2222 && npm run dev # Windows cmd
  ```

  **集群连接铁律：禁止反复 SSH 登录。** 展开目标、刷新页面和状态轮询均不能建立 SSH；必须点击「连接 / 重连」。所有平台的管理请求复用每个目标地址的一条持久连接，多网页的会话快照请求合并缓存；不创建每次刷新的 SSH 进程。终端每个目标/会话首次手动打开时建立连接，之后切换标签页、刷新网页和多客户端复用该终端连接。断线、超时或认证失败后服务端统一锁住目标，所有入口禁止自动重连；可立即手动点击连接，无需等待长时间冷却；连点和多个网页并发重连合并为同一次尝试，时间经过不会触发连接。支持时终端复用 OpenSSH ControlMaster/ControlPersist；不强制短 keepalive、不扫描主机。密钥认证和 host key 信任请预先在正常终端配置。

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
  PYTHON=/usr/bin/python3 npm install
  ```
  使用 `PYTHON` 环境变量选择解释器，见 [node-gyp 官方说明](https://github.com/nodejs/node-gyp#configuring-python-dependency)。

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
- 终端提供真实 shell 访问；管理请求校验目标、会话名和路径，本地进程使用参数数组启动，不依赖 Node 隐式展开命令字符串，
- 拒绝 `Origin` 非 localhost 的 WebSocket 升级（防 DNS-rebind），
- 把文件浏览、编辑、预览、下载和路径链接读取限制在来源 tmux 会话的**当前工作目录**之内；Agent 阅读只能取得服务端确认绑定的记录。

**请勿**对它做反向代理、隧道、端口转发，或暴露到 `0.0.0.0`。机器上任何本地用户都能用它。

## 🧪 测试

```bash
npm test   # vitest：输入校验、列表解析、ssh/tmux/wsl 的 argv 形状
```

## 🐧 tmux 速查表

> tmux 的「前缀键」默认是 **`Ctrl+b`**（下面记作 `C-b`）—— 先按它，松开，再按后面的键。
> 在网页终端里**最常用的是滚动 / 复制模式**（往上看历史输出、复制文字）。

### 滚动 & 复制（最常用）

切换会话或重新进入时，tmuxes 从保留的终端状态恢复画面、光标、全屏及鼠标模式，不再截取原始输出尾部回放；窗口尺寸变更按输出顺序应用。滚轮事件保留原始协议字节。画面恢复复用已有连接，不会重新 SSH 登录。全屏应用中的滚动由应用或 tmux 的鼠标设置控制。

**复制到系统剪贴板：** 点击终端上方的「选择文本」，直接拖选后点「复制」或按 `Ctrl+C` / `Ctrl+Shift+C`（macOS：`⌘C`），无需按住 Shift。该视图是打开时的当前终端缓冲快照，任务继续运行；点「返回交互」或按 `Esc` 返回实时终端，再次打开可获取新快照。它不是完整会话历史；全屏程序可能只有当前屏幕，尚未加载到浏览器的 tmux 历史不会包含在内。

**实时终端直接选字：** 普通左键拖动默认在本地选中文字，即使 SSH / WSL 的 tmux 或 Agent 开启了鼠标模式也一样，不需要切换快照。Ctrl+左键（macOS 也可用 ⌘）点击 / 拖动交给终端内程序；滚轮保持原行为。从文件路径或网页链接开始拖动会选字，只有完整的普通单击才打开链接。

交互模式中，有选区时 `Ctrl+C` 复制，无选区时仍中断程序；`Ctrl+Shift+C` 专用于复制。右键打开 tmuxes 菜单，可复制、粘贴、全选、渲染选区、进入阅读、滚动缓冲及重绘（`Ctrl+L`）；工具栏也提供「粘贴」和「终端菜单」。Shift+右键交给支持鼠标的终端程序，Shift+左键拖动仍用于选字；Alt+右键保留浏览器原生剪贴板菜单。设置中可改为普通右键默认透传。Firefox 的 Shift+右键可能还会显示浏览器菜单（[浏览器限制](https://developer.mozilla.org/en-US/docs/Web/API/Element/contextmenu_event)），可通过该设置改用普通右键透传。

粘贴沿用程序的括号粘贴模式，不追加回车；文本中已有的换行仍由当前 shell / 程序处理。浏览器不允许读取剪贴板时，先在手动粘贴框粘贴；断线或切换会话不会把未完成的剪贴板读取转发到其他终端。设置中可开启「鼠标选中后自动复制」（默认关闭）。需要 tmux 内部滚动或复制时，继续使用下表：

| 操作 | 按键 |
|---|---|
| 进入复制 / 滚动模式 | `C-b` 然后 `[` |
| 在模式里上下翻 | `↑ ↓`、`PageUp` / `PageDown` |
| 开始选择 → 复制 | `Space` 定起点 → 移动光标选中 → `Enter` 复制 |
| 把复制的内容粘回来 | `C-b` 然后 `]` |
| 在模式里搜索 | `C-s` 向前 / `C-r` 向后（默认 emacs 风格） |
| 退出复制 / 滚动模式 | `q` |
| **开鼠标滚轮**（直接滚轮翻 + 鼠标选） | 执行 `tmux set -g mouse on`，或写进 `~/.tmux.conf` |
| **交互模式下直接选字**（绕过 tmux 鼠标模式） | 普通左键拖选 → 点「复制」或按 `Ctrl+C`；Ctrl/⌘+左键操作终端内程序 |

> 提示：开了 `mouse on` 后仍可普通左键拖选；Ctrl/⌘+左键和 Shift+右键交给 tmux，Alt+右键使用浏览器原生复制菜单。
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

### 终端卡顿诊断

Windows 的每个 PTY 都在独立子进程中运行。原生缩放或关闭卡住时，只隔离该本地终端连接，不阻塞其他窗口；操作超时后不会自动重连 SSH。慢浏览器连接会被单独断开，PTY 继续读取输出。正常情况下按一次 Ctrl+C 即可退出；关闭阻塞时父进程限时清理自己创建的本地 PTY 进程树，不终止远端 tmux 会话。

启动日志显示进程 PID 和日志文件路径。Windows 默认保存在 `%LOCALAPPDATA%\tmuxes\logs\server-<PID>.log`，其他平台为 `~/.local/state/tmuxes/logs/`；可用 `TMUXES_LOG_DIR` 指定目录。每进程日志约 1 MiB 轮换，保留一个 `.1` 备份；只记录连接、超时、退出等诊断，不记录终端输出。请在报告卡顿时提供该文件。

创建会话后，初始命令的发送或执行按键失败会明确报错，已创建的会话会保留。SSH 管理通道失败后保持离线，只有手动点击连接才会再次尝试，且无需长时间冷却；配置中目的地、用户和端口相同的条目共享连接标识。

## 📋 更新日志

### 0.1.28（2026-10-22）

- **最新优先阅读**：先读取近期回答，工具日志尾段自动向前补查；历史可持续向前分页，并可随时回到最新。浏览器使用有界可移动窗口，不再限制可到达的历史总条数。
- **阅读滚动**：轻微向上滚动立即解除跟随，避免更新时吸回底部；向下滚到底部或点击「回到最新」后恢复。
- **完整回答**：移除单条 256 Ki 字符截断，区分被 Agent 重用的消息 ID；超过单记录安全预算时明确提示。
- **交互终端菜单**：右键支持复制、粘贴、全选、渲染、滚动与重绘；Shift+右键交给支持鼠标的终端程序，Alt+右键保留浏览器菜单。剪贴板权限不可用时提供手动粘贴框。
- **实时拖选一致性**：SSH、WSL 与本地普通左键均在浏览器选字，不被 tmux 鼠标模式抢占；Ctrl/⌘+左键透传。拖动文件与网页链接不再误打开，也不再吞掉选字起点。
- **公式解析**：修复多行公式开闭 `$$` 与内容同处一行时吞入后续正文的问题；保留矩阵换行与 Markdown 容器结构，块公式使用正确的显示模式验证，支持公式编号。
- **WSL Agent 关联**：hook 缺少 tmux 环境变量时，通过真实进程祖先链与 pane PID 证明归属；Linux 使用稳定进程身份并兼容旧记录，歧义与 daemon 仍不关联。
- **连接铁律**：阅读与状态采集只复用已建立管理连接，不新增自动 SSH 登录、探测或重试。

0.1.27 及更早版本见 [历史更新日志](https://github.com/f1974939505/tmuxes/blob/main/CHANGELOG.md)。

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
