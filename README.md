# Sagnex

Sagnex 是一款本地优先的事件规划工具。它使用任务依赖图组织工作，通过任务状态自动计算事件进度，并保存任务状态历史。

## 启动

部署只支持 Docker。Windows 需要 Docker Desktop，Ubuntu 需要 Docker Engine 和 Compose 插件；宿主机不需要安装 Node.js。

首次使用先生成本机配置：

```powershell
# Windows
.\sagnex.cmd config
```

```bash
# Ubuntu
./sagnex.sh config
```

修改 `config/sagnex.env`，至少将 `SAGNEX_PUBLIC_HOST` 设置为实际公网域名或 IPv4 地址。只填写主机部分，不要包含 `https://`、端口或路径：

```env
SAGNEX_PUBLIC_HOST=sagnex.example.com
# 或
SAGNEX_PUBLIC_HOST=203.0.113.20
```

随后启动：

```powershell
.\sagnex.cmd start
```

```bash
./sagnex.sh start
```

其他命令：

```text
config   从模板创建本机配置；已存在时询问是否覆盖
start    构建镜像并启动 api、web、caddy
update   使用本地基础镜像重新构建并启动
stop     停止容器，保留数据、备份和证书
```

如果直接执行 `start` 或 `update` 时配置不存在，脚本会询问是否从模板创建。数据库、备份和 Caddy 证书默认保存在项目的 `data` 目录；机器专用配置 `config/sagnex.env` 不进入 Git。

## 公网访问与 FRP

Docker Compose 固定运行三个服务：

```text
caddy → web
      → api
```

Web 和 API 只在 Docker 内部网络通信，外部只访问 Caddy。云服务器运行 FRP 服务端，仅转发 TCP 流量：

```text
浏览器 --HTTPS--> 云服务器 :443 --FRP--> 本地 Caddy :443
证书验证 --------> 云服务器 :80  --FRP--> 本地 Caddy :80
```

参考配置位于：

- `deploy/frp/frps.toml.example`：云服务器。
- `deploy/frp/frpc.toml.example`：运行 Sagnex 的本地机器。

域名应解析到云服务器公网 IP。使用公网 IP 访问时无需 DNS，但 FRP 仍需将云服务器的 `80/443` 转发到本地 Caddy。

## HTTPS 证书

Caddy 对 `SAGNEX_PUBLIC_HOST` 使用两级签发策略：

1. 优先通过 ACME 申请公开可信证书。
2. 如果公开签发不可用，自动改用 Caddy 内部 CA 签发证书。

自签名兜底仍会加密传输，但浏览器默认不信任。其根证书保存在：

```text
data/caddy/pki/authorities/local/root.crt
```

需要将该根证书安装到访问设备的受信任根证书存储中，否则浏览器会显示证书警告。不要在公网环境中习惯性忽略证书警告，因为这无法确认连接到的是否是自己的服务器。

## 局域网访问

可信局域网中的设备可以绕过云服务器和 FRP，直接访问运行 Sagnex 的机器：

```text
http://192.168.1.20
```

局域网 HTTP 同样经过 Caddy，并保持 Web/API 同源。建议通过主机防火墙限制 `80` 端口只允许局域网访问；HTTP 无法防止同一网络中的监听，不适合公共 Wi-Fi 等不可信网络。

## 邮箱验证码登录

邮箱登录默认关闭。启用时，在 `config/sagnex.env` 中配置允许登录的邮箱和 SMTP：

```env
SAGNEX_AUTH_EMAIL=owner@example.com
SAGNEX_SMTP_HOST=smtp.example.com
SAGNEX_SMTP_PORT=587
SAGNEX_SMTP_USER=owner@example.com
SAGNEX_SMTP_PASSWORD=replace-me
SAGNEX_SMTP_FROM=owner@example.com
```

验证码 10 分钟有效、只能使用一次并限制尝试与发送频率。Session 保存在 SQLite 中，默认空闲 14 天失效、最长 30 天失效。前端不发送定时保活请求，只有用户实际访问 API 时才滑动续期。

公网 HTTPS 使用 `HttpOnly`、`Secure`、`SameSite=Lax` Cookie；局域网 HTTP 无法使用 `Secure` Cookie，安全级别较低。

## 开发验证

`pnpm dev`、`pnpm test`、`pnpm build` 只用于源码开发和自动化验证，不属于部署启动方式。
