FROM node:24-bookworm-slim
LABEL org.opencontainers.image.version="0.17.0-preview"
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4318 FAMILY_DATA_DIR=/data TZ=Asia/Shanghai
COPY --chown=node:node *.cjs ./
COPY --chown=node:node prototype/ ./prototype/
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 4318
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD ["node", "healthcheck.cjs"]
CMD ["node", "server.cjs"]
