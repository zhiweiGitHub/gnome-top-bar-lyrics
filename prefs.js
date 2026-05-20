import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const LANGUAGE_OPTIONS = [
    { label: 'English', value: 'en' },
    { label: '中文', value: 'zh' },
];

const PLAYER_PRIORITY_VALUES = [
    'spotify,yesplaymusic,lx-music-desktop',
    'spotify,lx-music-desktop,yesplaymusic',
    'yesplaymusic,spotify,lx-music-desktop',
    'yesplaymusic,lx-music-desktop,spotify',
    'lx-music-desktop,spotify,yesplaymusic',
    'lx-music-desktop,yesplaymusic,spotify',
];

const PLAYER_NAMES = {
    en: {
        spotify: 'Spotify',
        yesplaymusic: 'YesPlayMusic',
        'lx-music-desktop': 'LX Music',
    },
    zh: {
        spotify: 'Spotify',
        yesplaymusic: 'YesPlayMusic',
        'lx-music-desktop': '洛雪音乐',
    },
};

const TRANSLATIONS = {
    en: {
        appearance: 'Appearance',
        language: 'Language',
        panelPosition: 'Panel Position',
        left: 'Left',
        center: 'Center',
        right: 'Right',
        maxTextLength: 'Max Text Length',
        maxTextLengthSubtitle: 'Maximum number of characters to display',
        fontSize: 'Font Size',
        fontSizeSubtitle: 'Font size of lyrics text in the panel (px)',
        playerPriority: 'Player Priority',
        playerPriorityDescription: 'Controls which player is used for lyrics and which app is opened first',
        priorityOrder: 'Priority Order',
        spotifyApi: 'Spotify API',
        spotifyApiDescription: 'Configure Spotify Developer credentials for more accurate track matching. Get yours at https://developer.spotify.com/dashboard',
        clientId: 'Client ID',
        clientSecret: 'Client Secret',
    },
    zh: {
        appearance: '外观',
        language: '语言',
        panelPosition: '面板位置',
        left: '左侧',
        center: '居中',
        right: '右侧',
        maxTextLength: '最大文本长度',
        maxTextLengthSubtitle: '面板中最多显示的字符数',
        fontSize: '字体大小',
        fontSizeSubtitle: '面板歌词文字大小（px）',
        playerPriority: '播放器优先级',
        playerPriorityDescription: '控制歌词来源和优先打开的播放器',
        priorityOrder: '优先级顺序',
        spotifyApi: 'Spotify API',
        spotifyApiDescription: '配置 Spotify Developer 凭据，用于更准确地匹配歌曲。可在 https://developer.spotify.com/dashboard 获取',
        clientId: '客户端 ID',
        clientSecret: '客户端密钥',
    },
};

function getLanguage(settings) {
    const language = settings.get_string('language');
    return TRANSLATIONS[language] ? language : 'en';
}

function t(settings, key) {
    return TRANSLATIONS[getLanguage(settings)][key] || TRANSLATIONS.en[key] || key;
}

function makeStringList(strings) {
    return new Gtk.StringList({ strings });
}

function getPriorityLabel(language, value) {
    const names = PLAYER_NAMES[language] || PLAYER_NAMES.en;
    return value.split(',').map(key => names[key] || key).join(' > ');
}

