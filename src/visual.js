const { Clutter, GObject, GLib, Gio, St, Gdk, Gst, Gvc, Meta, Shell } = imports.gi;
const DND = imports.ui.dnd;
const Cairo = imports.cairo;
const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const Config = imports.misc.config;
const [MajorVersion, MinorVersion] = Config.PACKAGE_VERSION.split('.').map(s => Number(s));

// General Constants
const REFRESH_RATE_BASE = 1000; // Base ms count for calculating refresh rate
const INTERVAL_BASE = 1000000000; // Base ns count for calculating interval
const SPECTRUM_THRESHOLD = -80; // Default threshold for the spectrum
const MENU_POSITION_Y = 0.5; // Y position for popup menu
const MENU_SIDE = St.Side.TOP; // Side for popup menu
const POPUP_TIMEOUT = 600; // Timeout for popup in milliseconds

// drawStuff Constants
const MAX_FREQUENCY = 80; // Maximum frequency value
const MIN_INTENSITY = 0.2; // Minimum intensity
const VERTICAL_FLIP_FACTOR = 80; // Factor used in calculating yPosition for vertical flip
const SQRT_VALUE = 0.5; // Square root exponent used in calculating intensity
const MAX_COLOR_VALUE = 1.0; // Maximum color value for unit rgb used in calculations
const MIN_RANGE = 0; // Minimum range value when normalizing frequency
const MAX_RANGE = 1; // Maximum range value when normalizing frequency
const MIRROR_VALUE = 1; // Mirror value used to invert factors for horizontal flipping
const MIDDLE_DIVISOR = 2; // Divisor used in calculating xPosition, used for finding the middle of the line width of lineW
const START_DRAW_Y_VALUE = 0; // Value used for drawing line segments; marks the start of the drawn line
const END_DRAW_Y_VALUE = 1; // Value used for drawing line segments; marks the end of the drawn line

