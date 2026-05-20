import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

const MPRIS_PLAYER_PATH = '/org/mpris/MediaPlayer2';
const MPRIS_PLAYER_INTERFACE = 'org.mpris.MediaPlayer2.Player';

// Lyrics API configuration
const LYRICS_API_URL = 'https://lrclib.net/api/get';
const NETEASE_SEARCH_URL = 'https://music.163.com/api/search/get';
const NETEASE_LYRIC_URL = 'https://music.163.com/api/song/lyric';
const SPOTIFY_SEARCH_URL = 'https://api.spotify.com/v1/search';
const YESPLAYMUSIC_LYRIC_URL = 'http://127.0.0.1:10754/lyric';
const LX_MUSIC_STATUS_URL = 'http://127.0.0.1:23330/status';

// Player launch mapping
const PLAYER_LAUNCH_MAP = {
    'spotify': 'spotify.desktop',
    'yesplaymusic': 'yesplaymusic.desktop',
    'lx-music-desktop': 'lx-music-desktop.desktop',
};

const DEFAULT_PLAYER_PRIORITY_ORDER = ['spotify', 'yesplaymusic', 'lx-music-desktop'];
const PLAYER_ACTION_ORDER = ['spotify', 'yesplaymusic', 'lx-music-desktop'];

const PLAYER_CONFIGS = {
    'spotify': {
        name: 'Spotify',
        busName: 'org.mpris.MediaPlayer2.spotify',
    },
    'lx-music-desktop': {
        name: 'LX Music',
        busNamePrefix: 'org.mpris.MediaPlayer2.chromium.instance',
        identity: 'lx-music-desktop',
    },
    'yesplaymusic': {
        name: 'YesPlayMusic',
        busName: 'org.mpris.MediaPlayer2.yesplaymusic',
    },
};

const TRANSLATIONS = {
    en: {
        noPlayerConnected: 'No player connected',
        openPlayer: playerName => `Open ${playerName}`,
        refreshPlayer: 'Refresh Player',
        settings: 'Settings',
        about: 'About',
        viewOnGitHub: 'View on GitHub',
        credits: 'Created by deosaju',
        playingFrom: playerName => `Playing from ${playerName}`,
        unknownPlayer: 'Unknown Player',
        unknownTrack: 'Unknown track',
        unknownTrackTitle: 'Unknown Track',
        unknownArtist: 'Unknown Artist',
        unknownAlbum: 'Unknown Album',
    },
    zh: {
        noPlayerConnected: '未连接播放器',
        openPlayer: playerName => `打开${playerName}`,
        refreshPlayer: '刷新播放器',
        settings: '设置',
        about: '关于',
        viewOnGitHub: '在 GitHub 查看',
        credits: '由 deosaju 创建',
        playingFrom: playerName => `正在播放：${playerName}`,
        unknownPlayer: '未知播放器',
        unknownTrack: '未知歌曲',
        unknownTrackTitle: '未知歌曲',
        unknownArtist: '未知艺术家',
        unknownAlbum: '未知专辑',
    },
};

// Helper function to check if a bus name is a supported music player
function isSupportedPlayer(busName) {
    return getPlayerConfig(busName) !== null;
}

// Extract short player name from bus name
function getPlayerKey(busName) {
    const config = getPlayerConfig(busName);
    if (config) {
        return config.key;
    }

    const match = busName.match(/^org\.mpris\.MediaPlayer2\.(\w+)/);
    return match ? match[1] : null;
}

function getPlayerConfig(busName) {
    for (const [key, config] of Object.entries(PLAYER_CONFIGS)) {
        if (config.busName && busName === config.busName) {
            return { key, ...config };
        }

        if (config.busNamePrefix && busName.startsWith(config.busNamePrefix)) {
            if (!config.identity || getPlayerIdentity(busName) === config.identity) {
                return { key, ...config };
            }
        }
    }

    return null;
}

function getPlayerIdentity(busName) {
    try {
        const proxy = Gio.DBusProxy.new_for_bus_sync(
            Gio.BusType.SESSION,
            Gio.DBusProxyFlags.NONE,
            null,
            busName,
            MPRIS_PLAYER_PATH,
            'org.freedesktop.DBus.Properties',
            null
        );

        const reply = proxy.call_sync(
            'Get',
            new GLib.Variant('(ss)', ['org.mpris.MediaPlayer2', 'Identity']),
            Gio.DBusCallFlags.NONE,
            -1,
            null
        );

        return reply.get_child_value(0).get_variant().unpack();
    } catch (e) {
        return null;
    }
}

function getLanguage(settings) {
    const language = settings.get_string('language');
    return TRANSLATIONS[language] ? language : 'en';
}

function t(settings, key, ...args) {
    const value = TRANSLATIONS[getLanguage(settings)][key] || TRANSLATIONS.en[key] || key;
    return typeof value === 'function' ? value(...args) : value;
}

function getPlayerDisplayName(settings, playerKey) {
    if (getLanguage(settings) === 'zh' && playerKey === 'lx-music-desktop') {
        return '洛雪音乐';
    }

    return PLAYER_CONFIGS[playerKey]?.name || playerKey;
}

