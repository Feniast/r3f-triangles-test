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
import { PlaneBufferGeometry } from "three";
import tri from "url:./assets/tri.png";
import mask1Image from "url:./assets/mask1.jpg";
import mask2Image from "url:./assets/mask2.jpg";
import mask3Image from "url:./assets/mask3.jpg";
import image1 from "url:./assets/image1.jpg";
import image2 from "url:./assets/image2.jpg";
import image3 from "url:./assets/image3.jpg";
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
  },
  vertex,
  fragment,
  () => null
);

const ParticlesShaderMaterial = shaderMaterial(
  {
    time: 0,
    tex: null,
    colors: null,
  },
  vertexParticles,
  fragmentParticles,
  () => null
);

extend({
  ParticlesShaderMaterial,
  ImgShaderMaterial,
});

declare global {
  namespace JSX {
    interface IntrinsicElements {
      particlesShaderMaterial: any;
      imgShaderMaterial: any;
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
  new THREE.Color(247 / 255, 203 / 255, 105 / 255),
];

const random = (min: number, max: number, isInt = false) => {
  const r = Math.random() * (max - min) + min;
  return isInt ? Math.floor(r) : r;
};

const getPixelColor = (imageData: ImageData, x: number, y: number) => {
  const { width, data } = imageData;
  const i = (x + y * width) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
};

interface PointsProps {
  imageScale?: number;
  speedScale?: number;
  maskImage: string;
  image: string;
  sampleStep?: {
    x?: number;
    y?: number;
  };
}

const Points: React.FC<PointsProps> = (props) => {
  let {
    imageScale = 100 / 1920,
    speedScale = 0.0006,
    maskImage,
    image,
    sampleStep = { x: 1, y: 1 },
  } = props;
  const { clock, size, camera } = useThree();
  const { data: maskData, image: imgEl } = useImageData({
    image: maskImage,
    scale: imageScale,
  });

  let { x: xStep = 1, y: yStep = 1 } = sampleStep;
  xStep = Math.max(xStep, 1);
  yStep = Math.max(yStep, 1);

  const imageTexture = useTextureLoader(image);

  const positionScale = 1 / maskData.height;

  const aspect = size.width / size.height;
  const imageAspect = maskData.width / maskData.height;

  const triTexture = useTextureLoader(tri);
  const speeds = useRef<number[] | undefined>();

  const geometry = useMemo(() => {
    const bufferGeo = new THREE.BufferGeometry();
    const vertices: number[] = [];
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
          const z = Math.random() * 0.5 + 0.7;
          vertices.push(x, y, z);
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
      "alpha",
      new THREE.Float32BufferAttribute(alphas, 1)
    );
    bufferGeo.setAttribute(
      "colorIdx",
      new THREE.Int8BufferAttribute(colors, 1)
    );
    bufferGeo.setAttribute("rot", new THREE.Float32BufferAttribute(rot, 1));
    return bufferGeo;
  }, []);

  const particlesMaterial = useRef<THREE.ShaderMaterial>();
  const imgMaterial = useRef<THREE.ShaderMaterial>();
  const imgMaterial2 = useRef<THREE.ShaderMaterial>();

  const update = () => {
    const position = geometry.attributes.position;
    const rot = geometry.attributes.rot;
    const posArr = (position as THREE.BufferAttribute).array;
    const rotArr = rot.array;
    const { width, height } = maskData;
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
        getPixelColor(maskData, ~~ix, ~~iy)[0] === 0
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
  const imageMesh2 = useRef<THREE.Mesh>();
  useLayoutEffect(() => {
    const aspect = size.width / size.height;
    let s = 1;
    let y = 0;
    if (aspect > imageAspect) {
      s = aspect / imageAspect;
      y = (s - 1) * 0.5;
    }

    // pointsMesh.current.position.y = y;
    // pointsMesh.current.scale.set(s, s, s);

    // imageMesh.current.scale.set(s, s, s);
    // imageMesh.current.position.y = y;
    imageMesh2.current.scale.set(s, s, s);
    imageMesh2.current.position.y = y;
  }, [size.width, size.height]);

  const renderTarget = useMemo(
    () =>
      new THREE.WebGLRenderTarget(imgEl.naturalWidth, imgEl.naturalHeight, {
        encoding: THREE.sRGBEncoding,
        generateMipmaps: true,
        minFilter: THREE.LinearMipmapLinearFilter,
      }),
    []
  );
  const offScene = useMemo(() => new THREE.Scene(), []);
  const offCamera = useMemo(() => {
    const c = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1000);
    c.position.set(0, 0, 2);
    c.lookAt(0, 0, 0);
    return c;
  }, []);
  useLayoutEffect(() => {
    const aspect = size.width / size.height;
    offCamera.left = -1 * 0.5 * aspect;
    offCamera.right = 1 * 0.5 * aspect;
    offCamera.top = 1 * 0.5;
    offCamera.bottom = -1 * 0.5;
    offCamera.updateProjectionMatrix();
  }, [offCamera, size.width, size.height]);

  const offSceneContent = createPortal(
    <>
      {/* <primitive object={offCamera} /> */}
      <points
        position-z={0.002}
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
        />
      </points>
    </>,
    offScene
  );

  useFrame(({ gl, scene, camera }) => {
    particlesMaterial.current.uniforms.time.value = clock.elapsedTime;
    // update();
    // renderTarget.width = size.width;
    // renderTarget.height = size.height;
    gl.setRenderTarget(renderTarget);
    gl.render(offScene, offCamera);
    gl.setRenderTarget(null);
    imgMaterial2.current.needsUpdate = true;
  });

  return (
    <>
      {offSceneContent}
      <group>
        {/* <points position-z={0} ref={pointsMesh} geometry={geometry}>
          <particlesShaderMaterial
            ref={particlesMaterial}
            depthWrite={false}
            depthTest={false}
            transparent
            attach="material"
            tex={triTexture}
            colors={Colors}
          />
        </points> */}
        {/* <mesh ref={imageMesh} visible={true}>
          <planeBufferGeometry args={[imageAspect, 1]} attach="geometry" />
          <imgShaderMaterial
            ref={imgMaterial}
            transparent
            attach="material"
            image={imageTexture}
          />
        </mesh> */}
        <mesh position-z={0.001} ref={imageMesh2} visible={true}>
          <planeBufferGeometry args={[imageAspect, 1]} attach="geometry" />
          <imgShaderMaterial
            transparent
            attach="material"
            image={imageTexture}
            fg={renderTarget.texture}
            ref={imgMaterial2}
          />
        </mesh>
      </group>
    </>
  );
};

const Scene = () => {
  return (
    <>
      <Points
        maskImage={mask3Image}
        image={image3}
        sampleStep={{ x: 1, y: 1 }}
      />
    </>
  );
};

const CameraSet = () => {
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
        onCreated={(ctx) => {
          // ctx.gl.setClearColor(0x000000);
        }}
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
