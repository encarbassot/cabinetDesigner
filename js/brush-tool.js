'use strict';

let activeBrush = null;

class BrushTool {
  get btnId()  { return null; }
  get cursor() { return 'crosshair'; }

  activate() {
    activeBrush = this;
    if (this.btnId) document.getElementById(this.btnId)?.classList.add('active');
    canvasArea.style.cursor = this.cursor;
    this.onActivate();
  }

  deactivate() {
    this.onDeactivate();
    if (this.btnId) document.getElementById(this.btnId)?.classList.remove('active');
    canvasArea.style.cursor = 'grab';
    activeBrush = null;
  }

  onActivate()              {}
  onDeactivate()            {}
  onMouseMove(cx, cy)       {}
  onMouseDown(cx, cy)       {}
  onMouseUp()               {}
}

function deactivateActiveBrush() {
  if (activeBrush) activeBrush.deactivate();
}
