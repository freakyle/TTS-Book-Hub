# 墨香听书 (Moxiang Reader) - AI 小说阅读器
[English Version](#english-version) | [中文版本](#中文版本)
***
## 中文版本
**墨香听书** 是一款专为喜爱电子阅读和听书的用户设计的 Web 应用。它结合了极简的纸质书视觉美学与先进的 AI 文字转语音（TTS）技术，让用户可以将本地或复制的小说内容转化为高品质的语音体验。
### 🌟 核心功能
* **沉浸式阅读体验**：界面采用宣纸纹理背景，配色方案参考古籍，提供极致的视觉舒适度。
* **强大的 AI 语音引擎支持**：支持本地部署的 OpenAI TTS 兼容接口，提供语速调节与多样化音色选择。
* **完善的藏书管理**：本地存储书架系统，支持批量导出、导入及删除操作，所有数据均保留在您的浏览器中。
* **智能阅读器**：自动长文切片，支持进度自动追踪与音频预加载技术，确保持续流畅的播放。
* **国际化支持**：支持简体中文与英文界面一键切换。
### 🛠️ 技术规格
* **前端框架**：React 19 + TypeScript
* **样式方案**：Tailwind CSS
* **数据存储**：浏览器 LocalStorage
* **音频处理**：原生 Web Audio API
### 🚀 快速上手
1. **配置接口**：点击右上角 “设置” 图标，输入您本地 TTS 服务的 API 地址和 Key。
2. **新增书籍**：在 “藏书阁” 点击 “新增书籍”，创建您的第一本书。
3. **添加章节**：进入书籍，添加章节并粘贴小说内容。
4. **开始听书**：点击 “保存并开始听书” 即可享受。
## 本地运行
**前提条件：** Node.js
1. 安装依赖：`npm install`
2. 运行应用：`npm run dev`
## AI 语音服务配置
### 使用 OpenAI TTS API
您可以使用 OpenAI 官方的 TTS API 服务。需要在设置中配置：
* API 地址：`https://api.openai.com/v1/audio/speech`
* API Key：您的 OpenAI API Key
### 使用 OpenAI-Compatible Edge-TTS API
推荐使用 [openai-edge-tts](https://github.com/travisvn/openai-edge-tts) 项目，这是一个与 OpenAI TTS API 兼容的 Edge-TTS 实现。
**安装和使用方法请参考该项目的官方文档：**
[https://github.com/travisvn/openai-edge-tts](https://github.com/travisvn/openai-edge-tts)
## CORS 跨域配置
当网页域名 / 端口与本地 API 服务（默认运行在 [localhost:5050](https://localhost:5050)）不属于同一 "源" 时，可能会遇到 CORS 跨域问题。您可以使用 Nginx 来解决这个问题。
### Nginx 配置示例（conf/nginx.conf）
```
server {
    listen 80;  # 自定义端口（如 8080）
    server_name localhost;
    # 处理跨域
    add_header Access-Control-Allow-Origin *;
    add_header Access-Control-Allow-Methods 'GET, POST, OPTIONS';
    add_header Access-Control-Allow-Headers 'Authorization,Content-Type';
    # 预检请求直接返回 204
    if ($request_method = OPTIONS) {
        return 204;
    }
    # 反向代理到 openai-edge-tts 服务
    location / {
        proxy_pass http://127.0.0.1:5050;  # 指向本地 API 服务
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```
启动 Nginx，网页调用地址改为 http://localhost，即可绕过跨域限制。
***
## English Version
**Moxiang Reader** is a web application designed for those who love digital reading and audiobooks. It blends minimalist paper-book aesthetics with advanced AI Text-to-Speech (TTS) technology, allowing users to transform copied novel text into high-quality audio experiences.
### 🌟 Key Features
* **Immersive Reading Experience**: Features a traditional paper-texture background and a classic "ancient book" color palette for maximum visual comfort.
* **Powerful AI Voice Engine**: Supports locally deployed OpenAI-compatible TTS endpoints with adjustable playback speed and various voice profiles.
* **Comprehensive Library Management**: A local bookshelf system supporting batch export, import, and deletion. All data stays securely in your browser.
* **Smart Reader**: Automatically splits long text into chunks, featuring progress tracking and audio pre-loading for a gapless listening experience.
* **I18n Support**: Seamlessly switch between Simplified Chinese and English interfaces.
### 🛠️ Technical Specs
* **Framework**: React 19 + TypeScript
* **Styling**: Tailwind CSS
* **Storage**: Browser LocalStorage
* **Audio**: Native Web Audio API
### 🚀 Quick Start
1. **Configure API**: Click the "Settings" icon to set your local TTS API endpoint and Key.
2. **Add a Book**: Click "New Book" in the Library to get started.
3. **Add Chapters**: Enter the book, add a chapter, and paste your content.
4. **Start Listening**: Click "Save & Play" to begin your AI-narrated journey.
## Local Development
**Prerequisites:** Node.js
1. Install dependencies: `npm install`
2. Run the application: `npm run dev`
## AI Voice Service Configuration
### Using OpenAI TTS API
You can use OpenAI's official TTS API service. Configure in settings:
* API Endpoint: `https://api.openai.com/v1/audio/speech`
* API Key: Your OpenAI API Key
### Using OpenAI-Compatible Edge-TTS API
Recommended to use [openai-edge-tts](https://github.com/travisvn/openai-edge-tts), an OpenAI TTS API compatible Edge-TTS implementation.
**Please refer to the project's official documentation for installation and usage:**
[https://github.com/travisvn/openai-edge-tts](https://github.com/travisvn/openai-edge-tts)
## CORS Configuration
When the web page domain/port and local API service (default running on [localhost:5050](https://localhost:5050)) are not from the same "origin", you may encounter CORS issues. You can use Nginx to solve this problem.
### Nginx Configuration Example (conf/nginx.conf)
```
server {
    listen 80;  # Custom port (e.g., 8080)
    server_name localhost;
    # Handle CORS
    add_header Access-Control-Allow-Origin *;
    add_header Access-Control-Allow-Methods 'GET, POST, OPTIONS';
    add_header Access-Control-Allow-Headers 'Authorization,Content-Type';
    # Return 204 for preflight requests
    if ($request_method = OPTIONS) {
        return 204;
    }
    # Reverse proxy to openai-edge-tts service
    location / {
        proxy_pass http://127.0.0.1:5050;  # Point to local API service
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```
Start Nginx and change the web page call address to http://localhost to bypass CORS restrictions.
***
*“墨香余韵，耳畔书声。” —— Thank you for using Moxiang Reader.*
