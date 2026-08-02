// jsdom implements no layout, so `Range` has none of the measurement methods
// CodeMirror calls on every measure pass (it sizes lines by measuring text
// ranges). Without these stubs the note editor throws from inside a
// requestAnimationFrame, which surfaces as an unhandled error in the suite.
const EMPTY_RECT: DOMRect = {
  x: 0,
  y: 0,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  width: 0,
  height: 0,
  toJSON: () => ({}),
}

if (typeof Range !== 'undefined') {
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () =>
      Object.assign([] as DOMRect[], { item: () => null }) as unknown as DOMRectList
  }
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = () => EMPTY_RECT
  }
}
