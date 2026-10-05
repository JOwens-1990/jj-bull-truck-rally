# JJ’s Bull Truck Rally

An original, kid-friendly browser game imagined by JJ: colorful bull-shaped monster trucks, ramps, lava jumps, races, and self-driving adventures.

- Eight truck colors and 50 levels across five worlds.
- Race three computer-controlled trucks or explore at your own pace.
- Keyboard, touch buttons, optional hand control, and self-drive.
- Friendly rescues, collectible stars, sound effects, and device-local progress.
- No accounts, ads, analytics, payments, or backend required.

## Controls

Hold **DRIVE**, Right Arrow, or D to move. **BRAKE**, Left Arrow, or A slows down. **JUMP**, Space, Up Arrow, or W gives a hop. P or Escape pauses. Ramps automatically launch the truck when it has enough speed.

Choose **Hand control** during a game to enable the camera. Open a palm to drive, make a fist to brake, and lift an open hand quickly to jump. Camera frames are processed on the device; the game does not record or upload them. This mode needs HTTPS, permission, a working camera, and an initial download of MediaPipe runtime/model assets. Ordinary controls stay available.

## Build and test

Requires Node 20 or newer; there are no package dependencies.

```sh
npm test
npm run build
```

Publish `dist/` as a static site. `render.yaml` includes the Render configuration and response headers. Automatic deployments are disabled by default.

## Notes

All truck artwork is drawn with Canvas. Progress saves in this browser only and may be cleared with browser data. The game is designed for phone, tablet, and desktop layouts; real hand tracking varies with device performance and lighting.

Hand tracking uses pinned `@mediapipe/tasks-vision@0.10.21` and the Hand Landmarker `float16/1` model. See [Google’s Hand Landmarker guide](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js).
