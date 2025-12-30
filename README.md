# 项目README文件(最终版)



![GHBanner](https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6)



***

## Language / 语言选择



* [English Version](#english-version)

* [简体中文版本](#chinese-version)



***

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: [https://ai.studio/apps/drive/1KWN5IRlvsLs\_7cZ32akMZX2YYngskgPB](https://ai.studio/apps/drive/1KWN5IRlvsLs_7cZ32akMZX2YYngskgPB)

## Run Locally

**Prerequisites:**  Node.js



1. Install dependencies:

   `npm install`

2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key

3. Run the app:

   `npm run dev`

## TTS API Configuration

The application supports two TTS API options:

### Option 1: OpenAI TTS API



1. Set the `OPENAI_API_KEY` in [.env.local](.env.local) to your OpenAI API key

2. The application will automatically use OpenAI's TTS service

### Option 2: OpenAI-Compatible Edge-TTS API



1. Clone the [openai-edge-tts](https://github.com/travisvn/openai-edge-tts) repository

2. Install dependencies: `npm install`

3. Start the local API server: `npm start` (default port: 5050)

4. No additional API key is required for this option

## Nginx Configuration for CORS

To resolve CORS (Cross-Origin Resource Sharing) issues when the web page domain/port and local API service ([localhost:5050](https://localhost:5050)) are not from the same "origin", you need to configure Nginx.

### Step 1: Install Nginx



```
\# Ubuntu/Debian

sudo apt update

sudo apt install nginx

\# macOS

brew install nginx
```

### Step 2: Create Nginx Configuration File

Create a file named `nginx.conf` in the `conf` directory:



```
server {

&#x20;   listen 80;  # Custom port (e.g., 8080)

&#x20;   server\_name localhost;

&#x20;   # Handle CORS

&#x20;   add\_header Access-Control-Allow-Origin \*;

&#x20;   add\_header Access-Control-Allow-Methods 'GET, POST, OPTIONS';

&#x20;   add\_header Access-Control-Allow-Headers 'Authorization,Content-Type';

&#x20;   # Preflight request directly returns 204

&#x20;   if (\$request\_method = OPTIONS) {

&#x20;       return 204;

&#x20;   }

&#x20;   # Reverse proxy to openai-edge-tts service

&#x20;   location / {

&#x20;       proxy\_pass http://127.0.0.1:5050;  # Point to local API service

&#x20;       proxy\_set\_header Host \$host;

&#x20;       proxy\_set\_header X-Real-IP \$remote\_addr;

&#x20;   }

}
```

### Step 3: Start Nginx with the Configuration



```
\# Test the configuration

nginx -t -c /path/to/your/conf/nginx.conf

\# Start Nginx

nginx -c /path/to/your/conf/nginx.conf

\# Stop Nginx

nginx -s stop
```

### Step 4: Update API Endpoint in Your Application

Change the TTS API endpoint in your application to use the Nginx proxy:



* From: `http://localhost:5050`

* To: `http://localhost` (or your custom port)



***

[Switch to 简体中文版本 ↑](#chinese-version)



***

# 运行和部署您的 AI Studio 应用

这里包含了在本地运行您的应用所需的一切。

在 AI Studio 中查看您的应用: [https://ai.studio/apps/drive/1KWN5IRlvsLs\_7cZ32akMZX2YYngskgPB](https://ai.studio/apps/drive/1KWN5IRlvsLs_7cZ32akMZX2YYngskgPB)

## 本地运行

**前提条件:**  Node.js



1. 安装依赖:

   `npm install`

2. 在 [.env.local](.env.local) 中设置 `GEMINI_API_KEY` 为您的 Gemini API 密钥

3. 运行应用:

   `npm run dev`

## TTS API 配置

应用支持两种 TTS API 选项:

### 选项 1: OpenAI TTS API



1. 在 [.env.local](.env.local) 中设置 `OPENAI_API_KEY` 为您的 OpenAI API 密钥

2. 应用将自动使用 OpenAI 的 TTS 服务

### 选项 2: OpenAI 兼容的 Edge-TTS API



1. 克隆 [openai-edge-tts](https://github.com/travisvn/openai-edge-tts) 仓库

2. 安装依赖: `npm install`

3. 启动本地 API 服务器: `npm start` (默认端口: 5050)

4. 此选项不需要额外的 API 密钥

## Nginx 配置解决 CORS 问题

当网页域名 / 端口和本地 API 服务 ([localhost:5050](https://localhost:5050)) 不属于同一 "源" 时，需要配置 Nginx 来解决 CORS (跨域资源共享) 问题。

### 步骤 1: 安装 Nginx



```
\# Ubuntu/Debian

sudo apt update

sudo apt install nginx

\# macOS

brew install nginx
```

### 步骤 2: 创建 Nginx 配置文件

在 `conf` 目录中创建名为 `nginx.conf` 的文件:



```
server {

&#x20;   listen 80;  # 自定义端口（如 8080）

&#x20;   server\_name localhost;

&#x20;   # 处理跨域

&#x20;   add\_header Access-Control-Allow-Origin \*;

&#x20;   add\_header Access-Control-Allow-Methods 'GET, POST, OPTIONS';

&#x20;   add\_header Access-Control-Allow-Headers 'Authorization,Content-Type';

&#x20;   # 预检请求直接返回 204

&#x20;   if (\$request\_method = OPTIONS) {

&#x20;       return 204;

&#x20;   }

&#x20;   # 反向代理到 openai-edge-tts 服务

&#x20;   location / {

&#x20;       proxy\_pass http://127.0.0.1:5050;  # 指向本地 API 服务

&#x20;       proxy\_set\_header Host \$host;

&#x20;       proxy\_set\_header X-Real-IP \$remote\_addr;

&#x20;   }

}
```

### 步骤 3: 使用配置启动 Nginx



```
\# 测试配置

nginx -t -c /path/to/your/conf/nginx.conf

\# 启动Nginx

nginx -c /path/to/your/conf/nginx.conf

\# 停止Nginx

nginx -s stop
```

### 步骤 4: 更新应用中的 API 端点

将应用中的 TTS API 端点更改为使用 Nginx 代理:



* 从: `http://localhost:5050`

* 到: `http://localhost` (或您的自定义端口)



***

[Switch to English Version ↑](#english-version)



***

## Language / 语言选择



* [English Version](#english-version)

* [简体中文版本](#chinese-version)

> （注：文档部分内容可能由 AI 生成）
