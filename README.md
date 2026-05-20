# Music Lyrics GNOME Extension

Music Lyrics is a GNOME Shell extension that shows the current lyric line in the top panel for desktop music players. It is built around MPRIS, so it can follow player state from supported desktop apps, switch between players, and fall back to track information when lyrics are unavailable.

The extension currently focuses on Spotify, YesPlayMusic, and LX Music. LX Music is supported through both its MPRIS interface and its local Open API on `127.0.0.1:23330`, which can provide the current lyric line directly.

## Features

- Shows real-time lyric text in the GNOME top panel
- Supports Spotify, YesPlayMusic, and LX Music
- Uses player priority rules when multiple players are running or playing
- Provides separate menu actions for opening Spotify, YesPlayMusic, and LX Music
- Marks running players differently from unopened players in the panel menu
- Supports English and Chinese UI text in preferences and panel menu
- Uses LX Music Open API for direct lyric line updates when available
- Falls back through LRCLIB and NetEase lyric sources
- Supports configurable panel position, text length, and font size

## Player Selection

The extension uses this selection rule for lyrics:

1. If only one supported player is playing, use that player.
2. If multiple supported players are playing, use the configured priority order.
3. If no supported player is playing but some are running, use the configured priority order.
4. If no supported player is running, the menu can still launch the configured apps.

The panel menu has separate entries for each supported player. Each entry opens or focuses its own app. Running players are shown with normal highlighted menu text, while unopened players are shown in gray.

## Lyrics Sources

Lyrics are resolved in this order depending on the player:

- **LX Music**: tries `http://127.0.0.1:23330/status` first, then falls back to LRCLIB and NetEase.
- **YesPlayMusic**: tries the local YesPlayMusic lyric API when a NetEase track ID is available, then falls back to NetEase.
- **Spotify**: uses LRCLIB by default, optionally refines track matching with Spotify API credentials, then falls back to NetEase.

Spotify API credentials are not bundled. If you want the Spotify search refinement, enter your own Client ID and Client Secret in the extension preferences.

## Preferences

Open preferences with:

```bash
gnome-extensions prefs spotify-lyrics@gnome-shell-extension
```

Available settings:

- Language: English or Chinese
- Panel position: left, center, or right
- Max text length
- Font size
- Player priority order
- Optional Spotify API Client ID and Client Secret

## Requirements

- GNOME Shell 45 or 46
- A supported player: Spotify, YesPlayMusic, or LX Music
- DBus/MPRIS support
- Internet access for LRCLIB and NetEase fallback lyrics
- Optional: LX Music Open API enabled for direct LX Music lyric lines

## Installation

User installation:

```bash
mkdir -p ~/.local/share/gnome-shell/extensions/spotify-lyrics@gnome-shell-extension
cp -r * ~/.local/share/gnome-shell/extensions/spotify-lyrics@gnome-shell-extension/
gnome-extensions enable spotify-lyrics@gnome-shell-extension
```

System-wide installation:

```bash
sudo mkdir -p /usr/share/gnome-shell/extensions/spotify-lyrics@gnome-shell-extension
sudo cp -r * /usr/share/gnome-shell/extensions/spotify-lyrics@gnome-shell-extension/
gnome-extensions enable spotify-lyrics@gnome-shell-extension
```

After installation, restart GNOME Shell on X11 with `Alt+F2`, then `r`, then Enter. On Wayland, log out and log back in.

## Development

Useful commands:

```bash
# Validate JavaScript syntax
node --check extension.js
node --check prefs.js

# Compile GSettings schema
glib-compile-schemas schemas

# Reload extension
gnome-extensions disable spotify-lyrics@gnome-shell-extension
gnome-extensions enable spotify-lyrics@gnome-shell-extension

# Watch GNOME Shell logs
journalctl -f -o cat /usr/bin/gnome-shell
```

## Troubleshooting

Check available MPRIS players:

```bash
dbus-send --session --dest=org.freedesktop.DBus --type=method_call --print-reply /org/freedesktop/DBus org.freedesktop.DBus.ListNames | grep mpris
```

Check player status:

```bash
dbus-send --session --print-reply --dest=org.mpris.MediaPlayer2.yesplaymusic /org/mpris/MediaPlayer2 org.freedesktop.DBus.Properties.Get string:org.mpris.MediaPlayer2.Player string:PlaybackStatus
```

Check LX Music Open API:

```bash
curl http://127.0.0.1:23330/status
```

If LX Music lyrics do not appear, make sure LX Music's Open API is enabled. If the API is unavailable, the extension will try online lyric sources instead.

---

# Music Lyrics GNOME 扩展

Music Lyrics 是一个 GNOME Shell 扩展，用来在顶部面板显示当前播放歌曲的歌词行。扩展基于 MPRIS 监听播放器状态，可以在多个播放器之间切换；没有歌词时会回退显示歌曲和歌手信息。

