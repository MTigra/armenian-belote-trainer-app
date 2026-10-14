FROM node:24.19.0-bookworm-slim AS node
FROM gradle:8.14.3-jdk21 AS build
USER root
COPY --from=node /usr/local/ /usr/local/
WORKDIR /src
COPY . .
RUN npm install -g pnpm@11.25.0 && pnpm install --frozen-lockfile \
    && ./gradlew :server:installDist :game-core:jsNodeProductionLibraryDistribution -PuseSystemNode=true \
    && pnpm --filter @blot/web build

FROM eclipse-temurin:21-jre
RUN groupadd --system blot && useradd --system --uid 10001 --gid blot blot
WORKDIR /app
COPY --from=build /src/server/build/install/server/ /app/server/
COPY --from=build /src/web/dist/ /app/web/
ENV PORT=8080 WEB_ROOT=/app/web JAVA_OPTS="-Xmx256m -XX:MaxDirectMemorySize=64m -XX:ActiveProcessorCount=2"
EXPOSE 8080
USER blot
CMD ["/app/server/bin/server"]
