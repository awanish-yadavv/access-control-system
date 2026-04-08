FROM node:latest
RUN apt-get update && apt-get install -y mosquitto mosquitto-clients gettext-base && rm -rf /var/lib/apt/lists/*
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
