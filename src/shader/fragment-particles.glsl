uniform float time;
uniform sampler2D tex;
varying float vAlpha;
varying vec3 vColor;
varying float vRot;

vec2 rotate(vec2 p, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  mat2 m = mat2(c, -s, s, c);
  return m * p;
}

void main() {
  vec2 coord = rotate(gl_PointCoord - vec2(0.5), vRot) + vec2(0.5); 
  vec4 texColor = texture2D(tex, coord);
  gl_FragColor = vec4(vColor, texColor.a * vAlpha * 0.7);
}