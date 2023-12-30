'use strict';

const { Gio, Gtk, Gdk, GLib, GObject } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Params = imports.misc.params;
const Config = imports.misc.config;
const Me = ExtensionUtils.getCurrentExtension();

const [major, minor] = Config.PACKAGE_VERSION.split('.').map(s => Number(s));
let Adw;

const DEFAULT_SPIN_MIN = 1;
const DEFAULT_SPIN_MAX = 200;
const VISUALIZER_WIDTH_MAX = 1920;
const SPECTS_LINE_WIDTH_MAX = 20;
const TOTAL_SPECTS_BAND_MAX = 256;
const FPS_OPTIONS = ["15", "30", "60", "90", "120"];
const GRID_COLUMN_SPACING = 200;
const GRID_ROW_SPACING = 25;

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
        let fpsOptions = new Gtk.ComboBoxText();
        FPS_OPTIONS.forEach(fps => fpsOptions.append_text(fps));
        fpsOptions.connect('changed', (widget) => {
          let fps = widget.get_active_text();
          this._settings.set_int('fps', parseInt(fps, 10));
        });
        let currentFps = this._settings.get_int('fps');
        fpsOptions.set_active_id(currentFps.toString());

        attachItems(grid, new Gtk.Label({ label: 'Flip the Visualizer' }), getSwitch('flip-visualizer', this._settings), 0);
        attachItems(grid, new Gtk.Label({ label: 'Flip the Visualizer Horizontally' }), getSwitch('horizontal-flip', this._settings), 1);
        attachItems(grid, new Gtk.Label({ label: 'Visualizer Height' }), getSpinButton(false, 'visualizer-height', DEFAULT_SPIN_MIN, DEFAULT_SPIN_MAX, 1, this._settings), 2);
        attachItems(grid, new Gtk.Label({ label: 'Visualizer Width' }), getSpinButton(false, 'visualizer-width', DEFAULT_SPIN_MIN, VISUALIZER_WIDTH_MAX, 1, this._settings), 3);
        attachItems(grid, new Gtk.Label({ label: 'Spects Line Width' }), getSpinButton(false, 'spects-line-width', DEFAULT_SPIN_MIN, SPECTS_LINE_WIDTH_MAX, 1, this._settings), 5);
        attachItems(grid, new Gtk.Label({ label: 'Change Spects Band to Get' }), getSpinButton(false, 'total-spects-band', DEFAULT_SPIN_MIN, TOTAL_SPECTS_BAND_MAX, 1, this._settings), 4);
        attachItems(grid, new Gtk.Label({ label: 'Frames Per Second (FPS)' }), getDropDown(this._settings), 7);
        attachItems(grid, new Gtk.Label({ label: 'Visualizer Color' }), getColorButton(this._settings), 8);
        this.attachHybridRow(grid, new Gtk.Label({ label: 'Override Spect Value' }), new Gtk.Label({ label: 'Set Spects Value' }), getSwitch('spect-over-ride-bool', this._settings), getSpinButton(false, 'spect-over-ride', 1, 256, 1, this._settings), 6);
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
    let page = new Adw.PreferencesPage(
        {
          title: title,
          //icon_name: icon,
        }
    );
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
    let row = new Adw.ActionRow({ title: title });
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

    let row = new Adw.ActionRow({ title: title });
    expand_row.connect("notify::enable-expansion", (widget) => {
      let settingArray = widget.enable_expansion;
      this._settings.set_value(key, new GLib.Variant('b', settingArray));
    });
    row.add_suffix(key1);
    expand_row.add_row(row);
    group.add(expand_row);
  };

  append_info_group(group, name, title) {
    let adw_group = new Adw.PreferencesGroup();
    let infoBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, hexpand: false, vexpand: false});
    let name_label = new Gtk.Label({ label: name });
    let version = new Gtk.Label({ label: 'Version: ' + title });
    infoBox.append(name_label);
    infoBox.append(version);
    adw_group.add(infoBox);
    group.add(adw_group);
  }

  fillPrefsWindow() {
    let visualWidget = this.create_page('Visualizer'); {
      let groupVisual = this.create_group(visualWidget);
      this.append_row(groupVisual, 'Flip the Visualizer Vertically', getSwitch('flip-visualizer', this._settings));
      this.append_row(groupVisual, 'Flip the Visualizer Horizontally', getSwitch('horizontal-flip', this._settings));
      this.append_row(groupVisual, 'Visualizer Height', getSpinButton(false, 'visualizer-height', 1, 200, 1, this._settings));
      this.append_row(groupVisual, 'Visualizer Width', getSpinButton(false, 'visualizer-width', 1, 1920, 1, this._settings));
      this.append_row(groupVisual, 'Spects Line Width', getSpinButton(false, 'spects-line-width', 1, 20, 1, this._settings));
      this.append_row(groupVisual, 'Change Spects Band to Get', getSpinButton(false, 'total-spects-band', 1, 256, 1, this._settings));
      this.append_row(groupVisual, 'Frames Per Second (FPS)', getDropDown(this._settings));
      this.append_row(groupVisual, 'Visualizer Color', getColorButton(this._settings));
      this.append_expander_row(groupVisual, 'Override Spect Value', 'Set Spects Value', 'spect-over-ride-bool', getSpinButton(false, 'spect-over-ride', 1, 256, 1, this._settings));
    }

    let aboutPage = this.create_page('About'); {
      let groupAbout = this.create_group(aboutPage);
      this.append_info_group(groupAbout, Me.metadata.name, Me.metadata.version.toString());
    }
  }
}

