# 免费 Uptime 监控开通指南

> 目的：防止第三次 DNS/服务器级全站故障要等用户来问"怎么打不开"才发现（7/17、8/31 已各发生一次）。
> 这一项**不需要改代码**——生产已有的公开端点就能直接拿来监控，缺的只是"有个东西替你盯着"。
> 编写日期：2026-09-04。

## 用哪个服务

**推荐 [UptimeRobot](https://uptimerobot.com) 免费档**：50 个监控点、5 分钟检测一次、邮件/短信/Webhook 告警，免费额度对这个规模完全够用。注册账号这一步只能你自己做（邮箱注册，几分钟）。

## 加这四个监控点

登录后台 → Add New Monitor → Monitor Type 选 **HTTP(s)**，逐个添加：

| 名称 | URL | 监控的是什么 |
|---|---|---|
| Unimatcha 官网 | `https://unimatcha.ai` | 官网/DNS 可达性 |
| Unimatcha API | `https://api.unimatcha.ai/api/v1/public/site-stats` | **API + 数据库**都健康才会返回 200（这个端点内部要查库，比单纯 ping 首页更能测到真问题） |
| Unimatcha H5 | `https://app.unimatcha.ai` | H5 应用可达性 |
| Unimatcha 后台 | `https://admin.unimatcha.ai` | 管理后台可达性 |

四个都设成 **5 分钟检测一次**，告警方式建议邮件 + 如果你常看手机可以加一个免费的 Telegram/微信机器人推送（UptimeRobot 支持，设置里能找到）。

## 建完之后

四个监控点全绿就完事了，不用再管。哪天真出故障（DNS 又被劫、服务器挂了），你会在 5 分钟内收到邮件，而不是等用户来问。
