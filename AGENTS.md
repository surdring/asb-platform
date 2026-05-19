---
trigger: always
---

# ASB-Platform 项目规则

## 1) 语言
- 始终使用中文回复（除非用户明确要求使用其他语言）。
- 错误消息（Error message）必须用**英文**（便于日志搜索）；注释与 UI 文案可中文。

## 2) 技术栈概要

| 项目 | 选型 |
|------|------|
| 运行时 | Node.js >= 22 |
| 模块系统 | ES Module (`"type": "module"`) |
| 外部依赖 | **无**（零 npm 依赖，纯 Node.js 内置模块） |
| HTTP 服务 | `node:http` 原生模块 |
| 浏览器协议 | Chrome DevTools Protocol（CDP），通过 `WebSocket` 通信 |
| 测试框架 | Node.js 内置 `node:test` + `node:assert/strict` |
| 容器化 | Docker（基于 Playwright 镜像） |
| 类型系统 | 纯 JavaScript（无 TypeScript） |
| 数据库 | 无（内存状态 + 文件系统持久化浏览器配置） |

## 3) 项目目录结构

```
ASB-Platform/
├── docker/
│   ├── Dockerfile              # 浏览器容器镜像
│   ├── start-chrome.sh         # 容器启动脚本
│   └── extensions/
│       └── anti-fingerprint/   # 反指纹浏览器扩展
├── scripts/
│   └── smoke-test.js           # 冒烟测试脚本
├── skills/
│   └── <platform>/
│       └── manifest.json       # 平台技能清单
├── src/
│   ├── broker/
│   │   ├── http-server.js      # HTTP API 服务 + OpenAPI 规范
│   │   ├── lease-manager.js    # 标签页租用生命周期管理
│   │   └── task-runner.js      # 技能任务执行引擎
│   ├── browser/
│   │   ├── cdp-client.js       # CDP WebSocket 客户端
│   │   ├── chrome-paths.js     # 跨平台 Chrome/Edge 路径探测
│   │   └── environment-manager.js  # 浏览器环境管理（原生 + Docker）
│   ├── skills/
│   │   └── skill-registry.js   # 技能清单注册与加载
│   ├── config.js               # 配置（环境变量驱动）
│   └── index.js                # 入口文件
├── test/
│   ├── core.test.js            # 核心单元测试
│   └── http-server.test.js     # HTTP 服务集成测试
├── data/                       # 运行时数据（gitignore）
│   └── browser-state/          # 浏览器配置文件持久化
├── package.json
├── AGENTS.md
└── README.md
```

## 4) 验证命令

```bash
npm test          # 运行所有测试（node --test）
npm start         # 启动服务
npm run dev       # 开发模式（node --watch 热重启）
```

- 任务**只有在自动化验证通过后**方可标记完成。
- 优先运行 `npm test` 验证；若因环境/依赖缺失无法运行，必须在任务条目中记录原因与补验收计划，**不得直接标记完成**。

## 5) 编码规范

### 5.1 通用原则
- **零外部依赖**：本项目不使用任何 npm 包。所有功能必须使用 Node.js 内置模块实现。
- **ES Module**：所有 `.js` 文件使用 `import`/`export` 语法，不使用 `require`。
- **极致简洁**：用最少的代码解决问题，不做预测性编码。
- **精准修改**：只改动必须改的部分，不重构没有问题的代码。

### 5.2 命名约定
- **文件/目录**：`kebab-case`（如 `http-server.js`、`chrome-paths.js`、`environment-manager.js`）
- **类名**：`PascalCase`（如 `CdpClient`、`LeaseManager`、`SkillRegistry`、`BrowserEnvironmentManager`）
- **函数/变量**：`camelCase`
- **常量**：`UPPER_SNAKE_CASE`（如 `DEFAULT_CHROME_FLAGS`、`ACTION_TIMEOUT_MS`）
- **私有字段**：`#` 前缀（ES 私有字段语法，如 `#handleMessage`）

### 5.3 代码风格
- 不使用分号（遵循 Prettier 默认风格）
- 字符串使用单引号
- 缩进使用 2 空格
- 行尾不加分号
- 不使用 `var`，优先 `const`，其次 `let`
- 异步优先使用 `async/await`，避免裸 `.then()`
- 不使用 `console.log` 调试（使用 `console.error` 或结构化日志）

### 5.4 错误处理
- 错误消息（message）必须用英文
- 业务错误使用 `throw Object.assign(new Error(message), { statusCode })` 模式
- HTTP 错误码映射见 `statusFor()` 函数

