varying vec2 vUv;
uniform sampler2D image;
uniform sampler2D fg;

float overlay(float x, float y) {
	return (x < 0.5) ? (2.0 * x * y) : (1.0 - 2.0 * (1.0 - x) * (1.0 - y));
}

vec4 overlayBlending(vec4 x, vec4 y, float opacity) {
	vec4 z = vec4(overlay(x.r, y.r), overlay(x.g, y.g), overlay(x.b, y.b), overlay(x.a, y.a));
	return z * opacity + x * (1.0 - opacity);
}

void main() {
  gl_FragColor = texture2D(image, vUv);
}