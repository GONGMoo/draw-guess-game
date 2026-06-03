# 你画我猜

两人联机版你画我猜小游戏。当前实现是一个可安装到 iPhone 主屏幕的 PWA。

## 在电脑上启动

```powershell
cd "D:\00ai小游戏\你画我猜"
npm start
```

也可以右键 `start-phone.ps1`，选择“使用 PowerShell 运行”。

终端会输出：

```text
Draw Guess server running at http://localhost:3000
iPhone on same Wi-Fi: http://你的电脑IP:3000
```

电脑浏览器访问 `http://localhost:3000`。

## 在 iPhone 上使用

1. 让 iPhone 和电脑连接同一个 Wi-Fi。
2. 在 iPhone 的 Safari 打开终端里显示的 `http://你的电脑IP:3000`，不是 `localhost:3000`。
3. 在 Safari 分享菜单里选择“添加到主屏幕”。

如果手机打不开，优先检查：

- 这台电脑当前地址是 `192.168.1.115` 时，手机要打开 `http://192.168.1.115:3000`。
- 运行 `npm start` 的终端不能关闭。
- iPhone 不要使用蜂窝网络、代理或 VPN。
- Windows 防火墙弹窗出现时，要允许 Node.js 访问专用网络。
- 如果没有弹窗，右键 `allow-firewall.ps1`，选择“使用 PowerShell 以管理员身份运行”，手动放行 `3000` 端口。
- 路由器如果开启了 AP 隔离/访客网络，手机会无法访问电脑。
- 先在电脑浏览器确认 `http://localhost:3000` 能打开，再用手机访问局域网地址。

## 真正给别人远程联机

如果两个人不在同一个 Wi-Fi，需要把这个服务部署到公网服务器，或者用内网穿透工具把 `3000` 端口暴露出去。否则另一台手机无法连接到你电脑上的房间服务。

公网部署步骤见 [DEPLOY.md](./DEPLOY.md)。

## 原生 iOS 版

如果要做成 App Store 安装包，需要再用 React Native/Expo 或 Swift 重做客户端，并用 Mac + Xcode 打包。