当前主要支持 Spotify、YesPlayMusic 和洛雪音乐。洛雪音乐同时支持 MPRIS 和本地开放 API `127.0.0.1:23330`，开启开放 API 后可以直接从洛雪获取当前歌词行。

## 功能

- 在 GNOME 顶部面板实时显示歌词
- 支持 Spotify、YesPlayMusic 和洛雪音乐
- 多个播放器同时运行或播放时，按用户配置的优先级选择
- 面板菜单中提供 Spotify、YesPlayMusic、洛雪音乐三个独立打开入口
- 菜单中已运行播放器和未打开播放器会用不同文字状态区分
- 设置页和面板菜单支持英文/中文
- 洛雪音乐可通过开放 API 直接更新当前歌词行
- 支持 LRCLIB 和网易歌词兜底
- 支持配置面板位置、最大文本长度和字体大小

## 播放器选择规则

歌词显示按以下规则选择播放器：

1. 只有一个支持的播放器正在播放时，使用这个播放器。
2. 多个支持的播放器正在播放时，按设置中的播放器优先级选择。
3. 没有播放器正在播放，但有播放器运行时，按设置中的播放器优先级选择。
4. 没有播放器运行时，菜单里的播放器入口仍然可以启动对应应用。

面板菜单中每个播放器都有独立入口，点击后只会打开或聚焦对应应用。已运行的播放器显示为正常高亮文字，未打开的播放器显示为灰色。

## 歌词来源

不同播放器的歌词获取顺序如下：

- **洛雪音乐**：优先读取 `http://127.0.0.1:23330/status`，失败后回退到 LRCLIB 和网易歌词。
- **YesPlayMusic**：如果能从 MPRIS 元数据中拿到网易歌曲 ID，优先读取本地歌词接口，失败后回退到网易歌词。
- **Spotify**：默认使用 LRCLIB；如果用户配置了 Spotify API 凭据，会先用 Spotify API 优化歌曲匹配，然后再回退到网易歌词。

扩展不会内置 Spotify API 凭据。如果需要 Spotify 精准匹配，请在扩展设置中填写自己的 Client ID 和 Client Secret。

## 设置项

打开设置：

```bash
gnome-extensions prefs spotify-lyrics@gnome-shell-extension
```

可配置项：

- 语言：英文或中文
- 面板位置：左侧、居中、右侧
- 最大文本长度
- 字体大小
- 播放器优先级
- 可选 Spotify API Client ID 和 Client Secret

## 运行要求

- GNOME Shell 45 或 46
- Spotify、YesPlayMusic 或洛雪音乐
- DBus/MPRIS 支持
- 联网访问 LRCLIB 和网易歌词兜底源
- 可选：开启洛雪音乐开放 API，用于直接获取洛雪歌词行

## 安装

用户安装：

```bash
mkdir -p ~/.local/share/gnome-shell/extensions/spotify-lyrics@gnome-shell-extension
cp -r * ~/.local/share/gnome-shell/extensions/spotify-lyrics@gnome-shell-extension/
gnome-extensions enable spotify-lyrics@gnome-shell-extension
```

系统级安装：

```bash
sudo mkdir -p /usr/share/gnome-shell/extensions/spotify-lyrics@gnome-shell-extension
sudo cp -r * /usr/share/gnome-shell/extensions/spotify-lyrics@gnome-shell-extension/
gnome-extensions enable spotify-lyrics@gnome-shell-extension
```

安装后需要重载 GNOME Shell。X11 下可按 `Alt+F2`，输入 `r` 后回车；Wayland 下需要注销后重新登录。

## 开发

常用命令：

```bash
# 检查 JavaScript 语法
node --check extension.js
node --check prefs.js

# 编译 GSettings schema
glib-compile-schemas schemas

# 重载扩展
gnome-extensions disable spotify-lyrics@gnome-shell-extension
gnome-extensions enable spotify-lyrics@gnome-shell-extension

# 查看 GNOME Shell 日志
journalctl -f -o cat /usr/bin/gnome-shell
```

## 排错

查看当前 MPRIS 播放器：

```bash
dbus-send --session --dest=org.freedesktop.DBus --type=method_call --print-reply /org/freedesktop/DBus org.freedesktop.DBus.ListNames | grep mpris
```

查看播放器播放状态：

```bash
dbus-send --session --print-reply --dest=org.mpris.MediaPlayer2.yesplaymusic /org/mpris/MediaPlayer2 org.freedesktop.DBus.Properties.Get string:org.mpris.MediaPlayer2.Player string:PlaybackStatus
```

检查洛雪音乐开放 API：

```bash
curl http://127.0.0.1:23330/status
```

如果洛雪音乐不显示歌词，先确认洛雪音乐的开放 API 已开启。如果开放 API 不可用，扩展会自动尝试在线歌词源。
