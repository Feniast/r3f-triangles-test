varying vec2 vUv;
uniform sampler2D image;
uniform sampler2D fg;
uniform float progress;

float overlay(float x, float y) {
	return (x < 0.5) ? (2.0 * x * y) : (1.0 - 2.0 * (1.0 - x) * (1.0 - y));
}

vec4 overlay(vec4 x, vec4 y, float opacity) {
	vec4 z = vec4(overlay(x.r, y.r), overlay(x.g, y.g), overlay(x.b, y.b), overlay(x.a, y.a));
	return z * opacity + x * (1.0 - opacity);
}

vec4 screen(vec4 x, vec4 y, float opacity) {
  return (1.0 - (1.0 - x) * (1.0 - y)) * opacity + x * (1.0 - opacity);
}

vec4 lighten(vec4 x,  vec4 y, float opacity) {
	return max(x, y) * opacity + x * (1.0 - opacity);
}

vec4 Mix(vec4 f, vec4 b) {
  return vec4(f.rgb + b.rgb * (1. - f.a), max(f.a, b.a));
}

void main() {
  vec4 fgColor = texture2D(fg, vUv);
  vec4 imageColor = texture2D(image, vUv);
  vec4 mixColor = Mix(fgColor, imageColor);
  // gl_FragColor = overlay(fgColor, imageColor, 1.);
  gl_FragColor = overlay(mixColor, imageColor, 0.9);
  // gl_FragColor = overlay(imageColor, mixColor, 1.);
  // gl_FragColor = fgColor;
  gl_FragColor.a = gl_FragColor.a * progress;
}