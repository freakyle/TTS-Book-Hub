<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

[English](#english) / [简体中文](#简体中文)


<a id="english"></a>
# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1KWN5IRlvsLs_7cZ32akMZX2YYngskgPB

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## TTS API Setup

This app supports two TTS API options:
- Official OpenAI TTS API: You can use the official OpenAI Text-to-Speech API by configuring your OpenAI API key in the relevant settings.
- OpenAI-Compatible Edge-TTS API: Alternatively, you can use the open-source implementation from [openai-edge-tts](https://github.com/travisvn/openai-edge-tts). Follow the repository's instructions to deploy the local API service (typically running on `localhost:5050`).

## CORS Configuration with Nginx

If you encounter CORS (Cross-Origin Resource Sharing) issues (due to the web app and local API service running on different origins, e.g., web app on a different port/domain vs. local API at `localhost:5050`), you can use Nginx to handle cross-origin requests.

### Example Nginx Configuration

Create a `conf/nginx.conf` file with the following content:

```nginx
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
