# HTTPS 证书方案调研

> 调研日期：2026-08-23  
> 当前决定：暂缓实施，保留现有 Caddy ACME 优先、内部 CA 兜底的行为。

## 结论

Sagnex 当前的 Caddy + FRP 架构可以使用免费且被浏览器公开信任的 HTTPS 证书。

- 有域名时，优先使用 Let's Encrypt 域名证书。这是配置最简单、续期容错时间更长的方案。
- 只有固定公网 IP 时，可以使用 Let's Encrypt 公网 IPv4/IPv6 证书。该能力已于 2026-01-15 正式开放，但证书有效期只有 160 小时，必须可靠地自动续期。
- Caddy 内部 CA 适合作为临时兜底，但其证书不会被普通浏览器默认信任，不能代替公开可信证书。

## 当前行为

当前 `docker/Caddyfile` 为公开 ACME 签发配置了内部 CA 兜底：

```caddy
tls {
    issuer acme
    issuer internal
}
```

域名满足公开签发条件时，Caddy 可以自动申请公开可信证书。使用公网 IP 时，Let's Encrypt 要求 ACME 客户端显式选择 `shortlived` profile；当前配置没有选择该 profile，因此公开签发失败后会改用 Caddy 内部 CA。

这解释了直接通过公网 IP 访问时，浏览器可能看到 `Caddy Local Authority` 证书的原因。该连接仍然加密，但除非访问设备安装并信任 Caddy 根证书，否则浏览器无法验证服务器身份。

## 候选方案

| 方案 | 免费 | 浏览器默认信任 | 自动续期 | 适用性 |
| --- | --- | --- | --- | --- |
| Let's Encrypt 域名证书 | 是 | 是 | Caddy 原生支持 | 首选 |
| Let's Encrypt 公网 IP 证书 | 是 | 是 | Caddy 2.11 系列可管理 | 无域名且公网 IP 固定时可用 |
| Google Trust Services | 是 | 是 | 支持 ACME | 需要 Google Cloud 账号和 EAB，复杂度较高 |
| ZeroSSL | 有免费方案 | 是 | 支持 ACME | 公网 IP 场景不如 Let's Encrypt 直接 |
| Caddy 内部 CA | 是 | 否 | Caddy 原生支持 | 仅适合兜底或已分发根证书的受控设备 |

## 公网 IP 证书的限制

Let's Encrypt 公网 IP 证书具有以下强制条件：

1. 证书只能使用 `shortlived` profile，有效期为 160 小时，约 6 天 16 小时。
2. 支持公网 IPv4 和 IPv6，不签发私有地址或保留地址的公开证书。
3. 只能使用 HTTP-01 或 TLS-ALPN-01 验证，不能通过 DNS-01 验证 IP 地址。
4. 云服务器的公网 `80` 或 `443` 必须能在验证时经 FRP 到达实际管理证书的 Caddy。
5. Caddy 的 `/data` 必须持久化，否则 ACME 账户、证书和续期状态会丢失。
6. 公网 IP 必须稳定；IP 变更后，旧证书不能证明新地址。

短有效期降低了密钥泄露后的暴露窗口，但也缩短了故障恢复时间。如果 FRP、Caddy、网络出口或 ACME 服务连续异常数天，证书可能在恢复前过期。因此该方案必须依赖无人值守续期，不能采用人工定期更新。

## 后续实施建议

如果以后决定支持公网 IP 可信证书，建议按以下顺序实施：

1. 将 Caddy 镜像从当前的 `caddy:2.10-alpine` 升级并固定到经过验证的 2.11 稳定版本。
2. 区分域名和 IP 配置。域名继续使用普通 ACME profile，公网 IP 使用 Let's Encrypt `shortlived` profile，不能把 `shortlived` 无条件应用到所有主机。
3. 为 IP 主机生成或选择类似以下配置：

```caddy
tls {
    issuer acme https://acme-v02.api.letsencrypt.org/directory {
        profile shortlived
    }
    issuer internal
}
```

4. 保留 `issuer internal` 作为可用性兜底，但在日志和文档中明确区分“已加密”和“公开可信”。
5. 增加启动检查：确认 `80/443` 转发、Caddy 数据目录持久化，并输出实际证书颁发者与到期时间。
6. 增加续期观测或告警。IP 证书周期很短，仅依赖用户偶尔打开网页发现过期并不可靠。
7. 分别验证 IPv4、IPv6、无 SNI 客户端和 iPad Safari 等实际访问端，再替换现有生产配置。

当前部署不应直接只增加 `profile shortlived`。这样会同时改变域名场景的证书策略，也没有解决旧 Caddy 镜像及续期观测问题。

## 相关资料

- [Let's Encrypt：6-day and IP Address Certificates are Generally Available](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability/)
- [Let's Encrypt：We've Issued Our First IP Address Certificate](https://letsencrypt.org/2025/07/01/issuing-our-first-ip-address-certificate/)
- [Caddy：`tls` directive and ACME profile](https://caddyserver.com/docs/caddyfile/directives/tls#acme)
- [Caddy：公网 IP 证书兼容问题跟踪](https://github.com/caddyserver/caddy/issues/7399)
- [Google Trust Services：IP Certificates](https://developers.google.com/public-key-infrastructure/faq/ip-certificates)
- [Google Trust Services：获取证书的前置条件](https://developers.google.com/public-key-infrastructure/faq/get-a-certificate)
