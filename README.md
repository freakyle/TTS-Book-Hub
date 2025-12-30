<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# AI Studio Application Documentation
# AI Studio应用程序文档

---

## English Version
## 英文版本

### Run and deploy your AI Studio app

This contains everything you need to run your app locally.

#### Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Run the app:
   `npm run dev`

#### TTS API Configuration

This application supports text-to-speech functionality through either:

##### Option 1: OpenAI TTS API
- You can use the official OpenAI TTS API
- Requires an OpenAI API key with TTS capabilities

##### Option 2: OpenAI-Compatible Edge-TTS API
- Alternatively, you can use the open-source implementation from: https://github.com/travisvn/openai-edge-tts
- This provides an OpenAI-compatible interface using Microsoft Edge TTS
- For detailed setup instructions, please refer to the [openai-edge-tts repository](https://github.com/travisvn/openai-edge-tts)

#### Nginx Configuration for CORS

When deploying the application, you may encounter CORS (Cross-Origin Resource Sharing) issues if your web frontend and API backend are running on different domains or ports.

##### Problem Description
- Web frontend: Your domain/port (e.g., https://your-domain.com or http://localhost:3000)
- API backend: localhost:5050 (openai-edge-tts service)
- These are considered different "origins" by browsers, causing CORS restrictions

##### Solution: Nginx Reverse Proxy

Modify the Nginx configuration file (conf/nginx.conf) with the following configuration:

```nginx
server {
    listen 80;  # Custom port (e.g., 8080)
    server_name localhost;

    # Handle CORS
    add_header Access-Control-Allow-Origin *;
    add_header Access-Control-Allow-Methods 'GET, POST, OPTIONS';
    add_header Access-Control-Allow-Headers 'Authorization,Content-Type';

    # Preflight requests return 204 directly
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

##### Deployment Steps with Nginx

1. Install Nginx on your server
2. Modify the configuration file as shown above
3. Start Nginx with the new configuration
4. Update your application to use the Nginx endpoint (web call address changed to http://localhost) instead of directly accessing localhost:5050

This setup will:
- Allow cross-origin requests from any domain
- Handle preflight OPTIONS requests
- Proxy requests to your local API service
- Preserve original client IP and host information

#### Troubleshooting

- If you encounter CORS errors, verify your Nginx configuration is correct
- Check that the openai-edge-tts service is running on port 5050
- Ensure your firewall allows traffic on the configured Nginx port
- For production deployment, consider restricting Access-Control-Allow-Origin to specific domains instead of using '*'

---

## Chinese Version
## 中文版本

### 运行和部署您的AI Studio应用

这包含了在本地运行您的应用所需的一切。

#### 本地运行

**前提条件:**  Node.js


1. 安装依赖:
   `npm install`
2. 运行应用:
   `npm run dev`

#### TTS API配置

此应用程序通过以下任一方式支持文本转语音功能:

##### 选项1: OpenAI TTS API
- 您可以使用官方的OpenAI TTS API
- 需要具有TTS功能的OpenAI API密钥

##### 选项2: 兼容OpenAI的Edge-TTS API
- 或者，您可以使用来自以下项目的开源实现: https://github.com/travisvn/openai-edge-tts
- 这提供了一个使用Microsoft Edge TTS的兼容OpenAI的接口
- 有关详细的设置说明，请参考 [openai-edge-tts仓库](https://github.com/travisvn/openai-edge-tts)

#### Nginx CORS配置

在部署应用程序时，如果您的Web前端和API后端运行在不同的域或端口上，可能会遇到CORS（跨域资源共享）问题。

##### 问题描述
- Web前端: 您的域名/端口 (例如: https://your-domain.com 或 http://localhost:3000)
- API后端: localhost:5050 (openai-edge-tts服务)
- 浏览器将这些视为不同的"源"，导致CORS限制

##### 解决方案: Nginx反向代理

修改 Nginx 配置文件（conf/nginx.conf），添加以下配置:

```nginx
server {
    listen 80;  # Custom port (e.g., 8080)
    server_name localhost;

    # Handle CORS
    add_header Access-Control-Allow-Origin *;
    add_header Access-Control-Allow-Methods 'GET, POST, OPTIONS';
    add_header Access-Control-Allow-Headers 'Authorization,Content-Type';

    # Preflight requests return 204 directly
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

##### 使用Nginx的部署步骤

1. 在您的服务器上安装Nginx
2. 按照上面所示修改配置文件
3. 使用新配置启动Nginx
4. 更新您的应用程序以使用 Nginx 端点（网页调用地址改为 http://localhost），而不是直接访问localhost:5050

此设置将:
- 允许来自任何域的跨域请求
- 处理预检OPTIONS请求
- 将请求代理到您的本地API服务
- 保留原始客户端IP和主机信息

#### 故障排除

- 如果遇到CORS错误，请验证您的Nginx配置是否正确
- 检查openai-edge-tts服务是否在端口5050上运行
- 确保您的防火墙允许配置的Nginx端口上的流量
- 对于生产环境部署，请考虑将Access-Control-Allow-Origin限制为特定域，而不是使用'*'
