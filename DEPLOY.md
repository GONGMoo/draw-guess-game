# 公网部署

这个项目是一个 Node.js WebSocket 服务。公网部署后，玩家访问同一个 HTTPS 地址即可联机。

## 方案一：Render / Railway 这类托管平台

适合不想管理服务器的人。

1. 把项目上传到 GitHub。
2. 在平台创建 Web Service。
3. 选择这个仓库。
4. 构建命令可以留空或填：

```bash
npm install
```

5. 启动命令填：

```bash
npm start
```

6. 部署完成后，平台会给你一个 HTTPS 域名，例如：

```text
https://your-game.example.com
```

iPhone Safari 打开这个公网域名，再添加到主屏幕。

## 方案二：Docker 部署到 VPS

适合你已经有云服务器。

服务器安装 Docker 后，在项目目录运行：

```bash
docker build -t draw-guess .
docker run -d --name draw-guess -p 3000:3000 --restart unless-stopped draw-guess
```

临时访问：

```text
http://服务器公网IP:3000
```

正式给 iPhone 使用时，建议再绑定域名并配置 HTTPS。

## 方案三：VPS 直接运行 Node

```bash
git clone 你的仓库地址
cd 你的项目目录
npm install
npm start
```

长期运行建议用 pm2：

```bash
npm install -g pm2
pm2 start server.js --name draw-guess
pm2 save
```

## Nginx 反向代理示例

如果你有域名 `game.example.com`，可以让 Nginx 转发到本机 `3000` 端口：

```nginx
server {
  server_name game.example.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

配置 HTTPS 可以使用 certbot 或云厂商证书。

## 检查部署是否成功

浏览器打开：

```text
https://你的域名/healthz
```

看到下面内容表示服务正在运行：

```json
{"ok":true}
```

再打开主页测试创建房间。
