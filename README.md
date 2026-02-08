# Obsidian Gantt Calendar Enhanced

<div align="center">

**v2.0.0** | Fork 自 [sustcsugar/obsidian-gantt-calendar](https://github.com/sustcsugar/obsidian-gantt-calendar)

一个面向个人任务管理的 Obsidian 插件，提供甘特图风格的周视图、月视图和任务列表三种视角。

</div>

---

## 与原项目的主要区别

本项目在原项目基础上进行了以下关键性修改：

1. **彻底重构任务数据系统** — 抛弃原有的 Markdown 文件解析方式（Tasks/Dataview 格式），改为专用 JSON 文件存储，提供独立的 CRUD 接口和数据层抽象
2. **大幅改造视图系统** — 重写周视图（甘特图风格 bar 布局）、月视图（简化显示逻辑）、任务视图（简洁/完整双模式），移除年视图、日视图和独立甘特图
3. **实现 GitHub 数据同步** — 通过 GitHub Actions 定时推送任务日报和提醒到 Issue，实现数据备份

---

## 核心功能

### 周视图（甘特图风格）

每个任务显示为一行横向 bar，直观展示任务的时间跨度：

- 待办（蓝色）和提醒（橙色虚线）通过颜色区分类型
- 同类型内通过透明度区分优先级（高=深色、普通=中等、低=浅色）
- 已完成任务显示为绿色
- 支持「今天起7天」滚动模式（长按标题切换，或设为默认启动模式）
- 待办显示可点击的复选框，hover 显示详情 tooltip

### 月视图

标准月历布局，任务按日期格子展示：

- 待办仅在截止日期当天显示；无截止日的在开始日期显示
- 提醒仅在提醒日期当天显示
- 已完成任务在完成日当天显示
- 格子内任务超出时可滚动查看

### 任务视图

全部任务的列表视图，支持简洁/完整两种显示模式（点击标题切换）。

### 工具栏

三区域对称布局：

- **左侧**：视图切换 [周 | 月 | 任务]
- **中间**：导航箭头 + 日期标题
- **右侧**：筛选 | 预设 | 新建

### GitHub 同步

通过 GitHub Actions 将任务数据自动推送到 GitHub Issue，支持：

- 配置每日任务日报推送
- 配置定时提醒推送
- 数据备份与跨设备同步

#### Token 配置（推荐使用 Fine-grained Token）

为了安全，建议使用 GitHub [Fine-grained Personal Access Token](https://github.com/settings/personal-access-tokens/new)（细粒度令牌）而非经典 Token。

**创建步骤**：GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token

**必须设置**：

| 设置项 | 值 |
|-------|-----|
| Repository access | **Only select repositories** → 仅选择同步用的私有仓库 |
| Contents | **Read and write**（读写文件，推送 tasks.json 和脚本） |
| Metadata | **Read**（基础仓库信息，自动选中） |
| Workflows | **Read and write**（推送 `.github/workflows/` 下的工作流文件） |

> **安全说明**：
> - 同步仓库务必设为 **Private**（私有），插件初始化时会自动创建为私有仓库
> - Fine-grained Token 仅授权指定仓库，即使泄露也不会影响其他 GitHub 仓库
> - Token 存储在 Obsidian 的 `data.json` 中（本地明文），这是 Obsidian 插件的固有限制
> - 建议设置 Token 有效期（如 90 天），到期后重新生成

---

## 安装

### 手动安装

1. 从 [Releases](https://github.com/Ming-321/obsidian-gantt-calendar-enhance/releases) 下载最新版本
2. 解压到 `<你的库>/.obsidian/plugins/obsidian-gantt-calendar/`
3. 重启 Obsidian，在设置中启用插件

### 开发构建

```bash
npm install          # 安装依赖
npm run dev          # 开发模式（热重载）
npm run build        # 生产构建
```

---

## 任务数据

任务存储在 `.obsidian/plugins/obsidian-gantt-calendar/data/tasks.json`，通过插件内置的创建/编辑弹窗管理任务。

### 任务属性

| 属性 | 说明 |
|------|------|
| 类型 | 待办（截止前持续显示）或 提醒（仅指定日显示） |
| 优先级 | 重要 / 正常 / 不重要（三级） |
| 截止/提醒日期 | 任务的目标日期 |
| 开始日期 | 周视图 bar 的起点（编辑弹窗中可调整） |
| 创建日期 | 自动记录创建时间 |
| 重复规则 | 支持每天/每周/每月/每年，可指定具体星期或日期 |
| 标签 | 任务分类标签，支持筛选 |

---

## 许可证

MIT License

