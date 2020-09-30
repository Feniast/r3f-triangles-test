import React, {
  useRef,
  Suspense,
  useMemo,
  useLayoutEffect,
  useState,
  useEffect,
  useCallback,
} from "react";
import {
  Canvas,
  useFrame,
  ReactThreeFiber,
  extend,
  useThree,
  useUpdate,
  createPortal,
} from "react-three-fiber";
import * as THREE from "three";
import { OrbitControls, shaderMaterial, useTextureLoader, Html } from "drei";
import * as dat from "dat.gui";
import { useDeepMemo, useDeepCompareEffect } from "./useDeep";
import myVideo from "url:./assets/video.mp4";
import vertex from "./shader/vertex.glsl";
import fragment from "./shader/fragment.glsl";
import vertexParticles from "./shader/vertex-particles.glsl";
import fragmentParticles from "./shader/fragment-particles.glsl";
import { PlaneBufferGeometry, TypedArray } from "three";
import tri from "url:./assets/tri.png";
import mask1Image from "url:./assets/mask1.jpg";
import mask2Image from "url:./assets/mask2.jpg";
import mask3Image from "url:./assets/mask3.jpg";
import mask4Image from "url:./assets/mask4.jpg";
import image1 from "url:./assets/image1.jpg";
import image2 from "url:./assets/image2.jpg";
import image3 from "url:./assets/image3.jpg";
import image4 from "url:./assets/image4.jpg";
import useSWR from "swr";

interface DatGuiSetting {
  value: string | number | undefined;
  type?: "color" | undefined;
  min?: number;
  max?: number;
  step?: number;
}

const ImgShaderMaterial = shaderMaterial(
  {
    image: null,
    fg: null,
    progress: 0,
  },
  vertex,
  fragment
);

const BgShaderMaterial = shaderMaterial(
  {
    image: null,
    alpha: 1,
  },
  vertex,
  `
varying vec2 vUv;
uniform sampler2D image;
uniform sampler2D fg;
uniform float alpha;

void main() {
  vec4 c = texture2D(image, vUv);
  c.a = c.a * alpha;
  gl_FragColor = c;
}
`
);

const ParticlesShaderMaterial = shaderMaterial(
  {
    time: 0,
    tex: null,
    colors: null,
    pointSize: 1,
    progress: 0,
  },
  vertexParticles,
  fragmentParticles
);

extend({
  ParticlesShaderMaterial,
  ImgShaderMaterial,
  BgShaderMaterial,
});

declare global {
  namespace JSX {
    interface IntrinsicElements {
      particlesShaderMaterial: any;
      imgShaderMaterial: any;
      bgShaderMaterial: any;
    }
  }
}

const useDatGui = <T extends Record<string, DatGuiSetting>>(settings: T) => {
  const obj = useDeepMemo<Record<keyof T, DatGuiSetting["value"]>>(() => {
    const o = {} as Record<keyof T, DatGuiSetting["value"]>;
    Object.keys(settings).forEach((key) => {
      const setting = settings[key];
      const { value } = setting;
      o[key as keyof T] = value;
    });
    return o;
  }, [settings]);

  useDeepCompareEffect(() => {
    const inst = new dat.GUI();
    Object.keys(settings).forEach((key) => {
      const setting = settings[key];
      const { type, min, max, step } = setting;
      if (type === "color") {
        inst.addColor(obj, key);
      } else {
        inst.add(obj, key, min, max, step);
      }
    });
    return () => {
      inst.destroy();
    };
  }, [obj]);

  return obj;
};

interface UseImageDataOptions {
  scale?: number;
  image: string | HTMLImageElement;
}

const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.addEventListener("load", () => {
      resolve(i);
    });
    i.addEventListener("error", (e) => {
      reject(e);
    });
    i.src = src;
  });
};

const useImageData = (options: UseImageDataOptions) => {
  const canvas = useMemo(() => document.createElement("canvas"), []);
  const ctx = useMemo(() => canvas.getContext("2d"), [canvas]);
  const { image, scale = 1 } = options;
  const { data: img } = useSWR<HTMLImageElement>(
    ["image", image],
    (__, i) => {
      if (typeof i === "string") {
        return loadImage(i);
      }
      return i;
    },
    {
      suspense: true,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateOnMount: false,
    }
  );

  const imgData = useMemo(() => {
    if (!img) return null;
    canvas.width = img.naturalWidth * scale;
    canvas.height = img.naturalHeight * scale;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }, [scale]);

  return {
    image: img,
    data: imgData,
  };
};

const Colors = [
  new THREE.Color(0xffffff),
  new THREE.Color(255 / 255, 222 / 255, 101 / 255),
];

const random = (min: number, max: number, isInt = false) => {
  const r = Math.random() * (max - min) + min;
  return isInt ? Math.floor(r) : r;
};

const clamp = (v: number, min: number, max: number) => {
  return Math.min(max, Math.max(min, v));
};

