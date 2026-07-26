FROM golang:1.25-alpine AS builder
WORKDIR /app
RUN apk add --no-cache git
COPY go.mod ./
RUN go mod download
COPY . .
RUN go mod tidy
RUN go build -o skia-api .

FROM alpine:latest
WORKDIR /app
RUN apk add --no-cache ca-certificates wget python3 py3-pip poppler-utils
RUN pip3 install --no-cache-dir --break-system-packages pdfplumber
COPY --from=builder /app/skia-api .
EXPOSE 8080
CMD ["./skia-api"]
