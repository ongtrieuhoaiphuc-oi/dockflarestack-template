# Build image litestream tren nen alpine (dam bao co /bin/sh cho entrypoint.sh).
# Image litestream/litestream:latest gan day co bien the scratch (khong shell)
# -> entrypoint restore+replicate can shell nen ta copy binary sang alpine.
FROM litestream/litestream:latest AS ls

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY --from=ls /usr/local/bin/litestream /usr/local/bin/litestream
COPY litestream.yml /etc/litestream.yml
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/bin/sh", "/entrypoint.sh"]