### 5.5 测试规范
- 使用 `node:test` 的 `test()` 函数编写测试
- 断言使用 `node:assert/strict`
- 测试文件放在 `test/` 目录，命名 `*.test.js`
- 测试描述使用英文

### 5.6 导入规范
- 使用 Node.js 内置模块时显式指定 `node:` 前缀（如 `import http from 'node:http'`）
- 不使用路径别名，使用相对路径导入（如 `'./cdp-client.js'`）
- 导入 `.js` 文件时必须带扩展名

## 6) 技能清单规范

- 技能清单为 JSON 格式，位于 `skills/<platform>/manifest.json`
- 必须包含字段：`id`、`name`、`platform`、`version`、`perception`、`actions`
- `perception` 定义 DOM 选择器，`actions` 定义操作步骤，`parsers` 定义数据解析器
- 支持的步骤类型：`navigate`、`waitForSelector`、`click`、`type`、`scroll`、`extract`、`evaluate`、`sleep`
- 新增平台无需修改 broker 代码，只需添加技能清单并调用 `POST /skills/reload`

## 7) API 规范

- HTTP API 基于 `node:http` 原生模块
- 所有响应为 JSON 格式（`Content-Type: application/json; charset=utf-8`）
- 支持 CORS（`Access-Control-Allow-Origin: *`）
- SSE 事件总线位于 `GET /events`
- OpenAPI 规范位于 `GET /openapi.json`
- API 描述文案使用中文（已在 `openApiSpec()` 函数中配置）

## 8) 浏览器环境规范

- 支持两种模式：`native`（本地 Chrome/Edge）和 `docker`（容器化 Chrome）
- 浏览器配置文件持久化在 `data/browser-state/<mode>/<profileId>/`
- CDP 通信通过 WebSocket，使用 `CdpClient` 封装
- 跨平台 Chrome 路径探测见 `chrome-paths.js`（支持 Windows/macOS/Linux）

## 9) 文档生成与落盘
- 当用户要求"生成文档/规范/模板/清单"等内容时：
  - 必须根据仓库目录结构，选择**合理的目标目录**（优先 `docs/`）。
  - 必须以 **Markdown（.md）** 格式在目标目录中**创建文件并写入内容**（而不是只在聊天中输出）。
  - 若用户未指定目标目录或命名：
    - 先提出 1-3 个建议路径与文件名供用户确认，再创建文件。

## 10) 行为准则

### 10.1 先思考再编码（Think Before Coding）
**不要假设。不要隐藏困惑。暴露权衡。**

实现之前：
- 明确陈述你的假设。如果不确定，提问。
- 如果存在多种解读，全部列出——不要默默选择。
- 如果存在更简单的方案，直接指出。必要时敢于提出异议。
- 如果某件事不清晰，停下来。明确指出困惑点。提问。

### 10.2 极致简洁（Simplicity First）
**用最少的代码解决问题。不做预测性编码。**

- 不实现未被要求的功能。
- 不为单次使用的代码创建抽象层。
- 不引入未被要求的"灵活性"或"可配置性"。
- 不为不可能发生的场景编写错误处理。
- 如果写了 200 行但可以用 50 行解决，重写。
- 自问："资深工程师会觉得这个过于复杂吗？"如果是，简化。

### 10.3 精准修改（Surgical Changes）
**只改动必须改的部分。只清理自己引入的遗留问题。**

编辑现有代码时：
- 不"改进"相邻代码、注释或格式。
- 不重构没有问题的代码。
- 匹配现有风格，即使你更倾向另一种写法。
- 如果发现无关的废弃代码，可以提及——不要删除。

自己的改动产生孤儿代码时：
- 清理自己导致不再使用的导入/变量/函数。
- 不要删除预先存在的废弃代码（除非被要求）。

检验标准：每一行改动都应能直接追溯到用户的需求。

## 11) 数据持久化规范
- 核心数据（浏览器配置文件）使用文件系统持久化，路径为 `data/browser-state/`
- 运行时状态（环境、租约、技能）使用内存存储（`Map`）
- 并发控制：Node.js 单线程事件循环天然安全，无需额外锁机制
- 进程状态：使用 CDP 端点探测判断浏览器进程是否存活

## 12) 跨平台适配
- 使用 `chrome-paths.js` 中的策略模式封装平台差异（Linux / macOS / Windows）
- 系统命令（`spawn`）、目录选择等操作需适配各平台标准工具
- Docker 模式仅在安装了 Docker 的环境中可用