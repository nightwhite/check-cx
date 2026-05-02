# Astro 单页 Dashboard 设计 Brief

## Feature Summary

Check CX 单页 Dashboard 面向需要快速判断 AI Provider 和模型健康状态的团队成员。页面必须优先服务扫描、筛选和异常定位，而不是营销展示。

## Primary User Action

用户进入页面后，应在几秒内判断当前是否存在异常 Provider，并能按分组、搜索词和 7/15/30 天窗口定位具体模型。

## Design Direction

视觉先对标原版：清晰、克制、技术型、状态密度高。界面应像运维状态中心，而不是 SaaS 落地页或重型后台。

## Layout Strategy

- 顶部保留产品名、整体状态、总数、更新时间和刷新操作。
- 控制区集中放置搜索、分组、时间窗口。
- 主体使用自适应网格展示 Provider 状态，卡片半径控制在 8px。
- 分组不跳转页面，作为过滤条件保留在单页内。

## Key States

- Loading：显示紧凑骨架，不白屏。
- Error：显示错误和重试按钮。
- Empty：说明当前没有快照数据。
- Default：展示状态摘要、分组筛选和 Provider 卡片。
- Mobile：控制项纵向排列，卡片单列，无横向溢出。

## Interaction Model

- period 按钮切换后重新请求 `/api/dashboard`。
- 搜索和分组过滤只在客户端过滤当前快照。
- 刷新按钮强制重新拉取当前 period。
- Provider 卡片展示状态、延迟、ping、模型、分组和最新消息。

## Content Requirements

- 保留中文标签：全部、搜索、刷新、更新时间、无数据、加载失败。
- 状态文案使用原版语义：operational、degraded、failed、validation_failed、maintenance、error。

## Recommended References

- `impeccable`：避免营销页、过度卡片化和泛 AI 风格。
- `shape`：保持用户目标为“快速判断异常”。
