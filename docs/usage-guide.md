# ASB Platform 使用指南

## 目录

- [架构概览](#架构概览)
- [快速启动](#快速启动)
- [浏览器环境管理](#浏览器环境管理)
- [标签页租用](#标签页租用)
- [Skill 技能系统](#skill-技能系统)
- [任务执行](#任务执行)
- [数据查询](#数据查询)
- [完整示例：新增一个采集任务](#完整示例新增一个采集任务)
- [最佳实践](#最佳实践)

---

## 架构概览

ASB Platform 由以下核心模块组成：

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Agent/用户  │────▶│  Broker API  │────▶│  Skill 引擎  │
│  (HTTP调用)  │     │  (node:http) │     │  (CDP 协议)  │
└─────────────┘     └──────┬───────┘     └──────┬───────┘
                           │                     │
                           ▼                     ▼
                    ┌──────────────┐     ┌──────────────┐
                    │  租约管理器   │     │ 浏览器环境管理器 │
                    │  LeaseManager│     │  Environment  │
                    └──────────────┘     └──────┬───────┘
                                                │
                                    ┌───────────┴───────────┐
                                    │                       │
                               ┌────────┐            ┌────────┐
                               │ Native │            │ Docker │
                               │ Chrome │            │ Chrome │
                               └────────┘            └────────┘
```

**核心概念：**

- **Broker**：中心调度服务，提供 REST API 管理浏览器环境、租约和任务
- **浏览器环境**：一个 Chrome/Edge 浏览器实例（Native 或 Docker 模式），拥有独立的用户数据目录
- **租约（Lease）**：Agent 对浏览器中某个标签页的临时使用权，有过期时间
- **Skill（技能）**：定义采集逻辑的 JSON manifest，包含感知层选择器、动作步骤和解析器
- **任务（Task）**：在某个租约上执行 Skill 中某个动作的一次运行

---

## 快速启动

### 启动 Broker 服务

```bash
npm start
```

默认监听 `http://127.0.0.1:8787`。

### 验证服务

```bash
curl http://127.0.0.1:8787/health
```

返回示例：

```json
{
  "ok": true,
  "service": "asb-broker",
  "database": { "path": "...", "environments": 0, "skills": 0, "leases": 0, "tasks": 0, "collectedItems": 0, "logs": 0 },
  "environments": 0,
  "skills": 0
}
```

### 环境变量配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `ASB_HOST` | `127.0.0.1` | 监听地址 |
| `ASB_PORT` | `8787` | 监听端口 |
| `ASB_DATA_DIR` | `./data` | 数据目录 |
| `ASB_DB_PATH` | `{dataDir}/asb.sqlite` | SQLite 数据库路径 |
| `ASB_SKILLS_DIR` | `./skills` | 技能清单目录 |
| `ASB_LEASE_TTL_MS` | `900000` (15分钟) | 租约默认过期时间 |
| `ASB_BODY_LIMIT_BYTES` | `2097152` (2MB) | 请求体大小限制 |

---

## 浏览器环境管理

### 创建环境

```bash
curl -X POST http://127.0.0.1:8787/environments \
  -H "content-type: application/json" \
  -d '{
    "id": "my-env",
    "mode": "native",
    "profileId": "my-profile",
    "headless": true
  }'
```

**参数说明：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 否 | 环境标识，不传则自动生成 UUID |
| `mode` | string | 否 | `native`（本机 Chrome/Edge）或 `docker`（容器化 Chrome），默认 `native` |
| `profileId` | string | 否 | 浏览器配置文件标识，用于持久化 Cookies/LocalStorage |
| `headless` | boolean | 否 | 是否无头模式，默认 `false` |
| `remoteDebuggingPort` | number | 否 | CDP 调试端口，Native 默认 `9222`，Docker 默认 `9223` |
| `chromePath` | string | 否 | Chrome/Edge 可执行文件路径，不传则自动探测 |
| `cdpEndpoint` | string | 否 | 附加到已有浏览器时使用，如 `http://127.0.0.1:9222` |
| `attachOnly` | boolean | 否 | 仅附加到已有浏览器，不启动新进程，默认 `true`（当提供 `cdpEndpoint` 时） |
| `sharedProfile` | boolean | 否 | 是否共享配置文件，默认 `true` |
| `userDataDir` | string | 否 | 自定义用户数据目录路径 |
| `extensionsDir` | string | 否 | 浏览器扩展目录路径 |
| `startTimeoutMs` | number | 否 | 启动超时时间，默认 `15000` |

### 启动环境

```bash
curl -X POST http://127.0.0.1:8787/environments/my-env/start
```

启动后返回环境摘要，包含 `status: "running"` 和 CDP 端点地址。

### 停止环境

```bash
curl -X POST http://127.0.0.1:8787/environments/my-env/stop
```

### 列出所有环境

```bash
curl http://127.0.0.1:8787/environments
```

### Native 模式详解

Native 模式使用本机安装的 Chrome 或 Edge 浏览器：

```bash
# 创建带界面的浏览器环境（可手动登录）
curl -X POST http://127.0.0.1:8787/environments \
  -H "content-type: application/json" \
  -d '{
    "id": "login-env",
    "mode": "native",
    "profileId": "my-account",
    "headless": false
  }'

# 启动后手动登录一次
curl -X POST http://127.0.0.1:8787/environments/login-env/start
```

登录态会持久化到 `data/browser-state/native/my-account/` 目录。后续使用相同 `profileId` 的环境会自动复用登录态。

**跨平台 Chrome 路径探测：**

| 平台 | 探测路径 |
|------|----------|
| Windows | `C:\Program Files\Google\Chrome\Application\chrome.exe`、`C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`、Edge 同理 |
| macOS | `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` |
| Linux | `google-chrome`、`chromium`、`chromium-browser` |

如果自动探测失败，可通过 `chromePath` 参数指定路径。

### Docker 模式详解

```bash
# 1. 构建浏览器镜像
docker build -t asb-browser:latest -f docker/Dockerfile .

# 2. 创建 Docker 环境
curl -X POST http://127.0.0.1:8787/environments \
  -H "content-type: application/json" \
  -d '{
    "id": "docker-env",
    "mode": "docker",
    "profileId": "docker-profile",
    "remoteDebuggingPort": 9223,
    "image": "asb-browser:latest"
  }'

# 3. 启动
curl -X POST http://127.0.0.1:8787/environments/docker-env/start
```

Docker 模式额外支持以下参数：

| 参数 | 说明 |
|------|------|
| `image` | Docker 镜像名，默认 `asb-browser:latest` |
| `containerName` | 容器名，自动生成 |
| `remoteDebuggingPort` | 宿主机端口映射 |

### 附加到已有浏览器

如果你已经有一个正在运行的 Chrome（如本地开发时手动打开的浏览器），可以附加到它：

```bash
curl -X POST http://127.0.0.1:8787/environments \
  -H "content-type: application/json" \
  -d '{
    "id": "attach-env",
    "mode": "native",
    "cdpEndpoint": "http://127.0.0.1:9222"
  }'

curl -X POST http://127.0.0.1:8787/environments/attach-env/start
```

附加模式不会启动新进程，也不会关闭已有浏览器。

---

## 标签页租用

租约（Lease）是 Agent 使用浏览器标签页的临时授权机制。

### 创建租约

```bash
curl -X POST http://127.0.0.1:8787/leases \
  -H "content-type: application/json" \
  -d '{
    "environmentId": "my-env",
    "agentId": "agent-001",
    "url": "https://example.com",
    "ttlMs": 300000,
    "isolatedContext": false,
    "metadata": { "purpose": "data-collection" }
  }'
```

**参数说明：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `environmentId` | string | 是 | 浏览器环境 ID |
| `agentId` | string | 是 | Agent 标识 |
| `url` | string | 否 | 初始导航 URL，默认 `about:blank` |
| `ttlMs` | number | 否 | 租约有效期（毫秒），默认 `900000`（15分钟） |
| `isolatedContext` | boolean | 否 | 是否使用独立浏览器上下文，默认 `false` |
| `groupId` | string | 否 | 标签页分组 ID |
| `metadata` | object | 否 | 自定义元数据 |

**返回示例：**

```json
{
  "id": "lease_550e8400-e29b-41d4-a716-446655440000",
  "agentId": "agent-001",
  "environmentId": "my-env",
  "tabId": "E22535E9A7018B22A5E89E34C274008B",
  "groupId": "group_E22535E9",
  "sessionId": "",
  "status": "active",
  "metadata": { "purpose": "data-collection" },
  "createdAt": "2026-05-16T07:00:00.000Z",
  "expiresAt": "2026-05-16T07:05:00.000Z"
}
```

### 续租

```bash
curl -X POST http://127.0.0.1:8787/leases/lease_xxx/renew \
  -H "content-type: application/json" \
  -d '{ "ttlMs": 600000 }'
```

### 释放租约

```bash
# 释放租约，同时关闭标签页
curl -X DELETE "http://127.0.0.1:8787/leases/lease_xxx?closeTab=true"

# 仅释放租约，保留标签页
curl -X DELETE "http://127.0.0.1:8787/leases/lease_xxx"
```

### 查询租约

```bash
# 查询所有租约
curl http://127.0.0.1:8787/leases

# 按 Agent 过滤
curl "http://127.0.0.1:8787/leases?agentId=agent-001"

# 按环境过滤
curl "http://127.0.0.1:8787/leases?environmentId=my-env"
```

### 租约生命周期

```
创建 ──▶ active ──▶ released（主动释放）
                ──▶ expired（超时自动过期）
```

- 过期检查是惰性的：在调用 `list()`、`get()` 时触发
- 过期后的租约仍可查询历史，但无法执行任务

---

## Skill 技能系统

Skill 是 ASB Platform 的核心抽象，它将采集逻辑定义为声明式 JSON manifest。

### 目录结构

```
skills/
└── <platform>/
    └── manifest.json
```

每个平台一个目录，目录名即平台名。Broker 启动时自动扫描 `skills/` 下所有子目录中的 `manifest.json`。

### Manifest 完整结构

```json
{
  "id": "platform.skill.v1",
  "name": "Platform Collector",
  "platform": "platform",
  "version": "0.1.0",
  "description": "采集某平台商品数据",
  "perception": {
    "itemCard": {
      "selector": ".product-card",
      "description": "商品卡片容器"
    },
    "nextButton": {
      "selector": ".pagination .next",
      "description": "翻页按钮"
    }
  },
  "actions": {
    "collectProducts": {
      "steps": [
        { "type": "waitForSelector", "selector": "itemCard", "timeoutMs": 10000 },
        { "type": "extract", "name": "items", "selector": "itemCard", "many": true }
      ],
      "parser": "items"
    }
  },
  "parsers": {
    "items": {
      "type": "javascript",
      "source": "(input) => ({ items: input.items })"
    }
  }
}
```

### 字段说明

| 字段 | 说明 |
|------|------|
| `id` | 技能唯一标识，全局唯一 |
| `name` | 技能可读名称 |
| `platform` | 所属平台，用于分类 |
| `version` | 语义化版本号 |
| `description` | 技能描述 |
| `perception` | 感知层定义，声明 DOM 选择器，可在 actions 中通过名称引用 |
| `actions` | 动作集合，每个动作包含 steps 和可选的 parser |
| `parsers` | 解析器集合，用于将原始采集结果转换为结构化数据 |

### Perception（感知层）

Perception 定义 DOM 选择器，key 是选择器别名，value 包含 `selector`（CSS 选择器）和可选的 `description`。

```json
"perception": {
  "productRow": { "selector": "tr[data-product]" },
  "productName": { "selector": ".name" },
  "productPrice": { "selector": ".price" }
}
```

在 action steps 中，可以通过别名引用选择器：

```json
{ "type": "click", "selector": "productRow" }
```

框架会自动解析为 `tr[data-product]`。如果传入的是原始 CSS 选择器（如 `".my-class"`），则直接使用。

### Actions（动作）

每个 action 包含一个 `steps` 数组和一个可选的 `parser` 引用。

#### 支持的 Step 类型

| 类型 | 说明 | 参数 |
|------|------|------|
| `navigate` | 导航到 URL | `url`（支持 `{{input.key}}` 模板插值）、`waitMs` |
| `waitForSelector` | 等待元素出现 | `selector`、`timeoutMs`（默认 15000） |
| `click` | 点击元素 | `selector`、`waitMs`（默认 300） |
| `type` | 输入文本 | `selector`、`text`（支持模板插值）、`waitMs` |
| `scroll` | 滚动页面 | `x`、`y`（像素）、`waitMs` |
| `extract` | 提取元素内容 | `selector`、`name`、`many`、`attribute` |
| `evaluate` | 执行任意 JS | `name`、`expression`（支持模板插值） |
| `sleep` | 等待指定时间 | `ms` |

**extract 的 attribute 参数：**

| 值 | 说明 |
|------|------|
| `textContent`（默认） | 元素的文本内容（trim 后） |
| `html` | 元素的 innerHTML |
| 其他字符串 | 元素的属性值，如 `href`、`src`、`data-id` |

**evaluate 示例：**

```json
{
  "type": "evaluate",
  "name": "pageTitle",
  "expression": "document.title"
}
```

```json
{
  "type": "evaluate",
  "name": "customData",
  "expression": "JSON.parse(document.querySelector('#data').textContent)"
}
```

**模板插值：**

在 `navigate.url`、`type.text`、`evaluate.expression` 中可以使用 `{{input.key}}` 语法引用任务输入参数：

```json
{
  "type": "navigate",
  "url": "https://example.com/search?q={{input.keyword}}"
}
```

### Parsers（解析器）

解析器将 steps 执行后的 `context.results` 转换为最终输出。

**JavaScript 解析器：**

```json
{
  "parsers": {
    "products": {
      "type": "javascript",
      "source": "(input) => ({
        items: input.products.map((p, i) => ({
          index: i + 1,
          title: p,
          capturedAt: new Date().toISOString()
        }))
      })"
    }
  }
}
```

`input` 即 `context.results` 对象，包含所有 step 中通过 `name` 保存的结果。

**Mapping 解析器：**

```json
{
  "parsers": {
    "simple": {
      "type": "mapping",
      "fields": {
        "title": "products.0",
        "count": "products.length"
      }
    }
  }
}
```

### 重新加载技能

如果运行时修改了 manifest.json，无需重启 Broker：

```bash
curl -X POST http://127.0.0.1:8787/skills/reload
```

### 查看已加载的技能

```bash
curl http://127.0.0.1:8787/skills
```

---

## 任务执行

### 执行任务

```bash
curl -X POST http://127.0.0.1:8787/tasks/run \
  -H "content-type: application/json" \
  -d '{
    "leaseId": "lease_xxx",
    "skillId": "platform.skill.v1",
    "action": "collectProducts",
    "input": { "keyword": "laptop" }
  }'
```

**参数说明：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `leaseId` | string | 是 | 有效的活跃租约 ID |
| `skillId` | string | 是 | 技能 ID |
| `action` | string | 是 | 动作名称 |
| `input` | object | 否 | 输入参数，可在 steps 中通过 `{{input.key}}` 引用 |

**返回示例：**

```json
{
  "taskId": "task_xxx",
  "leaseId": "lease_xxx",
  "skillId": "platform.skill.v1",
  "action": "collectProducts",
  "results": {
    "items": ["Product A", "Product B", "Product C"],
    "parsed": {
      "items": ["Product A", "Product B", "Product C"]
    }
  },
  "completedAt": "2026-05-16T07:00:05.000Z"
}
```

### 任务生命周期

```
创建 ──▶ running ──▶ completed（成功）
                 ──▶ failed（失败）
```

- 任务执行过程中，每一步的结果会按 `name` 存入 `context.results`
- 如果 action 定义了 `parser`，解析结果存入 `context.results.parsed`
- 解析后的 `items` 数组会自动持久化到 `collected_items` 表

### 查看任务历史

```bash
curl "http://127.0.0.1:8787/tasks?limit=20"
```

---

## 数据查询

Broker 提供多个查询接口，所有数据持久化在 SQLite 中。

### 数据库状态

```bash
curl http://127.0.0.1:8787/db/status
```

返回各表的记录数。

### 查看日志

```bash
curl "http://127.0.0.1:8787/logs?limit=50"
```

日志包含结构化字段：`level`、`message`、`event`、`payload`。

### 查看任务

```bash
curl "http://127.0.0.1:8787/tasks?limit=50"
```

### 查看采集结果

```bash
curl "http://127.0.0.1:8787/collected-items?limit=50"
```

### SSE 事件总线

```bash
curl -N http://127.0.0.1:8787/events
```

订阅实时事件，事件类型包括：

| 事件 | 触发时机 |
|------|----------|
| `environment.created` | 环境创建 |
| `environment.started` | 环境启动 |
| `environment.stopped` | 环境停止 |
| `lease.created` | 租约创建 |
| `lease.renewed` | 租约续期 |
| `lease.released` | 租约释放 |
| `lease.expired` | 租约过期 |
| `task.started` | 任务开始 |
| `task.completed` | 任务完成 |
| `task.failed` | 任务失败 |
| `skills.reloaded` | 技能重新加载 |

### OpenAPI 规范

```bash
curl http://127.0.0.1:8787/openapi.json
```

---

## 完整示例：新增一个采集任务

以下演示如何为某个目标网站新增一个完整的采集流程。

### 场景

假设我们要采集某个技术新闻网站的文章列表，提取标题、链接和发布时间。

### 第一步：创建 Skill 目录和 Manifest

```bash
mkdir -p skills/tech-news
```

创建 `skills/tech-news/manifest.json`：

```json
{
  "id": "technews.article.v1",
  "name": "Tech News Article Collector",
  "platform": "tech-news",
  "version": "0.1.0",
  "description": "采集技术新闻网站的文章列表",
  "perception": {
    "articleList": {
      "selector": ".article-list .item",
      "description": "文章列表项"
    },
    "articleTitle": {
      "selector": "h2 a",
      "description": "文章标题链接"
    },
    "articleDate": {
      "selector": ".date",
      "description": "发布日期"
    },
    "loadMore": {
      "selector": ".load-more",
      "description": "加载更多按钮"
    }
  },
  "actions": {
    "collectArticles": {
      "steps": [
        {
          "type": "waitForSelector",
          "selector": "articleList",
          "timeoutMs": 10000
        },
        {
          "type": "extract",
          "name": "titles",
          "selector": "articleTitle",
          "many": true,
          "attribute": "textContent"
        },
        {
          "type": "extract",
          "name": "links",
          "selector": "articleTitle",
          "many": true,
          "attribute": "href"
        },
        {
          "type": "extract",
          "name": "dates",
          "selector": "articleDate",
          "many": true,
          "attribute": "textContent"
        }
      ],
      "parser": "articles"
    },
    "collectWithScroll": {
      "steps": [
        {
          "type": "waitForSelector",
          "selector": "articleList",
          "timeoutMs": 10000
        },
        {
          "type": "scroll",
          "y": 2000,
          "waitMs": 1000
        },
        {
          "type": "extract",
          "name": "titles",
          "selector": "articleTitle",
          "many": true
        }
      ],
      "parser": "articles"
    }
  },
  "parsers": {
    "articles": {
      "type": "javascript",
      "source": "(input) => ({
        items: input.titles.map((title, i) => ({
          title: title,
          url: (input.links || [])[i] || null,
          date: (input.dates || [])[i] || null,
          capturedAt: new Date().toISOString()
        }))
      })"
    }
  }
}
```

### 第二步：重新加载技能

```bash
curl -X POST http://127.0.0.1:8787/skills/reload
```

验证技能已加载：

```bash
curl http://127.0.0.1:8787/skills
```

### 第三步：准备浏览器环境

```bash
# 创建环境
curl -X POST http://127.0.0.1:8787/environments \
  -H "content-type: application/json" \
  -d '{
    "id": "tech-news-env",
    "mode": "native",
    "profileId": "tech-news-profile",
    "headless": true
  }'

# 启动环境
curl -X POST http://127.0.0.1:8787/environments/tech-news-env/start
```

### 第四步：租用标签页

```bash
curl -X POST http://127.0.0.1:8787/leases \
  -H "content-type: application/json" \
  -d '{
    "environmentId": "tech-news-env",
    "agentId": "crawler-01",
    "url": "https://example-tech-news.com",
    "ttlMs": 300000
  }'
```

记下返回的 `leaseId`。

### 第五步：执行采集任务

```bash
curl -X POST http://127.0.0.1:8787/tasks/run \
  -H "content-type: application/json" \
  -d '{
    "leaseId": "lease_xxx",
    "skillId": "technews.article.v1",
    "action": "collectArticles",
    "input": {}
  }'
```

### 第六步：查看采集结果

```bash
curl "http://127.0.0.1:8787/collected-items?limit=10"
```

### 第七步：清理

```bash
# 释放租约并关闭标签页
curl -X DELETE "http://127.0.0.1:8787/leases/lease_xxx?closeTab=true"

# 停止浏览器环境
curl -X POST http://127.0.0.1:8787/environments/tech-news-env/stop
```

### 完整脚本示例

你也可以用 Node.js 编写自动化脚本（参考 `examples/run-complete-demo.js`）：

```javascript
import http from 'node:http'

const BASE = 'http://127.0.0.1:8787'

async function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: 8787,
      path,
      method,
      headers: body ? { 'content-type': 'application/json' } : {}
    }
    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => data += chunk)
      res.on('end', () => {
        const parsed = JSON.parse(data)
        if (res.statusCode >= 400) reject(new Error(parsed.error))
        else resolve(parsed)
      })
    })
    req.on('error', reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

// 1. 创建环境
await request('POST', '/environments', {
  id: 'my-env',
  mode: 'native',
  profileId: 'my-profile',
  headless: true
})

// 2. 启动环境
await request('POST', '/environments/my-env/start')

// 3. 租用标签页
const lease = await request('POST', '/leases', {
  environmentId: 'my-env',
  agentId: 'my-agent',
  url: 'https://example.com',
  ttlMs: 300000
})

// 4. 执行任务
const result = await request('POST', '/tasks/run', {
  leaseId: lease.id,
  skillId: 'technews.article.v1',
  action: 'collectArticles',
  input: {}
})

console.log(`采集到 ${result.results.parsed.items.length} 条数据`)

// 5. 清理
await request('DELETE', `/leases/${lease.id}?closeTab=true`)
await request('POST', '/environments/my-env/stop')
```

---

## 最佳实践

### 1. 复用浏览器配置文件

对于需要登录的网站，先手动登录一次，后续使用相同 `profileId` 的 Agent 会自动复用登录态：

```bash
# 第一次：非 headless 模式，手动登录
curl -X POST http://127.0.0.1:8787/environments \
  -H "content-type: application/json" \
  -d '{"id":"login","mode":"native","profileId":"my-account","headless":false}'

# 后续：headless 模式，复用登录态
curl -X POST http://127.0.0.1:8787/environments \
  -H "content-type: application/json" \
  -d '{"id":"crawl","mode":"native","profileId":"my-account","headless":true}'
```

### 2. 合理设置租约 TTL

- 短任务（如单页采集）：`ttlMs: 60000`（1分钟）
- 长任务（如多页遍历）：`ttlMs: 600000`（10分钟）
- 超时后租约自动过期，任务会失败

### 3. 使用 `waitForSelector` 确保页面就绪

在所有操作之前，先等待关键元素出现：

```json
{ "type": "waitForSelector", "selector": "contentArea", "timeoutMs": 15000 }
```

### 4. 翻页采集模式

对于多页采集，可以在 action 中组合 scroll 和 extract：

```json
{
  "steps": [
    { "type": "waitForSelector", "selector": "item", "timeoutMs": 10000 },
    { "type": "extract", "name": "page1", "selector": "item", "many": true },
    { "type": "click", "selector": "nextButton", "waitMs": 2000 },
    { "type": "waitForSelector", "selector": "item", "timeoutMs": 10000 },
    { "type": "extract", "name": "page2", "selector": "item", "many": true }
  ],
  "parser": "merge"
}
```

### 5. 错误处理

- 任务失败时，错误信息会记录在 SQLite 的 `tasks.error` 字段
- 浏览器 stderr 输出会通过 `logger` 记录
- 可以通过 `GET /logs` 查看详细日志

### 6. 性能建议

- 使用 `headless: true` 减少资源消耗
- 合理设置 `timeoutMs`，避免长时间等待不存在的元素
- 采集完成后及时释放租约和关闭浏览器环境
- 多个 Agent 可以共享同一个浏览器环境的不同标签页

### 7. 开发调试

- 开发时使用 `headless: false` 观察浏览器行为
- 使用 `evaluate` step 执行任意 JS 来调试选择器
- 查看 `data/logs/asb.log` 获取详细运行日志
- 使用 `node --watch src/index.js`（`npm run dev`）实现热重启