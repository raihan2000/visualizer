const { Clutter, GObject, GLib, Gio, St, Gdk, Gst, Gvc, Meta, Shell } = imports.gi;
const DND = imports.ui.dnd;
const Cairo = imports.cairo;
const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const Config = imports.misc.config;
const [major, minor] = Config.PACKAGE_VERSION.split('.').map(s => Number(s));

var pipeline = class Pipeline {
    constructor() {
    this.monitor = Main.layoutManager.primaryMonitor;
    this._freq = [];
    this._dupFreq = [];
    this._sources = [];
    this._spectBands = 128;//this._settings.get_int('total-spects-band');
    }
    
    run(){
        this.setupGst();
    }
    
    get spectB(){
        return this._spectBands;
    }
    
    get doubleArray(){
        return this._dupFreq;
    }
    
    setupGst() {
      Gst.init(null);
      this._pipeline = Gst.Pipeline.new("bin");
      this._src = Gst.ElementFactory.make("pulsesrc", "src");
      this.setDefaultSrc();
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
      } else {
        for (let i = 0; i < this._spectBands; ++i) {
            for (let j=i; j < this._spectBands * 2 / 3; ++j){
                if(i == this._spectBands * 2/3){
                    break;
                } else {
                    this._freq[j] = magnitudes.get_nth(j) * -1;
                }
            }
        }
        if (this._freq.length > 1){
            this._createdup(this._freq,this._dupFreq, this._spectBands * 4/3);
        }
      }
    }
    
    async setDefaultSrc() {
      try {
        this._defaultSrc = await this.getDefaultSrc();
        this._src.set_property('device', this._defaultSrc);
      } catch (e) {
        logError(e);
      }
    }

    getDefaultSrc() {
      return new Promise((resolve, reject) => {
        this._defaultSrcId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
          let stream = (major < 43) ? Main.panel.statusArea.aggregateMenu._volume._volumeMenu._output.stream : Main.panel.statusArea.quickSettings._volume._output.stream;
          (stream !== null) ? resolve(stream.get_name() + '.monitor'): reject(Error('failure'));
          return GLib.SOURCE_REMOVE;
        });
        this._sources.push(this._defaultSrcId);
      });
    }
    
    _createdup(freq, dupfreq, bands){
        for (let i=0;i< bands;i++){
            if(i < freq.length){
                dupfreq[i] = freq[freq.length-1-i];
            } else {
                dupfreq[i] = freq[i-freq.length];
            }
        }
    }
    
    stop() {
      this._removeSources(this._sources);
      this._pipeline.get_bus().remove_signal_watch();
      this._pipeline.set_state(Gst.State.NULL);
    }
    
    _removeSources(src) {
      for(let i=0; i<src.length; i++) {
        if (src[i]) {
            GLib.Source.remove(src[i]);
            src[i] = null;
        }
      }
    }
}

var visualizer = GObject.registerClass(
  class musicVisualizer extends St.BoxLayout {
    _init(pipeline) {
      super._init({
        reactive: false,
        track_hover: false,
        can_focus: false
      });
      this._flip = false;
      this._horizontal = false;
      this._pipeline = pipeline;
      this.monitor = Main.layoutManager.primaryMonitor;
      this._sources = [];
      this._actor = new St.DrawingArea();
      this.add_child(this._actor);
      this.actorInit();
      this._actor.connect('repaint', (area) => this.drawStuff(area));
      this.set_position(0,this.monitor.height-this._actor.height);
      this._update();
    }

    actorInit() {
      this._actor.height = 80;
      this._actor.width = this.monitor.width;
    }

    drawStuff(area) {
      let values = 128*4/3;//this.getSpectBands();
      let [width, height] = area.get_surface_size();
      let cr = area.get_context();
      let lineW = 3;//this._settings.get_int('spects-line-width');
      //let flip = false;//this._settings.get_boolean('flip-visualizer');

      let freq = this._pipeline.doubleArray;

        if(!this._horizontal){
            for (let i = 0; i < values; i++) {
                let startX = lineW / 2 + i * width / values;
                let endY = height * freq[i] / 80;
                cr.setSourceRGBA(1, freq[i] / 80, 1, 1);
                cr.setLineWidth(lineW);
                if (!this._flip) {
                    cr.moveTo(startX, height);
                    cr.lineTo(startX, endY);
//                    cr.lineTo(startX, height - 1);
                } else {
                    cr.moveTo(startX, 0);
//                    cr.lineTo(startX, 1);
                    cr.lineTo(startX, height / 80 * (80 - freq[i]));
                }
                    cr.stroke();
            }
        } else {
            for (let i =0; i< values; i++) {
                let startY = lineW /2+ i* height/values;
                let endX = width * freq[i]/80;
                cr.setSourceRGBA(1, freq[i]/80,1,1);
                cr.setLineWidth(lineW);
                if(!this._flip){
                    cr.moveTo(width,startY);
                    cr.lineTo(endX,startY);
                } else {
                    cr.moveTo(0,startY);
                    cr.lineTo(width/80*(80-freq[i]), startY);
                }
                cr.stroke();
            }
        }
        cr.$dispose();
    }

    _update() {
        this._mainTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, (1*10), () => {
            this._actor.queue_repaint();
            return GLib.SOURCE_CONTINUE;
        });
        this._sources.push(this._mainTimeoutId);
    }

    getStreams() {
      return new Promise((resolve, reject) => {
        this._streamId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
          let control = (major < 43) ? Main.panel.statusArea.aggregateMenu._volume._control : Main.panel.statusArea.quickSettings._volume._control;
          if (control.get_state() == Gvc.MixerControlState.READY) {
            let streams = control.get_streams();
            (streams.length > 0) ? resolve(streams): reject(Error('failure'))
          }
          return GLib.SOURCE_REMOVE;
        });
        this._sources.push(this._streamId);
      });
    }

    onDestroy() {
      this._removeSources(this._sources);
    }

    _removeSources(src) {
      for(let i=0; i<src.length; i++) {
        if (src[i]) {
            GLib.Source.remove(src[i]);
            src[i] = null;
        }
      }
    }
  });
