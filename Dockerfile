# Stage 1: build the frontend with cache-friendly layers.
FROM node:20-alpine3.21 AS web
WORKDIR /web/server/app
COPY server/app/package*.json ./
RUN npm ci
COPY server/app/ ./
RUN npm run build

# Stage 2: build the Go backend.
FROM golang:1.24-alpine3.21 AS build
WORKDIR /src
RUN apk add --no-cache git

COPY go.mod go.sum ./
RUN go mod download

COPY . .
COPY --from=web /web/server/app/dist ./server/app/dist

ENV CGO_ENABLED=0
RUN go build -o /out/openbooks ./cmd/openbooks

# Stage 3: runtime image.
FROM alpine:3.21 AS app
WORKDIR /app
RUN apk --no-cache add ca-certificates tzdata

COPY --from=build /out/openbooks ./openbooks

EXPOSE 80
VOLUME [ "/books" ]

# Environment variables for authentication (optional)
ENV AUTH_USER=""
ENV AUTH_PASS=""
ENV BASE_PATH=/
ENV OPENBOOKS_ARGS="--random-name --server irc.irchighway.net:6667 --tls=false --log server --dir /books --port 80 --persist --auto-extract"

ENTRYPOINT ["sh", "-c", "./openbooks ${OPENBOOKS_ARGS}"]
