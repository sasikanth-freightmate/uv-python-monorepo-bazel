FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04

ARG BAZELISK_VERSION=v1.27.0
ARG IBAZEL_VERSION=v0.29.0
ARG NODE_MAJOR=22
ARG PLAYWRIGHT_VERSION=1.49.0
ARG TARGETARCH

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        ca-certificates \
        curl \
        git \
        python3 \
        python3-venv \
        unzip \
        zip \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL "https://github.com/bazelbuild/bazelisk/releases/download/${BAZELISK_VERSION}/bazelisk-linux-${TARGETARCH}" \
        -o /usr/local/bin/bazelisk \
    && chmod +x /usr/local/bin/bazelisk \
    && ln -sf /usr/local/bin/bazelisk /usr/local/bin/bazel

RUN curl -fsSL "https://github.com/bazelbuild/bazel-watcher/releases/download/${IBAZEL_VERSION}/ibazel_linux_${TARGETARCH}" \
        -o /usr/local/bin/ibazel \
    && chmod +x /usr/local/bin/ibazel

# Node.js — used only for tooling such as Playwright. The app itself builds and
# runs with the Bazel-managed Node toolchain, not this one.
RUN curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Playwright + Chromium for headless UI verification of the Next.js app
# (localhost:3000). Everything is predownloaded at image-build time — the
# browser binaries, the headless shell, and every OS library Chromium needs —
# so verification works offline with no runtime fetch. Browsers live in a
# shared, world-readable location. Playwright ships arm64 Chromium, which
# (unlike Puppeteer's x86 bundle) runs natively on Apple-silicon containers.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV NODE_PATH=/usr/lib/node_modules
RUN npm install -g "playwright-core@${PLAYWRIGHT_VERSION}" "playwright@${PLAYWRIGHT_VERSION}" \
    && playwright install --with-deps chromium chromium-headless-shell \
    && chmod -R a+rX /ms-playwright \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /home/vscode/.cache/bazel /home/vscode/.cache/bazelisk /home/vscode/.vscode-server \
    && chown -R vscode:vscode /home/vscode/.cache /home/vscode/.vscode-server

USER vscode

RUN curl -fsSL https://claude.ai/install.sh | NONINTERACTIVE=1 bash
