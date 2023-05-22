const { Clutter, GObject, GLib, Gio, St, Gdk, Gst, Gvc, Meta, Shell } = imports.gi;
const Main = imports.ui.main;
const ExtensionUtils = imports.misc.extensionUtils;
const Visual = ExtensionUtils.getCurrentExtension().imports.visual;

let panelTop;
let panelBottom;
let panelLeft;
let panelRight;
let pipeline;
let container;
let new_container;

function init() {

/**
  let monitor = Main.layoutManager.primaryMonitor;

  panel = new St.BoxLayout({
    reactive: true,
    can_focus: true,
    track_hover: true,
  });

  container = new St.Bin({
    style: 'background-color: gold',
    reactive : true,
    can_focus : true,
    track_hover : true,
    width: 30,
    height: monitor.height,
  });
  
  new_container = new St.Bin({
    style: 'background-color: white',
    reactive: true,
    can_focus: true,
    track_hover: true,
    width: 400,
    height: monitor.height
  });
  
  panel.set_position(monitor.width-container.width, 0);
  panel.add_child(container);
  panel.add_child(new_container);
  
  container.connect("button-press-event", () => {
    let [xPos, yPos] = panel.get_position();
    let newX = (xPos === monitor.width-(container.width+new_container.width)) ? monitor.width-container.width : (monitor.width-(container.width+new_container.width));
    panel.ease({
    x: newX,
    duration: 2000,
    mode: Clutter.AnimationMode.EASE_OUT,
    onComplete: () => {
      log('Animation is finished');
    }
    });
  });
**/
}

function enable() {
  pipeline = new Visual.pipeline();
  pipeline.run();
  
  panelTop = new Visual.visualizer(pipeline);
  panelTop._flip = true;
  panelTop.set_position(0,0);

  panelBottom = new Visual.visualizer(pipeline);
  
  panelLeft = new Visual.visualizer(pipeline);
  panelLeft._horizontal = true;
  panelLeft._flip = true;
  panelLeft._actor.height = Main.layoutManager.primaryMonitor.height;
  panelLeft._actor.width = 80;
  panelLeft.set_position(0,0);

  panelRight = new Visual.visualizer(pipeline);
  panelRight._horizontal = true;
  panelRight._flip = false;
  panelRight._actor.height = Main.layoutManager.primaryMonitor.height;
  panelRight._actor.width = 80;
  panelRight.set_position(Main.layoutManager.primaryMonitor.width-panelRight._actor.width,0);

  Main.layoutManager.addChrome(panelTop, {
    affectsInputRegion : false,
    affectsStruts : false,
    trackFullscreen : false,
  });

Main.layoutManager.addChrome(panelBottom, {
    affectsInputRegion : false,
    affectsStruts : false,
    trackFullscreen : false,
  });
  
Main.layoutManager.addChrome(panelLeft, {
    affectsInputRegion : false,
    affectsStruts : false,
    trackFullscreen : false,
  });
  
Main.layoutManager.addChrome(panelRight, {
    affectsInputRegion : false,
    affectsStruts : false,
    trackFullscreen : false,
  });
}

function disable() {
  pipeline.stop();
  panelBottom.onDestroy();
  panelTop.onDestroy();
  Main.layoutManager.removeChrome(panelTop);
  Main.layoutManager.removeChrome(panelBottom);
  Main.layoutManager.removeChrome(panelLeft);
  Main.layoutManager.removeChrome(panelRight);
  panelTop = null;
  panelBottom = null;
  panelLeft = null;
  panelRight = null;
}
