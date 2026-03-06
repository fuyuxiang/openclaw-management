# OpenClaw 多实例管理后台

> 在一台 Linux 服务器上，集中管理多个 Docker 运行的 OpenClaw 实例。  
> 支持创建、删除、状态监控、日志查看、系统资源告警与创建前健康检查。

---

## 项目亮点

- 全栈可运行：`React + TypeScript + Express + TypeScript`
- 安全可控：后端强校验容器名、参数化命令执行、防误删非托管容器
- 端口智能分配：从 `18789` 开始，自动补洞 + 系统占用探测
- 多实例可视化：状态、端口、访问地址、运行时长、日志一屏管理
- 资源守护：CPU / 内存 / 磁盘实时监控，超阈值告警并阻止继续创建
- 易扩展：服务层解耦，便于新增重启/停止/备注等能力

---

## 适用场景

- 在同一台服务器上运行多个 OpenClaw 实例
- 需要统一分配端口与可视化管理容器生命周期
- 需要避免误删其他业务容器
- 需要在资源紧张时进行风险拦截

---

## 技术栈

| 层级 | 技术 | 说明 |
|---|---|---|
| 前端 | React + TypeScript + Vite | 管理后台 UI、状态轮询、交互反馈 |
| 后端 | Node.js + Express + TypeScript | REST API、Docker 调用、资源监控 |
| 持久化 | JSON 文件 | 保存实例元数据（可升级 SQLite） |
| 容器管理 | Docker CLI (`child_process.spawn`) | 参数数组调用，避免命令注入 |

---

## 系统架构

```text
┌─────────────────────────────────────────────────────────────────────┐
│                           Frontend (React)                         │
│ 资源卡片 / 创建表单 / 实例表格 / 日志弹窗 / 搜索筛选 / 自动刷新     │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ HTTP REST API
┌───────────────────────────────▼─────────────────────────────────────┐
│                       Backend (Express + TS)                       │
│ routes -> services -> utils                                         │
│ - 实例管理（create/delete/list/logs）                               │
│ - 系统监控（cpu/mem/disk/health）                                   │
│ - 统一错误响应                                                       │
└───────────────┬───────────────────────────────────────────┬─────────┘
                │                                           │
      ┌─────────▼─────────┐                       ┌────────▼────────┐
      │ Docker Engine      │                       │ JSON Store       │
      │ openclaw-zh:local  │                       │ instances.json   │
      └────────────────────┘                       └──────────────────┘
```

---

## 容器托管识别规则（防误删关键）

系统只管理带以下标签的容器：

- `app=openclaw-manager`
- `service=openclaw`

创建时自动附加：

```bash
--label app=openclaw-manager
--label service=openclaw
```

因此，服务器上其他业务容器不会被本系统误操作。

---

## 核心功能清单

### 1) 创建实例

- 输入“专属小龙虾名字”，自动转小写
- 名称规则：`[a-z0-9-]`，长度 `3~30`
- 自动查找下一个可用端口（起始 `18789`）
- 创建命令示例：

```bash
docker run -d \
  --name claw001 \
  --restart unless-stopped \
  --label app=openclaw-manager \
  --label service=openclaw \
  -p 18789:18789 \
  openclaw-zh:local
```

创建成功返回：实例名、容器 ID、端口、访问地址、创建时间、状态。

### 2) 删除实例

- 前端二次确认（显示实例名称，防误删）
- 后端执行：

```bash
docker stop {name}
docker rm {name}
```

- 删除不存在容器时返回明确错误

### 3) 实例监控

- 列表展示：名称、状态、容器 ID、镜像、端口、访问地址、创建时间、运行时长
- 支持手动刷新
- 支持查看最近 100 行日志
- 支持按状态筛选、按名称搜索

### 4) 系统资源监控

- CPU 使用率
- 内存总量/已用/剩余/使用率
- 磁盘总量/已用/剩余/使用率
- Docker 容器总数 + 受管实例数
- 阈值告警：
  - 内存使用率 `> 85%`
  - 磁盘使用率 `> 90%`
- 超阈值时禁用创建按钮并展示原因

### 5) 稳定性与安全性

- 后端严格校验实例名称
- Docker 命令使用参数数组，禁止 shell 拼接
- 创建前检查 Docker 可用性和镜像存在性
- 创建流程加锁，避免并发端口冲突
- 端口分配同时检查系统层占用
- 统一 JSON 响应结构，方便前端与运维排查

---

## REST API

### 响应格式

成功：

```json
{
  "success": true,
  "data": {}
}
```

失败：

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "错误信息",
    "details": {}
  }
}
```

### 接口列表

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/instances` | 获取所有受管 OpenClaw 实例 |
| POST | `/api/instances` | 创建实例，body: `{ "name": "claw001" }` |
| DELETE | `/api/instances/:name` | 删除指定实例 |
| GET | `/api/instances/:name/logs` | 获取实例最近 100 行日志 |
| GET | `/api/system/resources` | 获取系统资源信息 |
| GET | `/api/system/health` | 获取系统健康与是否允许创建 |

