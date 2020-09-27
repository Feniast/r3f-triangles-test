import React, {
  useRef,
  Suspense,
  useMemo,
  useLayoutEffect,
  useState,
  useEffect,
  useCallback,
} from 'react';
import {
  Canvas,
  useFrame,
  ReactThreeFiber,
  extend,
  useThree,
  useUpdate,
} from 'react-three-fiber';
import * as THREE from 'three';
import { OrbitControls, shaderMaterial, useTextureLoader, Html } from 'drei';
import * as dat from 'dat.gui';
import { useDeepMemo, useDeepCompareEffect } from './useDeep';
import myVideo from 'url:./assets/video.mp4';
import vertex from './shader/vertex.glsl';
import fragment from './shader/fragment.glsl';
import vertexParticles from './shader/vertex-particles.glsl';
import fragmentParticles from './shader/fragment-particles.glsl';
import { PlaneBufferGeometry } from 'three';
import tri from 'url:./assets/tri.png';
import mask1Image from 'url:./assets/mask1.jpg';
import useSWR from 'swr';

interface DatGuiSetting {
  value: string | number | undefined;
  type?: 'color' | undefined;
  min?: number;
  max?: number;
  step?: number;
}

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
});

const useDatGui = <T extends Record<string, DatGuiSetting>>(settings: T) => {
  const obj = useDeepMemo<Record<keyof T, DatGuiSetting['value']>>(() => {
    const o = {} as Record<keyof T, DatGuiSetting['value']>;
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
      if (type === 'color') {
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
    i.addEventListener('load', () => {
      resolve(i);
    });
    i.addEventListener('error', (e) => {
      reject(e);
    });
    i.src = src;
  });
};

const useImageData = (options: UseImageDataOptions) => {
  const canvas = useMemo(() => document.createElement('canvas'), []);
  const ctx = useMemo(() => canvas.getContext('2d'), [canvas]);
  const { image, scale = 1 } = options;
  const { data: img } = useSWR<HTMLImageElement>(
    ['image', image],
    (__, i) => {
      if (typeof i === 'string') {
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

const size = 100;

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

const Points = () => {
  const { clock } = useThree();
  const { data: maskData } = useImageData({
    image: mask1Image,
    scale: 100 / 1920,
  });
  const triTexture = useTextureLoader(tri);
  const speeds = useRef<number[] | undefined>();
  const posScale = 1 / 50;
  const speedScale = 0.001;
  const geometry = useMemo(() => {
    const bufferGeo = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const alphas: number[] = [];
    const colors: number[] = [];
    const rot: number[] = [];
    speeds.current = [];
    const { width, height, data } = maskData;
    for (let i = 0; i < width; i++) {
      for (let j = 0; j < height; j++) {
        const p = data[(j * width + i) * 4];
        if (p === 255) {
          const x = (i - width * 0.5) * posScale;
          const y = -(j - height * 0.5) * posScale;
          const z = Math.random() * 0.5 + 0.5;
          vertices.push(x, y, z);
          alphas.push(Math.random() * 0.8 + 0.1);
          colors.push(random(0, Colors.length, true));
          rot.push(Math.random() * Math.PI * 2);
          speeds.current.push(Math.random() * speedScale * 0.5 + speedScale);
        }
      }
    }
    bufferGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(vertices, 3)
    );
    bufferGeo.setAttribute(
      'alpha',
      new THREE.Float32BufferAttribute(alphas, 1)
    );
    bufferGeo.setAttribute(
      'colorIdx',
      new THREE.Int8BufferAttribute(colors, 1)
    );
    bufferGeo.setAttribute('rot', new THREE.Float32BufferAttribute(rot, 1));
    return bufferGeo;
  }, []);

  const material = useRef<THREE.ShaderMaterial>();

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

      let ix = x / posScale + 0.5 * width;
      let iy = -y / posScale + 0.5 * height;
      
      if (ix <= 0 || ix >= width || iy <= 0 || iy >= height) {
        r += Math.PI * (1 + Math.random() * 0.05);
      } else if (getPixelColor(maskData, ~~ix, ~~iy)[0] === 0) {
        r += Math.PI * (1 + Math.random() * 0.05);
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

  useFrame(() => {
    material.current.uniforms.time.value = clock.elapsedTime;
    update();
  });

  return (
    <points geometry={geometry}>
      {/* @ts-ignore */}
      <particlesShaderMaterial
        ref={material}
        depthWrite={false}
        depthTest={false}
        transparent
        attach="material"
        tex={triTexture}
        colors={Colors}
      />
    </points>
  );
};

const Scene = () => {
  return (
    <>
      <Points />
    </>
  );
};

const CameraSet = () => {
  const { aspect, camera } = useThree();
  useLayoutEffect(() => {
    const dist = camera.position.z;
    const height = 0.8; // make the scene "bigger", so the rotation of scene will not show the blank space
    (camera as THREE.PerspectiveCamera).fov =
      2 * (180 / Math.PI) * Math.atan(height / 2 / dist);
    camera.updateProjectionMatrix();
  }, [aspect]);

  return null;
};

const App = () => {
  return (
    <Canvas
      colorManagement
      camera={{
        position: [0, 0, 2],
        fov: 70,
      }}
      onCreated={(ctx) => {
        ctx.gl.setClearColor(0x000000);
      }}
    >
      <ambientLight intensity={0.5} />
      {/* <CameraSet /> */}
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
  );
};

export default App;
