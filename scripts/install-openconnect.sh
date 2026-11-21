#!/bin/bash

# OpenConnect Installation Helper Script
# This script helps install OpenConnect via Homebrew

set -e

echo "=========================================="
echo "OpenConnect 安装助手"
echo "=========================================="
echo ""

# Check if running on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "❌ 本脚本仅支持 macOS"
    exit 1
fi

# Check if Homebrew is installed
if ! command -v brew &> /dev/null; then
    echo "❌ 未检测到 Homebrew"
    echo ""
    echo "请先安装 Homebrew："
    echo "  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
    echo ""
    exit 1
fi

echo "✅ Homebrew 已安装"
echo ""

# Check if OpenConnect is already installed
if command -v openconnect &> /dev/null; then
    VERSION=$(openconnect --version | head -n1)
    echo "✅ OpenConnect 已安装"
    echo "   $VERSION"
    echo ""
    read -p "是否升级到最新版本？(y/N): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "⏳ 正在升级 OpenConnect…"
        brew upgrade openconnect
        echo "✅ OpenConnect 升级成功！"
    else
        echo "已跳过升级"
    fi
else
    echo "⏳ 正在通过 Homebrew 安装 OpenConnect…"
    echo ""

    brew install openconnect

    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ OpenConnect 安装成功！"
        VERSION=$(openconnect --version | head -n1)
        echo "   $VERSION"
    else
        echo ""
        echo "❌ OpenConnect 安装失败"
        exit 1
    fi
fi

echo ""
echo "=========================================="
echo "安装完成！"
echo "=========================================="
echo ""
echo "现在可以使用 OpenConnect VPN GUI 应用了。"
echo ""
