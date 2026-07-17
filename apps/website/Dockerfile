# Unimatcha 官网 —— 纯静态站（index.html + privacy.html + 预留视频素材），nginx 托管。
# 经 Caddy 反代为主域名（unimatcha.ai），见根目录 docker-compose.yml / Caddyfile。
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html
# nginx.conf 需要留在构建上下文里（上面 COPY 用），但不该被当静态文件对外提供
RUN rm -f /usr/share/nginx/html/nginx.conf
EXPOSE 80
