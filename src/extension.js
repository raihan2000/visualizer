const { GLib} = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Visualizer = ExtensionUtils.getCurrentExtension().imports.visual.Visualizer;

var timeoutId;
var visual;

function init() {
}

function enable() {
	visual = new Visualizer()
	timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1, () => {
		visual.update();
		return GLib.SOURCE_CONTINUE;
	});
}

function disable() {
	if(timeoutId){
		GLib.Source.remove(timeoutId);
		tiemoutId = null;
	}
	visual.on_destroy();
	visual = null;
}