const map = (
  v: number,
  s: number,
  t: number,
  a: number,
  b: number,
  clamped = true
) => {
  const r = a + ((v - s) / (t - s)) * (b - a);
  return clamped ? clamp(r, a, b) : r;
};

const getPixelColor = (data: TypedArray, x: number, y: number, width: number) => {
  const i = (x + y * width) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
};

interface PointsProps {
  maskScale?: number;
  speedScale?: number;
  pointScale?: number;
  pointsCanvasScale?: number;
  maskImage: string;
  image: string;
  sampleStep?: {
    x?: number;
    y?: number;
  };
}

const Points: React.FC<PointsProps> = (props) => {
  let {
    maskScale = 150 / 1920,
    speedScale = 0.0003,
    pointsCanvasScale = 1,
    pointScale = 1,
    maskImage,
    image,
    sampleStep = { x: 1, y: 1 },
  } = props;
  const { clock, size } = useThree();
  const { data: maskData, image: imgEl } = useImageData({
    image: maskImage,
    scale: maskScale,
  });

  let { x: xStep = 1, y: yStep = 1 } = sampleStep;
  xStep = Math.max(xStep, 1);
  yStep = Math.max(yStep, 1);

  const imageTexture = useTextureLoader(image) as THREE.Texture;

  const positionScale = 1 / maskData.height;

  const aspect = size.width / size.height;
  const imageAspect = maskData.width / maskData.height;

  const triTexture = useTextureLoader(tri);
  const speeds = useRef<number[] | undefined>();

  const settings = useDatGui({
    progress: {
      value: 1,
      min: 0,
      max: 1,
      step: 0.01,
    },
  });

  const geometry = useMemo(() => {
    const bufferGeo = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const starts: number[] = [];
    const alphas: number[] = [];
    const colors: number[] = [];
    const rot: number[] = [];
    speeds.current = [];
    const { width, height, data } = maskData;
    for (let i = 0; i < width; i += xStep) {
      for (let j = 0; j < height; j += yStep) {
        const p = data[(j * width + i) * 4];
        if (p === 255) {
          const x = (i - width * 0.5) * positionScale;
          const y = -(j - height * 0.5) * positionScale;
          const z = Math.random() * 0.6 + 0.4;
          vertices.push(x, y, z);
          starts.push(
            random(-1 * aspect, aspect),
            random(-1, 1),
            Math.random() * 0.6 + 0.7
          );
          alphas.push(Math.random() * 0.6 + 0.4);
          colors.push(random(0, Colors.length, true));
          rot.push(Math.random() * Math.PI * 2);
          speeds.current.push(Math.random() * speedScale * 0.5 + speedScale);
        }
      }
    }
    bufferGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3)
    );
    bufferGeo.setAttribute(
      "sPosition",
      new THREE.Float32BufferAttribute(starts, 3)
    );
    bufferGeo.setAttribute(
      "alpha",
      new THREE.Float32BufferAttribute(alphas, 1)
    );
    bufferGeo.setAttribute(
      "colorIdx",
      new THREE.Int8BufferAttribute(colors, 1)
    );
    bufferGeo.setAttribute("rot", new THREE.Float32BufferAttribute(rot, 1));
    return bufferGeo;
  }, [maskData]);

  const particlesMaterial = useRef<THREE.ShaderMaterial>();
  const imgMaterial = useRef<THREE.ShaderMaterial>();

  const update = () => {
    const position = geometry.attributes.position;
    const rot = geometry.attributes.rot;
    const posArr = (position as THREE.BufferAttribute).array;
    const rotArr = rot.array;
    const { width, height, data } = maskData;
    for (let i = 0; i < posArr.length; i += 3) {
      let x = posArr[i];
      let y = posArr[i + 1];
      let r = rotArr[i / 3];
      const speed = speeds.current[i / 3];

      let ix = x / positionScale + 0.5 * width;
      let iy = -y / positionScale + 0.5 * height;

      if (
        ix <= 0 ||
        ix >= width ||
        iy <= 0 ||
        iy >= height ||
        getPixelColor(data, ~~ix, ~~iy, width)[0] === 0
      ) {
        r += Math.PI;
      }

      x += speed * Math.cos(r);
      y += speed * Math.sin(r);
      (posArr as any)[i] = x;
      (posArr as any)[i + 1] = y;
      (rotArr as any)[i / 3] = r;
    }
    position.needsUpdate = true;
    rot.needsUpdate = true;
  };

  const pointsMesh = useRef<THREE.Points>();
  const imageMesh = useRef<THREE.Mesh>();
  useLayoutEffect(() => {
    const aspect = size.width / size.height;
    let s = 1;
    let y = 0;
    if (aspect > imageAspect) {
      s = aspect / imageAspect;
      y = (s - 1) * 0.5;
    }

    imageMesh.current.scale.set(s, s, s);
    imageMesh.current.position.y = y;
  }, [size.width, size.height, imageAspect]);

  const renderTarget = useMemo(
    () =>
      new THREE.WebGLRenderTarget(
        imgEl.naturalWidth * pointsCanvasScale,
        imgEl.naturalHeight * pointsCanvasScale,
        {
          // encoding: THREE.sRGBEncoding,
          // encoding: THREE.RGBEEncoding,
          format: THREE.RGBAFormat,
        }
      ),
    [imgEl, pointsCanvasScale]
  );
  const offScene = useMemo(() => new THREE.Scene(), []);
  const offCamera = useMemo(() => {
    const c = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1000);
    c.position.set(0, 0, 2);
    c.lookAt(0, 0, 0);
    return c;
  }, []);
  useLayoutEffect(() => {
    const aspect = imageAspect;
    offCamera.left = -1 * 0.5 * aspect;
    offCamera.right = 1 * 0.5 * aspect;
    offCamera.top = 1 * 0.5;
    offCamera.bottom = -1 * 0.5;
    offCamera.updateProjectionMatrix();
  }, [offCamera, imageAspect]);

  const offSceneContent = createPortal(
    <>
      {/* <primitive object={offCamera} /> */}
      <points
        position-z={0.001}
        ref={pointsMesh}
        geometry={geometry}
        visible={true}
      >
        <particlesShaderMaterial
          ref={particlesMaterial}
          depthWrite={false}
          depthTest={false}
          transparent
          attach="material"
          tex={triTexture}
          colors={Colors}
          pointSize={
            map(size.width, 400, 1200, 0.5, 1) * pointScale * pointsCanvasScale
          }
        />
      </points>
    </>,
    offScene
  );

  useFrame(({ gl }) => {
    particlesMaterial.current.uniforms.progress.value = settings.progress;
    particlesMaterial.current.uniforms.time.value = clock.elapsedTime;
    imgMaterial.current.uniforms.progress.value = settings.progress;
    if (settings.progress > 0) {
      update();
    }
    gl.setClearColor(0x000000, 0);
    gl.setRenderTarget(renderTarget);
    gl.render(offScene, offCamera);
    gl.setRenderTarget(null);
    gl.setClearColor(0x000000, 1);
    imgMaterial.current.needsUpdate = true;
  });

  return (
    <>
      {offSceneContent}
      <group>
        <mesh position-z={0.001} ref={imageMesh} visible={true}>
          <planeBufferGeometry args={[imageAspect, 1]} attach="geometry" />
          <imgShaderMaterial
            transparent
            attach="material"
            image={imageTexture}
            fg={renderTarget.texture}
            ref={imgMaterial}
          />
        </mesh>
      </group>
    </>
  );
};

