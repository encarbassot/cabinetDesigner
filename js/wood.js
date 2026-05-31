'use strict';

const WOOD_PRESETS = [
  { label: 'Arce',    h: 0.076, s: 0.30, l: 0.76, hex: '#cdb896' },
  { label: 'Pino',    h: 0.076, s: 0.38, l: 0.63, hex: '#b89868' },
  { label: 'Roble',   h: 0.074, s: 0.40, l: 0.48, hex: '#8c6a3e' },
  { label: 'Nogal',   h: 0.072, s: 0.38, l: 0.32, hex: '#5e3e26' },
  { label: 'Ébano',   h: 0.070, s: 0.25, l: 0.17, hex: '#302218' },
  { label: 'Negro',   h: 0.070, s: 0.12, l: 0.09, hex: '#181310' },
];
let woodPresetIdx = 2;

(function initWoodPicker() {
  const wrap   = document.getElementById('wood-swatches');
  const toggle = document.getElementById('wood-toggle');

  function updateToggle() {
    toggle.style.background = WOOD_PRESETS[woodPresetIdx].hex;
    toggle.style.borderColor = 'rgba(0,0,0,0.18)';
  }

  WOOD_PRESETS.forEach((p, i) => {
    const sw = document.createElement('div');
    sw.className        = 'wood-swatch' + (i === woodPresetIdx ? ' active' : '');
    sw.style.background = p.hex;
    sw.title            = p.label;
    sw.addEventListener('click', () => {
      woodPresetIdx = i;
      wrap.querySelectorAll('.wood-swatch').forEach((s, j) =>
        s.classList.toggle('active', j === i));
      updateToggle();
      wrap.classList.remove('open');
      buildFurniture();
    });
    wrap.appendChild(sw);
  });

  updateToggle();
})();

function toggleWoodPicker(e) {
  e.stopPropagation();
  document.getElementById('wood-swatches').classList.toggle('open');
}

document.addEventListener('click', () => {
  document.getElementById('wood-swatches').classList.remove('open');
});

function currentWood() { return WOOD_PRESETS[woodPresetIdx]; }
