varying vec2 vUv;
uniform sampler2D image;
uniform sampler2D fg;

float overlay(float x, float y) {
	return (x < 0.5) ? (2.0 * x * y) : (1.0 - 2.0 * (1.0 - x) * (1.0 - y));
}

vec4 overlay(vec4 x, vec4 y, float opacity) {
	vec4 z = vec4(overlay(x.r, y.r), overlay(x.g, y.g), overlay(x.b, y.b), overlay(x.a, y.a));
	return z * opacity + x * (1.0 - opacity);
}

float screen(float a, float b) {
  return 1. - (1. - a) * (1. - b);
}

vec4 screen(vec4 x, vec4 y) {
  return vec4(screen(x.r, y.r), screen(x.g, y.g), screen(x.b, y.b), screen(x.a, y.a));
}

vec4 fBMix(vec4 f, vec4 b) {
  return vec4(f.rgb + b.rgb * pow(f.a, 2.), f.a);
}

void main() {
  vec4 fgColor = texture2D(fg, vUv);
  vec4 imageColor = texture2D(image, vUv);
  // vec4 overlayColor = overlay(fBMix(fgColor, imageColor), imageColor, 1.);
  // vec4 screenColor = screen(overlayColor, imageColor);
  // vec4 addColor = overlayColor + imageColor;
  // gl_FragColor = overlayColor;
  gl_FragColor = overlay(fgColor, imageColor, 1.);
}