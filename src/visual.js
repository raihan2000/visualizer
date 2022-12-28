const { Clutter, GObject, GLib, Gio, St, Gdk, Gst, Meta, Shell } = imports.gi;
const DND = imports.ui.dnd;
const Cairo = imports.cairo;
const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const Decoder = new TextDecoder();

var Visualizer = GObject.registerClass(
  class musicVisualizer extends St.BoxLayout {
    _init() {
      super._init({
        reactive: true,
        track_hover: true,
        can_focus: true
      });
      this._visualMenuManager = new PopupMenu.PopupMenuManager(this);
      this._menuItems = this.getMenuItem();
      this._freq = [];
      this._actor = new St.DrawingArea();
      this.add_child(this._actor);
      this._settings = ExtensionUtils.getSettings();
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
      this._update();
      this.setPosition();
      Main.layoutManager._backgroundGroup.add_child(this);
    }

    setupGst() {
      Gst.init(null);
      this._pipeline = Gst.Pipeline.new("bin");
      this._src = Gst.ElementFactory.make("pulsesrc", "src");
      this._src.set_property("device", this._menuItems[0]);
      this._spectrum = Gst.ElementFactory.make("spectrum", "spectrum");
      this._spectrum.set_property("bands", this._spectBands);
      this._spectrum.set_property("threshold", -80);
      this._spectrum.set_property("post-messages", true);
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

    onMessage(bus, msg) {
      let struct = msg.get_structure();
      let [magbool, magnitudes] = struct.get_list("magnitude");
      if (!magbool) {
        print('No magnitudes');
      }
      else {
        for (let i = 0; i < this._spectBands; ++i) {
          this._freq[i] = magnitudes.get_nth(i) * -1;
        }
      }
    }

    actorInit() {
      this._spectBands = this._settings.get_int('total-spects-band');
      this._spectHeight = this._settings.get_int('visualizer-height');
      this._spectWidth = this._settings.get_int('visualizer-width');
      this._actor.height = this._spectHeight;
      this._actor.width = this._spectWidth;
    }

    drawStuff(area) {
      let [width, height] = area.get_surface_size();
      let cr = area.get_context();
      let lineW = this._settings.get_int('spects-line-width');
      for (let i = 0; i < this._freq.length; i++) {
        cr.setSourceRGBA(1, this._freq[i] / 80, 1, 1);
        cr.setLineWidth(lineW);
        cr.moveTo(lineW / 2 + i * width / this._spectBands, height);
        cr.lineTo(lineW / 2 + i * width / this._spectBands, height * this._freq[i] / 80);
        cr.stroke();
      }
      cr.$dispose();
    }

    _update() {
      this._actor.queue_repaint();
    }

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

    _isOnScreen(x, y) {
      let rect = this._getMetaRectForCoords(x, y);
      let monitorWorkArea = this._getWorkAreaForRect(rect);
      return monitorWorkArea.contains_rect(rect);
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

    _onDragMotion(dragEvent) {
      this.deltaX = dragEvent.x - (dragEvent.x - this.oldX);
      this.deltaY = dragEvent.y - (dragEvent.y - this.oldY);
      let p = this.get_transformed_position();
      this.oldX = p[0];
      this.oldY = p[1];
      return DND.DragMotionResult.CONTINUE;
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

    getDragActor() {}

    getDragActorSource() {
      return this;
    }

    getMenuItem() {
      try {
        let [ok, out, err, exit] = GLib.spawn_command_line_sync(`sh -c "pactl list | grep -A2 'Source #' | grep 'Name: ' | cut -d' ' -f2"`);
        if (out.length > 0) {
          return Decoder.decode(out).trim().split('\n');
        }
      }
      catch (e) {
        logError(e);
      }
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

    _onHover() {
      if (!this.hover)
        this._removeMenuTimeout();
    }

    _removeMenuTimeout() {
      if (this._menuTimeoutId > 0) {
        GLib.source_remove(this._menuTimeoutId);
        this._menuTimeoutId = 0;
      }
    }

    _setPopupTimeout() {
      this._removeMenuTimeout();
      this._menuTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 600, () => {
        this._menuTimeoutId = 0;
        this._popupMenu();
        return GLib.SOURCE_REMOVE;
      });
      GLib.Source.set_name_by_id(this._menuTimeoutId, '[visualizer] this.popupMenu');
    }

    _popupMenu() {
      this._removeMenuTimeout();
      if (!this._menu) {
        this._subMenuItem = [];
        this._menu = new PopupMenu.PopupMenu(this, 0.5, St.Side.TOP);
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
          this._subMenuItem[k].setOrnament(this._menuItems[0] == this._menuItems[k] ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);
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

    onDestroy() {
      if (this._menuTimeoutId) {
        GLib.Source.remove(this._menuTimeoutId);
        this._menuTimeoutId = null;
      }
      this._pipeline.set_state(Gst.State.NULL);
      Main.layoutManager._backgroundGroup.remove_child(this);
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
      this._settings.connect('changed::spects-line-width', () => this._update());
    }
  });
