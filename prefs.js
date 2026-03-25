import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class SpotLinePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage();

        // Appearance group
        const appearanceGroup = new Adw.PreferencesGroup({
            title: 'Appearance'
        });

        // Position setting
        const positionRow = new Adw.ComboRow({
            title: 'Panel Position',
            model: new Gtk.StringList({
                strings: ['Left', 'Center', 'Right']
            })
        });

        const positions = ['left', 'center', 'right'];
        positionRow.selected = positions.indexOf(settings.get_string('position-in-panel'));

        positionRow.connect('notify::selected', () => {
            settings.set_string('position-in-panel', positions[positionRow.selected]);
        });

        appearanceGroup.add(positionRow);

        // Max Width setting
        const widthRow = new Adw.SpinRow({
            title: 'Max Text Length',
            subtitle: 'Maximum number of characters to display',
            adjustment: new Gtk.Adjustment({
                lower: 10,
                upper: 200,
                step_increment: 5,
                value: settings.get_int('max-text-length')
            })
        });

        widthRow.connect('notify::value', () => {
            settings.set_int('max-text-length', widthRow.get_value());
        });

        appearanceGroup.add(widthRow);

        // Font size setting
        const fontSizeRow = new Adw.SpinRow({
            title: 'Font Size',
            subtitle: 'Font size of lyrics text in the panel (px)',
            adjustment: new Gtk.Adjustment({
                lower: 10,
                upper: 30,
                step_increment: 1,
                value: settings.get_int('font-size')
            })
        });

        fontSizeRow.connect('notify::value', () => {
            settings.set_int('font-size', fontSizeRow.get_value());
        });

        appearanceGroup.add(fontSizeRow);

        page.add(appearanceGroup);

        // Lyrics source group
        const lyricsGroup = new Adw.PreferencesGroup({
            title: 'Spotify API',
            description: 'Configure Spotify Developer credentials for more accurate track matching. Get yours at https://developer.spotify.com/dashboard'
        });

        const clientIdRow = new Adw.EntryRow({
            title: 'Client ID',
            text: settings.get_string('spotify-client-id')
        });

        clientIdRow.connect('changed', () => {
            settings.set_string('spotify-client-id', clientIdRow.get_text());
        });

        lyricsGroup.add(clientIdRow);

        const clientSecretRow = new Adw.PasswordEntryRow({
            title: 'Client Secret',
            text: settings.get_string('spotify-client-secret')
        });

        clientSecretRow.connect('changed', () => {
            settings.set_string('spotify-client-secret', clientSecretRow.get_text());
        });

        lyricsGroup.add(clientSecretRow);

        page.add(lyricsGroup);

        window.add(page);
    }
}
