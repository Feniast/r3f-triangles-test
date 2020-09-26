uniform float time;
uniform sampler2D tex;

void main() {
  gl_FragColor = vec4(1.0, 1.0, 1.0, 0.6);
  vec4 texColor = texture2D(tex, gl_PointCoord);
  gl_FragColor = vec4(1.0, 1.0, 1.0, texColor.a);
}