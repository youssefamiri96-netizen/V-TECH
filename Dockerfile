FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    VTECH_CLOUD_MODE=1 \
    VTECH_DATA_DIR=/data \
    VTECH_OUTPUT_DIR=/data/outputs \
    VTECH_DOWNLOADS_DIR=/data/downloads \
    VTECH_XML_DIR=/data/downloads

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN mkdir -p /data/uploads /data/outputs /data/downloads

EXPOSE 8765

CMD ["python", "vtech_web.py", "--host", "0.0.0.0", "--no-browser"]