export default class SpotLinePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage();

        const appearanceGroup = new Adw.PreferencesGroup();

        const languageRow = new Adw.ComboRow({
            model: makeStringList(LANGUAGE_OPTIONS.map(option => option.label))
        });

        languageRow.selected = Math.max(
            0,
            LANGUAGE_OPTIONS.findIndex(option => option.value === settings.get_string('language'))
        );

        const positionRow = new Adw.ComboRow();
        const positions = ['left', 'center', 'right'];
        positionRow.selected = positions.indexOf(settings.get_string('position-in-panel'));

        const widthRow = new Adw.SpinRow({
            adjustment: new Gtk.Adjustment({
                lower: 10,
                upper: 200,
                step_increment: 5,
                value: settings.get_int('max-text-length')
            })
        });

        const fontSizeRow = new Adw.SpinRow({
            adjustment: new Gtk.Adjustment({
                lower: 10,
                upper: 30,
                step_increment: 1,
                value: settings.get_int('font-size')
            })
        });

        appearanceGroup.add(languageRow);
        appearanceGroup.add(positionRow);
        appearanceGroup.add(widthRow);
        appearanceGroup.add(fontSizeRow);
        page.add(appearanceGroup);

        const playerPriorityGroup = new Adw.PreferencesGroup();

        const priorityRow = new Adw.ComboRow();
        const currentPriority = settings.get_string('player-priority-order');
        priorityRow.selected = Math.max(
            0,
            PLAYER_PRIORITY_VALUES.indexOf(currentPriority)
        );

        playerPriorityGroup.add(priorityRow);
        page.add(playerPriorityGroup);

        const lyricsGroup = new Adw.PreferencesGroup();

        const clientIdRow = new Adw.EntryRow({
            text: settings.get_string('spotify-client-id')
        });

        const clientSecretRow = new Adw.PasswordEntryRow({
            text: settings.get_string('spotify-client-secret')
        });

        lyricsGroup.add(clientIdRow);
        lyricsGroup.add(clientSecretRow);
        page.add(lyricsGroup);

        const updateLanguageLabels = () => {
            const language = getLanguage(settings);

            appearanceGroup.title = t(settings, 'appearance');
            languageRow.title = t(settings, 'language');

            positionRow.title = t(settings, 'panelPosition');
            positionRow.model = makeStringList([
                t(settings, 'left'),
                t(settings, 'center'),
                t(settings, 'right'),
            ]);
            positionRow.selected = Math.max(0, positions.indexOf(settings.get_string('position-in-panel')));

            widthRow.title = t(settings, 'maxTextLength');
            widthRow.subtitle = t(settings, 'maxTextLengthSubtitle');
            fontSizeRow.title = t(settings, 'fontSize');
            fontSizeRow.subtitle = t(settings, 'fontSizeSubtitle');

            playerPriorityGroup.title = t(settings, 'playerPriority');
            playerPriorityGroup.description = t(settings, 'playerPriorityDescription');
            priorityRow.title = t(settings, 'priorityOrder');
            priorityRow.model = makeStringList(PLAYER_PRIORITY_VALUES.map(value => getPriorityLabel(language, value)));
            priorityRow.selected = Math.max(0, PLAYER_PRIORITY_VALUES.indexOf(settings.get_string('player-priority-order')));

            lyricsGroup.title = t(settings, 'spotifyApi');
            lyricsGroup.description = t(settings, 'spotifyApiDescription');
            clientIdRow.title = t(settings, 'clientId');
            clientSecretRow.title = t(settings, 'clientSecret');
        };

        languageRow.connect('notify::selected', () => {
            settings.set_string('language', LANGUAGE_OPTIONS[languageRow.selected].value);
            updateLanguageLabels();
        });

        positionRow.connect('notify::selected', () => {
            settings.set_string('position-in-panel', positions[positionRow.selected]);
        });

        widthRow.connect('notify::value', () => {
            settings.set_int('max-text-length', widthRow.get_value());
        });

        fontSizeRow.connect('notify::value', () => {
            settings.set_int('font-size', fontSizeRow.get_value());
        });

        priorityRow.connect('notify::selected', () => {
            settings.set_string(
                'player-priority-order',
                PLAYER_PRIORITY_VALUES[priorityRow.selected]
            );
        });

        clientIdRow.connect('changed', () => {
            settings.set_string('spotify-client-id', clientIdRow.get_text());
        });

        clientSecretRow.connect('changed', () => {
            settings.set_string('spotify-client-secret', clientSecretRow.get_text());
        });

        updateLanguageLabels();
        window.add(page);
    }
}
