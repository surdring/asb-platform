FROM mcr.microsoft.com/playwright:v1.44.1-jammy

USER root

ENV ASB_HEADLESS=true

RUN apt-get update && apt-get install -y --no-install-recommends \
    x11vnc novnc websockify \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /home/pwuser/profile /opt/asb/extensions && chown -R pwuser:pwuser /home/pwuser /opt/asb

COPY docker/extensions/anti-fingerprint /opt/asb/extensions/anti-fingerprint
COPY docker/start-chrome.sh /usr/local/bin/start-chrome
RUN chmod +x /usr/local/bin/start-chrome

USER pwuser
EXPOSE 9222 6080

CMD ["start-chrome"]