const MusicLyricsIndicator = GObject.registerClass(
    class MusicLyricsIndicator extends PanelMenu.Button {
        _init(settings) {
            super._init(0.5, 'Music Lyrics Indicator');

            this._settings = settings;

            // Spotify token cache
            this._spotifyAccessToken = null;
            this._spotifyTokenExpiry = 0;

            // Create a box to hold label, icon, and info icon
            const box = new St.BoxLayout({
                style_class: 'panel-status-menu-box'
            });

            this._label = new St.Label({
                text: '',
                y_align: Clutter.ActorAlign.CENTER,
                style_class: 'spotify-lyrics-label'
            });

            // Enable text clipping with ellipsis
            this._label.clutter_text.ellipsize = 3; // PANGO_ELLIPSIZE_END

            // Music icon for when nothing is playing
            this._musicIcon = new St.Icon({
                icon_name: 'audio-x-generic-symbolic',
                style_class: 'system-status-icon',
                icon_size: 17,
                y_align: Clutter.ActorAlign.CENTER
            });

            box.add_child(this._musicIcon);
            box.add_child(this._label);
            this.add_child(box);

            this._currentTrack = null;
            this._currentLyrics = null;
            this._currentLine = '';
            this._proxy = null;
            this._propertiesChangedId = null;
            this._lyricsTimeoutId = null;
            this._lxMusicApiTimeoutId = null;
            this._currentBusName = null;
            this._busWatchIds = null;
            this._isPlaying = false;


            // Apply initial font size
            this._applyFontSize();

            // Connect setting signals
            this._settingsSignalIds = [];
            this._settingsSignalIds.push(
                this._settings.connect('changed::max-text-length', () => {
                    this._updateLabelText();
                })
            );
            this._settingsSignalIds.push(
                this._settings.connect('changed::font-size', () => {
                    this._applyFontSize();
                })
            );
            this._settingsSignalIds.push(
                this._settings.connect('changed::player-priority-order', () => {
                    this._findActivePlayer();
                })
            );
            this._settingsSignalIds.push(
                this._settings.connect('changed::language', () => {
                    this._updateMenuLanguage();
                    this._updatePlayerInfo();
                    this._updatePlayerActionItems();
                })
            );

            // Start with music icon visible, label hidden
            this._showMusicIcon();
            this._buildMenu();
            this._updatePlayerActionItems();
            this._setupDBusMonitoring();
        }

        _applyFontSize() {
            const fontSize = this._settings.get_int('font-size');
            this._label.style = `font-size: ${fontSize}px;`;
        }

        _showMusicIcon() {
            this._musicIcon.show();
            this._label.hide();
            this._isPlaying = false;
        }

        _showLabel() {
            this._musicIcon.hide();
            this._label.show();
            this._isPlaying = true;
        }

        _buildMenu() {
            // Player info section
            this._playerInfoItem = new PopupMenu.PopupMenuItem(t(this._settings, 'noPlayerConnected'), {
                reactive: false
            });
            this._playerInfoItem.label.style = 'font-size: 0.85em; color: #888;';
            this.menu.addMenuItem(this._playerInfoItem);

            // Track info section
            this._trackInfoItem = new PopupMenu.PopupMenuItem(t(this._settings, 'unknownTrack'), {
                reactive: false
            });
            this._trackInfoItem.label.style = 'font-size: 0.9em;';
            this.menu.addMenuItem(this._trackInfoItem);

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            this._playerActionItems = {};
            for (const playerKey of PLAYER_ACTION_ORDER) {
                const item = new PopupMenu.PopupMenuItem(getPlayerDisplayName(this._settings, playerKey));
                item.connect('activate', () => {
                    this._openPlayerByKey(playerKey);
                });
                this._playerActionItems[playerKey] = item;
                this.menu.addMenuItem(item);
            }

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            // Refresh button
            this._refreshItem = new PopupMenu.PopupMenuItem(t(this._settings, 'refreshPlayer'));
            this._refreshItem.connect('activate', () => {
                this._findActivePlayer();
            });
            this.menu.addMenuItem(this._refreshItem);

            // Settings button
            this._settingsItem = new PopupMenu.PopupMenuItem(t(this._settings, 'settings'));
            this._settingsItem.connect('activate', () => {
                try {
                    const proc = Gio.Subprocess.new(
                        ['gnome-extensions', 'prefs', 'spotify-lyrics@gnome-shell-extension'],
                        Gio.SubprocessFlags.NONE
                    );
                } catch (e) {
                    logError(e, 'Failed to open extension settings');
                }
            });
            this.menu.addMenuItem(this._settingsItem);

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            // Info submenu
            this._infoSubmenu = new PopupMenu.PopupSubMenuMenuItem(t(this._settings, 'about'));

            // GitHub link
            this._githubItem = new PopupMenu.PopupMenuItem(t(this._settings, 'viewOnGitHub'));
            this._githubItem.connect('activate', () => {
                Gio.AppInfo.launch_default_for_uri(
                    'https://github.com/d3osaju/Spotline',
                    null
                );
            });
            this._infoSubmenu.menu.addMenuItem(this._githubItem);

            // Credits
            this._creditsItem = new PopupMenu.PopupMenuItem(t(this._settings, 'credits'), {
                reactive: false
            });
            this._creditsItem.label.style = 'font-size: 0.9em; color: #888;';
            this._infoSubmenu.menu.addMenuItem(this._creditsItem);

            this.menu.addMenuItem(this._infoSubmenu);
        }

        _updateMenuLanguage() {
            if (this._currentTrack) {
                this._trackInfoItem.label.text = `${this._currentTrack.artist} - ${this._currentTrack.title}`;
            } else if (this._trackInfoItem) {
                this._trackInfoItem.label.text = t(this._settings, 'unknownTrack');
            }
            if (this._refreshItem) {
                this._refreshItem.label.text = t(this._settings, 'refreshPlayer');
            }
            if (this._settingsItem) {
                this._settingsItem.label.text = t(this._settings, 'settings');
            }
            if (this._infoSubmenu) {
                this._infoSubmenu.label.text = t(this._settings, 'about');
            }
            if (this._githubItem) {
                this._githubItem.label.text = t(this._settings, 'viewOnGitHub');
            }
            if (this._creditsItem) {
                this._creditsItem.label.text = t(this._settings, 'credits');
            }
        }

        _openPlayerByKey(playerKey) {
            const desktopId = PLAYER_LAUNCH_MAP[playerKey] || PLAYER_LAUNCH_MAP.spotify;

            // Use Shell.AppSystem to activate the app window (or launch if not running)
            try {
                const appSystem = Shell.AppSystem.get_default();
                const app = appSystem.lookup_app(desktopId);
                if (app) {
                    app.activate();
                    return;
                }
            } catch (e) {
                // Fall through to desktop file launch
            }

            // Fallback: launch via desktop file
            try {
                const appInfo = Gio.DesktopAppInfo.new(desktopId);
                if (appInfo) {
                    appInfo.launch([], null);
                }
            } catch (e) {
                logError(e, `Failed to launch ${desktopId}`);
            }
        }

        _updatePlayerActionItems() {
            if (!this._playerActionItems) {
                return;
            }

            const runningPlayerKeys = this._getRunningPlayerKeys();
            for (const playerKey of PLAYER_ACTION_ORDER) {
                const item = this._playerActionItems[playerKey];
                if (!item) {
                    continue;
                }

                const isRunning = runningPlayerKeys.has(playerKey);
                item.label.text = getPlayerDisplayName(this._settings, playerKey);
                item.label.style = isRunning ?
                    'font-weight: 600;' :
                    'color: #8a8a8a;';
            }
        }

        _getRunningPlayerKeys() {
            try {
                const supportedPlayers = this._getSupportedPlayersFromNames(this._listDBusNamesSync());
                return new Set(supportedPlayers.map(busName => getPlayerKey(busName)).filter(Boolean));
            } catch (e) {
                return new Set();
            }
        }

        _getPlayerPriorityOrder() {
            let configuredOrder = [];

            try {
                configuredOrder = this._settings.get_string('player-priority-order')
                    .split(',')
                    .map(key => key.trim())
                    .filter(key => PLAYER_CONFIGS[key]);
            } catch (e) {
                configuredOrder = [];
            }

            const seen = new Set(configuredOrder);
            for (const key of DEFAULT_PLAYER_PRIORITY_ORDER) {
                if (!seen.has(key)) {
                    configuredOrder.push(key);
                    seen.add(key);
                }
            }

            return configuredOrder;
        }

        _getPlayerPriorityIndex(busName) {
            const playerKey = getPlayerKey(busName);
            const order = this._getPlayerPriorityOrder();
            const index = order.indexOf(playerKey);
            return index === -1 ? 99 : index;
        }

        _sortPlayersByPriority(busNames) {
            return busNames.sort((a, b) => {
                const priorityDiff = this._getPlayerPriorityIndex(a) - this._getPlayerPriorityIndex(b);
                if (priorityDiff !== 0) {
                    return priorityDiff;
                }

                return a.localeCompare(b);
            });
        }

        _listDBusNamesSync() {
            const dbusProxy = Gio.DBusProxy.new_for_bus_sync(
                Gio.BusType.SESSION,
                Gio.DBusProxyFlags.NONE,
                null,
                'org.freedesktop.DBus',
                '/org/freedesktop/DBus',
                'org.freedesktop.DBus',
                null
            );

            const reply = dbusProxy.call_sync(
                'ListNames',
                null,
                Gio.DBusCallFlags.NONE,
                -1,
                null
            );

            return reply.get_child_value(0).deep_unpack();
        }

        _getSupportedPlayersFromNames(names) {
            return this._sortPlayersByPriority(names.filter(n => isSupportedPlayer(n)));
        }

        _getPreferredPlayerBusName(supportedPlayers) {
            const playingPlayers = supportedPlayers.filter(n => this._isPlayerPlaying(n));
            if (playingPlayers.length > 0) {
                return playingPlayers[0];
            }

            return supportedPlayers.length > 0 ? supportedPlayers[0] : null;
        }

        _isPlayerPlaying(busName) {
            try {
                const playerProxy = Gio.DBusProxy.new_for_bus_sync(
                    Gio.BusType.SESSION,
                    Gio.DBusProxyFlags.NONE,
                    null,
                    busName,
                    MPRIS_PLAYER_PATH,
                    MPRIS_PLAYER_INTERFACE,
                    null
                );

                const playbackStatus = playerProxy.get_cached_property('PlaybackStatus');
                return playbackStatus?.unpack() === 'Playing';
            } catch (e) {
                return false;
            }
        }

        _getPreferredPlayerBusNameFromDBus() {
            try {
                const supportedPlayers = this._getSupportedPlayersFromNames(this._listDBusNamesSync());
                return this._getPreferredPlayerBusName(supportedPlayers);
            } catch (e) {
                logError(e, 'Failed to find preferred player');
                return null;
            }
        }

        _setupDBusMonitoring() {
            // Watch for specific supported players appearing/disappearing on the bus
            this._busWatchIds = [];

            // Watch Spotify
            this._busWatchIds.push(Gio.bus_watch_name(
                Gio.BusType.SESSION,
                'org.mpris.MediaPlayer2.spotify',
                Gio.BusNameWatcherFlags.NONE,
                () => this._findActivePlayer(),
                () => this._onPlayerVanished()
            ));

            // Watch YesPlayMusic
            this._busWatchIds.push(Gio.bus_watch_name(
                Gio.BusType.SESSION,
                'org.mpris.MediaPlayer2.yesplaymusic',
                Gio.BusNameWatcherFlags.NONE,
                () => this._findActivePlayer(),
                () => this._onPlayerVanished()
            ));

            // Electron/Chromium-based players like LX Music expose dynamic bus
            // names, so listen for all MPRIS name changes and rescan.
            this._nameOwnerChangedId = Gio.DBus.session.signal_subscribe(
                'org.freedesktop.DBus',
                'org.freedesktop.DBus',
                'NameOwnerChanged',
                '/org/freedesktop/DBus',
                null,
                Gio.DBusSignalFlags.NONE,
                (connection, senderName, objectPath, interfaceName, signalName, parameters) => {
                    const [name] = parameters.deep_unpack();
                    if (name.startsWith('org.mpris.MediaPlayer2.')) {
                        this._findActivePlayer();
                    }
                }
            );

            this._mprisPropertiesChangedId = Gio.DBus.session.signal_subscribe(
                null,
                'org.freedesktop.DBus.Properties',
                'PropertiesChanged',
                MPRIS_PLAYER_PATH,
                MPRIS_PLAYER_INTERFACE,
                Gio.DBusSignalFlags.NONE,
                (connection, senderName, objectPath, interfaceName, signalName, parameters) => {
                    const [changedInterface, changedProperties] = parameters.deep_unpack();
                    if (changedInterface !== MPRIS_PLAYER_INTERFACE) {
                        return;
                    }

                    if (changedProperties.PlaybackStatus || changedProperties.Metadata) {
                        this._findActivePlayer();
                    }
                }
            );

            this._findActivePlayer();
        }

        _onPlayerVanished() {
            // A player disappeared, try to find another active one
            this._currentTrack = null;
            this._currentLyrics = null;
            this._currentLine = '';
            if (this._lyricsTimeoutId) {
                GLib.source_remove(this._lyricsTimeoutId);
                this._lyricsTimeoutId = null;
            }
            if (this._lxMusicApiTimeoutId) {
                GLib.source_remove(this._lxMusicApiTimeoutId);
                this._lxMusicApiTimeoutId = null;
            }
            this._findActivePlayer();
        }

        _findActivePlayer() {
            try {
                const dbusProxy = Gio.DBusProxy.new_for_bus_sync(
                    Gio.BusType.SESSION,
                    Gio.DBusProxyFlags.NONE,
                    null,
                    'org.freedesktop.DBus',
                    '/org/freedesktop/DBus',
                    'org.freedesktop.DBus',
                    null
                );

                dbusProxy.call(
                    'ListNames',
                    null,
                    Gio.DBusCallFlags.NONE,
                    -1,
                    null,
                    (proxy, result) => {
                        try {
                            const reply = proxy.call_finish(result);
                            const names = reply.get_child_value(0).deep_unpack();

                            const supportedPlayers = this._getSupportedPlayersFromNames(names);
                            const foundPlayer = this._getPreferredPlayerBusName(supportedPlayers);

                            if (foundPlayer) {
                                this._tryConnectToPlayer(foundPlayer);
                            } else {
                                this._currentBusName = null;
                                this._proxy = null;
                                this._playerProxy = null;
                                this._showMusicIcon();
                                this._playerInfoItem.label.text = t(this._settings, 'noPlayerConnected');
                                this._trackInfoItem.label.text = t(this._settings, 'unknownTrack');
                                this._updatePlayerActionItems();
                            }
                        } catch (e) {
                            logError(e, 'Failed to list DBus names');
                            this._showMusicIcon();
                        }
                    }
                );
            } catch (e) {
                logError(e, 'Failed to query DBus');
                this._showMusicIcon();
            }
        }

        _tryConnectToPlayer(busName) {
            try {
                // Create proxy for properties interface
                const proxy = Gio.DBusProxy.new_for_bus_sync(
                    Gio.BusType.SESSION,
                    Gio.DBusProxyFlags.NONE,
                    null,
                    busName,
                    MPRIS_PLAYER_PATH,
                    'org.freedesktop.DBus.Properties',
                    null
                );

                // Create proxy for player interface to monitor changes
                const playerProxy = Gio.DBusProxy.new_for_bus_sync(
                    Gio.BusType.SESSION,
                    Gio.DBusProxyFlags.NONE,
                    null,
                    busName,
                    MPRIS_PLAYER_PATH,
                    MPRIS_PLAYER_INTERFACE,
                    null
                );

                // Disconnect previous player if any
                if (this._propertiesChangedId && this._playerProxy) {
                    this._playerProxy.disconnect(this._propertiesChangedId);
                }

                this._proxy = proxy;
                this._playerProxy = playerProxy;
                this._currentBusName = busName;

                this._propertiesChangedId = this._playerProxy.connect(
                    'g-properties-changed',
                    this._onPropertiesChanged.bind(this)
                );

                this._updatePlayerInfo();
                this._updateTrackInfo();
                this._updatePlayerActionItems();
                return true;
            } catch (e) {
                return false;
            }
        }

        _updatePlayerInfo() {
            if (!this._currentBusName) {
                this._playerInfoItem.label.text = t(this._settings, 'noPlayerConnected');
                return;
            }

            let playerName = getPlayerConfig(this._currentBusName)?.name || t(this._settings, 'unknownPlayer');
            let playerIcon = '♪';

            if (this._currentBusName.includes('spotify')) {
                playerIcon = '🎵';
            } else if (this._currentBusName.includes('chromium')) {
                playerIcon = '🎵';
            } else if (this._currentBusName.includes('yesplaymusic')) {
                playerIcon = '🎵';
            }

            this._playerInfoItem.label.text = `${playerIcon} ${t(this._settings, 'playingFrom', playerName)}`;
        }

        _onPropertiesChanged() {
            this._updateTrackInfo();
        }

        _updateTrackInfo() {
            if (!this._playerProxy) {
                return;
            }

            try {
                const metadata = this._playerProxy.get_cached_property('Metadata');
                if (!metadata) {
                    this._showMusicIcon();
                    this._trackInfoItem.label.text = t(this._settings, 'unknownTrack');
                    return;
                }

                const metadataDict = metadata.deep_unpack();
                const title = metadataDict['xesam:title']?.unpack() || null;
                const artist = metadataDict['xesam:artist']?.deep_unpack()[0] || null;
                const album = metadataDict['xesam:album']?.unpack() || null;
                const trackUrl = metadataDict['xesam:url']?.unpack() || null;
                // mpris:length is in microseconds
                const lengthUs = metadataDict['mpris:length']?.unpack() || 0;
                this._trackDurationSec = lengthUs / 1000000;

                // Extract Netease song ID from YesPlayMusic's xesam:url (e.g. "/trackid/1902252436")
                this._neteaseTrackId = null;
                if (trackUrl) {
                    const idMatch = trackUrl.match(/\/trackid\/(\d+)/);
                    if (idMatch) {
                        this._neteaseTrackId = idMatch[1];
                    }
                }

                // If both title and artist are missing, show icon
                if (!title && !artist) {
                    this._showMusicIcon();
                    this._trackInfoItem.label.text = t(this._settings, 'unknownTrack');
                    return;
                }

                // We have track info — show the label
                this._showLabel();

                const newTitle = title || t(this._settings, 'unknownTrackTitle');
                const newArtist = artist || t(this._settings, 'unknownArtist');
                const newAlbum = album || t(this._settings, 'unknownAlbum');

                // Check if the track actually changed
                const trackChanged = !this._currentTrack ||
                    this._currentTrack.title !== newTitle ||
                    this._currentTrack.artist !== newArtist;

                this._currentTrack = {
                    title: newTitle,
                    artist: newArtist,
                    album: newAlbum
                };

                // Update menu with track info
                this._trackInfoItem.label.text = `${this._currentTrack.artist} - ${this._currentTrack.title}`;

                // Fetch when the track changed, or retry if a previous fetch left us without lyrics.
                if (trackChanged || !this._currentLyrics || this._currentLyrics.length === 0) {
                    this._fetchLyrics(this._currentTrack.title, this._currentTrack.artist);
                }
            } catch (e) {
                logError(e, 'Failed to get track info');
            }
        }

        // --- Multi-source lyrics fetching with chain fallback ---

        _fetchLyrics(title, artist) {
            // Clear any existing lyrics timeout
            if (this._lyricsTimeoutId) {
                GLib.source_remove(this._lyricsTimeoutId);
                this._lyricsTimeoutId = null;
            }
            if (this._lxMusicApiTimeoutId) {
                GLib.source_remove(this._lxMusicApiTimeoutId);
                this._lxMusicApiTimeoutId = null;
            }

            const isSpotify = this._currentBusName && this._currentBusName.includes('spotify');
            const isYesPlayMusic = this._currentBusName && this._currentBusName.includes('yesplaymusic');
            const isLXMusic = getPlayerKey(this._currentBusName || '') === 'lx-music-desktop';
            const clientId = this._settings.get_string('spotify-client-id');
            const clientSecret = this._settings.get_string('spotify-client-secret');
            const hasSpotifyCredentials = clientId && clientSecret;

            const neteaseFallback = (t, a) => {
                this._fetchNeteaseLyrics(t, a, (success) => {
                    if (!success) {
                        this._updateLabelText(`${a} - ${t}`);
                    }
                });
            };

            const fetchGenericLyrics = () => {
                this._fetchLRCLIB(title, artist, (success) => {
                    if (!success) {
                        neteaseFallback(title, artist);
                    }
                });
            };

            if (isLXMusic) {
                this._startLXMusicOpenApiDisplay(title, artist, (success) => {
                    if (!success) {
                        fetchGenericLyrics();
                    }
                });
            } else if (isYesPlayMusic && this._neteaseTrackId) {
                // YesPlayMusic: local API (with track ID) -> Netease search -> fallback
                this._fetchYesPlayMusicLyrics(this._neteaseTrackId, (success) => {
                    if (!success) {
                        neteaseFallback(title, artist);
                    }
                });
            } else if (isSpotify && hasSpotifyCredentials) {
                // Spotify + credentials: auto-fetch token, then use Spotify API to refine track info
                this._ensureSpotifyToken(clientId, clientSecret, (token) => {
                    if (token) {
                        this._fetchSpotifyTrackInfo(title, artist, token, (refinedTitle, refinedArtist) => {
                            const t = refinedTitle || title;
                            const a = refinedArtist || artist;
                            this._fetchLRCLIB(t, a, (success) => {
                                if (!success) {
                                    // If refined name failed, retry LRCLIB with original name
                                    if (refinedTitle && (refinedTitle !== title || refinedArtist !== artist)) {
                                        this._fetchLRCLIB(title, artist, (success2) => {
                                            if (!success2) {
                                                neteaseFallback(title, artist);
                                            }
                                        });
                                    } else {
                                        neteaseFallback(title, artist);
                                    }
                                }
                            });
                        });
                    } else {
                        // Token fetch failed, fall back to LRCLIB directly
                        this._fetchLRCLIB(title, artist, (success) => {
                            if (!success) {
                                neteaseFallback(title, artist);
                            }
                        });
                    }
                });
            } else if (isSpotify) {
                // Spotify without credentials: LRCLIB -> Netease -> fallback
                fetchGenericLyrics();
            } else {
                // Others: LRCLIB -> Netease -> fallback
                fetchGenericLyrics();
            }
        }

        _startLXMusicOpenApiDisplay(title, artist, callback) {
            this._fetchLXMusicOpenApiStatus((data) => {
                if (!data || data.status !== 'playing' || !data.name) {
                    callback(false);
                    return;
                }

                const displayArtist = data.singer || artist;
                const initialText = data.lyricLineText || `${displayArtist} - ${data.name}`;
                this._currentLyrics = [{ time: 0, text: initialText }];
                this._currentTrack = {
                    title: data.name,
                    artist: displayArtist,
                    album: data.albumName || t(this._settings, 'unknownAlbum')
                };
                this._trackDurationSec = data.duration || this._trackDurationSec || 0;
                this._trackInfoItem.label.text = `${displayArtist} - ${data.name}`;
                this._updateLabelText(initialText);

                this._lxMusicApiTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                    this._fetchLXMusicOpenApiStatus((latestData) => {
                        if (!latestData || latestData.status !== 'playing') {
                            return;
                        }

                        if (latestData.name) {
                            const latestArtist = latestData.singer || displayArtist;
                            this._currentTrack = {
                                title: latestData.name,
                                artist: latestArtist,
                                album: latestData.albumName || this._currentTrack?.album || t(this._settings, 'unknownAlbum')
                            };
                            this._trackDurationSec = latestData.duration || this._trackDurationSec || 0;
                            this._trackInfoItem.label.text = `${latestArtist} - ${latestData.name}`;
                        }

                        if (latestData.lyricLineText) {
                            this._updateLabelText(latestData.lyricLineText);
                        }
                    });

                    return GLib.SOURCE_CONTINUE;
                });

                callback(true);
            });
        }

        _fetchLXMusicOpenApiStatus(callback) {
            try {
                const proc = Gio.Subprocess.new(
                    ['curl', '-sS', '--max-time', '2', LX_MUSIC_STATUS_URL],
                    Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
                );

                proc.communicate_utf8_async(null, null, (proc, result) => {
                    try {
                        const [, stdout] = proc.communicate_utf8_finish(result);
                        if (!stdout) {
                            callback(null);
                            return;
                        }

                        callback(JSON.parse(stdout));
                    } catch (e) {
                        callback(null);
                    }
                });
            } catch (e) {
                callback(null);
            }
        }

        _fetchYesPlayMusicLyrics(trackId, callback) {
            const url = `${YESPLAYMUSIC_LYRIC_URL}?id=${trackId}`;
            const file = Gio.File.new_for_uri(url);

            file.load_contents_async(null, (source, result) => {
                try {
                    const [success, contents] = source.load_contents_finish(result);

                    if (!success) {
                        callback(false);
                        return;
                    }

                    const decoder = new TextDecoder('utf-8');
                    const response = decoder.decode(contents);
                    const data = JSON.parse(response);

                    if (data.lrc && data.lrc.lyric) {
                        this._currentLyrics = this._parseLRC(data.lrc.lyric);
                        if (this._currentLyrics.length > 0) {
                            this._startLyricsDisplay();
                            callback(true);
                            return;
                        }
                    }
                    callback(false);
                } catch (e) {
                    logError(e, 'Failed to fetch lyrics from YesPlayMusic');
                    callback(false);
                }
            });
        }

        _ensureSpotifyToken(clientId, clientSecret, callback) {
            // Check if we have a valid cached token
            const now = Date.now();
            if (this._spotifyAccessToken && this._spotifyTokenExpiry > now) {
                callback(this._spotifyAccessToken);
                return;
            }

            // Fetch a new token using Client Credentials flow
            const encoder = new TextEncoder();
            const credentials = GLib.base64_encode(encoder.encode(`${clientId}:${clientSecret}`));

            try {
                const proc = Gio.Subprocess.new(
                    ['curl', '-s', '-X', 'POST',
                     'https://accounts.spotify.com/api/token',
                     '-H', `Authorization: Basic ${credentials}`,
                     '-H', 'Content-Type: application/x-www-form-urlencoded',
                     '-d', 'grant_type=client_credentials'],
                    Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
                );

                proc.communicate_utf8_async(null, null, (proc, result) => {
                    try {
                        const [, stdout] = proc.communicate_utf8_finish(result);
                        if (stdout) {
                            const data = JSON.parse(stdout);
                            if (data.access_token) {
                                this._spotifyAccessToken = data.access_token;
                                // Token expires_in is in seconds, subtract 60s as safety margin
                                this._spotifyTokenExpiry = now + (data.expires_in - 60) * 1000;
                                callback(this._spotifyAccessToken);
                                return;
                            }
                        }
                        log('Spotline: Failed to obtain Spotify access token');
                        callback(null);
                    } catch (e) {
                        logError(e, 'Failed to parse Spotify token response');
                        callback(null);
                    }
                });
            } catch (e) {
                logError(e, 'Failed to request Spotify token');
                callback(null);
            }
        }

        _fetchSpotifyTrackInfo(title, artist, token, callback) {
            const query = encodeURIComponent(`track:${title} artist:${artist}`);
            const url = `${SPOTIFY_SEARCH_URL}?q=${query}&type=track&limit=1`;

            try {
                const proc = Gio.Subprocess.new(
                    ['curl', '-s', '-H', `Authorization: Bearer ${token}`, url],
                    Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
                );

                proc.communicate_utf8_async(null, null, (proc, result) => {
                    try {
                        const [, stdout] = proc.communicate_utf8_finish(result);
                        if (stdout) {
                            const data = JSON.parse(stdout);
                            if (data.tracks && data.tracks.items && data.tracks.items.length > 0) {
                                const track = data.tracks.items[0];
                                const refinedTitle = track.name;
                                const refinedArtist = track.artists[0]?.name;
                                callback(refinedTitle, refinedArtist);
                                return;
                            }
                        }
                        callback(null, null);
                    } catch (e) {
                        logError(e, 'Failed to parse Spotify search result');
                        callback(null, null);
                    }
                });
            } catch (e) {
                logError(e, 'Failed to call Spotify API');
                callback(null, null);
            }
        }

        _fetchLRCLIB(title, artist, callback) {
            const url = `${LYRICS_API_URL}?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
            const file = Gio.File.new_for_uri(url);

            file.load_contents_async(null, (source, result) => {
                try {
                    const [success, contents] = source.load_contents_finish(result);

                    if (!success) {
                        // Exact match failed, try search API
                        this._fetchLRCLIBSearch(title, artist, callback);
                        return;
                    }

                    const decoder = new TextDecoder('utf-8');
                    const response = decoder.decode(contents);
                    const data = JSON.parse(response);

                    if (data.syncedLyrics) {
                        this._currentLyrics = this._parseLRC(data.syncedLyrics);
                        this._startLyricsDisplay();
                        callback(true);
                    } else {
                        // No synced lyrics from exact match, try search API
                        this._fetchLRCLIBSearch(title, artist, callback);
                    }
                } catch (e) {
                    // Parse error or HTTP error, try search API as fallback
                    this._fetchLRCLIBSearch(title, artist, callback);
                }
            });
        }

        _fetchLRCLIBSearch(title, artist, callback) {
            const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(`${title} ${artist}`)}`;
            const file = Gio.File.new_for_uri(searchUrl);

            file.load_contents_async(null, (source, result) => {
                try {
                    const [success, contents] = source.load_contents_finish(result);

                    if (!success) {
                        callback(false);
                        return;
                    }

                    const decoder = new TextDecoder('utf-8');
                    const response = decoder.decode(contents);
                    const results = JSON.parse(response);

                    if (!Array.isArray(results) || results.length === 0) {
                        callback(false);
                        return;
                    }

                    // Filter results with synced lyrics
                    const syncedResults = results.filter(r => r.syncedLyrics);

                    if (syncedResults.length > 0) {
                        let bestResult = syncedResults[0];

                        // If we have track duration, prefer the result with closest duration
                        if (this._trackDurationSec > 0) {
                            bestResult = syncedResults.reduce((best, current) => {
                                const bestDiff = Math.abs((best.duration || 0) - this._trackDurationSec);
                                const currentDiff = Math.abs((current.duration || 0) - this._trackDurationSec);
                                return currentDiff < bestDiff ? current : best;
                            });
                        }

                        this._currentLyrics = this._parseLRC(bestResult.syncedLyrics);
                        this._startLyricsDisplay();
                        callback(true);
                        return;
                    }

                    // No synced lyrics found — return false to allow fallback to other sources
                    callback(false);
                } catch (e) {
                    logError(e, 'Failed to search lyrics from LRCLIB');
                    callback(false);
                }
            });
        }

        _fetchNeteaseLyrics(title, artist, callback) {
            const searchParams = `s=${encodeURIComponent(`${title} ${artist}`)}&type=1&limit=1`;
            const searchUrl = `${NETEASE_SEARCH_URL}?${searchParams}`;

            try {
                const proc = Gio.Subprocess.new(
                    ['curl', '-s', searchUrl],
                    Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
                );

                proc.communicate_utf8_async(null, null, (proc, result) => {
                    try {
                        const [, stdout] = proc.communicate_utf8_finish(result);
                        if (!stdout) {
                            callback(false);
                            return;
                        }

                        const data = JSON.parse(stdout);
                        if (!data.result || !data.result.songs || data.result.songs.length === 0) {
                            callback(false);
                            return;
                        }

                        const songId = data.result.songs[0].id;
                        this._fetchNeteaseLyricById(songId, title, artist, callback);
                    } catch (e) {
                        logError(e, 'Failed to search Netease');
                        callback(false);
                    }
                });
            } catch (e) {
                logError(e, 'Failed to call Netease search API');
                callback(false);
            }
        }

        _fetchNeteaseLyricById(songId, title, artist, callback) {
            const url = `${NETEASE_LYRIC_URL}?id=${songId}&lv=1`;

            try {
                const proc = Gio.Subprocess.new(
                    ['curl', '-s', url],
                    Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
                );

                proc.communicate_utf8_async(null, null, (proc, result) => {
                    try {
                        const [, stdout] = proc.communicate_utf8_finish(result);
                        if (!stdout) {
                            callback(false);
                            return;
                        }

                        const data = JSON.parse(stdout);
                        if (data.lrc && data.lrc.lyric) {
                            this._currentLyrics = this._parseLRC(data.lrc.lyric);
                            if (this._currentLyrics.length > 0) {
                                this._startLyricsDisplay();
                                callback(true);
                                return;
                            }
                        }
                        callback(false);
                    } catch (e) {
                        logError(e, 'Failed to fetch Netease lyrics');
                        callback(false);
                    }
                });
            } catch (e) {
                logError(e, 'Failed to call Netease lyric API');
                callback(false);
            }
        }

        // --- End multi-source lyrics ---

        _parseLRC(lrcText) {
            // Parse LRC format: [mm:ss.xx]lyrics or [mm:ss.xxx]lyrics
            const lines = [];
            const lrcLines = lrcText.split('\n');

            for (const line of lrcLines) {
                const match = line.match(/\[(\d+):(\d+)\.(\d+)\](.*)/);
                if (match) {
                    const minutes = parseInt(match[1]);
                    const seconds = parseInt(match[2]);
                    const fracStr = match[3];
                    const text = match[4].trim();

                    // Handle variable-length fractional seconds:
                    // 2 digits = centiseconds (e.g. .82 = 820ms)
                    // 3 digits = milliseconds (e.g. .237 = 237ms)
                    let fracMs;
                    if (fracStr.length === 1) {
                        fracMs = parseInt(fracStr) * 100;
                    } else if (fracStr.length === 2) {
                        fracMs = parseInt(fracStr) * 10;
                    } else {
                        fracMs = parseInt(fracStr.substring(0, 3));
                    }

                    const timeMs = (minutes * 60 + seconds) * 1000 + fracMs;

                    if (text) {
                        lines.push({ time: timeMs, text: text });
                    }
                }
            }

            return lines.sort((a, b) => a.time - b.time);
        }

        _startLyricsDisplay() {
            if (!this._currentLyrics || this._currentLyrics.length === 0) {
                return;
            }

            // Clear any existing timeout before starting a new one
            if (this._lyricsTimeoutId) {
                GLib.source_remove(this._lyricsTimeoutId);
                this._lyricsTimeoutId = null;
            }

            // Reset current line so the first update always triggers
            this._currentLine = '';

            // Record start time for fallback timing (when Position is not supported)
            this._lyricsStartTime = GLib.get_monotonic_time() / 1000; // in ms
            this._lyricsStartPosition = 0; // will be updated on first successful Position query
            this._positionSupported = null; // unknown yet
            this._positionZeroCount = 0; // track consecutive zero returns before deciding

            // Get current playback position
            this._updateCurrentLyricLine();

            // Update lyrics at 200ms interval for tighter sync
            this._lyricsTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
                this._updateCurrentLyricLine();
                return GLib.SOURCE_CONTINUE;
            });
        }

        _updateCurrentLyricLine() {
            if (!this._proxy || !this._currentLyrics || this._currentLyrics.length === 0) {
                return;
            }

            try {
                // Query position via DBus
                this._proxy.call(
                    'Get',
                    new GLib.Variant('(ss)', [MPRIS_PLAYER_INTERFACE, 'Position']),
                    Gio.DBusCallFlags.NONE,
                    -1,
                    null,
                    (proxy, result) => {
                        try {
                            const reply = proxy.call_finish(result);
                            const positionUs = reply.get_child_value(0).get_variant().get_int64();
                            let positionMs = positionUs / 1000;

                            // Check if Position is supported (non-zero or first time)
                            if (positionMs > 0) {
                                this._positionSupported = true;
                                this._positionZeroCount = 0;
                                // Update fallback timer reference
                                this._lyricsStartTime = GLib.get_monotonic_time() / 1000;
                                this._lyricsStartPosition = positionMs;
                            } else if (this._positionSupported === null) {
                                // Don't decide on first zero — could be start of song
                                this._positionZeroCount = (this._positionZeroCount || 0) + 1;
                                if (this._positionZeroCount >= 5) {
                                    // 5 consecutive zeros (~1s), likely not supported
                                    this._positionSupported = false;
                                }
                            }

                            // If Position is not supported, use elapsed time
                            if (!this._positionSupported) {
                                const elapsed = GLib.get_monotonic_time() / 1000 - this._lyricsStartTime;
                                positionMs = this._lyricsStartPosition + elapsed;
                            }

                            this._syncLyricLine(positionMs);
                        } catch (e) {
                            // Position query failed, use fallback timing
                            const elapsed = GLib.get_monotonic_time() / 1000 - this._lyricsStartTime;
                            const positionMs = this._lyricsStartPosition + elapsed;
                            this._syncLyricLine(positionMs);
                        }
                    }
                );
            } catch (e) {
                logError(e, 'Failed to update lyric line');
            }
        }

        _syncLyricLine(positionMs) {
            if (!this._currentLyrics || this._currentLyrics.length === 0) return;

            // Add advance offset to compensate for polling + D-Bus latency + Position update lag
            // YesPlayMusic only updates Position once per second, so we need a larger offset
            const LYRICS_ADVANCE_MS = 500;
            const adjustedMs = positionMs + LYRICS_ADVANCE_MS;

            let currentLine = this._currentLyrics[0].text;

            for (let i = this._currentLyrics.length - 1; i >= 0; i--) {
                if (this._currentLyrics[i].time <= adjustedMs) {
                    currentLine = this._currentLyrics[i].text;
                    break;
                }
            }

            if (currentLine !== this._currentLine) {
                this._currentLine = currentLine;
                this._updateLabelText(currentLine);
            }
        }

        _updateLabelText(text = null) {
            if (text !== null) {
                this._currentText = text;
            }

            const display = this._currentText || '';
            const maxLength = this._settings.get_int('max-text-length');
            this._label.set_text(this._truncateText(display, maxLength));
        }

        _truncateText(text, maxLength) {
            if (text.length <= maxLength) {
                return text;
            }
            return text.substring(0, maxLength - 3) + '...';
        }

        destroy() {
            if (this._settingsSignalIds) {
                for (const id of this._settingsSignalIds) {
                    this._settings.disconnect(id);
                }
                this._settingsSignalIds = null;
            }

            if (this._lyricsTimeoutId) {
                GLib.source_remove(this._lyricsTimeoutId);
                this._lyricsTimeoutId = null;
            }

            if (this._lxMusicApiTimeoutId) {
                GLib.source_remove(this._lxMusicApiTimeoutId);
                this._lxMusicApiTimeoutId = null;
            }

            if (this._propertiesChangedId && this._playerProxy) {
                this._playerProxy.disconnect(this._propertiesChangedId);
                this._propertiesChangedId = null;
            }

            if (this._busWatchIds) {
                for (const id of this._busWatchIds) {
                    Gio.bus_unwatch_name(id);
                }
                this._busWatchIds = null;
            }

            if (this._nameOwnerChangedId) {
                Gio.DBus.session.signal_unsubscribe(this._nameOwnerChangedId);
                this._nameOwnerChangedId = null;
            }

            if (this._mprisPropertiesChangedId) {
                Gio.DBus.session.signal_unsubscribe(this._mprisPropertiesChangedId);
                this._mprisPropertiesChangedId = null;
            }

            this._proxy = null;
            this._playerProxy = null;
            super.destroy();
        }
    });

