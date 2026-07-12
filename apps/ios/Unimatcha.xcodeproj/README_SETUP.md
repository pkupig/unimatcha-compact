# iOS 项目设置说明

由于 Xcode 项目文件包含二进制格式内容，请按以下步骤创建 Xcode 项目：

## 创建步骤

1. 打开 Xcode → File → New → Project
2. 选择 iOS → App
3. 填写项目信息：
   - Product Name: Unimatcha
   - Organization Identifier: com.yourname.campuslove
   - Interface: SwiftUI
   - Language: Swift
   - Minimum Deployments: iOS 16.0
4. 保存到 apps/ios/ 目录

## 添加源文件

将 Unimatcha/ 目录下所有 .swift 文件拖入 Xcode 项目。

## 配置 API 地址

在 Info.plist 中添加：
  Key: API_BASE_URL
  Value: http://localhost:3001/api/v1

## App Transport Security（开发环境）

Info.plist 添加 NSAppTransportSecurity -> NSAllowsArbitraryLoads = true