const configs: PointsProps[] = [
  {
    image: image1,
    maskImage: mask1Image,
    sampleStep: {
      x: 1,
      y: 1,
    },
    pointScale: 1.8,
    pointsCanvasScale: 2,
    maskScale: 100 / 1920,
  },
  {
    image: image2,
    maskImage: mask2Image,
    sampleStep: {
      x: 1,
      y: 1,
    },
    pointScale: 2,
    pointsCanvasScale: 2,
    maskScale: 100 / 1920,
  },
  {
    image: image3,
    maskImage: mask3Image,
    sampleStep: {
      x: 1,
      y: 1,
    },
    pointScale: 2,
    pointsCanvasScale: 2,
    maskScale: 100 / 1920,
  },
  {
    image: image4,
    maskImage: mask4Image,
    sampleStep: {
      x: 1,
      y: 1,
    },
    maskScale: 100 / 1200,
    pointScale: 1,
    pointsCanvasScale: 2,
  },
];

const Scene = () => {
  return (
    <>
      <Points {...configs[3]} />
    </>
  );
};

const CameraSet: React.FC<any> = () => {
  const { size, setDefaultCamera } = useThree();
  const frustumSize = 1;
  const camera = useMemo(() => {
    const c = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1000);
    c.position.set(0, 0, 2);
    c.lookAt(0, 0, 0);
    setDefaultCamera(c);
    return c;
  }, []);
  useLayoutEffect(() => {
    const aspect = size.width / size.height;
    camera.left = -frustumSize * 0.5 * aspect;
    camera.right = frustumSize * 0.5 * aspect;
    camera.top = frustumSize * 0.5;
    camera.bottom = -frustumSize * 0.5;
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height]);

  return null;
};

const App = () => {
  return (
    <div id="canvas">
      <Canvas
        colorManagement
        updateDefaultCamera={false} // not update our custom camera
      >
        <CameraSet />
        <ambientLight intensity={0.5} />
        <OrbitControls />
        <Suspense
          fallback={
            <Html>
              <div>Loading</div>
            </Html>
          }
        >
          <Scene />
        </Suspense>
      </Canvas>
    </div>
  );
};

export default App;
