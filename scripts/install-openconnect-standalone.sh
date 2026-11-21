#!/bin/bash

# OpenConnect Standalone Installation Script
# This script installs OpenConnect from source without Homebrew

set -e

echo "=========================================="
echo "OpenConnect 独立安装脚本"
echo "=========================================="
echo ""

# Check if running on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "❌ 本脚本仅支持 macOS"
    exit 1
fi

# Check for required build tools
if ! command -v gcc &> /dev/null && ! command -v clang &> /dev/null; then
    echo "❌ 未检测到 C 编译器"
    echo ""
    echo "请先安装 Xcode 命令行工具："
    echo "  xcode-select --install"
    echo ""
    exit 1
fi

echo "✅ 已检测到构建工具"
echo ""

# Set installation directory
INSTALL_DIR="$HOME/.local/openconnect"
BIN_DIR="$INSTALL_DIR/bin"
TEMP_DIR="/tmp/openconnect-build"

echo "安装目录：$INSTALL_DIR"
echo ""

# Create directories
mkdir -p "$BIN_DIR"
mkdir -p "$TEMP_DIR"

# OpenConnect version to install
OPENCONNECT_VERSION="9.12"
GNUTLS_VERSION="3.8.3"
NETTLE_VERSION="3.9.1"
GMP_VERSION="6.3.0"

echo "⏳ 正在下载并编译依赖…"
echo "根据机器性能，可能需要 15-30 分钟。"
echo ""

cd "$TEMP_DIR"

# Function to download and extract
download_and_extract() {
    local url=$1
    local filename=$(basename "$url")
    local dirname=${filename%.tar.*}

    echo "📥 正在下载 $filename…"
    curl -LO "$url" || wget "$url"

    echo "📦 正在解压 $filename…"
    tar -xf "$filename"

    echo "$dirname"
}

# Build GMP (required by Nettle)
if [ ! -f "$INSTALL_DIR/lib/libgmp.dylib" ]; then
    echo ""
    echo "正在编译 GMP…"
    dirname=$(download_and_extract "https://ftp.gnu.org/gnu/gmp/gmp-$GMP_VERSION.tar.xz")
    cd "$dirname"
    ./configure --prefix="$INSTALL_DIR" --enable-shared
    make -j$(sysctl -n hw.ncpu)
    make install
    cd "$TEMP_DIR"
fi

# Build Nettle (required by GnuTLS)
if [ ! -f "$INSTALL_DIR/lib/libnettle.dylib" ]; then
    echo ""
    echo "正在编译 Nettle…"
    dirname=$(download_and_extract "https://ftp.gnu.org/gnu/nettle/nettle-$NETTLE_VERSION.tar.gz")
    cd "$dirname"
    PKG_CONFIG_PATH="$INSTALL_DIR/lib/pkgconfig" \
    ./configure --prefix="$INSTALL_DIR" --enable-shared
    make -j$(sysctl -n hw.ncpu)
    make install
    cd "$TEMP_DIR"
fi

# Build GnuTLS
if [ ! -f "$INSTALL_DIR/lib/libgnutls.dylib" ]; then
    echo ""
    echo "正在编译 GnuTLS…"
    dirname=$(download_and_extract "https://www.gnupg.org/ftp/gcrypt/gnutls/v3.8/gnutls-$GNUTLS_VERSION.tar.xz")
    cd "$dirname"
    PKG_CONFIG_PATH="$INSTALL_DIR/lib/pkgconfig" \
    ./configure --prefix="$INSTALL_DIR" --with-included-libtasn1 --with-included-unistring --without-p11-kit
    make -j$(sysctl -n hw.ncpu)
    make install
    cd "$TEMP_DIR"
fi

# Build OpenConnect
echo ""
echo "正在编译 OpenConnect…"
dirname=$(download_and_extract "https://www.infradead.org/openconnect/download/openconnect-$OPENCONNECT_VERSION.tar.gz")
cd "$dirname"

PKG_CONFIG_PATH="$INSTALL_DIR/lib/pkgconfig" \
CFLAGS="-I$INSTALL_DIR/include" \
LDFLAGS="-L$INSTALL_DIR/lib" \
./configure --prefix="$INSTALL_DIR" --with-gnutls --without-openssl

make -j$(sysctl -n hw.ncpu)
make install

# Download vpnc-script
echo ""
echo "📥 正在下载 vpnc-script…"
curl -L "https://gitlab.com/openconnect/vpnc-scripts/-/raw/master/vpnc-script" -o "$INSTALL_DIR/bin/vpnc-script"
chmod +x "$INSTALL_DIR/bin/vpnc-script"

# Clean up
echo ""
echo "🧹 正在清理临时文件…"
rm -rf "$TEMP_DIR"

# Update PATH instructions
echo ""
echo "=========================================="
echo "✅ 安装完成！"
echo "=========================================="
echo ""
echo "OpenConnect 已安装到："
echo "  $BIN_DIR/openconnect"
echo ""
echo "如需使用，请将下面这行加入你的 shell 配置："
echo "  export PATH=\"$BIN_DIR:\$PATH\""
echo ""
echo "或创建软链接（需要 sudo）："
echo "  sudo ln -s $BIN_DIR/openconnect /usr/local/bin/openconnect"
echo "  sudo ln -s $INSTALL_DIR/bin/vpnc-script /usr/local/bin/vpnc-script"
echo ""
echo "重启 OpenConnect VPN GUI 应用即可使用已安装的程序。"
echo ""
