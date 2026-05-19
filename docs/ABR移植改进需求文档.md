# ABR → ASB-Platform 移植改进需求文档

> 基于 Agent Browser Runtime（ABR）优势能力分析，梳理可移植到 ASB-Platform 的改进需求，
> 按优先级排列，含实现参考和适配方案。

---

## 优先级定义

| 级别 | 含义 |
|------|------|
| **P0** | 核心安全/反检测能力，缺少则无法在主流平台稳定运行 |
| **P1** | 重要增强，显著提升采集成功率和运维体验 |
| **P2** | 锦上添花，完善产品能力矩阵 |

---

## P0 — 浏览器反检测基础能力

### 1.1 JavaScript 环境补丁（主世界注入）

**现状**：ASB-Platform 仅通过 `--disable-features=AutomationControlled` 启动参数做基础隐藏，未进行任何 JS 层面补丁。

**ABR 参考**：[stealth-content.js](file:///d:/develop/ASB-Platform/docs/agent-browser-runtime/extension/stealth-content.js)

**需求**：在 `document_start` 阶段注入主世界脚本，实现以下补丁：

| 补丁项 | 说明 |
|--------|------|
| `navigator.webdriver` | 设为 `undefined`（而非 `false`） |
| `navigator.languages` | 返回真实语言列表 |
| `navigator.platform` | 返回目标平台标识（如 `MacIntel`） |
| `navigator.vendor` | 返回 `Google Inc.` |
| `navigator.plugins` / `mimeTypes` | 注入标准 Chrome 插件数组（Chrome PDF Plugin / Chrome PDF Viewer / Native Client） |
| `navigator.hardwareConcurrency` | 可配置值（默认保留真实值） |
| `navigator.deviceMemory` | 可配置值（默认保留真实值） |
| `chrome.runtime` | 桩对象（避免 `chrome` 未定义被检测） |
| `chrome.app` | 桩对象（`isInstalled: false` 等） |
| `chrome.csi` / `chrome.loadTimes` | 桩函数（返回合理的时间数据） |
| `Notification.permission` | 通过 `permissions.query` 拦截保护 |
| `HTMLMediaElement.canPlayType` | 返回合理的编解码器支持声明 |

**适配方案**：

1. 复用 [docker/extensions/anti-fingerprint/](file:///d:/develop/ASB-Platform/docker/extensions/anti-fingerprint/) 扩展目录，将 ABR 的 `stealth-content.js` 逻辑移植到 `content.js` 中
2. 将 `runtime-config.js` 中的配置项纳入 ASB-Platform 的 `config.js`，通过环境变量 `ASB_STEALTH_*` 控制
3. 注入方式：利用 Chrome 扩展 `"run_at": "document_start"` 确保在页面脚本执行前生效
4. 支持 `ASB_STEALTH_EXCLUDED_HOSTS` 排除名单（如 `accounts.google.com`），避免在高信任登录页触发反检测导致登录失败

---

### 1.2 CDP 层头部与模拟覆盖

**现状**：ASB-Platform 未通过 CDP 做任何请求头或浏览器属性覆盖。

**ABR 参考**：[background.js#L196-L225](file:///d:/develop/ASB-Platform/docs/agent-browser-runtime/extension/background.js#L196-L225) `applyStealthCdpOverrides()`

**需求**：在标签页创建后、首次导航前，通过 CDP 执行以下覆盖：

| CDP 命令 | 覆盖项 |
|----------|--------|
| `Network.setExtraHTTPHeaders` | `Accept-Language` 头（从配置读取） |
| `Network.setUserAgentOverride` | UA + UA-CH 元数据 + platform |
| `Emulation.setTimezoneOverride` | 时区（从配置读取） |
| `Emulation.setLocaleOverride` | 语言区域（从配置读取） |

**适配方案**：

1. 在 [environment-manager.js](file:///d:/develop/ASB-Platform/src/browser/environment-manager.js) 的 `createTab()` 方法中，`Page.navigate` 之前执行 CDP 覆盖
2. 配置项使用 `ASB_CDP_*` 前缀环境变量 + `config.js` 统一管理：
   - `ASB_CDP_ACCEPT_LANGUAGE`
   - `ASB_CDP_USER_AGENT`
   - `ASB_CDP_PLATFORM`
   - `ASB_CDP_TIMEZONE`
   - `ASB_CDP_LOCALE`
3. 覆盖逻辑封装为 `applyCdpOverrides(cdp, sessionId)` 函数，与任务执行解耦
4. 同样支持 `ASB_STEALTH_EXCLUDED_HOSTS` 排除机制

**注意**：ASB-Platform 无 Chrome 扩展层，CDP 命令直接通过 `CdpClient` 发送，不需要 `chrome.debugger.attach`。

---

### 1.3 Canvas / Audio 指纹噪声

**现状**：ASB-Platform 无任何 Canvas 或 Audio 指纹对抗。

**ABR 参考**：[stealth-content.js#L187-L240](file:///d:/develop/ASB-Platform/docs/agent-browser-runtime/extension/stealth-content.js#L187-L240)

**需求**：

| 能力 | 说明 |
|------|------|
| Canvas 噪声 | 劫持 `HTMLCanvasElement.toDataURL`，对前 32×32 像素做 ±1 随机偏移，WeakSet 防重复处理 |
| Canvas 噪声（toBlob/2D getImageData） | 同上覆盖 `toBlob` 和 `CanvasRenderingContext2D.getImageData` |
| Audio 噪声 | 劫持 `AudioBuffer.getChannelData`，对每 100 个采样点做 ±0.00001 随机偏移 |

**适配方案**：

1. 集成到 [docker/extensions/anti-fingerprint/content.js](file:///d:/develop/ASB-Platform/docker/extensions/anti-fingerprint/content.js) 中
2. 通过 `ASB_CANVAS_NOISE_ENABLED` / `ASB_AUDIO_NOISE_ENABLED` 环境变量控制开关
3. 噪声强度参数化（`ASB_CANVAS_NOISE_STRENGTH` / `ASB_AUDIO_NOISE_STRENGTH`）

---

### 1.4 WebGL 指纹伪装

**现状**：无。

**ABR 参考**：[stealth-content.js#L167-L185](file:///d:/develop/ASB-Platform/docs/agent-browser-runtime/extension/stealth-content.js#L167-L185)

**需求**：劫持 `WebGLRenderingContext.getParameter` / `WebGL2RenderingContext.getParameter`，覆盖：

| 参数 | 值 |
|------|-----|
| `37445` (UNMASKED_VENDOR_WEBGL) | 可配置（默认 `Google Inc. (Apple)`） |
| `37446` (UNMASKED_RENDERER_WEBGL) | 可配置（默认 `Apple GPU`） |

**适配方案**：集成到 `content.js`，通过 `ASB_WEBGL_VENDOR` / `ASB_WEBGL_RENDERER` 控制。

---

## P1 — 人化操作与交互模拟

### 2.1 真实输入事件（替代 DOM Click）

**现状**：ASB-Platform 的 [task-runner.js](file:///d:/develop/ASB-Platform/src/broker/task-runner.js#L90-L99) 通过 `Runtime.evaluate` 执行 `el.click()`，这是 DOM 点击而非真实鼠标事件，极易被检测。

**ABR 参考**：ABR 扩展通过 `Input.dispatchMouseEvent` / `Input.dispatchKeyEvent` 等 CDP Input 域发送真实输入事件。

**需求**：新增以下 UI 操作原语（通过 CDP Input 域而非 DOM 操作）：

| 原语 | CDP 命令 | 说明 |
|------|----------|------|
| `mouseMove` | `Input.dispatchMouseEvent` (type=mouseMoved) | 鼠标移动到目标元素中心 |
| `mouseClick` | `Input.dispatchMouseEvent` (type=mousePressed + mouseReleased) | 真实鼠标点击 |
| `keyType` | `Input.dispatchKeyEvent` (type=keyDown + keyUp + char) | 逐字符键盘输入 |
| `keyPress` | `Input.dispatchKeyEvent` (type=rawKeyDown + keyUp) | 单键按下（Enter/Tab 等） |
| `wheelScroll` | `Input.dispatchMouseEvent` (type=mouseWheel) | 鼠标滚轮滚动 |

**适配方案**：

1. 在 `task-runner.js` 中新增步骤类型：`mouseMove`、`mouseClick`、`keyType`、`keyPress`、`wheelScroll`
2. 保留现有 `click` / `type` 步骤作为兼容模式（轻量场景），新增 `humanClick` / `humanType` 作为人化模式
3. 技能清单 manifest 中可声明 `humanize: true` 启用真实事件模式
4. 元素定位：通过 `Runtime.evaluate` 获取 `getBoundingClientRect()` 计算元素中心坐标，再发送鼠标事件

```js
// 伪代码示例
async function humanClick(context, selector) {
  // 1. 获取元素坐标
  const rect = await evaluate(context, `
    (() => {
      const el = document.querySelector('${selector}')
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    })()
  `, true)

  // 2. 移动鼠标到目标位置
  await context.cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved', x: rect.x, y: rect.y
  })

  // 3. 点击
  await context.cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1
  })
  await context.cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1
  })
}
```

---

### 2.2 人化节奏控制

**现状**：ASB-Platform 仅有固定 `sleep(ms)` 延迟。

**ABR 参考**：`BOT_HUMANIZE_LEVEL` + `humanizeTab()` + 扩展级 mousemove/scroll/pause 原语。

**需求**：

| 等级 | 效果 |
|------|------|
| `off` | 无额外延迟 |
| `minimal` | 操作间 200-500ms 随机延迟 |
| `standard` | 操作间 500-1500ms 随机延迟 + 页面加载后随机滚动 |
| `enhanced` | 操作间 1-3s 随机延迟 + 随机滚动 + 鼠标微动 + 随机暂停（2-8s） |

**适配方案**：

1. 在 `task-runner.js` 中增加 `humanizeLevel` 参数（来源于请求 body 或环境变量 `ASB_HUMANIZE_LEVEL`）
2. 每次步骤执行后，根据等级插入随机延迟
3. `enhanced` 级别额外执行随机滚动和暂停

---

### 2.3 平台冷却机制

**现状**：无。

**ABR 参考**：`BRS_PLATFORM_COOLDOWN_ENABLED` + 各平台冷却时间配置。

**需求**：

| 平台 | 默认冷却时间 | 配置项 |
|------|-------------|--------|
| Reddit | 45s | `ASB_COOLDOWN_REDDIT_SECONDS` |
| Facebook | 60s | `ASB_COOLDOWN_FACEBOOK_SECONDS` |
| LinkedIn | 180s | `ASB_COOLDOWN_LINKEDIN_SECONDS` |
| Instagram | 240s | `ASB_COOLDOWN_INSTAGRAM_SECONDS` |
| 通用/手动验证 | 300s | `ASB_COOLDOWN_MANUAL_CHALLENGE_SECONDS` |

**适配方案**：

1. 在 Lease 或 Environment 级别维护 `lastActionAt` Map（按平台域名记录最后操作时间）
2. 任务执行前检查冷却状态，未冷却完毕则返回 HTTP 429 或自动等待
3. 支持 `cooldown: false` 跳过（用于紧急调试），以及 `cooldownMode: reject`（直接拒绝而非等待）

---

## P1 — noVNC 可视化调试

### 3.1 浏览器可视化面板

**现状**：ASB-Platform 无浏览器可视化能力，调试依赖外部 Chrome DevTools。

**ABR 参考**：[docker-compose.yml](file:///d:/develop/ASB-Platform/docs/agent-browser-runtime/docker-compose.yml) chrome-runtime 服务（Xvfb + x11vnc + noVNC）。

**需求**：

1. Docker 模式下自动启用 VNC（`ASB_VNC_ENABLED=true`）
2. 暴露 noVNC 端点（默认 `http://127.0.0.1:16080/vnc.html?autoconnect=true&resize=remote`）
3. 前端 PolyBrowser 中嵌入 iframe 或提供快捷链接跳转

**适配方案**：

1. 修改 [docker/Dockerfile](file:///d:/develop/ASB-Platform/docker/Dockerfile) — Playwright 镜像已包含 Xvfb，需追加 x11vnc + noVNC 安装
2. 修改 [docker/start-chrome.sh](file:///d:/develop/ASB-Platform/docker/start-chrome.sh) — 增加 Xvfb + VNC 启动逻辑
3. 在 Environment 详情 API (`GET /environments/:id`) 中增加 `vncUrl` 字段
4. 前端 Environment 卡片增加「VNC」按钮

**注意**：Native 模式不支持 noVNC（本地 Chrome 窗口已可见），仅 Docker 模式需要。

---

## P1 — Session Probe 会话探测

### 4.1 平台登录状态探测

**现状**：无。

**ABR 参考**：[broker/src/server.js](file:///d:/develop/ASB-Platform/docs/agent-browser-runtime/broker/src/server.js) `POST /sessions/probe` handler；[background.js#L250-L399](file:///d:/develop/ASB-Platform/docs/agent-browser-runtime/extension/background.js#L250-L399) `sessionProbe()`。

**需求**：

| API | 说明 |
|-----|------|
| `POST /sessions/probe` | 探测指定平台的登录状态 |
| 请求参数 | `platform`（linkedin/reddit/facebook/instagram/generic）、`url`、`includeCookies`、`includeStorageState` |
| 响应字段 | `connected`、`reason`、`errorCode`、`currentUrl`、`cookieNames`、`authCookies`、`expiresAt` |

**探测逻辑**：

1. 创建租约 → 创建 Tab → 导航到平台 URL
2. 通过 CDP `Network.getAllCookies` 获取 Cookies
3. 通过 CDP `Runtime.evaluate` 检测页面登录/验证信号：
   - 登录表单选择器匹配（如 `input[name="session_key"]`）
   - 验证文本匹配（如 `captcha`、`security verification`）
4. 根据平台策略判断 `connected` 状态：
   - 有 Auth Cookie + 无验证信号 + 无登录页面 → `connected: true`
   - 否则返回对应 `reason`

**平台策略**（移植 ABR 的 `platformProbePolicy()`）：

| 平台 | Auth Cookies | 登录 URL 特征 | 验证 URL 特征 |
|------|-------------|-------------|-------------|
| LinkedIn | `li_at` | `/login`, `/uas/login` | `/checkpoint/`, `/challenge/` |
| Reddit | `reddit_session`, `token_v2` | `/login` | `/captcha` |
| Facebook | `c_user`, `xs` | `/login`, `/checkpoint/block` | `/checkpoint/`, `/captcha` |
| Instagram | `sessionid`, `ds_user_id` | `/accounts/login` | `/challenge/`, `/captcha` |
| Generic | — | `/login`, `/signin` | `/captcha`, `/challenge` |

**适配方案**：

1. 新建 `src/broker/session-prober.js`，封装探测逻辑
2. 在 [http-server.js](file:///d:/develop/ASB-Platform/src/broker/http-server.js) 中新增 `POST /sessions/probe` 路由
3. 平台策略硬编码在模块中（不引入外部配置依赖，保持简洁）
4. `includeStorageState` 通过 `Runtime.evaluate` 执行 `JSON.stringify({cookies, localStorage, sessionStorage})` 获取

---

## P2 — Artifact 管理

### 5.1 产物生命周期管理

**现状**：ASB-Platform 无 artifact 概念，任务结果仅存储在 `task.result_json` 中。

**ABR 参考**：[broker/src/server.js](file:///d:/develop/ASB-Platform/docs/agent-browser-runtime/broker/src/server.js) artifact CRUD；[store.js](file:///d:/develop/ASB-Platform/docs/agent-browser-runtime/broker/src/store.js) artifacts 表。

**需求**：

| API | 说明 |
|-----|------|
| `GET /artifacts?leaseId=&kind=&limit=` | 列出 artifact 元数据 |
| `GET /artifacts/:id` | 获取单个 artifact 元数据 |
| `GET /artifacts/:id/download` | 下载 artifact 文件 |
| `DELETE /artifacts/:id` | 删除 artifact 记录和文件 |
| `POST /artifacts/cleanup` | 按天数清理旧 artifact（默认 dry-run） |

**Artifact 类型**：

| kind | MIME | 说明 |
|------|------|------|
| `html` | `text/html` | 页面 HTML 快照 |
| `screenshot` | `image/jpeg` 或 `image/png` | 页面截图 |
| `extract-result` | `application/json` | 提取器/采集结果 JSON |
| `session-probe` | `application/json` | 会话探测结果 |
| `error` | `application/json` | 失败任务的错误信息 |

**文件存储**：`data/artifacts/YYYY-MM-DD/<leaseId>/<artifactId>.<ext>`

**适配方案**：

1. 在 `sqlite-store.js` 的 `#migrate()` 方法中新增 `artifacts` 表
2. 新增 `src/broker/artifact-manager.js` 处理文件读写
3. 在 `http-server.js` 中新增 artifact 路由
4. 任务执行完成后自动保存 HTML（可选）和 screenshot（可选）artifact

---

### 5.2 错误 Artifact 与重试

**现状**：ASB-Platform 任务失败仅记录 `error` 字段。

**需求**：

1. 扩展 `POST /tasks/run` 支持 `maxAttempts` 参数（默认 1）
2. 每次失败尝试保存 `error` artifact（含 URL、attempt、error stack）
3. 在所有 `maxAttempts` 耗尽后返回最终失败

**适配方案**：

1. 修改 [task-runner.js](file:///d:/develop/ASB-Platform/src/broker/task-runner.js) 的 `run()` 方法，增加重试循环
2. 新增 `maxAttempts` 参数到请求 schema

---

## P2 — 扩展性增强

### 6.1 Tab 审计与自动修复

**现状**：无。

**ABR 参考**：`GET /tab-audit` + `POST /tab-audit/reconcile`

**需求**：

1. `GET /tab-audit` — 对比内存 `tabs Map` 与实际浏览器 Tab 列表（通过 `GET /json/list`），发现幽灵 Tab（内存中有但浏览器中不存在）和孤立 Tab（浏览器中有但不在租约中）
2. `POST /tab-audit/reconcile` — 自动清理幽灵 Tab 记录

**适配方案**：

1. 在 `environment-manager.js` 中新增 `auditTabs(envId)` 方法
2. 在 `http-server.js` 中新增路由

---

### 6.2 浏览器指纹种子生成

**现状**：无。

**ABR 参考**：`BRS_GENERATE_FINGERPRINT_ENABLED` + `BRS_FINGERPRINT_SEED` 种子系统。

**需求**：基于种子（整数或字符串）确定性生成一套**内部一致**的浏览器指纹：

| 生成项 | 说明 |
|--------|------|
| UA 字符串 | 含 Chrome 版本 + 操作系统 |
| UA-CH 元数据 | `brands`、`fullVersionList`、`platform`、`architecture`、`model`、`mobile` |
| Accept-Language | 可配置的语言偏好 |
| Navigator Platform | 操作系统平台 |
| WebGL Vendor/Renderer | GPU 信息 |
| Hardware Concurrency | CPU 核心数 |
| Device Memory | 设备内存（GB） |
| Max Touch Points | 触摸点数 |

**适配方案**：

1. 新建 `src/browser/fingerprint-generator.js`，用种子 + 预设模板生成一致指纹
2. 预设模板保留 ABR 的 `chrome124-macos`（可扩展）
3. 生成的指纹自动应用到 CDP 覆盖和 JS 环境补丁中

---

### 6.3 Docker Compose 一键部署

**现状**：ASB-Platform 无 `docker-compose.yml`，Docker 模式需要手动管理。

**参考 ABR**：[docker-compose.yml](file:///d:/develop/ASB-Platform/docs/agent-browser-runtime/docker-compose.yml)

**需求**：

1. 编写 `docker-compose.yml`，包含：
   - `asb-broker`：ASB-Platform Node.js 服务
   - `chrome-runtime`：Chromium 浏览器（基于 Playwright 镜像）
2. 通过 `depends_on` + `healthcheck` 确保启动顺序
3. 端口映射：Broker `8787`、CDP `9222`、noVNC `6080`（可选）
4. 环境变量通过 `.env` 文件管理

**适配方案**：基于现有 [docker/Dockerfile](file:///d:/develop/ASB-Platform/docker/Dockerfile) 编写 `docker-compose.yml`。

---

## P2 — 前端增强

### 7.1 VNC 面板嵌入

在 Environment 详情页嵌入 noVNC iframe，支持直接操作浏览器。

### 7.2 Session Probe 页面

新增「会话探测」页面，支持：
- 选择平台 → 一键探测
- 展示 `connected` / `reason` / `authCookies` / `expiresAt`
- 支持 `includeCookies` / `includeStorageState` 导出

### 7.3 Artifact 浏览与下载

在 Tasks 页面中，为每个任务展示关联的 artifacts（HTML/截图/结果 JSON），支持预览和下载。

---

## 实施路线图

```
Phase 1 (P0): 反检测基础 — 预计 3-5 天
├── 1.1 JS 环境补丁（移植 stealth-content.js）
├── 1.2 CDP 层头部覆盖
├── 1.3 Canvas/Audio 噪声
└── 1.4 WebGL 伪装

Phase 2 (P1): 人化操作 + 可视化 — 预计 3-4 天
├── 2.1 真实输入事件（替代 DOM Click）
├── 2.2 人化节奏控制
├── 2.3 平台冷却
├── 3.1 noVNC 集成
└── 4.1 Session Probe

Phase 3 (P2): 完善生态 — 预计 2-3 天
├── 5.1 Artifact 管理
├── 5.2 错误重试
├── 6.1 Tab 审计
├── 6.2 指纹种子生成
├── 6.3 Docker Compose
└── 7.x 前端增强
```

---

## 配置项汇总

实施完成后，ASB-Platform 新增以下环境变量配置项：

```bash
# ── 反检测（Phase 1）──
ASB_STEALTH_ENABLED=1              # 总开关
ASB_STEALTH_EXCLUDED_HOSTS=        # 排除域名（逗号分隔）
ASB_CANVAS_NOISE_ENABLED=1         # Canvas 噪声
ASB_AUDIO_NOISE_ENABLED=1          # Audio 噪声
ASB_WEBGL_VENDOR=                  # WebGL Vendor
ASB_WEBGL_RENDERER=                # WebGL Renderer
ASB_CDP_ACCEPT_LANGUAGE=en-US,en;q=0.9
ASB_CDP_USER_AGENT=               # 覆盖 UA（留空=保留真实）
ASB_CDP_PLATFORM=                  # 覆盖 Platform（留空=保留真实）
ASB_CDP_TIMEZONE=                  # 覆盖 Timezone（留空=保留真实）
ASB_CDP_LOCALE=                    # 覆盖 Locale（留空=保留真实）

# ── 人化操作（Phase 2）──
ASB_HUMANIZE_LEVEL=standard        # off | minimal | standard | enhanced

# ── 平台冷却（Phase 2）──
ASB_COOLDOWN_ENABLED=1
ASB_COOLDOWN_REDDIT_SECONDS=45
ASB_COOLDOWN_FACEBOOK_SECONDS=60
ASB_COOLDOWN_LINKEDIN_SECONDS=180
ASB_COOLDOWN_INSTAGRAM_SECONDS=240
ASB_COOLDOWN_MANUAL_CHALLENGE_SECONDS=300

# ── noVNC（Phase 2）──
ASB_VNC_ENABLED=0                  # Docker 模式下自动启用
ASB_VNC_PORT=6080

# ── 指纹种子（Phase 3）──
ASB_FINGERPRINT_SEED=              # 留空=自动生成
ASB_FINGERPRINT_PLATFORM=macos     # 目标平台
ASB_CHROME_MAJOR=                  # 覆盖 Chrome 主版本号（留空=自动检测）
```

---

## 参考文件映射

| ABR 文件 | ASB-Platform 对应位置 |
|----------|----------------------|
| `extension/stealth-content.js` | `docker/extensions/anti-fingerprint/content.js` |
| `extension/background.js` (CDP overrides) | `src/browser/environment-manager.js` (createTab 后) |
| `extension/background.js` (UI actions) | `src/broker/task-runner.js` (新增 human* 步骤) |
| `extension/background.js` (sessionProbe) | `src/broker/session-prober.js` (新建) |
| `extension/runtime-config.js` | `src/config.js` |
| `broker/src/server.js` (artifact routes) | `src/broker/http-server.js` |
| `broker/src/store.js` (artifacts table) | `src/store/sqlite-store.js` |
| `broker/src/extension-rpc.js` | 不需要（ASB-Platform 无扩展中间层） |
| `tls-gateway/` | Phase 3 评估，非必须 |
| `docker-compose.yml` | `docker-compose.yml`（新建） |