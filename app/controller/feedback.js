export function vibrateShort() {
  if ("vibrate" in navigator) {
    navigator.vibrate(100);
  }
}

export function vibrateDouble() {
  if ("vibrate" in navigator) {
    navigator.vibrate([80, 50, 80]);
  }
}