### 调用示例

```bash
# 查询实例
curl http://localhost:3001/api/instances

# 创建实例
curl -X POST http://localhost:3001/api/instances \
  -H "Content-Type: application/json" \
  -d '{"name":"claw001"}'

# 删除实例
curl -X DELETE http://localhost:3001/api/instances/claw001

# 查看日志
curl http://localhost:3001/api/instances/claw001/logs

# 系统资源
curl http://localhost:3001/api/system/resources

# 系统健康
curl http://localhost:3001/api/system/health
```

---

## 前端页面说明

1. 顶部资源卡片：CPU / 内存 / 磁盘 / 容器数量
2. 创建实例表单：实时校验 + 自动小写 + 风险拦截
3. 实例表格：状态/端口/访问地址/操作（日志、删除、刷新）
4. 日志弹窗：查看失败时显示详细原因
5. 交互反馈：loading、成功/错误提示、一键复制访问地址
6. 自动轮询：每 `10s` 刷新实例状态与系统资源

---

## 项目结构

```text
openclaw-management/
├── README.md
├── .gitignore
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── data/
│   │   └── instances.json
│   └── src/
│       ├── app.ts
│       ├── config.ts
│       ├── index.ts
│       ├── middleware/
│       │   ├── asyncHandler.ts
│       │   └── errorHandler.ts
│       ├── routes/
│       │   ├── instances.ts
│       │   └── system.ts
│       ├── services/
│       │   ├── dockerService.ts
│       │   ├── instanceStore.ts
│       │   └── systemService.ts
│       ├── types/
│       │   └── index.ts
│       └── utils/
│           ├── command.ts
│           ├── errors.ts
│           ├── network.ts
│           ├── port.ts
│           ├── response.ts
│           └── validators.ts
└── frontend/
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── App.tsx
        ├── api.ts
        ├── main.tsx
        ├── styles.css
        └── types.ts
```

---

## 快速开始

> 前提：已安装 Docker，且镜像 `openclaw-zh:local` 已存在。

### 1) 启动后端

```bash
cd backend
npm install
npm run dev
```

后端默认监听：`http://localhost:3001`

### 2) 启动前端

```bash
cd frontend
npm install
npm run dev
```

前端默认地址：`http://localhost:5173`

说明：Vite 已将 `/api` 代理到 `http://localhost:3001`。

---

## 环境变量

后端支持以下环境变量：

| 变量名 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `3001` | 后端服务端口 |
| `SERVER_IP` | 自动探测 | 返回访问地址时使用的服务器 IP |
| `OPENCLAW_IMAGE` | `openclaw-zh:local` | OpenClaw 镜像名 |

---

## 生产部署建议

### 推荐方案

1. 后端使用 `pm2` 或 `systemd` 守护
2. 前端执行 `npm run build` 后由 Nginx 托管静态资源
3. Nginx 反向代理 `/api` 到后端
4. 启用 HTTPS + 身份认证（Basic Auth / SSO）
5. 限制管理端来源 IP，避免未授权 Docker 操作

### Nginx 反向代理示例

```nginx
server {
  listen 80;
  server_name your-domain-or-ip;

  root /var/www/openclaw-manager/frontend/dist;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:3001/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

---

## 常见问题（FAQ）

### Q1: 创建时报“镜像不存在”

请先确认镜像已加载：

```bash
docker image ls | grep openclaw-zh
```

若不存在，请先导入或构建 `openclaw-zh:local`。

### Q2: 为什么名字会被自动转小写？

为了保证容器名规范一致，避免大小写导致的重复判断问题。

### Q3: 为什么系统资源紧张时不能创建？

这是保护机制，避免实例创建后因内存/磁盘不足导致大面积不稳定。

### Q4: 服务器上还有别的容器，会被误删吗？

不会。系统仅操作带固定 labels 的受管容器。

---

## 扩展路线（下一步）

### 1) 重启实例

- 新增 API：`POST /api/instances/:name/restart`
- 在 `dockerService` 增加 `restartManagedInstance(name)`

### 2) 停止实例

- 新增 API：`POST /api/instances/:name/stop`
- 在 `dockerService` 增加 `stopManagedInstance(name)`
- 前端新增停止按钮与状态刷新逻辑

### 3) 实例备注

- 在 `instances.json` 增加 `note` 字段
- 新增 API：`PATCH /api/instances/:name` 更新备注
- 前端表格新增备注列与编辑弹窗

### 4) 持久化升级

- 将 JSON 存储升级为 SQLite
- 增加审计日志表（创建/删除/重启操作记录）

---

## License

本项目用于 OpenClaw 多实例运维管理示例，可按团队规范补充企业内部许可证说明。
