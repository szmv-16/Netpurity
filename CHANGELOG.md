# 更新日志

## 0.1.0 — 首个可用版本

### 检测

- 出口 IP 多源交叉验证（5 个探测源，可发现透明代理与分流出不同出口）
- IP 纯净度：住宅 / 移动 / 机房 / 代理分类、ASN 归属、PTR、原生性判定
- 信誉与黑名单：DroneBL、SpamCop、S5H、UCEPROTECT 四个公开 DNSBL
- DNS 泄露：通过 `o-o.myaddr`、`whoami.akamai.net` 等权威 DNS 回显递归解析器出口 IP，与代理出口做 ASN / 国家比对
- DNS 劫持与污染：NXDOMAIN 劫持探测、与 Cloudflare DoH 结果比对
- WebRTC 泄露：srflx 公网候选与出口 IP 比对，识别 mDNS 混淆、内网地址、IPv6 候选
- 环境一致性：时区、语言地区与出口所在地比对
- 百分制综合评分，跳过项不计入分母

### 界面

- 一键检测与实时进度
- 概览精简列表 + 详细解析弹层
- 解锁测试：Netflix、Disney+、Prime Video、YouTube Premium、Spotify、TikTok、哔哩哔哩、ChatGPT、Claude、Gemini
- 设置：深色 / 浅色 / 跟随系统主题、情报源公示、版本信息
- 报告导出（JSON / PDF）、复制文字摘要
- 本地历史记录（最近 50 次，可回看与对比分数变化）

### 工程

- 检测引擎与界面解耦，`src/core` 只依赖 Node 标准库，可单独复用
- 检测引擎可在命令行直接运行（`pnpm cli`），适合服务器巡检
- 启动日志（`%TEMP%\netpurity\boot.log`）与窗口强制显示兜底，便于排查环境问题
- AGPL-3.0 许可证

### 已知限制

- 加密 DNS（DoH/DoT）环境下无法观测解析器出口，DNS 项会显示「跳过」而不是给假结论
- 部分代理的 fake-ip 模式会让 DNS 探测失效，同样显示「跳过」
- 解锁测试基于 HTTP 响应特征，属于实验性判定，未登录与人机验证会干扰结果
- 未做代码签名，Windows 首次运行会有 SmartScreen 提示
