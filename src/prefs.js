'use strict';

const { Adw, Gio, Gtk, Gdk, GLib } = imports.gi;
const Params = imports.misc.params;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

function init() {}

function fillPreferencesWindow(window) {
  let prefs = new PrefsWindow(window);
  prefs.fillPrefsWindow();
}

class PrefsWindow {
  constructor(window) {
    this._window = window;
    this._settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.visualizer');
  }

  create_page(title) {
    let page = new Adw.PreferencesPage({
      title: title,
      //icon_name: icon,
    });
    this._window.add(page);

    // get the headerbar
    if (!this.headerbar) {
      let pages_stack = page.get_parent(); // AdwViewStack
      let content_stack = pages_stack.get_parent().get_parent(); // GtkStack
      let preferences = content_stack.get_parent(); // GtkBox
      this.headerbar = preferences.get_first_child(); // AdwHeaderBar
    }

    return page;
  }

  // create a new Adw.PreferencesGroup and add it to a prefsPage
  create_group(page, title) {
    let group;
    if (title !== undefined) {
      group = new Adw.PreferencesGroup({
        title: title,
        /*margin_top: 5,
        margin_bottom: 5,*/
      });
    } else {
      group = new Adw.PreferencesGroup();
    }
    page.add(group);
    return group;
  }

  append_row(group, title, widget) {
    let row = new Adw.ActionRow({
      title: title,
    });
    group.add(row);
    row.add_suffix(widget);
    row.activatable_widget = widget;
  }

  // create a new Adw.ActionRow to insert an option into a prefsGroup
  append_switch(group, title, key) {
    let button = new Gtk.Switch({
      active: key,
      valign: Gtk.Align.CENTER,
    });

    this._settings.bind(
      key,
      button,
      'active',
      Gio.SettingsBindFlags.DEFAULT
    );
    this.append_row(group, title, button);
  }

  append_expander_row(titleEx, group, title, key) {
    let [testEnabled, spect] = this._settings.get_value(key).deep_unpack();
    let spin = Gtk.SpinButton.new_with_range(1, 256, 1);
    spin.set_value(spect);
    spin.connect('value-changed', (widget) => {
      let settingArray = this._settings.get_value(key).deep_unpack();
      settingArray[1] = widget.value;
      this._settings.set_value(key, new GLib.Variant('(bi)', settingArray));
    });
    let expand_row = new Adw.ExpanderRow({
      title: titleEx,
      show_enable_switch: true,
      expanded: testEnabled,
      enable_expansion: testEnabled
    });
    let row = new Adw.ActionRow({
      title: title,
    });
    expand_row.connect("notify::enable-expansion", (widget) => {
      let settingArray = this._settings.get_value(key).deep_unpack();
      settingArray[0] = widget.enable_expansion;
      this._settings.set_value(key, new GLib.Variant('(bi)', settingArray));
    });
    row.add_suffix(spin);
    expand_row.add_row(row);
    group.add(expand_row);
  };

  append_spin_button(group, title, is_double, key, min, max, step) {
    let v = 0;
    if (is_double) {
      v = this._settings.get_double(key);
    } else {
      v = this._settings.get_int(key);
    }
    let spin = Gtk.SpinButton.new_with_range(min, max, step);
    spin.set_value(v);
    this._settings.bind(key, spin, 'value', Gio.SettingsBindFlags.DEFAULT);
    this.append_row(group, title, spin);
  }

  append_info_group(group, name, title) {
    let adw_group = new Adw.PreferencesGroup();
    let infoBox = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      hexpand: false,
      vexpand: false
    });

    let name_label = new Gtk.Label({
      label: name,
    });

    let version = new Gtk.Label({
      label: 'Version: ' + title,
    });

    infoBox.append(name_label);
    infoBox.append(version);
    adw_group.add(infoBox);
    group.add(adw_group);
  }

  fillPrefsWindow() {
    let visualWidget = this.create_page('Visualizer'); {
      let groupVisual = this.create_group(visualWidget);
      this.append_switch(groupVisual, 'Flip the Visualizer', 'flip-visualizer');
      this.append_spin_button(groupVisual, 'Visualizer Height', false, 'visualizer-height', 1, 200, 1);
      this.append_spin_button(groupVisual, 'Visualizer Width', false, 'visualizer-width', 1, 1920, 1);
      this.append_spin_button(groupVisual, 'Spects Line Width', false, 'spects-line-width', 1, 20, 1);
      this.append_spin_button(groupVisual, 'Change Spects Band to Get', false, 'total-spects-band', 1, 256, 1);
      this.append_expander_row('Override Spect Value', groupVisual, 'Set Spects Value', 'spect-over-ride');
    }

    let aboutPage = this.create_page('About'); {
      let groupAbout = this.create_group(aboutPage);
      this.append_info_group(groupAbout, Me.metadata.name,
        Me.metadata.version.toString());
    }
  }
}