function attachItems(grid, label, widget, row) {
  grid.set_column_spacing(GRID_COLUMN_SPACING);
  grid.set_row_spacing(GRID_ROW_SPACING);
  grid.attach(label, 0, row, 1, 1);
  grid.attach(widget, 1, row, 1, 1);
}

function getSwitch(key, settings) {
  let button = new Gtk.Switch({ active: key, valign: Gtk.Align.CENTER });
  settings.bind(key, button, 'active', Gio.SettingsBindFlags.DEFAULT);
  return button
}

function getSpinButton(is_double, key, min, max, step, settings) {
  let value = is_double ? settings.get_double(key) : settings.get_int(key);
  let spin = Gtk.SpinButton.new_with_range(min, max, step);
  spin.set_value(value);
  settings.bind(key, spin, 'value', Gio.SettingsBindFlags.DEFAULT);
  return spin;
}

function getDropDown(settings) {
  let dropDown = new Gtk.ComboBoxText();
  FPS_OPTIONS.forEach(fps => dropDown.append_text(fps));

  dropDown.connect('changed', (widget) => {
    let fps = widget.get_active_text();
    settings.set_int('fps', parseInt(fps, 10));
  });

  let currentFps = settings.get_int('fps').toString();
  let currentIndex = FPS_OPTIONS.indexOf(currentFps);
  if (currentIndex !== -1) {
    dropDown.set_active(currentIndex);
  }
  return dropDown;
}

function getColorButton(settings) {
  let button = new Gtk.ColorButton();
  let rgbaString = settings.get_string('visualizer-color');
  let rgbaParts = rgbaString.split(',').map(parseFloat);
  let gdkRGBA = new Gdk.RGBA({red: rgbaParts[0], green: rgbaParts[1], blue: rgbaParts[2], alpha: rgbaParts[3]});
  button.set_rgba(gdkRGBA);
  button.connect('color-set', () => {
    let gdkRGBA = button.get_rgba();
    let rgbaString = `${gdkRGBA.red},${gdkRGBA.green},${gdkRGBA.blue},${gdkRGBA.alpha}`;
    settings.set_string('visualizer-color', rgbaString);
  });

  return button;
}