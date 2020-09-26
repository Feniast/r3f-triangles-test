varying vec2 vUv;
uniform sampler2D image;
uniform vec4 resolution;

void main() {
  vec2 newUV = (vUv - vec2(0.5)) * resolution.zw + vec2(0.5);
  gl_FragColor = vec4(vUv, 0.0, 1.0);
  gl_FragColor = texture2D(image, newUV);
}