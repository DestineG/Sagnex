# Sagnex

Sagnex 是一款本地优先的事件规划工具。它使用任务依赖图组织工作，通过任务状态自动计算事件进度，并保存不可修改的任务状态历史。

## 非 Docker 启动

需要 Node.js 20+。首次使用可先生成本机配置：

```powershell
.\sagnex.cmd config
```

按需修改 `config/sagnex.env` 后启动：

```powershell
.\sagnex.cmd start
```

Ubuntu 执行：

```bash
./sagnex.sh config
# 按需修改 config/sagnex.env
./sagnex.sh start
```

如果直接执行 `start` 且配置不存在，脚本会询问是否从模板创建配置并继续。首次启动会自动安装依赖并构建，完成后访问 `http://127.0.0.1:4173`。

## Docker 启动

需要 Docker Desktop（Windows）或 Docker Engine 与 Compose 插件（Ubuntu），不需要在宿主机安装 Node.js。

Windows 执行：

```powershell
.\sagnex.cmd config
# 按需修改 config/sagnex.env
.\sagnex.cmd docker start
```

Ubuntu 执行：

```bash
./sagnex.sh config
# 按需修改 config/sagnex.env
./sagnex.sh docker start
```

如果配置不存在，`docker start` 同样会先询问。首次启动会构建镜像并启动容器，局域网访问入口默认是 `http://127.0.0.1`。

## Docker + Caddy + FRP

Docker 启动会同时运行 `api`、`web` 和本地 `caddy` 容器。Caddy 是本地入口：它在同一个 Compose 网络中将 `/` 转发到 Web，将 `/api/` 转发到 API。Web/API 容器本身不需要证书，API 端口也不会直接暴露。

执行 `config` 后会生成两个本地配置文件：

- `config/sagnex.env`：端口、数据目录、邮箱登录和 Caddy 端口等机器配置。
- `config/Caddyfile`：本地 Caddy 路由配置，已被 `.gitignore` 忽略。

公网访问时，将 `SAGNEX_PUBLIC_DOMAIN` 改成自己的域名。域名 DNS 指向云服务器，云服务器运行 FRP 服务端，将 `80` 和 `443` 仅做 TCP 转发；本地运行 FRP 客户端，将它们转到本机的 Caddy 端口。Caddy 会在本地申请和续期证书，云服务器不需要配置 HTTPS。可参考 `deploy/frp/frps.toml.example` 和 `deploy/frp/frpc.toml.example`。

局域网内可以直接访问本机地址，例如 `http://192.168.1.20`。这是 HTTP 访问，只适合可信局域网；公网访问必须使用 HTTPS。建议在主机防火墙中只允许局域网访问本地 HTTP 端口。

## 邮箱验证码登录

默认不启用登录。需要登录时，在 `config/sagnex.env` 配置 `SAGNEX_AUTH_EMAIL` 以及 SMTP 参数。API 会发送一次性验证码并创建服务端 Session：验证码 10 分钟有效且只能使用一次，Session 空闲 14 天失效、最长 30 天失效。前端不会发送定时保活请求，只有用户实际访问 API 时才会滑动续期。

公网 HTTPS 下 Cookie 使用 `HttpOnly`、`Secure` 和 `SameSite=Lax`。局域网 HTTP 无法使用 `Secure` Cookie，安全级别较低，只建议在可信网络使用。
