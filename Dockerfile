# Multi-stage build for OpenBooks (Improved Version)
# Stage 1: Build the React frontend
FROM node:18-alpine as web
WORKDIR /web
COPY . .
WORKDIR /web/server/app/
RUN npm install
RUN npm run build

# Stage 2: Build the Go backend
FROM golang:1.21-alpine as build
WORKDIR /go/src/
COPY . .
COPY --from=web /web/ .

# Install build dependencies
RUN apk add --no-cache git

ENV CGO_ENABLED=0
RUN go get -d -v ./...
RUN go install -v ./...
WORKDIR /go/src/cmd/openbooks/
RUN go build

# Stage 3: Create minimal runtime image
FROM alpine:latest as app
WORKDIR /app

# Install ca-certificates for HTTPS and timezone data
RUN apk --no-cache add ca-certificates tzdata

COPY --from=build /go/src/cmd/openbooks/openbooks .

EXPOSE 80
VOLUME [ "/books" ]

# Environment variables for authentication (optional)
ENV AUTH_USER=""
ENV AUTH_PASS=""
ENV BASE_PATH=/

# Use recommended IRC Highway configuration (port 6667, no TLS)
# with all improvements enabled (random-name, auto-extract, persist)
ENTRYPOINT ["./openbooks", "--random-name", "--server", "irc.irchighway.net:6667", "--tls=false", "server", "--dir", "/books", "--port", "80", "--persist", "--auto-extract"]
