FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04

ARG BAZELISK_VERSION=v1.27.0
ARG IBAZEL_VERSION=v0.29.0
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

RUN mkdir -p /home/vscode/.cache/bazel /home/vscode/.cache/bazelisk /home/vscode/.vscode-server \
    && chown -R vscode:vscode /home/vscode/.cache /home/vscode/.vscode-server

USER vscode

RUN curl -fsSL https://claude.ai/install.sh | NONINTERACTIVE=1 bash
