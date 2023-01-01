'use strict';

const { Gio, Gtk, Gdk, GLib, GObject } = imports.gi;
const Params = imports.misc.params;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Config = imports.misc.config;
const [major, minor] = Config.PACKAGE_VERSION.split('.').map(s => Number(s));
let Adw;

function init() {
}

function fillPreferencesWindow(window) {
  Adw = imports.gi.Adw;
  let prefs = new PrefsWindow(window);
  prefs.fillPrefsWindow();
}

function buildPrefsWidget() {
  let widget = new prefsWidget();
  (major < 40) ? widget.show_all(): widget.show();
  return widget;
}

const prefsWidget = GObject.registerClass(
  class prefsWidget extends Gtk.Notebook {

    _init(params) {
      super._init(params);
      this._settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.visualizer');
      this.margin = 20;

      let grid = new Gtk.Grid();
      attachItems(grid, new Gtk.Label({ label: 'Flip the Visualizer' }), getSwitch('flip-visualizer', this._settings), 0);
      attachItems(grid, new Gtk.Label({ label: 'Visualizer Height' }), getSpinButton(false, 'visualizer-height', 1, 200, 1, this._settings), 1);
      attachItems(grid, new Gtk.Label({ label: 'Visualizer Width' }), getSpinButton(false, 'visualizer-width', 1, 1920, 1, this._settings), 2);
      attachItems(grid, new Gtk.Label({ label: 'Spects Line Width' }), getSpinButton(false, 'spects-line-width', 1, 20, 1, this._settings), 3);
      attachItems(grid, new Gtk.Label({ label: 'Change Spects Band to Get' }), getSpinButton(false, 'total-spects-band', 1, 256, 1, this._settings), 4);
      this.attachHybridRow(grid, new Gtk.Label({ label: 'Override Spect Value' }), new Gtk.Label({ label: 'Set Spects Value' }), getSwitch('spect-over-ride-bool', this._settings), getSpinButton(false, 'spect-over-ride', 1, 256, 1, this._settings), 5);
      this.append_page(grid, new Gtk.Label({ label: 'Visualizer' }));
      let aboutBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
      if (major < 40) {
        aboutBox.add(new Gtk.Label({ label: Me.metadata.name }));
        aboutBox.add(new Gtk.Label({ label: 'Version: ' + Me.metadata.version.toString() }));
      } else {
        aboutBox.append(new Gtk.Label({ label: Me.metadata.name }));
        aboutBox.append(new Gtk.Label({ label: 'Version: ' + Me.metadata.version.toString() }));
      }
      this.append_page(aboutBox, new Gtk.Label({ label: 'About' }));
    }

    attachHybridRow(grid, label, label1, button, button1, row) {
      grid.attach(label, 0, row, 1, 1);
      grid.attach(button, 1, row, 1, 1);
      grid.attach(label1, 0, row + 1, 1, 1);
      grid.attach(button1, 1, row + 1, 1, 1);
    }
  });

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
        //margin_top: 5,
        //margin_bottom: 5,
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

  append_expander_row(group, titleEx, title, key, key1) {
    let expand_row = new Adw.ExpanderRow({
      title: titleEx,
      show_enable_switch: true,
      expanded: this._settings.get_boolean(key),
      enable_expansion: this._settings.get_boolean(key)
    });
    let row = new Adw.ActionRow({
      title: title,
    });
    expand_row.connect("notify::enable-expansion", (widget) => {
      let settingArray = this._settings.get_boolean(key);
      settingArray = widget.enable_expansion;
      this._settings.set_value(key, new GLib.Variant('b', settingArray));
    });
    row.add_suffix(key1);
    expand_row.add_row(row);
    group.add(expand_row);
  };

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
      this.append_row(groupVisual, 'Flip the Visualizer', getSwitch('flip-visualizer', this._settings));
      this.append_row(groupVisual, 'Visualizer Height', getSpinButton(false, 'visualizer-height', 1, 200, 1, this._settings));
      this.append_row(groupVisual, 'Visualizer Width', getSpinButton(false, 'visualizer-width', 1, 1920, 1, this._settings));
      this.append_row(groupVisual, 'Spects Line Width', getSpinButton(false, 'spects-line-width', 1, 20, 1, this._settings));
      this.append_row(groupVisual, 'Change Spects Band to Get', getSpinButton(false, 'total-spects-band', 1, 256, 1, this._settings));
      this.append_expander_row(groupVisual, 'Override Spect Value', 'Set Spects Value', 'spect-over-ride-bool', getSpinButton(false, 'spect-over-ride', 1, 256, 1, this._settings));
    }

    let aboutPage = this.create_page('About'); {
      let groupAbout = this.create_group(aboutPage);
      this.append_info_group(groupAbout, Me.metadata.name, Me.metadata.version.toString());
    }
  }
}

function attachItems(grid, label, widget, row) {
  grid.set_column_spacing(200);
  grid.set_row_spacing(25);
  grid.attach(label, 0, row, 1, 1);
  grid.attach(widget, 1, row, 1, 1);
}

function getSwitch(key, settings) {
  let button = new Gtk.Switch({ active: key, valign: Gtk.Align.CENTER });
  settings.bind(key, button, 'active', Gio.SettingsBindFlags.DEFAULT);
  return button
}

function getSpinButton(is_double, key, min, max, step, settings) {
  let v = 0;
  (is_double) ? v = settings.get_double(key) : v = settings.get_int(key);
  let spin = Gtk.SpinButton.new_with_range(min, max, step);
  spin.set_value(v);
  settings.bind(key, spin, 'value', Gio.SettingsBindFlags.DEFAULT);
  return spin;
}
