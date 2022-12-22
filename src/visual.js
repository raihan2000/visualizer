const { Clutter, GObject, GLib, Gio, St, Gdk, Gst } = imports.gi;
const DND = imports.ui.dnd;
const Cairo		 = imports.cairo;
const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;

var Visualizer = GObject.registerClass(
class musicVisualizer extends St.BoxLayout {
		_init() {
			super._init({
				reactive: true,
			});
			this._freq = [];
			this._settings = ExtensionUtils.getSettings();
			this._settings.connect('changed::visualizer-location', () => this.setPosition());

      this._draggable = DND.makeDraggable(this)
      this._draggable._animateDragEnd = (eventTime) => {
          this._draggable._animationInProgress = true;
          this._draggable._onAnimationComplete(this._draggable._dragActor, eventTime);
        };
      this._draggable.connect('drag-begin', this._onDragBegin.bind(this));
      this._draggable.connect('drag-end', this._onDragEnd.bind(this));

			this.actor_init();
			this.setupGst();
			this.update();
			this.setPosition();
			Main.layoutManager._backgroundGroup.add_child(this);
		}

		setupGst() {
			Gst.init(null);
			this._pipeline = Gst.parse_launch("pulsesrc device=alsa_output.pci-0000_00_1b.0.analog-stereo.monitor !spectrum bands="+this._spectBands+" threshold=-80 message-phase=true post-messages=true ! fakesink");
			let bus = this._pipeline.get_bus();
			bus.add_signal_watch();
			bus.connect('message::element', (bus, msg) => this.on_message(bus, msg));

			this._pipeline.set_state(Gst.State.PLAYING);
		}

		on_message(bus, msg) {
				let struct = msg.get_structure();

				let [magbool, magnitudes] = struct.get_list("magnitude");
				let [phasebool, phases] = struct.get_list("phase");

				for(let i=0;i<this._spectBands;++i) {
					this._freq[i] = magnitudes.get_nth(i)*-1;
				}

//				if(struct.get_name() == "spectrum") {}
		}

		actor_init() {
			this._spectBands = 70;
			this._spectHeight = 200;
			this._actor = new St.DrawingArea({
				width: 720,
				height: this._spectHeight
			});
			this.add_child(this._actor);
			this._actor.connect('repaint', (area) => this.drawStuff(area));
		}
		
		drawStuff(area) {
			let [width, height] = area.get_surface_size();
			let cr = area.get_context();

			for(let i=0;i<this._freq.length-6;i++){
				cr.setSourceRGBA(1,this._freq[i]/80,1,1);
				cr.setLineWidth(5);
				cr.moveTo(2.5+i*width/this._spectBands-6,height);
				cr.lineTo(2.5+i*width/this._spectBands-6,height * this._freq[i]/80);
				cr.stroke();
			}
			cr.$dispose();
		}
		
		update() {
			this._actor.queue_repaint();
		}
		
    _getMetaRectForCoords(x, y){
        this.get_allocation_box();
        let rect = new Meta.Rectangle();
    
        [rect.x, rect.y] = [x, y];
        [rect.width, rect.height] = this.get_transformed_size();
        return rect;
    }
    
    _getWorkAreaForRect(rect){
        let monitorIndex = global.display.get_monitor_index_for_rect(rect);
        return Main.layoutManager.getWorkAreaForMonitor(monitorIndex);
    }

    _isOnScreen(x, y){
        let rect = this._getMetaRectForCoords(x, y);
        let monitorWorkArea = this._getWorkAreaForRect(rect);

        return monitorWorkArea.contains_rect(rect);
    }

    _keepOnScreen(x, y){
        let rect = this._getMetaRectForCoords(x, y);
        let monitorWorkArea = this._getWorkAreaForRect(rect);

        let monitorRight = monitorWorkArea.x + monitorWorkArea.width;
        let monitorBottom = monitorWorkArea.y + monitorWorkArea.height;

        x = Math.min(Math.max(monitorWorkArea.x, x), monitorRight - rect.width);
        y = Math.min(Math.max(monitorWorkArea.y, y), monitorBottom - rect.height);

        return [x, y];
    }

    setPosition(){
        if(this._ignorePositionUpdate)
            return;

        let [x, y] = this._settings.get_value('visualizer-location').deep_unpack();
        this.set_position(x, y);

        if(!this.get_parent())
            return;

        if(!this._isOnScreen(x, y)){
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
        this.deltaX = dragEvent.x - ( dragEvent.x - this.oldX );
        this.deltaY = dragEvent.y - ( dragEvent.y - this.oldY );

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

    getDragActor() {
    }

    getDragActorSource() {
        return this;
    }
    
    on_destroy() {
    	this._pipeline.set_state(Gst.State.NULL);
    	Main.layoutManager._backgroundGroup.remove_child(this);
    }
});
