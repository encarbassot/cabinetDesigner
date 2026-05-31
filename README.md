# PlyKit — Editor Visual 3D de Muebles

Editor de mobiliario modular en madera. Vanilla JS + Three.js. Sin bundler, sin framework.

---

## Estructura de archivos

### Raíz

| Archivo | Descripción |
|---|---|
| `index.html` | Esqueleto HTML puro. Contiene el markup (header, modales, canvas). No tiene CSS ni JS inline. Editar aquí si necesitas cambiar la estructura DOM. |
| `styles.css` | Todos los estilos. Editar aquí para cambiar colores, tipografía, layout, animaciones o cualquier aspecto visual. |
| `sketch.js` | Modelo de datos del mueble (`furniture`) y toda la geometría matemática: cálculo de anchuras, posiciones de paredes, centros de baldas, helpers de mutación. **No toca el DOM ni Three.js.** Editar aquí para cambiar la lógica de dimensiones o añadir nuevas propiedades al modelo. |

### `js/` — Módulos de la aplicación

Los scripts se cargan en este orden. Las variables globales de un script son accesibles en los scripts siguientes.

| Archivo | Descripción |
|---|---|
| `js/wood.js` | Presets de madera (`WOOD_PRESETS`), índice activo (`woodPresetIdx`), inicialización de los swatches de color, función `currentWood()`. Editar aquí para añadir/cambiar maderas o el selector visual. |
| `js/renderer.js` | Inicialización de Three.js: `renderer`, `scene`, `camera`, luces, suelo, backdrop. Cámara esférica (`sph`, `target`), `applyCameraPos()`, `resetCamera()`, `updateBackdrop()`. Editar aquí para cambiar iluminación, fondo, niebla o la cámara. |
| `js/view-mode.js` | Gestión de modos de vista: `setView('3d'|'2d'|'pretty')`, `setViewMode('tech'|'pretty')`, `onResize()`. Registra el listener de `resize`. Editar aquí para cambiar el comportamiento del toggle de vistas o el modo bonito/técnico. |
| `js/slab-links.js` | Sistema de baldas enlazadas. `slabLinks` (array de pares de baldas sincronizadas), snap threshold (`SNAP_THRESH = 10 cm`), `getSlabAbsY()`, `getLinkedChain()`, `buildLockButtons()`, `positionLockButtons()`, `unlinkSlabs()`. Editar aquí para cambiar la lógica de sincronización o el snap entre baldas. |
| `js/furniture3d.js` | Construcción del mueble 3D: `buildFurniture()` destruye y recrea todos los meshes de paredes y baldas. Selección de piezas (`selectMesh`, `deselectCurrent`), botones overlay (+/−), covers de compartimentos con etiqueta de dimensión. Editar aquí para cambiar la geometría 3D, materiales o interacciones de los botones de columnas/baldas. |
| `js/columns-ui.js` | Panel de gestión de columnas. `updateColumnsUI()` reconstruye la lista de columnas con inputs, botones de pin y borrado. Lógica de pin total/por columna (`pinnedTotal`, `pinnedCols`), redistribución proporcional, `insertSlabAbove()`. Editar aquí para cambiar la UI de columnas o la lógica de anchuras proporcionales. |
| `js/config-modal.js` | Modal de dimensiones iniciales (alto, ancho, fondo, grosor). `openCfgModal()`, `closeCfgModal()`, `applyCfgModal()`, `toggleCfgLock()`. `lockedDimensions` bloquea arrastre de paredes/baldas. Editar aquí para añadir nuevos campos de configuración o cambiar el comportamiento de los bloqueos. |
| `js/storage.js` | Adaptador de localStorage. CRUD de proyectos (`_getProjects`, `_setProjects`), serialización del estado (`_currentStateSnapshot`, `_applyState`), `saveState()`, `loadState()`, migración del formato legacy. Editar aquí para cambiar qué se persiste o migrar a otro backend de almacenamiento. |
| `js/interaction3d.js` | Todos los eventos del canvas 3D: arrastre de paredes y baldas, órbita de cámara, zoom con rueda, hover y selección por raycast. `clamp()` (utilidad usada también en `plan2d.js`). Editar aquí para cambiar cómo el usuario interactúa con la vista 3D. |
| `js/plan2d.js` | Vista 2D (planta). `drawPlan()` renderiza el blueprint completo en un `<canvas>`. Arrastre de paredes y baldas en 2D, edición inline de cotas al hacer click, hit-test. Editar aquí para cambiar la representación 2D o las interacciones del plano. |
| `js/projects.js` | Menú de archivo (dropdown). Lista de proyectos, renombrar, abrir, borrar, exportar/importar JSON. Editar aquí para cambiar la gestión de proyectos o añadir formatos de exportación. |
| `js/app.js` | Punto de entrada. Loop de animación (`requestAnimationFrame`), carga del estado inicial, arranque de la UI. Es el último script en cargarse. Editar aquí solo si necesitas cambiar el flujo de inicialización. |

---

## Orden de dependencias

```
three.min.js (CDN)
  └─ sketch.js          (modelo de datos, sin deps de DOM/Three)
       └─ js/wood.js
            └─ js/renderer.js
                 └─ js/view-mode.js
                      └─ js/slab-links.js
                           └─ js/furniture3d.js
                                └─ js/columns-ui.js
                                     └─ js/config-modal.js
                                          └─ js/storage.js
                                               └─ js/interaction3d.js
                                                    └─ js/plan2d.js
                                                         └─ js/projects.js
                                                              └─ js/app.js
```

No hay sistema de módulos ES: cada archivo usa `'use strict'` y expone sus funciones/variables al scope global. Los scripts posteriores pueden usar todo lo definido en scripts anteriores.

---

## Convenciones

- `CM = 0.1` — factor de escala: 1 unidad Three.js = 10 cm
- `furniture.columnWidths[i]` — anchura útil de la columna i (sin grosor de tabiques)
- `furniture.columnSlabs[i]` — array de alturas relativas de las baldas de la columna i (de abajo a arriba)
- `slabLinks` — array de `{ bayA, relIdxA, bayB, relIdxB }` que sincroniza baldas entre columnas