export default class MusicLyricsExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._indicator = null;
        this._settings = null;
    }

    enable() {
        this._settings = this.getSettings();
        this._indicator = new MusicLyricsIndicator(this._settings);

        // Delay position update to ensure other extensions (like Vitals) are loaded first
        this._positionTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            this._updatePosition();
            this._positionTimeoutId = null;
            return GLib.SOURCE_REMOVE;
        });

        this._settingsSignalId = this._settings.connect('changed::position-in-panel', () => {
            this._updatePosition();
        });
    }

    disable() {
        if (this._positionTimeoutId) {
            GLib.source_remove(this._positionTimeoutId);
            this._positionTimeoutId = null;
        }

        if (this._settingsSignalId) {
            this._settings.disconnect(this._settingsSignalId);
            this._settingsSignalId = null;
        }

        if (this._menuManagerAdded && this._indicator) {
            Main.panel.menuManager.removeMenu(this._indicator.menu);
            this._menuManagerAdded = false;
        }

        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }

        this._settings = null;
    }

    _updatePosition() {
        if (!this._indicator) return;

        // Remove from menu manager first
        if (this._menuManagerAdded) {
            Main.panel.menuManager.removeMenu(this._indicator.menu);
            this._menuManagerAdded = false;
        }

        // Remove from current parent if applied
        if (this._indicator.get_parent()) {
            this._indicator.get_parent().remove_child(this._indicator);
        }

        const position = this._settings.get_string('position-in-panel');

        if (position === 'left') {
            Main.panel._leftBox.add_child(this._indicator);
            Main.panel.menuManager.addMenu(this._indicator.menu);
            this._menuManagerAdded = true;
        } else if (position === 'center') {
            // Insert before the date/time clock
            const dateMenu = Main.panel.statusArea.dateMenu;
            if (dateMenu && dateMenu.get_parent() === Main.panel._centerBox) {
                Main.panel._centerBox.insert_child_below(this._indicator, dateMenu);
            } else {
                Main.panel._centerBox.insert_child_at_index(this._indicator, 0);
            }
            Main.panel.menuManager.addMenu(this._indicator.menu);
            this._menuManagerAdded = true;
        } else {
            // addToStatusArea handles menuManager registration automatically
            Main.panel.addToStatusArea('music-lyrics-indicator', this._indicator);
            this._menuManagerAdded = false;
        }
    }
}
