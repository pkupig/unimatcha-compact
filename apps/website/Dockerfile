# Unimatcha 官网 —— 纯静态站（index.html + privacy.html + 预留视频素材），nginx 托管。
# 经 Caddy 反代为主域名（unimatcha.com），见根目录 docker-compose.yml / Caddyfile。
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html
EXPOSE 80
