# Open 3-D models

Drop a **glTF 2.0 binary** file here named after an enemy type and the game uses it
instead of that type's procedural body:

```
assets/models/imp.glb
assets/models/grunt.glb
assets/models/brute.glb
assets/models/hound.glb
assets/models/spitter.glb
assets/models/wisp.glb
assets/models/warden.glb
```

## What happens

- The file is fetched at boot, parsed by `play/src/glb.js` (200 lines, no library),
  and scaled uniformly to that type's height in `TYPES`.
- The procedural rig stays the default. No file, a 404, or a file the reader cannot
  handle: nothing changes and nothing breaks.
- A model has no joints, so the walk cycle and the pose blend skip it. It will
  translate, rotate and flash on a hit, and that is all.

## What the reader supports

| Supported | Not supported |
| --- | --- |
| The `.glb` container (JSON + BIN chunks) | `.gltf` with external buffers |
| `POSITION`, `NORMAL`, `TEXCOORD_0` | Skinning, bones, animation |
| Indices in u8 / u16 / u32 | Morph targets |
| Node transforms, baked into the geometry | Textures (a material's base colour only) |

A model that needs any of the "not supported" column needs the official
`GLTFLoader` from three's examples, which is a 4,600-line dependency this project
does not otherwise have.

## Where to get models

Any CC0 or CC-BY pack works — Quaternius, Kenney, Poly Pizza. Check the licence
before committing one: this repository is PolyForm Noncommercial, and a model's
licence has to allow what the repository allows.