var Visualizer = GObject.registerClass(
  class musicVisualizer extends St.BoxLayout {
    /*
     * Initialization and Destruction Methods
     */
    _init() {
      this._settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.visualizer');
      super._init({
        reactive: true,
        track_hover: true,
        can_focus: true
      });
      this._settings.connect('changed::fps', () => {
        let fps = this._settings.get_int('fps');
        this._refreshRate = REFRESH_RATE_BASE / fps;
        this.updateGstInterval();
        this.startRefreshLoop();
      });
      this._settings.connect('changed::horizontal-flip', () => this._updateFlipSettings());
      this._settings.connect('changed::visualizer-pos-x', () => this.setPosition());
      this._settings.connect('changed::visualizer-pos-y', () => this.setPosition());
      this._settings.connect('changed::visualizer-color', () => this._update());
      let fps = this._settings.get_int('fps');
      this._visualMenuManager = new PopupMenu.PopupMenuManager(this);
      this._freq = [];
      this._actor = new St.DrawingArea();
      this.add_child(this._actor);
      this.settingsChanged();
      this._draggable = DND.makeDraggable(this);
      this._draggable._animateDragEnd = (eventTime) => {
        this._draggable._animationInProgress = true;
        this._draggable._onAnimationComplete(this._draggable._dragActor, eventTime);
      };
      this._draggable.connect('drag-begin', this._onDragBegin.bind(this));
      this._draggable.connect('drag-end', this._onDragEnd.bind(this));
      this.connect('notify::hover', () => this._onHover());
      this.actorInit();
      this._actor.connect('repaint', (area) => this.drawStuff(area));
      this.setupGst();
      this.setDefaultSrc();
      this.getMenuItems();
      this._update();
      this.setPosition();
      this._refreshRate = REFRESH_RATE_BASE / fps;
      this._refreshLoopId = null;
      this.startRefreshLoop();
      Main.layoutManager._backgroundGroup.add_child(this);
    }

    actorInit() {
      this._spectBands = this._settings.get_int('total-spects-band');
      this._spectHeight = this._settings.get_int('visualizer-height');
      this._spectWidth = this._settings.get_int('visualizer-width');
      this._actor.height = this._spectHeight;
      this._actor.width = this._spectWidth;
    }

    onDestroy() {
      if (this._refreshLoopId !== null) {
        GLib.Source.remove(this._refreshLoopId);
      }
      this._removeSource(this._menuTimeoutId);
      this._removeSource(this._streamId);
      this._removeSource(this._defaultSrcId);
      this._pipeline.set_state(Gst.State.NULL);
      Main.layoutManager._backgroundGroup.remove_child(this);
    }

    /*
     * GStreamer Methods
     */
    setupGst() {
      Gst.init(null);
      this._pipeline = Gst.Pipeline.new("bin");
      this._src = Gst.ElementFactory.make("pulsesrc", "src");
      this._spectrum = Gst.ElementFactory.make("spectrum", "spectrum");
      this._spectrum.set_property("bands", this._spectBands);
      this._spectrum.set_property("threshold", SPECTRUM_THRESHOLD);
      this._spectrum.set_property("post-messages", true);
      this.updateGstInterval();
      let _sink = Gst.ElementFactory.make("fakesink", "sink");
      this._pipeline.add(this._src);
      this._pipeline.add(this._spectrum);
      this._pipeline.add(_sink);
      if (!this._src.link(this._spectrum) || !this._spectrum.link(_sink)) {
        print('can not link elements');
      }
      let bus = this._pipeline.get_bus();
      bus.add_signal_watch();
      bus.connect('message::element', (bus, msg) => this.onMessage(bus, msg));
      this._pipeline.set_state(Gst.State.PLAYING);
    }

    updateGstInterval() {
      let fps = this._settings.get_int('fps');
      let interval = INTERVAL_BASE / fps;
      if (this._spectrum) {
        this._spectrum.set_property("interval", interval);
      }
    }

    onMessage(bus, msg) {
      let struct = msg.get_structure();
      let [magbool, magnitudes] = struct.get_list("magnitude");
      if (!magbool) {
        print('No magnitudes');
      } else {
        for (let i = 0; i < this._spectBands; ++i) {
          this._freq[i] = magnitudes.get_nth(i) * -1;
        }
      }
    }

    /*
     * Event Handlers
     */
    _onDragBegin() {
      this.isDragging = true;
      this._dragMonitor = {
        dragMotion: this._onDragMotion.bind(this)
      };
      DND.addDragMonitor(this._dragMonitor);
      let p = this.get_transformed_position();
      this.startX = this.oldX = p[0];
      this.startY = this.oldY = p[1];
      this.get_allocation_box();
      this.rowHeight = this.height;
      this.rowWidth = this.width;
    }

    _onDragEnd() {
      if (this._dragMonitor) {
        DND.removeDragMonitor(this._dragMonitor);
        this._dragMonitor = null;
      }
      this.set_position(this.deltaX, this.deltaY);
      this.ignoreUpdatePosition = true;
      this._settings.set_value('visualizer-location', new GLib.Variant('(ii)', [this.deltaX, this.deltaY]));
      this.ignoreUpdatePosition = false;
    }

    _onHover() {
      if (!this.hover)
        this._removeMenuTimeout();
    }

    _onDragMotion(dragEvent) {
      this.deltaX = dragEvent.x - (dragEvent.x - this.oldX);
      this.deltaY = dragEvent.y - (dragEvent.y - this.oldY);
      let p = this.get_transformed_position();
      this.oldX = p[0];
      this.oldY = p[1];
      return DND.DragMotionResult.CONTINUE;
    }

    vfunc_button_press_event() {
      let event = Clutter.get_current_event();
      if (event.get_button() === 1)
        this._setPopupTimeout();
      else if (event.get_button() === 3) {
        this._popupMenu();
        return Clutter.EVENT_STOP;
      }
      return Clutter.EVENT_PROPAGATE;
    }

    /*
     * Drawing and Rendering Methods
     */
    drawStuff(area) {
      let [width, height] = area.get_surface_size();
      let cr = area.get_context();
      let values = this.getSpectBands();
      let lineW = this._settings.get_int('spects-line-width');
      let horizontal_flip = this._settings.get_boolean('horizontal-flip');
      let vertical_flip = this._settings.get_boolean('flip-visualizer');
      let [r, g, b, a] = this._settings.get_string('visualizer-color').split(',').map(parseFloat);
      cr.setLineWidth(lineW);

      for (let i = 0; i < values; i++) {
        let normalizedFreq = Math.max(Math.min(this._freq[i] / MAX_FREQUENCY, MAX_RANGE), MIN_RANGE);
        let intensity = Math.pow(normalizedFreq, SQRT_VALUE);
        intensity = Math.max(intensity, MIN_INTENSITY);

        let horizontalFlip = this._settings.get_boolean('horizontal-flip');
        let positionFactor = horizontalFlip ? MIRROR_VALUE - (i / (values - MIRROR_VALUE)) : i / (values - MIRROR_VALUE);
        let blendFactor = horizontalFlip ? MIRROR_VALUE - positionFactor : positionFactor;
        let blendedR = r + blendFactor * (MAX_COLOR_VALUE - r);
        let blendedG = g + blendFactor * (MAX_COLOR_VALUE - g);
        let blendedB = b + blendFactor * (MAX_COLOR_VALUE - b);
        cr.setSourceRGBA(blendedR * intensity, blendedG * intensity, blendedB * intensity, a);

        let xPosition = horizontal_flip ? width - (lineW / MIDDLE_DIVISOR + i * width / values) : lineW / MIDDLE_DIVISOR + i * width / values;
        let yPosition = vertical_flip ? height / VERTICAL_FLIP_FACTOR * (VERTICAL_FLIP_FACTOR - this._freq[i]) : height * this._freq[i] / MAX_FREQUENCY;

        cr.moveTo(xPosition, vertical_flip ? START_DRAW_Y_VALUE : height);
        cr.lineTo(xPosition, vertical_flip ? END_DRAW_Y_VALUE : height - END_DRAW_Y_VALUE);
        cr.lineTo(xPosition, yPosition);
        cr.stroke();
      }

      cr.$dispose();
    }

    _update() {
      this._actor.queue_repaint();
    }

    /*
     * Utility Methods
     */
    _getMetaRectForCoords(x, y) {
      this.get_allocation_box();
      let rect = new Meta.Rectangle();
      [rect.x, rect.y] = [x, y];
      [rect.width, rect.height] = this.get_transformed_size();
      return rect;
    }

    _getWorkAreaForRect(rect) {
      let monitorIndex = global.display.get_monitor_index_for_rect(rect);
      return Main.layoutManager.getWorkAreaForMonitor(monitorIndex);
    }

    _keepOnScreen(x, y) {
      let rect = this._getMetaRectForCoords(x, y);
      let monitorWorkArea = this._getWorkAreaForRect(rect);
      let monitorRight = monitorWorkArea.x + monitorWorkArea.width;
      let monitorBottom = monitorWorkArea.y + monitorWorkArea.height;
      x = Math.min(Math.max(monitorWorkArea.x, x), monitorRight - rect.width);
      y = Math.min(Math.max(monitorWorkArea.y, y), monitorBottom - rect.height);
      return [x, y];
    }

    _removeMenuTimeout() {
      if (this._menuTimeoutId > 0) {
        GLib.source_remove(this._menuTimeoutId);
        this._menuTimeoutId = 0;
      }
    }

    _setPopupTimeout() {
      this._removeMenuTimeout();
      this._menuTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, POPUP_TIMEOUT, () => {
        this._menuTimeoutId = 0;
        this._popupMenu();
        return GLib.SOURCE_REMOVE;
      });
      GLib.Source.set_name_by_id(this._menuTimeoutId, '[visualizer] this.popupMenu');
    }

    /*
     * Getters, Setters
     */
    getStreams() {
      return new Promise((resolve, reject) => {
        this._streamId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
          let control = (MajorVersion < 43) ? Main.panel.statusArea.aggregateMenu._volume._control : Main.panel.statusArea.quickSettings._volume._control;
          if (control.get_state() == Gvc.MixerControlState.READY) {
            let streams = control.get_streams();
            (streams.length > 0) ? resolve(streams): reject(Error('failure'))
          }
          return GLib.SOURCE_REMOVE;
        });
      });
    }

    getDefaultSrc() {
      return new Promise((resolve, reject) => {
        this._defaultSrcId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
          let stream = (MajorVersion < 43) ? Main.panel.statusArea.aggregateMenu._volume._volumeMenu._output.stream : Main.panel.statusArea.quickSettings._volume._output.stream;
          (stream !== null) ? resolve(stream.get_name() + '.monitor'): reject(Error('failure'));
          return GLib.SOURCE_REMOVE;
        });
      });
    }

    getSpectBands() {
      let override = this._settings.get_boolean('spect-over-ride-bool');
      let values = this._settings.get_int('spect-over-ride');
      return (!override) ? this._spectBands : (values <= this._spectBands) ? values : this._spectBands
    }

    getDragActor() {}

    getDragActorSource() {
      return this;
    }

    setPosition() {
      if (this._ignorePositionUpdate)
        return;
      let [x, y] = this._settings.get_value('visualizer-location').deep_unpack();
      this.set_position(x, y);
      if (!this.get_parent())
        return;
      if (!this._isOnScreen(x, y)) {
        [x, y] = this._keepOnScreen(x, y);
        this.ease({
          x,
          y,
          duration: 150,
          mode: Clutter.AnimationMode.EASE_OUT_QUAD
        });
        this._ignorePositionUpdate = true;
        this._settings.set_value('visualizer-location', new GLib.Variant('(ii)', [x, y]));
        this._ignorePositionUpdate = false;
      }
    }

    /*
     * Lifecycle-related Methods
     */
    startRefreshLoop() {
      if (this._refreshLoopId !== null) {
        GLib.Source.remove(this._refreshLoopId);
      }
      this._refreshLoopId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this._refreshRate, () => {
        this._actor.queue_repaint();
        return true;
      });
    }

    settingsChanged() {
      this._settings.connect('changed::visualizer-location', () => this.setPosition());
      this._settings.connect('changed::total-spects-band', () => {
        this.actorInit();
        this._spectrum.set_property("bands", this._spectBands);
        this._update();
      });
      this._settings.connect('changed::visualizer-height', () => {
        this.actorInit();
        this._update();
      });
      this._settings.connect('changed::visualizer-width', () => {
        this.actorInit();
        this._update();
      });
      this._settings.connect('changed::spect-over-ride', () => this.getSpectBands());
      this._settings.connect('changed::spect-over-ride-bool', () => this.getSpectBands());
      this._settings.connect('changed::spects-line-width', () => this._update());
    }

    _removeSource(src) {
      if (src) {
        GLib.Source.remove(src);
        src = null;
      }
    }

    /*
     * Async Methods
     */
    async getMenuItems() {
      try {
        this._menuItems = [];
        let stream = await this.getStreams();
        for (let i = 0; i < stream.length; i++) {
          if (stream[i] instanceof Gvc.MixerSink) {
            this._menuItems.push(stream[i].get_name() + '.monitor');
          } else if (stream[i] instanceof Gvc.MixerSource) {
            this._menuItems.push(stream[i].get_name());
          }
        }
        if (this._menuItems.length > 0) {
          this._removeSource(this._streamId);
        }
      } catch (e) {
        logError(e);
      }
    }

    async setDefaultSrc() {
      try {
        this._defaultSrc = await this.getDefaultSrc();
        this._src.set_property('device', this._defaultSrc);
        if (this._defaultSrc !== undefined) {
          this._removeSource(this._defaultSrcId);
        }
      } catch (e) {
        logError(e);
      }
    }

    /*
     * Miscellaneous Methods
     */
    _popupMenu() {
      this._removeMenuTimeout();
      if (!this._menu) {
        this._subMenuItem = [];
        this._menu = new PopupMenu.PopupMenu(this, MENU_POSITION_Y, MENU_SIDE);
        let srcDevice = new PopupMenu.PopupSubMenuMenuItem('Change Audio Source');
        this._menu.addMenuItem(srcDevice);
        for (let i = 0; i < this._menuItems.length; i++) {
          let item = new PopupMenu.PopupMenuItem(this._menuItems[i]);
          item.connect('activate', () => {
            for (let k = 0; k < this._menuItems.length; k++) {
              this._subMenuItem[k].setOrnament(this._menuItems[i] == this._menuItems[k] ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);
            }
            this._src.set_property("device", this._menuItems[i]);
          });
          srcDevice.menu.addMenuItem(item, i);
          this._subMenuItem.push(item);
        }
        for (let k = 0; k < this._menuItems.length; k++) {
          this._subMenuItem[k].setOrnament(this._defaultSrc == this._menuItems[k] ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);
        }
        this._menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._menu.addAction("Visualizer Settings", () => {
          ExtensionUtils.openPrefs();
        });
        Main.uiGroup.add_actor(this._menu.actor);
        this._visualMenuManager.addMenu(this._menu);
      }
      this._menu.open();
      return false;
    }

    _isOnScreen(x, y) {
      let rect = this._getMetaRectForCoords(x, y);
      let monitorWorkArea = this._getWorkAreaForRect(rect);
      return monitorWorkArea.contains_rect(rect);
    }
  });
