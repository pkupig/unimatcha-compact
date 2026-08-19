# U-Spark 匹配模型服务（FastAPI）。默认 LLM_BACKEND=mock，无需 ollama/模型即可端到端跑。
FROM python:3.12-slim
WORKDIR /app

# 先装依赖（利用层缓存）
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# 再拷源码
COPY app ./app
COPY feedback ./feedback
COPY questionnaire ./questionnaire

EXPOSE 8100
# HOST=0.0.0.0 对外监听；生产必须设 MATCH_API_KEY（空 key + 非回环会 fail-closed 拒绝启动）
ENV HOST=0.0.0.0 PORT=8100
CMD ["python", "-m", "app.main"]
