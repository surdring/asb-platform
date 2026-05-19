# ASB Platform

ASB Platform 是一个面向多平台数据采集的共享浏览器环境与 Agent 技能化平台。它将浏览器运行层、Broker 调度层、Skill 技能包和数据持久化解耦，开发者接入新平台时通常只需要新增一个 `skills/<platform>/manifest.json`，无需重建整套采集工程。

## 功能概览

- 支持双模式浏览器环境：`native` 本机 Chrome/Edge，`docker` 容器化 Chrome。
- 支持浏览器状态持久化：Cookies、LocalStorage、IndexedDB 保存到 `data/browser-state/<mode>/<profileId>`。
- 支持 Tab 租用：多个 Agent 通过 Broker 租用独立标签页执行任务。
- 支持动态 Skill：感知层 selector、动作 steps、解析 parser 全部通过 JSON manifest 装载。
- 支持 SQLite 持久化：环境、技能、租约、任务、采集结果、日志统一写入 `data/asb.sqlite`。
- 支持文件日志：运行日志同时追加到 `data/logs/asb.log`。

## 快速开始

运行 Broker：

```bash
npm start
```

默认地址：

```text
http://127.0.0.1:8787
```

运行测试：

```bash
npm test
```

## 完整示例

项目内置了一个可直接跑通的本地示例，不依赖外部网站：

```bash
npm run demo
```

这个示例会自动完成以下流程：

1. 启动本地 Broker 服务。
2. 启动本机 headless Chrome。
3. 启动一个本地 HTTP demo 页面。
4. 创建浏览器环境并租用一个 Tab。
5. 加载 `demo.market.v1` 技能。
6. 执行商品采集动作，抓取 3 条商品数据。
7. 执行点击动作，模拟加入购物车。
8. 将任务、日志、采集结果写入 SQLite。

运行成功后，终端会输出 `ok: true`，同时打印以下信息：

- `brokerUrl`：示例运行时 Broker 地址。
- `databasePath`：SQLite 数据库路径。
- `logFile`：日志文件路径。
- `collectTaskId`：商品采集任务 ID。
- `cartTaskId`：加入购物车任务 ID。
- `collectedProducts`：本次采集到的商品数量。
- `cartItems`：购物车中写入的商品数量。

### 示例产物位置

```text
data/asb.sqlite
data/logs/asb.log
```

### 示例涉及的 Skill

示例 Skill 位于：

```text
skills/demo-market/manifest.json
```

它包含两个动作：

- `collectProducts`：采集页面中的商品卡片。
- `addFirstToCart`：点击第一个商品的加入购物车按钮，并读取存储结果。

## 示例使用说明

如果你想手动体验一遍和 `npm run demo` 相同的链路，可以按下面步骤调用 Broker API。

### 1. 启动服务

```bash
npm start
```

### 2. 创建浏览器环境

```bash
curl -X POST http://127.0.0.1:8787/environments \
  -H "content-type: application/json" \
  -d "{\"id\":\"demo-native\",\"mode\":\"native\",\"profileId\":\"demo-profile\",\"headless\":true}"
```

### 3. 启动浏览器环境

```bash
curl -X POST http://127.0.0.1:8787/environments/demo-native/start
```

### 4. 租用一个 Tab

这里的 `url` 可以换成任意目标页面，也可以先传一个本地页面地址。

```bash
curl -X POST http://127.0.0.1:8787/leases \
  -H "content-type: application/json" \
  -d "{\"environmentId\":\"demo-native\",\"agentId\":\"demo-agent\",\"url\":\"https://example.com\",\"ttlMs\":300000}"
```

返回结果里会包含一个 `leaseId`。

### 5. 执行 Skill 动作

以 demo skill 为例：

```bash
curl -X POST http://127.0.0.1:8787/tasks/run \
  -H "content-type: application/json" \
  -d "{\"leaseId\":\"lease_xxx\",\"skillId\":\"demo.market.v1\",\"action\":\"collectProducts\",\"input\":{}}"
```

如果页面结构匹配，结果会返回解析后的 `items`，同时写入 SQLite 的 `tasks` 和 `collected_items` 表。

### 6. 释放租约

```bash
curl -X DELETE "http://127.0.0.1:8787/leases/lease_xxx?closeTab=true"
```

## 数据查看

Broker 提供了几个直接可用的查询接口：

- `GET /health`
- `GET /db/status`
- `GET /logs?limit=50`
- `GET /tasks?limit=50`
- `GET /collected-items?limit=50`
- `GET /skills`
- `GET /openapi.json`

### 查看数据库状态

```bash
curl http://127.0.0.1:8787/db/status
```

### 查看最近日志

```bash
curl http://127.0.0.1:8787/logs?limit=10
```

### 查看最近任务

```bash
curl http://127.0.0.1:8787/tasks?limit=10
```

### 查看最近采集结果

```bash
curl http://127.0.0.1:8787/collected-items?limit=10
```

## Native 模式

创建并启动一个本地浏览器环境：

```bash
curl -X POST http://127.0.0.1:8787/environments \
  -H "content-type: application/json" \
  -d "{\"id\":\"local-xhs\",\"mode\":\"native\",\"profileId\":\"xhs-main\",\"headless\":false}"

curl -X POST http://127.0.0.1:8787/environments/local-xhs/start
```

如果你手动登录一次，后续复用相同 `profileId` 的 Agent 会共享登录态。

## Docker 模式

构建浏览器镜像：

```bash
docker build -t asb-browser:latest -f docker/Dockerfile .
```

创建并启动容器化浏览器环境：

```bash
curl -X POST http://127.0.0.1:8787/environments \
  -H "content-type: application/json" \
  -d "{\"id\":\"cloud-xhs\",\"mode\":\"docker\",\"profileId\":\"xhs-main\",\"remoteDebuggingPort\":9223,\"image\":\"asb-browser:latest\"}"

curl -X POST http://127.0.0.1:8787/environments/cloud-xhs/start
```

## Skill Manifest 结构

```json
{
  "id": "platform.skill.v1",
  "name": "Platform Collector",
  "platform": "platform",
  "version": "0.1.0",
  "perception": {
    "itemCard": { "selector": ".card" }
  },
  "actions": {
    "collect": {
      "steps": [
        { "type": "waitForSelector", "selector": "itemCard" },
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

支持的 step 类型：

- `navigate`
- `waitForSelector`
- `click`
- `type`
- `scroll`
- `extract`
- `evaluate`
- `sleep`
